-- ===============================================
-- Wine Shop Inventory Management System
-- Remove received_stock constraint from daily_stock_records
-- Rely on shop_inventory.current_quantity >= 0 for stock validation
-- ===============================================

BEGIN;

-- Drop the existing constraint
ALTER TABLE daily_stock_records DROP CONSTRAINT IF EXISTS chk_nonnegative_vals;

-- Add simplified constraint without received_stock restriction
-- Let shop_inventory.current_quantity >= 0 handle the actual stock validation
ALTER TABLE daily_stock_records ADD CONSTRAINT chk_nonnegative_vals CHECK (
    opening_stock >= 0 AND
    (closing_stock IS NULL OR closing_stock >= 0) AND
    (price_per_unit IS NULL OR price_per_unit >= 0)
);

-- Add comment explaining the logic
COMMENT ON CONSTRAINT chk_nonnegative_vals ON daily_stock_records IS 
'Basic validation for daily stock records. Stock availability is enforced by shop_inventory.current_quantity >= 0';

COMMIT;

-- ===============================================
-- VERIFICATION
-- ===============================================
SELECT 'Constraint updated successfully!' as status;
SELECT 'received_stock can now be any value - stock validation handled by shop_inventory' as change_made;
