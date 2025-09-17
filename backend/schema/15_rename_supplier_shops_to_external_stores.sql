-- ===============================================
-- Wine Shop Inventory Management System
-- Rename supplier_shops table to external_stores
-- ===============================================

BEGIN;

-- ===============================================
-- RENAME TABLE
-- ===============================================

-- 1. Rename the table from supplier_shops to external_stores
ALTER TABLE supplier_shops RENAME TO external_stores;

-- ===============================================
-- UPDATE COMMENTS
-- ===============================================

-- Update table comment
COMMENT ON TABLE external_stores IS 'External stores/suppliers that can supply stock to shops';

-- Update column comments
COMMENT ON COLUMN external_stores.shop_id IS 'Reference to the shop that added this external store';
COMMENT ON COLUMN external_stores.shop_name IS 'Name of the external store/supplier';
COMMENT ON COLUMN external_stores.retailer_code IS '7-digit retailer code of the external store';
COMMENT ON COLUMN external_stores.contact IS 'Contact information for the external store';

-- ===============================================
-- VERIFICATION
-- ===============================================
SELECT 'Table renamed successfully!' as status;
SELECT 'supplier_shops → external_stores' as change_made;

COMMIT;
