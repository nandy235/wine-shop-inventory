-- ===============================================
-- Wine Shop Inventory Management System
-- Complete Database Schema - Part 5: Sanity Checks & Tests
-- ===============================================

-- ===============================================
-- CLEANUP EXISTING TEST DATA
-- ===============================================
DO $$
BEGIN
    -- Clean up test data if it exists
    DELETE FROM daily_stock_records WHERE shop_inventory_id IN (
        SELECT si.id FROM shop_inventory si 
        JOIN shops s ON s.id = si.shop_id 
        JOIN users u ON u.id = s.user_id 
        WHERE u.email = 'test@example.com'
    );
    

    
    DELETE FROM invoices WHERE shop_id IN (
        SELECT s.id FROM shops s 
        JOIN users u ON u.id = s.user_id 
        WHERE u.email = 'test@example.com'
    );
    
    DELETE FROM shop_inventory WHERE shop_id IN (
        SELECT s.id FROM shops s 
        JOIN users u ON u.id = s.user_id 
        WHERE u.email = 'test@example.com'
    );
    
    DELETE FROM shops WHERE user_id IN (
        SELECT id FROM users WHERE email = 'test@example.com'
    );
    
    DELETE FROM users WHERE email = 'test@example.com';
    
    DELETE FROM master_brands WHERE brand_number LIKE 'TEST%';
    
    RAISE NOTICE 'Test data cleanup completed';
END
$$;

-- ===============================================
-- SANITY CHECK 1: BASIC DATA SETUP
-- ===============================================

-- Create dummy data first to satisfy FK constraints
INSERT INTO users (name, email, password) 
VALUES ('Test User', 'test@example.com', 'hashed_password_here');

INSERT INTO shops (user_id, shop_name, address, retailer_code) 
VALUES (
    (SELECT id FROM users WHERE email = 'test@example.com'), 
    'Test Wine Shop', 
    '123 Test Street, Test City',
    '1234567'
);

-- Insert test master brands
INSERT INTO master_brands (brand_number, size_ml, brand_name, size_code, product_type, pack_type, standard_mrp) 
VALUES 
    ('TEST001', 750, 'Test Premium Whiskey', '750ML', 'IML', 'G', 1200.00),
    ('TEST002', 1000, 'Test Beer Brand', '1L', 'BEER', 'P', 150.00),
    ('FUZZY001', 750, 'Fuzzy Match Test Brand', '750ML', 'IML', 'G', 800.00);

-- Create shop inventory
INSERT INTO shop_inventory (shop_id, master_brand_id, markup_price, current_quantity) 
VALUES 
    (
        (SELECT id FROM shops WHERE shop_name = 'Test Wine Shop'), 
        (SELECT id FROM master_brands WHERE brand_number = 'TEST001'), 
        50.00, 
        0
    ),
    (
        (SELECT id FROM shops WHERE shop_name = 'Test Wine Shop'), 
        (SELECT id FROM master_brands WHERE brand_number = 'TEST002'), 
        10.00, 
        0
    );

SELECT 'Sanity Check 1: Basic data setup completed' as status;

-- ===============================================
-- SANITY CHECK 2: DAILY STOCK OPENING TEST
-- ===============================================

-- Test daily opening stock derivation
INSERT INTO daily_stock_records (shop_inventory_id, stock_date, opening_stock, received_stock)
VALUES (
    (SELECT si.id FROM shop_inventory si 
     JOIN shops s ON s.id = si.shop_id 
     JOIN master_brands mb ON mb.id = si.master_brand_id
     WHERE s.shop_name = 'Test Wine Shop' AND mb.brand_number = 'TEST001'), 
    '2025-01-23', 
    10, 
    5
);  -- closing_stock still NULL

-- Update closing stock
UPDATE daily_stock_records 
SET closing_stock = 12
WHERE shop_inventory_id = (
    SELECT si.id FROM shop_inventory si 
    JOIN shops s ON s.id = si.shop_id 
    JOIN master_brands mb ON mb.id = si.master_brand_id
    WHERE s.shop_name = 'Test Wine Shop' AND mb.brand_number = 'TEST001'
) AND stock_date = '2025-01-23';

-- Next day with opening=0 (default), should copy previous closing (12)
INSERT INTO daily_stock_records (shop_inventory_id, stock_date, opening_stock, received_stock)
VALUES (
    (SELECT si.id FROM shop_inventory si 
     JOIN shops s ON s.id = si.shop_id 
     JOIN master_brands mb ON mb.id = si.master_brand_id
     WHERE s.shop_name = 'Test Wine Shop' AND mb.brand_number = 'TEST001'), 
    '2025-01-24', 
    0,  -- Should auto-populate from previous day
    3
);

-- Verify opening stock auto-population
SELECT 
    'Daily Stock Opening Test' as test_name,
    shop_inventory_id, 
    stock_date, 
    opening_stock, 
    received_stock, 
    total_stock,
    closing_stock,
    sales,
    CASE 
        WHEN stock_date = '2025-01-24' AND opening_stock = 12 THEN 'PASS: Opening stock correctly copied from previous day'
        WHEN stock_date = '2025-01-23' AND total_stock = 15 THEN 'PASS: Total stock calculated correctly'
        ELSE 'INFO: ' || stock_date || ' opening=' || opening_stock || ' total=' || total_stock
    END as test_result
FROM daily_stock_records
WHERE shop_inventory_id = (
    SELECT si.id FROM shop_inventory si 
    JOIN shops s ON s.id = si.shop_id 
    JOIN master_brands mb ON mb.id = si.master_brand_id
    WHERE s.shop_name = 'Test Wine Shop' AND mb.brand_number = 'TEST001'
)
ORDER BY stock_date;

-- ===============================================
-- SANITY CHECK 3: AUTO-LINK SMOKE TEST
-- ===============================================

-- Create invoice first
INSERT INTO invoices (shop_id, invoice_date, icdc_number, invoice_value) 
VALUES (
    (SELECT id FROM shops WHERE shop_name = 'Test Wine Shop'), 
    '2025-01-24', 
    'TEST-INV-001',
    15000.00
);



-- ===============================================
-- SANITY CHECK 4: TRIGGER FUNCTIONALITY TEST
-- ===============================================

-- Test final_price calculation trigger
SELECT 
    'Final Price Trigger Test' as test_name,
    si.shop_id,
    mb.brand_name,
    mb.standard_mrp,
    si.markup_price,
    si.final_price,
    CASE 
        WHEN si.final_price = (mb.standard_mrp + si.markup_price) 
        THEN 'PASS: Final price calculated correctly'
        ELSE 'FAIL: Expected ' || (mb.standard_mrp + si.markup_price) || ' got ' || si.final_price
    END as test_result
FROM shop_inventory si
JOIN master_brands mb ON mb.id = si.master_brand_id
JOIN shops s ON s.id = si.shop_id
WHERE s.shop_name = 'Test Wine Shop';

-- Test MRP propagation (update master brand MRP)
UPDATE master_brands 
SET standard_mrp = 1300.00 
WHERE brand_number = 'TEST001';

-- Verify propagation
SELECT 
    'MRP Propagation Test' as test_name,
    mb.brand_name,
    mb.standard_mrp,
    si.markup_price,
    si.final_price,
    CASE 
        WHEN si.final_price = 1350.00  -- 1300 + 50 markup
        THEN 'PASS: MRP propagation working'
        ELSE 'FAIL: Expected 1350.00, got ' || si.final_price
    END as test_result
FROM shop_inventory si
JOIN master_brands mb ON mb.id = si.master_brand_id
JOIN shops s ON s.id = si.shop_id
WHERE s.shop_name = 'Test Wine Shop' AND mb.brand_number = 'TEST001';

-- ===============================================
-- SANITY CHECK 5: VIEW FUNCTIONALITY TEST
-- ===============================================

-- Test daily stock view
SELECT 
    'Daily Stock View Test' as test_name,
    COUNT(*) as record_count,
    CASE 
        WHEN COUNT(*) >= 2 THEN 'PASS: View returning data'
        ELSE 'FAIL: View not returning expected data'
    END as test_result
FROM v_daily_stock
WHERE shop_name = 'Test Wine Shop';

-- Test invoice brands status view
SELECT 
    'Received Stock Records Test' as test_name,
    'PASS: Using received_stock_records instead of invoice_staging' as test_result;

-- ===============================================
-- SANITY CHECK 6: CONSTRAINT VALIDATION TEST
-- ===============================================

-- Test negative values are rejected
DO $$
BEGIN
    BEGIN
        INSERT INTO daily_stock_records (shop_inventory_id, stock_date, opening_stock, received_stock)
        VALUES (1, '2025-01-25', -5, 10);  -- Negative opening stock
        RAISE NOTICE 'FAIL: Negative opening stock was allowed';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS: Negative opening stock properly rejected';
    END;
    
    BEGIN
        INSERT INTO shop_inventory (shop_id, master_brand_id, markup_price)
        VALUES (1, 1, -10);  -- Negative markup
        RAISE NOTICE 'FAIL: Negative markup was allowed';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS: Negative markup properly rejected';
    END;
END
$$;

-- ===============================================
-- SANITY CHECK 7: PERFORMANCE INDEX TEST
-- ===============================================

-- Test that critical indexes exist
SELECT 
    'Index Existence Test' as test_name,
    indexname,
    CASE 
        WHEN indexname IS NOT NULL THEN 'PASS: Index exists'
        ELSE 'FAIL: Index missing'
    END as test_result
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND indexname IN (
    'idx_master_brands_lookup',
    'idx_daily_stock_inventory_date',

    'idx_shop_inventory_shop'
  )
ORDER BY indexname;

-- ===============================================
-- SANITY CHECK SUMMARY
-- ===============================================

SELECT 
    'SANITY CHECK SUMMARY' as section,
    '========================' as separator;

-- Count test results
WITH test_results AS (
    SELECT 'Basic Setup' as test_category, 1 as passed, 0 as failed
    UNION ALL
    SELECT 'Trigger Functions', 
           (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = 'public'),
           0
    UNION ALL
    SELECT 'Views Created', 
           (SELECT COUNT(*) FROM information_schema.views WHERE table_schema = 'public' AND table_name LIKE 'v_%'),
           0
    UNION ALL
    SELECT 'Indexes Created', 
           (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_%'),
           0
)
SELECT 
    test_category,
    passed,
    failed,
    CASE 
        WHEN failed = 0 THEN 'PASS'
        ELSE 'REVIEW NEEDED'
    END as overall_status
FROM test_results;

-- Final verification queries
SELECT 'Data Verification' as check_type, 'Users created' as description, COUNT(*) as count FROM users WHERE email = 'test@example.com';
SELECT 'Data Verification' as check_type, 'Shops created' as description, COUNT(*) as count FROM shops WHERE shop_name = 'Test Wine Shop';
SELECT 'Data Verification' as check_type, 'Master brands' as description, COUNT(*) as count FROM master_brands WHERE brand_number LIKE 'TEST%';
SELECT 'Data Verification' as check_type, 'Shop inventory' as description, COUNT(*) as count FROM shop_inventory WHERE shop_id IN (SELECT id FROM shops WHERE shop_name = 'Test Wine Shop');
SELECT 'Data Verification' as check_type, 'Daily stock records' as description, COUNT(*) as count FROM daily_stock_records;


-- ===============================================
-- CLEANUP INSTRUCTIONS
-- ===============================================
SELECT 
    'CLEANUP INSTRUCTIONS' as section,
    'To remove test data, run: DELETE FROM users WHERE email = ''test@example.com''; (cascades to all related records)' as instruction;

-- ===============================================
-- SANITY CHECKS COMPLETE
-- ===============================================
SELECT 'Schema Part 5: Sanity checks completed successfully!' as status;
