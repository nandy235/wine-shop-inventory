-- Enhanced Price Propagation for Daily Stock Records
-- Ensures price_per_unit in daily_stock_records always reflects current final_price

-- ===============================================
-- ENHANCED TRIGGER FUNCTION
-- ===============================================

-- Enhanced function to always set price_per_unit to current final_price
CREATE OR REPLACE FUNCTION trg_daily_stock_defaults()
RETURNS TRIGGER AS $$
DECLARE
  prev_close INTEGER;
  inv_final  DECIMAL(10,2);
BEGIN
  -- Opening stock from previous day's closing if not provided
  IF NEW.opening_stock = 0 THEN
    SELECT closing_stock INTO prev_close
    FROM daily_stock_records
    WHERE shop_inventory_id = NEW.shop_inventory_id
      AND stock_date = NEW.stock_date - 1
    LIMIT 1;
    NEW.opening_stock := COALESCE(prev_close, 0);
  END IF;

  -- ALWAYS set price_per_unit to current final_price from shop_inventory
  -- This ensures sales calculations always use the current selling price
  SELECT final_price INTO inv_final
  FROM shop_inventory
  WHERE id = NEW.shop_inventory_id;
  NEW.price_per_unit := COALESCE(inv_final, 0);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===============================================
-- NEW TRIGGER FUNCTION FOR PRICE UPDATES
-- ===============================================

-- Function to update daily_stock_records when shop_inventory final_price changes
CREATE OR REPLACE FUNCTION trg_propagate_final_price_to_daily_records()
RETURNS TRIGGER AS $$
BEGIN
  -- Update price_per_unit in all daily_stock_records for this inventory item
  -- Only update records from today and future (don't change historical pricing)
  UPDATE daily_stock_records 
  SET price_per_unit = NEW.final_price
  WHERE shop_inventory_id = NEW.id 
    AND stock_date >= CURRENT_DATE;
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===============================================
-- UPDATE EXISTING TRIGGER
-- ===============================================

-- Drop and recreate the daily stock trigger to handle all cases
DROP TRIGGER IF EXISTS daily_stock_defaults ON daily_stock_records;

CREATE TRIGGER daily_stock_defaults
BEFORE INSERT OR UPDATE
ON daily_stock_records
FOR EACH ROW
EXECUTE FUNCTION trg_daily_stock_defaults();

-- ===============================================
-- NEW TRIGGER FOR PRICE PROPAGATION
-- ===============================================

-- Create trigger to propagate final_price changes to daily_stock_records
CREATE TRIGGER propagate_final_price_to_daily_records
AFTER UPDATE OF final_price, markup_price
ON shop_inventory
FOR EACH ROW
WHEN (OLD.final_price IS DISTINCT FROM NEW.final_price)
EXECUTE FUNCTION trg_propagate_final_price_to_daily_records();

-- ===============================================
-- UPDATE EXISTING RECORDS
-- ===============================================

-- Update all existing daily_stock_records to use current final_price
-- This is a one-time update to fix any inconsistencies
UPDATE daily_stock_records 
SET price_per_unit = si.final_price
FROM shop_inventory si
WHERE daily_stock_records.shop_inventory_id = si.id
  AND (daily_stock_records.price_per_unit IS NULL 
       OR daily_stock_records.price_per_unit != si.final_price);

-- ===============================================
-- VERIFICATION QUERY
-- ===============================================

-- Query to verify price consistency (for debugging)
-- SELECT 
--   dsr.id,
--   dsr.stock_date,
--   mb.brand_name,
--   mb.size_code,
--   si.final_price as current_final_price,
--   dsr.price_per_unit as recorded_price,
--   CASE 
--     WHEN si.final_price = dsr.price_per_unit THEN 'CONSISTENT'
--     ELSE 'INCONSISTENT'
--   END as price_status
-- FROM daily_stock_records dsr
-- JOIN shop_inventory si ON si.id = dsr.shop_inventory_id
-- JOIN master_brands mb ON mb.id = si.master_brand_id
-- WHERE si.shop_id = ? -- Replace with actual shop_id
-- ORDER BY dsr.stock_date DESC, mb.brand_name;

-- ===============================================
-- COMMENTS
-- ===============================================

COMMENT ON FUNCTION trg_daily_stock_defaults() IS 'Auto-populates opening stock and ALWAYS sets price_per_unit to current final_price';
COMMENT ON FUNCTION trg_propagate_final_price_to_daily_records() IS 'Updates daily_stock_records price_per_unit when shop_inventory final_price changes';

-- Enhanced price propagation system installed successfully
