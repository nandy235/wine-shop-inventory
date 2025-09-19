-- ===============================================
-- Wine Shop Inventory Management System
-- Modify received_stock_records table - Replace transfer_quantity with shift_in and shift_out
-- ===============================================

BEGIN;

-- ===============================================
-- MODIFY RECEIVED STOCK RECORDS TABLE
-- ===============================================

-- 1. Drop views that reference transfer_quantity first
DROP VIEW IF EXISTS v_daily_stock_summary_enhanced CASCADE;

-- 2. Drop the generated column first (since it depends on transfer_quantity)
ALTER TABLE received_stock_records DROP COLUMN IF EXISTS total_received;

-- 3. Drop transfer_quantity column
ALTER TABLE received_stock_records DROP COLUMN IF EXISTS transfer_quantity;

-- 4. Add shift_in and shift_out columns
ALTER TABLE received_stock_records ADD COLUMN shift_in INTEGER DEFAULT 0;
ALTER TABLE received_stock_records ADD COLUMN shift_out INTEGER DEFAULT 0;

-- 5. Recreate the generated column total_received with new columns
ALTER TABLE received_stock_records ADD COLUMN total_received INTEGER GENERATED ALWAYS AS (
    COALESCE(invoice_quantity, 0) + 
    COALESCE(shift_in, 0) - 
    COALESCE(shift_out, 0)
) STORED;

-- 6. Update indexes that reference the dropped columns
DROP INDEX IF EXISTS idx_received_stock_transfers;
CREATE INDEX idx_received_stock_shift_in ON received_stock_records(shop_id, record_date) WHERE shift_in != 0;
CREATE INDEX idx_received_stock_shift_out ON received_stock_records(shop_id, record_date) WHERE shift_out != 0;

-- 7. Update the reporting index to include new columns
DROP INDEX IF EXISTS idx_received_stock_reporting;
CREATE INDEX idx_received_stock_reporting ON received_stock_records(shop_id, master_brand_id, record_date) 
  INCLUDE (invoice_quantity, shift_in, shift_out, total_received);

-- ===============================================
-- UPDATE TRIGGER FUNCTIONS
-- ===============================================

-- Update the trigger function to use new shift columns
CREATE OR REPLACE FUNCTION trg_sync_daily_stock_received()
RETURNS TRIGGER AS $$
DECLARE
    target_shop_inventory_id BIGINT;
    delta_amount INTEGER;
BEGIN
    -- Get shop_inventory_id for this shop + master_brand combination
    SELECT si.id INTO target_shop_inventory_id
    FROM shop_inventory si
    WHERE si.shop_id = NEW.shop_id 
      AND si.master_brand_id = NEW.master_brand_id
    LIMIT 1;
    
    -- Only proceed if shop_inventory exists
    IF target_shop_inventory_id IS NOT NULL THEN
        -- Calculate the delta (change) in total_received
        IF TG_OP = 'INSERT' THEN
            -- For INSERT, the delta is the full NEW.total_received
            delta_amount := NEW.total_received;
        ELSIF TG_OP = 'UPDATE' THEN
            -- For UPDATE, the delta is the difference between NEW and OLD
            delta_amount := NEW.total_received - OLD.total_received;
        ELSE
            -- For DELETE, the delta is negative of OLD.total_received
            delta_amount := -OLD.total_received;
        END IF;
        
        -- Add only the delta to existing received_stock
        UPDATE daily_stock_records 
        SET received_stock = COALESCE(received_stock, 0) + delta_amount
        WHERE shop_inventory_id = target_shop_inventory_id 
          AND stock_date = NEW.record_date;
        
        -- If no daily stock record exists, create one with the delta amount
        IF NOT FOUND THEN
            INSERT INTO daily_stock_records (
                shop_inventory_id, stock_date, opening_stock, received_stock, closing_stock
            ) VALUES (
                target_shop_inventory_id, 
                NEW.record_date,
                0,
                delta_amount,
                NULL
            );
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ===============================================
-- UPDATE VIEWS
-- ===============================================

-- Update the enhanced daily stock summary view
CREATE OR REPLACE VIEW v_daily_stock_summary_enhanced AS
SELECT
    dsr.shop_inventory_id,
    si.shop_id,
    s.shop_name,
    dsr.stock_date as record_date,
    si.master_brand_id,
    mb.brand_number,
    mb.brand_name,
    mb.size_ml,
    mb.size_code,
    mb.product_type,
    
    -- Stock quantities from daily_stock_records
    dsr.opening_stock,
    dsr.received_stock as total_received,
    dsr.total_stock as total_available,
    dsr.closing_stock,
    dsr.sales as calculated_sales,
    
    -- Received stock breakdown from received_stock_records
    COALESCE(rs_summary.invoice_quantity, 0) as received_from_invoices,
    COALESCE(rs_summary.shift_in, 0) as received_shift_in,
    COALESCE(rs_summary.shift_out, 0) as received_shift_out,
    
    -- Financial data
    dsr.price_per_unit as unit_price,
    dsr.sale_value as sales_value,
    
    -- Performance metrics
    CASE 
        WHEN dsr.total_stock = 0 THEN 0
        ELSE ROUND((dsr.sales::DECIMAL / dsr.total_stock) * 100, 2)
    END as sales_percentage

FROM daily_stock_records dsr
JOIN shop_inventory si ON si.id = dsr.shop_inventory_id
JOIN shops s ON s.id = si.shop_id
JOIN master_brands mb ON mb.id = si.master_brand_id
LEFT JOIN (
    SELECT 
        shop_id,
        master_brand_id,
        record_date,
        SUM(invoice_quantity) as invoice_quantity,
        SUM(shift_in) as shift_in,
        SUM(shift_out) as shift_out
    FROM received_stock_records
    GROUP BY shop_id, master_brand_id, record_date
) rs_summary ON rs_summary.shop_id = si.shop_id 
    AND rs_summary.master_brand_id = si.master_brand_id 
    AND rs_summary.record_date = dsr.stock_date
ORDER BY dsr.stock_date DESC, s.shop_name, mb.brand_number;

-- Update the stock transfer summary view
CREATE OR REPLACE VIEW v_stock_transfers AS
SELECT
    rs.id,
    rs.shop_id,
    s.shop_name,
    rs.master_brand_id,
    mb.brand_number,
    mb.brand_name,
    mb.size_ml,
    rs.record_date,
    rs.shift_in,
    rs.shift_out,
    rs.transfer_reference,
    rs.notes,
    CASE 
        WHEN rs.shift_in > 0 THEN 'SHIFT_IN'
        WHEN rs.shift_out > 0 THEN 'SHIFT_OUT'
        ELSE 'NO_SHIFT'
    END as transfer_type,
    rs.created_at,
    u.name as created_by_name
FROM received_stock_records rs
JOIN shops s ON s.id = rs.shop_id
JOIN master_brands mb ON mb.id = rs.master_brand_id
LEFT JOIN users u ON u.id = rs.created_by
WHERE rs.shift_in != 0 OR rs.shift_out != 0
ORDER BY rs.record_date DESC, rs.created_at DESC;

-- ===============================================
-- UPDATE COMMENTS
-- ===============================================

COMMENT ON COLUMN received_stock_records.store_code IS '7-digit retailer code for the store/supplier';
COMMENT ON COLUMN received_stock_records.invoice_quantity IS 'Stock received from confirmed invoices (bottles)';
COMMENT ON COLUMN received_stock_records.shift_in IS 'Stock received through shift transfers (bottles)';
COMMENT ON COLUMN received_stock_records.shift_out IS 'Stock transferred out through shift transfers (bottles)';
COMMENT ON COLUMN received_stock_records.total_received IS 'Auto-calculated: invoice_quantity + shift_in - shift_out';

COMMENT ON VIEW v_daily_stock_summary_enhanced IS 'Enhanced daily stock summary with granular received stock breakdown including shift transfers';
COMMENT ON VIEW v_stock_transfers IS 'Summary of all stock shift transfers between shops or locations';

COMMIT;

-- ===============================================
-- VERIFICATION
-- ===============================================
SELECT 'Schema modification completed successfully!' as status;
SELECT 'Modified received_stock_records table - replaced transfer_quantity with shift_in and shift_out' as changes_made;
