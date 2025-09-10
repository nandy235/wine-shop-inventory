-- Trigger to keep shop_inventory.current_quantity in sync with daily stock records
-- This ensures current_quantity always reflects the actual current stock

-- Function to update current_quantity based on daily stock records
CREATE OR REPLACE FUNCTION sync_current_quantity()
RETURNS TRIGGER AS $$
DECLARE
    calculated_current INTEGER;
BEGIN
    -- Calculate what the current quantity should be based on your logic:
    -- current_quantity = closing_stock (if not NULL) OR total_stock
    IF NEW.closing_stock IS NOT NULL THEN
        calculated_current := NEW.closing_stock;
    ELSE
        calculated_current := COALESCE(NEW.total_stock, 0);
    END IF;
    
    -- Update the shop_inventory.current_quantity
    UPDATE shop_inventory 
    SET 
        current_quantity = calculated_current,
        last_updated = CURRENT_TIMESTAMP
    WHERE id = NEW.shop_inventory_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that fires when daily_stock_records is updated
DROP TRIGGER IF EXISTS sync_current_quantity_trigger ON daily_stock_records;
CREATE TRIGGER sync_current_quantity_trigger
    AFTER INSERT OR UPDATE ON daily_stock_records
    FOR EACH ROW
    EXECUTE FUNCTION sync_current_quantity();

-- Also create a function to manually sync all current quantities
CREATE OR REPLACE FUNCTION sync_all_current_quantities(target_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER := 0;
    rec RECORD;
BEGIN
    -- Update all shop_inventory records based on their latest daily stock records
    FOR rec IN 
        SELECT 
            si.id as shop_inventory_id,
            CASE 
                WHEN dsr.closing_stock IS NOT NULL THEN dsr.closing_stock
                ELSE COALESCE(dsr.opening_stock, 0) + COALESCE(dsr.received_stock, 0) - COALESCE(dsr.sales, 0)
            END as calculated_current
        FROM shop_inventory si
        LEFT JOIN daily_stock_records dsr ON si.id = dsr.shop_inventory_id 
            AND dsr.stock_date = target_date
        WHERE si.is_active = true
    LOOP
        UPDATE shop_inventory 
        SET 
            current_quantity = rec.calculated_current,
            last_updated = CURRENT_TIMESTAMP
        WHERE id = rec.shop_inventory_id;
        
        updated_count := updated_count + 1;
    END LOOP;
    
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Run the sync for the current business date to fix existing inconsistencies
SELECT sync_all_current_quantities('2025-09-09'::DATE) as records_updated;

COMMENT ON FUNCTION sync_current_quantity() IS 'Automatically updates shop_inventory.current_quantity when daily stock records change';
COMMENT ON FUNCTION sync_all_current_quantities(DATE) IS 'Manually sync all current quantities for a specific date';
