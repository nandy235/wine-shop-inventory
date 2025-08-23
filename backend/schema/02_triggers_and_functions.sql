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

-- Function 4: Auto-link invoice brands to master brands
CREATE OR REPLACE FUNCTION trg_auto_link_invoice_brands()
RETURNS TRIGGER AS $$
DECLARE
    matched_brand_id BIGINT;
    confidence_score DECIMAL(5,2);
    match_type VARCHAR(20);
BEGIN
    -- Skip if already manually matched
    IF NEW.master_brand_id IS NOT NULL AND OLD.master_brand_id IS NOT NULL THEN
        RETURN NEW;
    END IF;
    
    -- Reset matching fields for new attempts
    NEW.master_brand_id := NULL;
    NEW.match_confidence := NULL;
    NEW.match_method := NULL;
    NEW.matched_at := NULL;
    
    -- 1. Try exact match on (brand_number, size_ml) - Highest confidence
    SELECT mb.id INTO matched_brand_id
    FROM master_brands mb
    WHERE mb.brand_number = NEW.brand_number 
      AND mb.size_ml = NEW.size_ml
      AND mb.is_active = true
    LIMIT 1;
    
    IF matched_brand_id IS NOT NULL THEN
        NEW.master_brand_id := matched_brand_id;
        NEW.match_confidence := 100.00;
        NEW.match_method := 'exact';
        NEW.matched_at := CURRENT_TIMESTAMP;
        
        RAISE NOTICE 'Auto-linked invoice brand % (size: %ml) to master brand ID % with exact match', 
                     NEW.brand_number, NEW.size_ml, matched_brand_id;
        RETURN NEW;
    END IF;
    
    -- 2. Try fuzzy match on brand_number only (same size) - High confidence
    SELECT mb.id INTO matched_brand_id
    FROM master_brands mb
    WHERE mb.size_ml = NEW.size_ml
      AND mb.is_active = true
      AND (
          -- Close brand number matches (handle typos, extra chars)
          similarity(mb.brand_number, NEW.brand_number) > 0.8
          OR mb.brand_number ILIKE '%' || NEW.brand_number || '%'
          OR NEW.brand_number ILIKE '%' || mb.brand_number || '%'
      )
    ORDER BY similarity(mb.brand_number, NEW.brand_number) DESC
    LIMIT 1;
    
    IF matched_brand_id IS NOT NULL THEN
        NEW.master_brand_id := matched_brand_id;
        NEW.match_confidence := 85.00;
        NEW.match_method := 'fuzzy';
        NEW.matched_at := CURRENT_TIMESTAMP;
        
        RAISE NOTICE 'Auto-linked invoice brand % (size: %ml) to master brand ID % with fuzzy match', 
                     NEW.brand_number, NEW.size_ml, matched_brand_id;
        RETURN NEW;
    END IF;
    
    -- 3. Try brand_number match with size tolerance - Medium confidence
    SELECT mb.id, 
           CASE 
               WHEN ABS(mb.size_ml - NEW.size_ml) = 0 THEN 90.00
               WHEN ABS(mb.size_ml - NEW.size_ml) <= 50 THEN 75.00
               WHEN ABS(mb.size_ml - NEW.size_ml) <= 100 THEN 65.00
               ELSE 50.00
           END as calc_confidence
    INTO matched_brand_id, confidence_score
    FROM master_brands mb
    WHERE mb.brand_number = NEW.brand_number
      AND mb.is_active = true
      AND ABS(mb.size_ml - NEW.size_ml) <= 200 -- Maximum 200ml difference
    ORDER BY ABS(mb.size_ml - NEW.size_ml) ASC
    LIMIT 1;
    
    IF matched_brand_id IS NOT NULL THEN
        NEW.master_brand_id := matched_brand_id;
        NEW.match_confidence := confidence_score;
        NEW.match_method := 'fuzzy';
        NEW.matched_at := CURRENT_TIMESTAMP;
        
        RAISE NOTICE 'Auto-linked invoice brand % (size: %ml) to master brand ID % with size tolerance match (confidence: %)', 
                     NEW.brand_number, NEW.size_ml, matched_brand_id, confidence_score;
        RETURN NEW;
    END IF;
    
    -- 4. No match found - log for manual review
    RAISE NOTICE 'No match found for invoice brand % (size: %ml) - requires manual review', 
                 NEW.brand_number, NEW.size_ml;
    
    -- Keep master_brand_id as NULL to indicate unmatched
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

-- Trigger 4: Auto-link invoice brands to master brands
CREATE TRIGGER auto_link_invoice_brands
BEFORE INSERT OR UPDATE OF brand_number, size_ml
ON invoice_brands
FOR EACH ROW
EXECUTE FUNCTION trg_auto_link_invoice_brands();

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
