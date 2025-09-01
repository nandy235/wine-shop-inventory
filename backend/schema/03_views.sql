-- ===============================================
-- Wine Shop Inventory Management System
-- Complete Database Schema - Part 3: Optimized Views
-- ===============================================

-- ===============================================
-- DROP EXISTING VIEWS
-- ===============================================
DROP VIEW IF EXISTS v_daily_stock CASCADE;

-- ===============================================
-- VIEW 1: Daily Stock View (Denormalized for Reports)
-- ===============================================
CREATE OR REPLACE VIEW v_daily_stock AS
SELECT
  d.id,
  d.shop_inventory_id,
  si.shop_id,
  s.shop_name,
  d.stock_date,
  d.opening_stock,
  d.received_stock,
  d.total_stock,
  d.closing_stock,
  d.sales,
  d.price_per_unit,
  d.sale_value,
  mb.brand_number,
  mb.brand_name,
  mb.size_ml,
  mb.size_code,
  mb.product_type,
  mb.pack_type,
  mb.pack_quantity,
  mb.standard_mrp,
  si.markup_price,
  si.final_price,
  si.current_quantity,
  -- Calculated fields
  (si.current_quantity * mb.standard_mrp) as stock_value_at_mrp,
  (si.current_quantity * si.final_price) as stock_value_at_final_price,
  -- Status indicators
  CASE 
    WHEN d.closing_stock IS NULL THEN 'PENDING_CLOSURE'
    WHEN d.closing_stock = d.total_stock THEN 'NO_SALES'
    WHEN d.closing_stock < d.total_stock THEN 'HAS_SALES'
    ELSE 'UNKNOWN'
  END as stock_status,
  -- Performance metrics
  CASE 
    WHEN d.opening_stock + d.received_stock = 0 THEN 0
    ELSE ROUND((d.sales::DECIMAL / (d.opening_stock + d.received_stock)) * 100, 2)
  END as sales_percentage
FROM daily_stock_records d
JOIN shop_inventory si ON si.id = d.shop_inventory_id
JOIN shops s ON s.id = si.shop_id
JOIN master_brands mb ON mb.id = si.master_brand_id
WHERE si.is_active = true AND mb.is_active = true;

-- ===============================================
-- VIEW 2: Shop Inventory Summary View
-- ===============================================
CREATE OR REPLACE VIEW v_shop_inventory_summary AS
SELECT
  si.shop_id,
  s.shop_name,
  s.user_id,
  u.name as user_name,
  COUNT(si.id) as total_brands,
  COUNT(CASE WHEN si.current_quantity > 0 THEN 1 END) as brands_in_stock,
  COUNT(CASE WHEN si.current_quantity = 0 THEN 1 END) as brands_out_of_stock,
  SUM(si.current_quantity) as total_quantity,
  SUM(si.current_quantity * mb.standard_mrp) as total_stock_value_mrp,
  SUM(si.current_quantity * si.final_price) as total_stock_value_final,
  ROUND(AVG(si.markup_price), 2) as avg_markup,
  ROUND(AVG(si.final_price - mb.standard_mrp), 2) as avg_price_difference,
  MAX(si.last_updated) as last_inventory_update
FROM shop_inventory si
JOIN shops s ON s.id = si.shop_id
JOIN users u ON u.id = s.user_id
JOIN master_brands mb ON mb.id = si.master_brand_id
WHERE si.is_active = true AND mb.is_active = true
GROUP BY si.shop_id, s.shop_name, s.user_id, u.name;

-- ===============================================
-- VIEW 4: Daily Sales Summary View
-- ===============================================
CREATE OR REPLACE VIEW v_daily_sales_summary AS
SELECT
  d.stock_date,
  si.shop_id,
  s.shop_name,
  COUNT(d.id) as total_items,
  SUM(d.opening_stock) as total_opening,
  SUM(d.received_stock) as total_received,
  SUM(d.total_stock) as total_available,
  SUM(COALESCE(d.closing_stock, d.total_stock)) as total_closing,
  SUM(d.sales) as total_sales_qty,
  SUM(d.sale_value) as total_sales_value,
  ROUND(AVG(d.price_per_unit), 2) as avg_selling_price,
  -- Performance metrics
  CASE 
    WHEN SUM(d.total_stock) = 0 THEN 0
    ELSE ROUND((SUM(d.sales)::DECIMAL / SUM(d.total_stock)) * 100, 2)
  END as sales_rate_percent,
  COUNT(CASE WHEN d.closing_stock IS NULL THEN 1 END) as pending_closure_count
FROM daily_stock_records d
JOIN shop_inventory si ON si.id = d.shop_inventory_id
JOIN shops s ON s.id = si.shop_id
WHERE si.is_active = true
GROUP BY d.stock_date, si.shop_id, s.shop_name
ORDER BY d.stock_date DESC, s.shop_name;

-- ===============================================
-- VIEW 5: Invoice Processing Queue View (Updated for received_stock_records)
-- ===============================================
CREATE OR REPLACE VIEW v_invoice_processing_queue AS
SELECT
  i.id as invoice_id,
  i.shop_id,
  s.shop_name,
  i.invoice_date,
  i.icdc_number,
  i.status,
  i.created_at,
  COUNT(rsr.id) as total_brands,
  COUNT(rsr.id) as matched_brands, -- All received stock records are matched
  0 as unmatched_brands, -- No unmatched with new system
  100.0 as match_rate_percent, -- Always 100% with new system
  SUM(rsr.invoice_quantity) as total_quantity,
  SUM(rsr.invoice_quantity * mb.standard_mrp) as total_value,
  -- Priority scoring (simplified for new system)
  (CASE WHEN i.status = 'pending' THEN 20 ELSE 0 END) +
  (CASE WHEN i.created_at < CURRENT_TIMESTAMP - INTERVAL '24 hours' THEN 15 ELSE 0 END) as priority_score,
  -- Status summary (simplified)
  CASE 
    WHEN COUNT(rsr.id) > 0 THEN 'FULLY_MATCHED'
    ELSE 'NO_ITEMS'
  END as processing_status
FROM invoices i
JOIN shops s ON s.id = i.shop_id
LEFT JOIN received_stock_records rsr ON rsr.invoice_id = i.id
LEFT JOIN master_brands mb ON mb.id = rsr.master_brand_id
GROUP BY i.id, i.shop_id, s.shop_name, i.invoice_date, i.icdc_number, i.status, i.created_at
ORDER BY priority_score DESC, i.created_at DESC;

-- ===============================================
-- ADD VIEW COMMENTS
-- ===============================================

COMMENT ON VIEW v_daily_stock IS 'Comprehensive daily stock view with all related brand and shop information';
-- COMMENT ON VIEW v_invoice_brands_status IS 'Removed - using received_stock_records system';
COMMENT ON VIEW v_shop_inventory_summary IS 'Shop-level inventory summary with stock values and metrics';
COMMENT ON VIEW v_daily_sales_summary IS 'Daily sales performance summary by shop';
COMMENT ON VIEW v_invoice_processing_queue IS 'Invoice processing queue with priority scoring for manual review';

-- ===============================================
-- VIEWS SETUP COMPLETE
-- ===============================================
SELECT 'Schema Part 3: Views created successfully!' as status;
