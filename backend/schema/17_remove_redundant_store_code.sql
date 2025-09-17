-- Migration 17: Remove redundant store_code column
-- Since we now have source_store_code and destination_store_code for better tracking,
-- the old store_code column is no longer needed

-- First, drop the constraint and index on store_code
ALTER TABLE received_stock_records DROP CONSTRAINT IF EXISTS chk_store_code_valid;
DROP INDEX IF EXISTS idx_received_stock_store_code;

-- Drop the store_code column
ALTER TABLE received_stock_records DROP COLUMN IF EXISTS store_code;

-- Update any views that might reference store_code
-- (This will be handled by recreating the views if needed)
