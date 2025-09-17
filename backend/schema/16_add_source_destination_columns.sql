-- Migration 16: Add source_store_code and destination_store_code columns
-- This allows tracking both source and destination for shift operations

-- Add the new columns
ALTER TABLE received_stock_records 
ADD COLUMN source_store_code VARCHAR(7),
ADD COLUMN destination_store_code VARCHAR(7);

-- Add comments
COMMENT ON COLUMN received_stock_records.source_store_code IS '7-digit retailer code of the source store for shift-in operations';
COMMENT ON COLUMN received_stock_records.destination_store_code IS '7-digit retailer code of the destination store for shift-out operations';

-- Add constraints to ensure 7-digit format
ALTER TABLE received_stock_records 
ADD CONSTRAINT chk_source_store_code_valid 
CHECK (source_store_code IS NULL OR source_store_code ~ '^\d{7}$');

ALTER TABLE received_stock_records 
ADD CONSTRAINT chk_destination_store_code_valid 
CHECK (destination_store_code IS NULL OR destination_store_code ~ '^\d{7}$');

-- Add indexes for better query performance
CREATE INDEX idx_received_stock_source_store ON received_stock_records(source_store_code) 
WHERE source_store_code IS NOT NULL;

CREATE INDEX idx_received_stock_destination_store ON received_stock_records(destination_store_code) 
WHERE destination_store_code IS NOT NULL;

-- Update the total_received calculation to include both directions
-- (This will be handled by the existing generated column logic)
