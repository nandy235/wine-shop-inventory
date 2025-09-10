-- Drop source_shop_id column from received_stock_records table
-- This column is redundant as it's always the current shop for internal transfers
-- and null for external transfers

BEGIN;

-- Drop the column
ALTER TABLE received_stock_records DROP COLUMN IF EXISTS source_shop_id;

-- Update any indexes that might reference this column
-- (Check if any indexes need to be updated)

COMMIT;
