-- ===============================================
-- Wine Shop Inventory Management System
-- MASTER DEPLOYMENT SCRIPT
-- ===============================================
-- 
-- This script deploys the complete database schema for the 
-- Wine Shop Inventory Management System.
-- 
-- Execute this script on a fresh PostgreSQL database to set up:
-- - 10 core tables with proper relationships
-- - Auto-linking triggers for invoice brand matching  
-- - Performance indexes for 3000+ shops and brands
-- - Optimized views for reporting
-- - Comprehensive sanity checks
--
-- IMPORTANT: [[memory:6974518]] This script uses DATABASE_PUBLIC_URL 
-- for public database connections and DATABASE_URL for internal connections.
-- 
-- Usage:
--   psql -d your_database -f deploy_schema.sql
-- 
-- Or execute each part separately:
--   \i 01_extensions_and_tables.sql
--   \i 02_triggers_and_functions.sql  
--   \i 03_views.sql
--   \i 04_indexes.sql
--   \i 05_sanity_checks.sql
-- ===============================================

\echo '==============================================='
\echo 'Wine Shop Inventory Management System'
\echo 'Database Schema Deployment Started'
\echo '==============================================='

-- Set transaction isolation and error handling
\set ON_ERROR_STOP on
BEGIN;

\echo 'Part 1: Creating extensions and tables...'
\i 01_extensions_and_tables.sql

\echo 'Part 2: Creating triggers and functions...'
\i 02_triggers_and_functions.sql

\echo 'Part 3: Creating optimized views...'
\i 03_views.sql

\echo 'Part 4: Creating performance indexes...'
\i 04_indexes.sql

-- Commit the schema changes before running tests
COMMIT;

\echo 'Part 5: Running sanity checks...'
\i 05_sanity_checks.sql

\echo '==============================================='
\echo 'Database Schema Deployment Completed!'
\echo '==============================================='

-- Final verification
SELECT 
    'DEPLOYMENT SUMMARY' as section,
    '==================' as separator;

SELECT 
    'Tables' as object_type,
    COUNT(*) as count
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE';

SELECT 
    'Views' as object_type,
    COUNT(*) as count
FROM information_schema.views 
WHERE table_schema = 'public';

SELECT 
    'Triggers' as object_type,
    COUNT(*) as count
FROM information_schema.triggers 
WHERE trigger_schema = 'public';

SELECT 
    'Indexes' as object_type,
    COUNT(*) as count
FROM pg_indexes 
WHERE schemaname = 'public';

SELECT 
    'Functions' as object_type,
    COUNT(*) as count
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_type = 'FUNCTION';

\echo '==============================================='
\echo 'Schema is ready for production use!'
\echo 'Next steps:'
\echo '1. Update your application to use the new schema'
\echo '2. Migrate existing data if needed'
\echo '3. Configure your ORM/database service layer'
\echo '4. Run the sanity checks periodically'
\echo '==============================================='
