-- ===============================================
-- Wine Shop Inventory Management System
-- Complete Database Schema - Part 4: Performance Indexes
-- ===============================================

-- ===============================================
-- DROP EXISTING INDEXES (if they exist)
-- ===============================================
DROP INDEX IF EXISTS idx_shops_user CASCADE;
DROP INDEX IF EXISTS idx_master_brands_lookup CASCADE;
DROP INDEX IF EXISTS idx_master_brands_active CASCADE;
DROP INDEX IF EXISTS idx_master_brands_similarity CASCADE;
DROP INDEX IF EXISTS idx_shop_inventory_shop CASCADE;
DROP INDEX IF EXISTS idx_shop_inventory_brand CASCADE;
DROP INDEX IF EXISTS idx_shop_inventory_active CASCADE;
DROP INDEX IF EXISTS idx_daily_stock_inventory_date CASCADE;
DROP INDEX IF EXISTS idx_daily_stock_date_range CASCADE;
DROP INDEX IF EXISTS idx_daily_stock_pending_closure CASCADE;
DROP INDEX IF EXISTS idx_invoices_shop_date CASCADE;
DROP INDEX IF EXISTS idx_invoices_status CASCADE;
DROP INDEX IF EXISTS idx_invoice_brands_invoice CASCADE;
DROP INDEX IF EXISTS idx_invoice_brands_match CASCADE;
DROP INDEX IF EXISTS idx_invoice_brands_unmatched CASCADE;
DROP INDEX IF EXISTS idx_invoice_brands_confidence CASCADE;
DROP INDEX IF EXISTS idx_invoice_unmatched_queue CASCADE;
DROP INDEX IF EXISTS idx_expenses_shop_date CASCADE;
DROP INDEX IF EXISTS idx_income_shop_date CASCADE;
DROP INDEX IF EXISTS idx_payments_shop_date CASCADE;

-- ===============================================
-- CRITICAL INDEXES FOR QUERY OPTIMIZATION
-- ===============================================

-- User and Shop lookups
CREATE INDEX idx_shops_user ON shops(user_id);
CREATE INDEX idx_shops_active ON shops(user_id) WHERE shop_name IS NOT NULL;
CREATE UNIQUE INDEX idx_shops_retailer_code ON shops(retailer_code);
CREATE INDEX idx_shops_license_number ON shops(license_number) WHERE license_number IS NOT NULL;

-- Master brands lookup (most common queries)
CREATE INDEX idx_master_brands_lookup ON master_brands(brand_number, size_ml);
CREATE INDEX idx_master_brands_active ON master_brands(is_active, brand_number) WHERE is_active = true;
CREATE INDEX idx_master_brands_type ON master_brands(product_type, is_active) WHERE is_active = true;

-- Shop inventory optimization (frequent joins and filters)
CREATE INDEX idx_shop_inventory_shop ON shop_inventory(shop_id);
CREATE INDEX idx_shop_inventory_brand ON shop_inventory(master_brand_id);
CREATE INDEX idx_shop_inventory_active ON shop_inventory(shop_id, is_active) WHERE is_active = true;
CREATE INDEX idx_shop_inventory_shop_brand ON shop_inventory(shop_id, master_brand_id);

-- Daily stock records (heaviest table - critical indexes)
CREATE INDEX idx_daily_stock_inventory_date ON daily_stock_records(shop_inventory_id, stock_date);
CREATE INDEX idx_daily_stock_date_range ON daily_stock_records(stock_date) WHERE closing_stock IS NOT NULL;
CREATE INDEX idx_daily_stock_pending_closure ON daily_stock_records(shop_inventory_id, stock_date) WHERE closing_stock IS NULL;
CREATE INDEX idx_daily_stock_sales_analysis ON daily_stock_records(stock_date, sales) WHERE sales > 0;

-- Invoice processing and matching (critical for auto-linking)
CREATE INDEX idx_invoices_shop_date ON invoices(shop_id, invoice_date);
CREATE INDEX idx_invoices_status ON invoices(status, created_at) WHERE status = 'pending';
CREATE INDEX idx_invoices_icdc ON invoices(shop_id, icdc_number);

-- Invoice brands (auto-linking performance)
CREATE INDEX idx_invoice_brands_invoice ON invoice_brands(invoice_id);
CREATE INDEX idx_invoice_brands_match ON invoice_brands(brand_number, size_ml); -- For matching to master_brands
CREATE INDEX idx_invoice_brands_unmatched ON invoice_brands(invoice_id, master_brand_id) WHERE master_brand_id IS NULL; -- For unmatched brands
CREATE INDEX idx_invoice_brands_confidence ON invoice_brands(match_confidence DESC) WHERE master_brand_id IS NOT NULL;
CREATE INDEX idx_invoice_brands_method ON invoice_brands(match_method, matched_at) WHERE master_brand_id IS NOT NULL;

-- Financial tracking
CREATE INDEX idx_expenses_shop_date ON expenses(shop_id, expense_date);
CREATE INDEX idx_income_shop_date ON other_income(shop_id, income_date);
CREATE INDEX idx_payments_shop_date ON daily_payments(shop_id, payment_date);

-- ===============================================
-- SPECIALIZED INDEXES FOR FUZZY MATCHING
-- ===============================================

-- Enable similarity extension for fuzzy matching (already created pg_trgm extension)
CREATE INDEX idx_master_brands_similarity ON master_brands USING gin(brand_number gin_trgm_ops);
CREATE INDEX idx_master_brands_name_similarity ON master_brands USING gin(brand_name gin_trgm_ops);

-- Additional performance index for invoice review queues
CREATE INDEX idx_invoice_unmatched_queue
  ON invoice_brands (invoice_id, master_brand_id, match_confidence)
  WHERE master_brand_id IS NULL;

-- ===============================================
-- COMPOSITE INDEXES FOR COMPLEX QUERIES
-- ===============================================

-- Daily stock reporting (used by views)
CREATE INDEX idx_daily_stock_reporting ON daily_stock_records(stock_date, shop_inventory_id) 
  INCLUDE (opening_stock, received_stock, total_stock, closing_stock, sales, sale_value);

-- Shop inventory reporting
CREATE INDEX idx_shop_inventory_reporting ON shop_inventory(shop_id, is_active) 
  INCLUDE (master_brand_id, current_quantity, final_price, markup_price)
  WHERE is_active = true;

-- Invoice processing workflow
CREATE INDEX idx_invoice_processing ON invoices(status, created_at, shop_id)
  INCLUDE (invoice_date, icdc_number, invoice_value);

-- Brand matching workflow
CREATE INDEX idx_brand_matching ON invoice_brands(master_brand_id, match_method, match_confidence)
  INCLUDE (brand_number, size_ml, matched_at);

-- ===============================================
-- PARTIAL INDEXES FOR SPECIFIC CONDITIONS
-- ===============================================

-- Active inventory only
CREATE INDEX idx_active_inventory_summary ON shop_inventory(shop_id) 
  INCLUDE (master_brand_id, current_quantity, final_price) 
  WHERE is_active = true AND current_quantity > 0;

-- Recent stock movements (last 30 days) - removed date function from index predicate
CREATE INDEX idx_recent_stock_movements ON daily_stock_records(shop_inventory_id, stock_date);

-- High-value transactions
CREATE INDEX idx_high_value_invoices ON invoices(shop_id, invoice_date) 
  WHERE invoice_value > 10000;

-- Pending manual review
CREATE INDEX idx_pending_manual_review ON invoice_brands(invoice_id, brand_number, size_ml) 
  WHERE master_brand_id IS NULL;

-- ===============================================
-- UNIQUE INDEXES FOR DATA INTEGRITY
-- ===============================================

-- Ensure unique email addresses (case-insensitive) - using citext column type instead
-- Note: users.email is already citext type which handles case-insensitive uniqueness

-- Ensure unique shop inventory per brand
CREATE UNIQUE INDEX idx_shop_inventory_unique ON shop_inventory(shop_id, master_brand_id);

-- Ensure unique daily stock record per date
CREATE UNIQUE INDEX idx_daily_stock_unique ON daily_stock_records(shop_inventory_id, stock_date);

-- Ensure unique invoice per shop
CREATE UNIQUE INDEX idx_invoice_shop_unique ON invoices(shop_id, icdc_number) WHERE icdc_number IS NOT NULL;

-- Ensure unique payment record per day
CREATE UNIQUE INDEX idx_payment_shop_date_unique ON daily_payments(shop_id, payment_date);

-- Ensure unique license numbers for login
CREATE UNIQUE INDEX idx_shops_license_unique ON shops(license_number) WHERE license_number IS NOT NULL;

-- ===============================================
-- STATISTICS AND MAINTENANCE
-- ===============================================

-- Update table statistics for better query planning
ANALYZE users;
ANALYZE shops;
ANALYZE master_brands;
ANALYZE shop_inventory;
ANALYZE daily_stock_records;
ANALYZE invoices;
ANALYZE invoice_brands;
ANALYZE expenses;
ANALYZE other_income;
ANALYZE daily_payments;

-- ===============================================
-- INDEX USAGE MONITORING QUERIES
-- ===============================================

-- Create a view to monitor index usage
CREATE OR REPLACE VIEW v_index_usage_stats AS
SELECT
    schemaname,
    relname as tablename,
    indexrelname as indexname,
    idx_tup_read,
    idx_tup_fetch,
    idx_scan,
    CASE 
        WHEN idx_scan = 0 THEN 'UNUSED'
        WHEN idx_scan < 100 THEN 'LOW_USAGE'
        WHEN idx_scan < 1000 THEN 'MODERATE_USAGE'
        ELSE 'HIGH_USAGE'
    END as usage_category
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- ===============================================
-- MAINTENANCE RECOMMENDATIONS
-- ===============================================

COMMENT ON INDEX idx_master_brands_lookup IS 'Critical: Most frequent lookup for brand matching';
COMMENT ON INDEX idx_daily_stock_inventory_date IS 'Critical: Primary access pattern for stock records';
COMMENT ON INDEX idx_invoice_brands_match IS 'Critical: Essential for auto-linking performance';
COMMENT ON INDEX idx_shop_inventory_reporting IS 'Performance: Optimizes inventory summary queries';
COMMENT ON INDEX idx_master_brands_similarity IS 'Fuzzy matching: Enables fast similarity searches';

-- ===============================================
-- PERFORMANCE INDEXES COMPLETE
-- ===============================================
SELECT 'Schema Part 4: Performance Indexes created successfully!' as status;
SELECT 'Total indexes created: ' || COUNT(*) as index_count
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND indexname LIKE 'idx_%';
