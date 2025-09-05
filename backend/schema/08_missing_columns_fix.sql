-- ===============================================
-- Wine Shop Inventory Management System
-- Missing Columns Fix - Part 8
-- ===============================================

-- Add missing columns that are expected by the application

-- 1. Add closing_counter_balance to daily_payments table
ALTER TABLE daily_payments 
ADD COLUMN IF NOT EXISTS closing_counter_balance DECIMAL(10,2) DEFAULT 0;

-- 2. Add sort_order to shop_inventory table
ALTER TABLE shop_inventory 
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 999;

-- 3. Add password column to shops table (if not exists)
-- This is needed because the current schema has password in users table but code expects it in shops table
ALTER TABLE shops 
ADD COLUMN IF NOT EXISTS password VARCHAR(255);

-- 4. Update constraints for daily_payments
ALTER TABLE daily_payments 
DROP CONSTRAINT IF EXISTS chk_payment_nonnegative;

ALTER TABLE daily_payments 
ADD CONSTRAINT chk_payment_nonnegative CHECK (
    cash_amount >= 0 AND 
    upi_amount >= 0 AND 
    card_amount >= 0 AND
    (closing_counter_balance IS NULL OR closing_counter_balance >= -999999)
);

-- 5. Add index for sort_order for better performance
CREATE INDEX IF NOT EXISTS idx_shop_inventory_sort_order 
ON shop_inventory(shop_id, sort_order, id);

-- 6. Add index for closing_counter_balance queries
CREATE INDEX IF NOT EXISTS idx_daily_payments_closing_balance 
ON daily_payments(shop_id, payment_date, closing_counter_balance);

-- ===============================================
-- COMMENTS FOR DOCUMENTATION
-- ===============================================

COMMENT ON COLUMN daily_payments.closing_counter_balance IS 'Calculated closing counter balance for the day';
COMMENT ON COLUMN shop_inventory.sort_order IS 'Custom sort order for products in shop inventory display';
COMMENT ON COLUMN shops.password IS 'Shop-specific password for retailer login';

-- ===============================================
-- MIGRATION COMPLETE
-- ===============================================
SELECT 'Schema Part 8: Missing columns added successfully!' as status;
SELECT 'Added columns: daily_payments.closing_counter_balance, shop_inventory.sort_order, shops.password' as columns_added;
