-- ===============================================
-- Fix trigger to use delta approach instead of sum replacement
-- ===============================================

BEGIN;

CREATE OR REPLACE FUNCTION trg_sync_daily_stock_received()
RETURNS TRIGGER AS $$
DECLARE
    target_shop_inventory_id BIGINT;
BEGIN
    -- Get shop_inventory_id for this shop + master_brand combination
    SELECT si.id INTO target_shop_inventory_id
    FROM shop_inventory si
    WHERE si.shop_id = NEW.shop_id 
      AND si.master_brand_id = NEW.master_brand_id
    LIMIT 1;
    
    -- Only proceed if shop_inventory exists
    IF target_shop_inventory_id IS NOT NULL THEN
        -- Add the change (delta) to existing received_stock
        -- Don't replace with sum, just add NEW.total_received
        UPDATE daily_stock_records 
        SET received_stock = COALESCE(received_stock, 0) + NEW.total_received
        WHERE shop_inventory_id = target_shop_inventory_id 
          AND stock_date = NEW.record_date;
        
        -- If no daily stock record exists, create one with the new amount
        IF NOT FOUND THEN
            INSERT INTO daily_stock_records (
                shop_inventory_id, stock_date, opening_stock, received_stock, closing_stock
            ) VALUES (
                target_shop_inventory_id, 
                NEW.record_date,
                0,
                NEW.total_received,
                NULL
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- ===============================================
-- VERIFICATION
-- ===============================================
SELECT 'Trigger updated to use delta approach!' as status;
SELECT 'Now adds NEW.total_received to existing received_stock instead of replacing with sum' as change_made;

