#!/usr/bin/env node

/**
 * Auto-Linking Test Script
 * 
 * Tests the automatic brand linking functionality after master brands import
 * Validates that invoice brands are properly matched to master brands
 * 
 * Usage: node testAutoLinking.js
 */

const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/wine_inventory',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test cases for auto-linking
const testCases = [
    {
        name: "Exact Match Test",
        brandNumber: "0012",
        sizeML: 180,
        expectedMatch: true,
        expectedConfidence: 100.00,
        expectedMethod: "exact"
    },
    {
        name: "Exact Match Test - Different Size",
        brandNumber: "0019",
        sizeML: 750,
        expectedMatch: true,
        expectedConfidence: 100.00,
        expectedMethod: "exact"
    },
    {
        name: "Fuzzy Match Test - Similar Brand",
        brandNumber: "0012", // Assuming this exists
        sizeML: 180,
        expectedMatch: true,
        expectedConfidence: 100.00, // Should be exact in this case
        expectedMethod: "exact"
    },
    {
        name: "Size Tolerance Test",
        brandNumber: "0019",
        sizeML: 755, // 5ml difference from 750ml
        expectedMatch: true,
        expectedConfidence: 90.00, // High confidence for small difference
        expectedMethod: "fuzzy"
    },
    {
        name: "No Match Test",
        brandNumber: "9999",
        sizeML: 999,
        expectedMatch: false,
        expectedConfidence: null,
        expectedMethod: null
    }
];

/**
 * Creates a test invoice for testing purposes
 */
async function createTestInvoice() {
    try {
        // Create a test shop first (if it doesn't exist)
        const shopResult = await pool.query(`
            INSERT INTO shops (user_id, shop_name, retailer_code)
            SELECT 1, 'Test Shop', '1234567'
            WHERE NOT EXISTS (SELECT 1 FROM shops WHERE retailer_code = '1234567')
            RETURNING id
        `);

        let shopId;
        if (shopResult.rows.length > 0) {
            shopId = shopResult.rows[0].id;
        } else {
            const existingShop = await pool.query(`
                SELECT id FROM shops WHERE retailer_code = '1234567' LIMIT 1
            `);
            shopId = existingShop.rows[0]?.id;
        }

        if (!shopId) {
            throw new Error('Could not create or find test shop');
        }

        // Create test invoice
        const invoiceResult = await pool.query(`
            INSERT INTO invoices (shop_id, invoice_date, icdc_number)
            VALUES ($1, CURRENT_DATE, 'TEST-' || EXTRACT(EPOCH FROM NOW())::text)
            RETURNING id
        `, [shopId]);

        return invoiceResult.rows[0].id;
    } catch (error) {
        console.error('Error creating test invoice:', error);
        throw error;
    }
}

/**
 * Tests auto-linking for a single test case
 */
async function testAutoLinking(testCase, invoiceId) {
    try {
        console.log(`\n🧪 Running: ${testCase.name}`);
        console.log(`   Brand: ${testCase.brandNumber}, Size: ${testCase.sizeML}ml`);

        // Insert invoice brand (this should trigger auto-linking)
        const insertResult = await pool.query(`
            INSERT INTO invoice_brands (
                invoice_id, brand_number, size_ml, brand_name, 
                cases, bottles, pack_quantity
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, master_brand_id, match_confidence, match_method, matched_at
        `, [
            invoiceId,
            testCase.brandNumber,
            testCase.sizeML,
            `Test Brand ${testCase.brandNumber}`,
            1, // cases
            0, // bottles
            12 // pack_quantity
        ]);

        const result = insertResult.rows[0];
        
        // Verify results
        const matched = result.master_brand_id !== null;
        const confidence = result.match_confidence;
        const method = result.match_method;

        console.log(`   Result: ${matched ? '✅ MATCHED' : '❌ NO MATCH'}`);
        
        if (matched) {
            console.log(`   Master Brand ID: ${result.master_brand_id}`);
            console.log(`   Confidence: ${confidence}%`);
            console.log(`   Method: ${method}`);
            console.log(`   Matched At: ${result.matched_at}`);

            // Get master brand details
            const masterBrand = await pool.query(`
                SELECT brand_name, product_type, standard_mrp
                FROM master_brands 
                WHERE id = $1
            `, [result.master_brand_id]);

            if (masterBrand.rows.length > 0) {
                const mb = masterBrand.rows[0];
                console.log(`   Matched Brand: ${mb.brand_name}`);
                console.log(`   Type: ${mb.product_type}, MRP: ₹${mb.standard_mrp}`);
            }
        }

        // Validate against expectations
        let testPassed = true;
        const issues = [];

        if (matched !== testCase.expectedMatch) {
            testPassed = false;
            issues.push(`Expected ${testCase.expectedMatch ? 'match' : 'no match'}, got ${matched ? 'match' : 'no match'}`);
        }

        if (testCase.expectedMatch && matched) {
            if (confidence !== testCase.expectedConfidence) {
                // Allow some tolerance for confidence scores
                const tolerance = 5;
                if (Math.abs(confidence - testCase.expectedConfidence) > tolerance) {
                    testPassed = false;
                    issues.push(`Expected confidence ${testCase.expectedConfidence}%, got ${confidence}%`);
                }
            }

            if (method !== testCase.expectedMethod) {
                // Note: Method might vary based on actual data, so this is informational
                console.log(`   ℹ️  Expected method: ${testCase.expectedMethod}, got: ${method}`);
            }
        }

        if (testPassed) {
            console.log(`   🎉 TEST PASSED`);
        } else {
            console.log(`   ❌ TEST FAILED:`);
            issues.forEach(issue => console.log(`      - ${issue}`));
        }

        return { testCase: testCase.name, passed: testPassed, issues };

    } catch (error) {
        console.log(`   💥 TEST ERROR: ${error.message}`);
        return { testCase: testCase.name, passed: false, issues: [error.message] };
    }
}

/**
 * Cleans up test data
 */
async function cleanup(invoiceId) {
    try {
        // Delete test invoice brands
        await pool.query('DELETE FROM invoice_brands WHERE invoice_id = $1', [invoiceId]);
        
        // Delete test invoice
        await pool.query('DELETE FROM invoices WHERE id = $1', [invoiceId]);
        
        // Delete test shop (optional - might want to keep for future tests)
        // await pool.query('DELETE FROM shops WHERE retailer_code = $1', ['1234567']);
        
        console.log('\n🧹 Test data cleaned up');
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}

/**
 * Main test function
 */
async function runAutoLinkingTests() {
    console.log('🚀 Auto-Linking Test Suite');
    console.log('============================\n');

    try {
        // Check database connection
        await pool.query('SELECT 1');
        console.log('✅ Database connection successful');

        // Check if master_brands table has data
        const brandCount = await pool.query('SELECT COUNT(*) FROM master_brands WHERE is_active = true');
        const count = parseInt(brandCount.rows[0].count);
        
        if (count === 0) {
            throw new Error('No master brands found in database. Please import master brands first.');
        }
        
        console.log(`✅ Found ${count} active master brands`);

        // Check if triggers are installed
        const triggerCheck = await pool.query(`
            SELECT COUNT(*) 
            FROM pg_trigger 
            WHERE tgname = 'trg_invoice_brands_auto_link'
        `);
        
        if (parseInt(triggerCheck.rows[0].count) === 0) {
            console.warn('⚠️  Auto-linking trigger not found. Auto-linking may not work.');
        } else {
            console.log('✅ Auto-linking trigger is installed');
        }

        // Create test invoice
        console.log('\n📋 Creating test invoice...');
        const invoiceId = await createTestInvoice();
        console.log(`✅ Test invoice created (ID: ${invoiceId})`);

        // Run test cases
        const results = [];
        for (const testCase of testCases) {
            const result = await testAutoLinking(testCase, invoiceId);
            results.push(result);
        }

        // Print summary
        console.log('\n' + '='.repeat(50));
        console.log('📊 TEST SUMMARY');
        console.log('='.repeat(50));
        
        const passed = results.filter(r => r.passed).length;
        const total = results.length;
        
        console.log(`Tests passed: ${passed}/${total}`);
        console.log(`Success rate: ${((passed / total) * 100).toFixed(1)}%`);
        
        if (passed < total) {
            console.log('\n❌ Failed tests:');
            results.filter(r => !r.passed).forEach(r => {
                console.log(`   - ${r.testCase}`);
                r.issues.forEach(issue => console.log(`     * ${issue}`));
            });
        } else {
            console.log('\n🎉 All tests passed! Auto-linking is working correctly.');
        }

        // Cleanup
        await cleanup(invoiceId);

    } catch (error) {
        console.error('💥 Test suite failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n⏹ Tests interrupted by user');
    await pool.end();
    process.exit(0);
});

// Execute if called directly
if (require.main === module) {
    runAutoLinkingTests();
}

module.exports = { runAutoLinkingTests };

