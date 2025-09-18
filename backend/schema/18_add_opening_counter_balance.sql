-- ===============================================
-- Wine Shop Inventory Management System
-- Migration 18: Add Opening Counter Balance to Shops
-- ===============================================

-- Add opening_counter_balance column to shops table
-- This is a one-time lifetime setting per shop
-- NULL = not set yet, DECIMAL = set value (can only be changed via DB)

ALTER TABLE shops 
ADD COLUMN opening_counter_balance DECIMAL(10,2) DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN shops.opening_counter_balance IS 'One-time lifetime opening counter balance for the shop. Can only be set once via application, changes require direct database access.';

-- Create index for faster lookups
CREATE INDEX idx_shops_opening_balance ON shops(opening_counter_balance) WHERE opening_counter_balance IS NOT NULL;

-- ===============================================
-- MIGRATION COMPLETE
-- ===============================================
SELECT 'Migration 18: Added opening_counter_balance column to shops table' as status;
