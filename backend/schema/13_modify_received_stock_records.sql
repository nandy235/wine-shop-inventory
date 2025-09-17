-- ===============================================
-- Wine Shop Inventory Management System
-- Modify received_stock_records table structure
-- ===============================================

BEGIN;

-- ===============================================
-- MODIFY RECEIVED STOCK RECORDS TABLE
-- ===============================================

-- 1. Rename supplier_code to store_code
ALTER TABLE received_stock_records RENAME COLUMN supplier_code TO store_code;

-- 2. Drop supplier_shop_id column (no longer needed)
ALTER TABLE received_stock_records DROP COLUMN IF EXISTS supplier_shop_id;

-- 3. Drop views that reference manual_quantity first
DROP VIEW IF EXISTS v_daily_stock_summary_enhanced CASCADE;

-- 4. Drop the generated column first (since it depends on manual_quantity)
ALTER TABLE received_stock_records DROP COLUMN IF EXISTS total_received;

-- 5. Drop manual_quantity column
ALTER TABLE received_stock_records DROP COLUMN IF EXISTS manual_quantity;

-- 6. Update TGBCL values to a valid 7-digit code before applying constraint
UPDATE received_stock_records 
SET store_code = '0000000' 
WHERE store_code = 'TGBCL';

-- 7. Update the constraint for store_code to only allow 7-digit retailer codes
ALTER TABLE received_stock_records DROP CONSTRAINT IF EXISTS chk_supplier_code_valid;
ALTER TABLE received_stock_records ADD CONSTRAINT chk_store_code_valid CHECK (
    store_code IS NULL OR store_code ~ '^\d{7}$'
);

-- 8. Recreate the generated column total_received without manual_quantity
ALTER TABLE received_stock_records ADD COLUMN total_received INTEGER GENERATED ALWAYS AS (
    COALESCE(invoice_quantity, 0) + 
    COALESCE(transfer_quantity, 0)
) STORED;

-- 9. Update indexes that reference the dropped columns
DROP INDEX IF EXISTS idx_received_stock_supplier_code;
CREATE INDEX idx_received_stock_store_code ON received_stock_records(store_code);

-- 10. Update the reporting index to exclude manual_quantity
DROP INDEX IF EXISTS idx_received_stock_reporting;
CREATE INDEX idx_received_stock_reporting ON received_stock_records(shop_id, master_brand_id, record_date) 
  INCLUDE (invoice_quantity, transfer_quantity, total_received);

-- ===============================================
-- UPDATE TRIGGER FUNCTIONS
-- ===============================================

-- Update the trigger function to exclude manual_quantity from calculations
CREATE OR REPLACE FUNCTION trg_sync_daily_stock_received()
RETURNS TRIGGER AS $$
DECLARE
    target_shop_inventory_id BIGINT;
    total_received_qty INTEGER;
BEGIN
    -- Get shop_inventory_id for this shop + master_brand combination
    SELECT si.id INTO target_shop_inventory_id
    FROM shop_inventory si
    WHERE si.shop_id = NEW.shop_id 
      AND si.master_brand_id = NEW.master_brand_id
    LIMIT 1;
    
    -- Calculate total received from all sources for this date (excluding manual)
    SELECT COALESCE(SUM(total_received), 0) INTO total_received_qty
    FROM received_stock_records 
    WHERE shop_id = NEW.shop_id 
      AND master_brand_id = NEW.master_brand_id 
      AND record_date = NEW.record_date;
    
    -- Update daily_stock_records.received_stock
    IF target_shop_inventory_id IS NOT NULL THEN
        UPDATE daily_stock_records 
        SET received_stock = total_received_qty
        WHERE shop_inventory_id = target_shop_inventory_id 
          AND stock_date = NEW.record_date;
        
        -- If no daily stock record exists, create one
        IF NOT FOUND THEN
            INSERT INTO daily_stock_records (
                shop_inventory_id, stock_date, opening_stock, received_stock, closing_stock
            ) VALUES (
                target_shop_inventory_id, 
                NEW.record_date,
                0, -- Will be updated by existing triggers
                total_received_qty,
                NULL
            );
        END IF;
    END IF;
    
    RETURN NEW;
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
    
    -- Received stock breakdown from received_stock_records (excluding manual)
    COALESCE(rs_summary.invoice_quantity, 0) as received_from_invoices,
    COALESCE(rs_summary.transfer_quantity, 0) as received_transfers,
    
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
        SUM(transfer_quantity) as transfer_quantity
    FROM received_stock_records
    GROUP BY shop_id, master_brand_id, record_date
) rs_summary ON rs_summary.shop_id = si.shop_id 
    AND rs_summary.master_brand_id = si.master_brand_id 
    AND rs_summary.record_date = dsr.stock_date
ORDER BY dsr.stock_date DESC, s.shop_name, mb.brand_number;

-- ===============================================
-- UPDATE COMMENTS
-- ===============================================

COMMENT ON COLUMN received_stock_records.store_code IS '7-digit retailer code for the store/supplier';
COMMENT ON COLUMN received_stock_records.invoice_quantity IS 'Stock received from confirmed invoices (bottles)';
COMMENT ON COLUMN received_stock_records.transfer_quantity IS 'Stock transferred in/out (negative for outgoing transfers)';
COMMENT ON COLUMN received_stock_records.total_received IS 'Auto-calculated sum of invoice_quantity + transfer_quantity';

COMMIT;

-- ===============================================
-- VERIFICATION
-- ===============================================
SELECT 'Schema modification completed successfully!' as status;
SELECT 'Modified received_stock_records table structure' as changes_made;
