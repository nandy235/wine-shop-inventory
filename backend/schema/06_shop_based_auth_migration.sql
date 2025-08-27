-- ===============================================
-- Shop-Based Authentication Migration
-- Move password from users to shops table
-- Keep shops.user_id for multiple shops per user
-- ===============================================

-- 1. Add password field to shops table
ALTER TABLE shops ADD COLUMN password VARCHAR(255);

-- 2. Remove password from users table (after ensuring shops have passwords)
-- ALTER TABLE users DROP COLUMN password;  -- Commented out for safety

-- Note: Keep existing shops.user_id relationship for multiple shops per user
-- No need to add users.shop_id - users can have multiple shops

-- ===============================================
-- Comments for the new schema
-- ===============================================

COMMENT ON COLUMN shops.password IS 'Shop-specific password for retailer code login';
COMMENT ON COLUMN shops.user_id IS 'User who owns/manages this shop (one user can have multiple shops)';

SELECT 'Shop-based authentication migration completed!' as status;
