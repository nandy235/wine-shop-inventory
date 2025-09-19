-- ===============================================
-- Fix trigger to handle INSERT vs UPDATE operations correctly
-- ===============================================

BEGIN;

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

COMMIT;

SELECT 'Trigger updated to handle INSERT/UPDATE deltas correctly!' as status;
