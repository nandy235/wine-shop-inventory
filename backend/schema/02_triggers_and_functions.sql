-- ===============================================
-- Wine Shop Inventory Management System
-- Complete Database Schema - Part 2: Triggers & Functions
-- ===============================================

-- ===============================================
-- TRIGGER FUNCTIONS
-- ===============================================

-- Function 1: Update final_price in shop_inventory
CREATE OR REPLACE FUNCTION trg_shop_inventory_set_final_price()
RETURNS TRIGGER AS $$
BEGIN
  NEW.final_price := COALESCE(
    (SELECT standard_mrp FROM master_brands WHERE id = NEW.master_brand_id), 0
  ) + COALESCE(NEW.markup_price, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function 2: Propagate MRP changes to shop inventory
CREATE OR REPLACE FUNCTION trg_master_brands_propagate_price()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE shop_inventory
  SET final_price = COALESCE(NEW.standard_mrp, 0) + COALESCE(markup_price, 0)
  WHERE master_brand_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function 3: Auto-populate opening stock and price snapshot
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

  -- Snapshot current final_price for audit purposes
  IF NEW.price_per_unit IS NULL THEN
    SELECT final_price INTO inv_final
    FROM shop_inventory
    WHERE id = NEW.shop_inventory_id;
    NEW.price_per_unit := COALESCE(inv_final, 0);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function 4: Auto-link invoice brands - REMOVED
-- This functionality is now handled by received_stock_records table
-- with invoice_quantity column and invoice_id reference

-- Function 5: Update updated_at timestamp
CREATE OR REPLACE FUNCTION trg_updated_at_touch()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function 6: Update last_updated timestamp  
CREATE OR REPLACE FUNCTION trg_last_updated_touch()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===============================================
-- CREATE TRIGGERS
-- ===============================================

-- Trigger 1: Maintain final_price in shop_inventory
CREATE TRIGGER set_final_price_on_inventory
BEFORE INSERT OR UPDATE OF markup_price, master_brand_id
ON shop_inventory
FOR EACH ROW
EXECUTE FUNCTION trg_shop_inventory_set_final_price();

-- Trigger 2: Propagate MRP changes to shop inventory
CREATE TRIGGER propagate_price_on_master_brands
AFTER UPDATE OF standard_mrp
ON master_brands
FOR EACH ROW
EXECUTE FUNCTION trg_master_brands_propagate_price();

-- Trigger 3: Auto-populate opening stock and price snapshot
CREATE TRIGGER daily_stock_defaults
BEFORE INSERT OR UPDATE OF stock_date, shop_inventory_id
ON daily_stock_records
FOR EACH ROW
EXECUTE FUNCTION trg_daily_stock_defaults();

-- Trigger 4: Auto-link invoice brands - REMOVED
-- This functionality is now handled by received_stock_records table

-- Trigger 5: Touch triggers for updated_at columns
CREATE TRIGGER touch_updated_at_users
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION trg_updated_at_touch();

CREATE TRIGGER touch_updated_at_shops
BEFORE UPDATE ON shops
FOR EACH ROW
EXECUTE FUNCTION trg_updated_at_touch();

-- Trigger 6: Touch triggers for last_updated columns
CREATE TRIGGER touch_last_updated_shop_inventory
BEFORE UPDATE ON shop_inventory
FOR EACH ROW
EXECUTE FUNCTION trg_last_updated_touch();

-- ===============================================
-- TRIGGER SETUP COMPLETE
-- ===============================================
SELECT 'Schema Part 2: Triggers and Functions created successfully!' as status;
