-- Create invoice_staging table to store temporary invoice data
-- This table stores parsed invoice data temporarily until confirmation

CREATE TABLE IF NOT EXISTS invoice_staging (
    id SERIAL PRIMARY KEY,
    temp_id VARCHAR(100) UNIQUE NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    invoice_number VARCHAR(100),
    invoice_date DATE,
    invoice_value DECIMAL(10,2),
    net_invoice_value DECIMAL(10,2),
    mrp_rounding_off DECIMAL(10,2),
    retail_shop_excise_tax DECIMAL(10,2),
    retail_excise_turnover_tax DECIMAL(10,2),
    special_excise_cess DECIMAL(10,2),
    tcs DECIMAL(10,2),
    total_amount DECIMAL(10,2),
    confidence DECIMAL(5,2),
    parse_method VARCHAR(50),
    items_data JSONB, -- Store the parsed items as JSON
    summary_data JSONB, -- Store parsing summary
    warnings JSONB, -- Store any warnings
    skipped_items JSONB, -- Store skipped items
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 minutes')
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_invoice_staging_temp_id ON invoice_staging(temp_id);
CREATE INDEX IF NOT EXISTS idx_invoice_staging_expires_at ON invoice_staging(expires_at);
CREATE INDEX IF NOT EXISTS idx_invoice_staging_shop_id ON invoice_staging(shop_id);

-- Create a function to clean up expired records
CREATE OR REPLACE FUNCTION cleanup_expired_invoice_staging()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM invoice_staging WHERE expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE invoice_staging IS 'Temporary storage for parsed invoice data before confirmation';
COMMENT ON COLUMN invoice_staging.temp_id IS 'Temporary ID generated for each upload session';
COMMENT ON COLUMN invoice_staging.expires_at IS 'Expiration time for temporary data (30 minutes from creation)';
COMMENT ON FUNCTION cleanup_expired_invoice_staging() IS 'Function to clean up expired temporary invoice records';
