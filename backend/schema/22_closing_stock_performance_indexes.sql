-- Performance optimization indexes for closing stock operations
-- Created: 2024 - Closing Stock Performance Enhancement

-- Index for faster daily_stock_records lookups by shop_inventory_id and stock_date
-- This is critical for the batch update operations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_stock_shop_inventory_date 
ON daily_stock_records(shop_inventory_id, stock_date);

-- Index for faster previous day closing stock lookups
-- Used when creating new records that need previous day's closing stock as opening stock
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_stock_date_desc 
ON daily_stock_records(shop_inventory_id, stock_date DESC);

-- Composite index for closing stock status queries
-- Used to quickly determine how many products have closing stock set
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_stock_closing_status 
ON daily_stock_records(stock_date, shop_inventory_id) 
WHERE closing_stock IS NOT NULL;

-- Index for shop_inventory active products lookup
-- Used when initializing stock records for all products
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shop_inventory_active 
ON shop_inventory(shop_id, is_active) 
WHERE is_active = true;

-- Partial index for NULL closing stock records
-- Helps identify products that need closing stock to be set
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_stock_null_closing 
ON daily_stock_records(shop_inventory_id, stock_date) 
WHERE closing_stock IS NULL;

-- Index for business date range queries
-- Useful for reports and historical data
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_stock_date_range 
ON daily_stock_records(stock_date, shop_inventory_id);

-- Add constraint to ensure data integrity
-- Prevent duplicate records for same product on same date
ALTER TABLE daily_stock_records 
ADD CONSTRAINT IF NOT EXISTS unique_shop_inventory_date 
UNIQUE (shop_inventory_id, stock_date);

-- Analyze tables to update statistics for query planner
ANALYZE daily_stock_records;
ANALYZE shop_inventory;

-- Performance monitoring query (for debugging)
-- SELECT schemaname, tablename, indexname, idx_tup_read, idx_tup_fetch 
-- FROM pg_stat_user_indexes 
-- WHERE tablename IN ('daily_stock_records', 'shop_inventory')
-- ORDER BY idx_tup_read DESC;

PRINT 'Closing stock performance indexes created successfully';
