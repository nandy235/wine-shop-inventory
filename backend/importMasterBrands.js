#!/usr/bin/env node

/**
 * Master Brands CSV Import Script
 * 
 * Imports all 2,267+ brand records from masterbrands.csv into the master_brands table
 * Preserves 4-digit brand numbers with leading zeros (e.g., "0012")
 * Handles data validation and transformation according to database schema
 * 
 * Usage: node importMasterBrands.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Pool } = require('pg');

// Load environment variables
require('dotenv').config();

// Database configuration - Railway setup
// Use PUBLIC_URL for local development, DATABASE_URL for Railway deployment
const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || 'postgresql://localhost:5432/wine_inventory';
const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('railway') ? { rejectUnauthorized: false } : false
});

console.log('🔗 Connecting to database:', databaseUrl.replace(/\/\/.*@/, '//***:***@')); // Hide credentials in log

// Command line arguments
const isDryRun = process.argv.includes('--dry-run');

// Statistics tracking
const stats = {
    totalRows: 0,
    successfulInserts: 0,
    skippedRows: 0,
    errors: 0,
    duplicates: 0
};

/**
 * Maps CSV product category to database product_type enum
 */
function mapProductType(category) {
    if (!category) return 'IML';
    
    const categoryUpper = category.toUpperCase().trim();
    
    switch (categoryUpper) {
        case 'IML':
            return 'IML';
        case 'DUTY PAID':
        case 'DUTY_PAID':
            return 'DUTY_PAID';
        case 'BEER':
            return 'BEER';
        case 'DUTY_FREE':
        case 'DUTY FREE':
            return 'DUTY_FREE';
        default:
            console.warn(`Unknown category: "${category}", defaulting to IML`);
            return 'IML';
    }
}

/**
 * Validates and cleans pack type
 */
function validatePackType(packType) {
    if (!packType) return 'G';
    
    const cleanType = packType.trim().toUpperCase();
    if (['G', 'P', 'C', 'B'].includes(cleanType)) {
        return cleanType;
    }
    
    console.warn(`Invalid pack type: "${packType}", defaulting to G`);
    return 'G';
}

/**
 * Ensures brand number is exactly 4 digits with leading zeros
 */
function formatBrandNumber(brandNumber) {
    if (!brandNumber) return null;
    
    // Remove any whitespace and ensure it's a string
    const cleaned = String(brandNumber).trim();
    
    // If it's already 4 digits, return as-is
    if (/^\d{4}$/.test(cleaned)) {
        return cleaned;
    }
    
    // If it's a number without leading zeros, pad to 4 digits
    const numericValue = parseInt(cleaned, 10);
    if (!isNaN(numericValue) && numericValue >= 0 && numericValue <= 9999) {
        return numericValue.toString().padStart(4, '0');
    }
    
    console.warn(`Invalid brand number format: "${brandNumber}"`);
    return null;
}

/**
 * Cleans and truncates brand name to fit database constraints
 */
function cleanBrandName(productName) {
    if (!productName) return '';
    
    // Clean up the name and truncate to 255 characters
    return productName.trim().substring(0, 255);
}

/**
 * Maps and validates brand kind (sub-category) from CSV
 */
function mapBrandKind(subCategory) {
    if (!subCategory) return null;
    
    const cleaned = subCategory.trim().toUpperCase();
    
    // Handle the special case that appears in CSV
    if (cleaned === 'SUB CATEGORY') return null;
    
    // Map known sub-categories
    const validKinds = [
        'WHISKY', 'WINE', 'BEER', 'BRANDY', 'VODKA', 'RUM', 'GIN',
        'READY TO DRINK', 'LIQUEUR', 'TEQUILA', 'SPIRIT'
    ];
    
    // Handle the specific case in CSV data
    if (cleaned.includes('TI MANSION HOUSE XO BRANDY')) {
        return 'BRANDY';
    }
    
    // Check if it's a valid kind
    if (validKinds.includes(cleaned)) {
        return cleaned;
    }
    
    // Log unknown sub-categories for review
    if (cleaned && cleaned !== '') {
        console.warn(`Unknown sub-category: "${subCategory}", setting to null`);
    }
    
    return null;
}

/**
 * Parses and validates MRP value
 */
function parseMRP(mrpValue) {
    if (!mrpValue) return null;
    
    const parsed = parseFloat(mrpValue);
    if (isNaN(parsed) || parsed < 0) return null;
    
    return parsed;
}

/**
 * Parses and validates integer fields
 */
function parseInteger(value, defaultValue = 0) {
    if (!value) return defaultValue;
    
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 0) return defaultValue;
    
    return parsed;
}

/**
 * Processes a single CSV row and returns formatted data for database insertion
 */
function processCSVRow(row) {
    try {
        const brandNumber = formatBrandNumber(row['Brand Number']);
        if (!brandNumber) {
            throw new Error(`Invalid brand number: ${row['Brand Number']}`);
        }

        const sizeML = parseInteger(row['Size_ml']);
        if (sizeML <= 0) {
            throw new Error(`Invalid size_ml: ${row['Size_ml']}`);
        }

        const brandName = cleanBrandName(row['Product Name']);
        if (!brandName) {
            throw new Error(`Missing product name`);
        }

        const sizeCode = row['Size Code']?.trim() || '';
        const productType = mapProductType(row['Category']);
        const packType = validatePackType(row['Pack Type']);
        const packQuantity = parseInteger(row['Pack Quantity'], 12);
        const standardMRP = parseMRP(row['MRP']);
        const invoicePrice = parseMRP(row['Invoice']) || (parseMRP(row['Issue Price']) / packQuantity);
        const specialMargin = parseMRP(row['Special Margin']);
        const specialExciseCess = parseMRP(row['Special Cess']);
        const brandKind = mapBrandKind(row[' Sub Category']); // Note the leading space in CSV header

        return {
            brandNumber,
            sizeML,
            brandName,
            sizeCode,
            productType,
            packType,
            packQuantity,
            standardMRP,

            issuePrice: invoicePrice, // Use pre-calculated invoice price or calculate from issue price
            specialMargin,
            specialExciseCess,
            brandKind,
            isActive: true
        };
    } catch (error) {
        throw new Error(`Row processing error: ${error.message}`);
    }
}

/**
 * Inserts a batch of records into the database
 */
async function insertBatch(records) {
    if (records.length === 0) return;

    const query = `
        INSERT INTO master_brands (
            brand_number, size_ml, brand_name, size_code, 
            product_type, pack_type, pack_quantity, standard_mrp, 
            invoice, special_margin, special_excise_cess, brand_kind, is_active
        ) VALUES ${records.map((_, i) => 
            `($${i * 13 + 1}, $${i * 13 + 2}, $${i * 13 + 3}, $${i * 13 + 4}, $${i * 13 + 5}, $${i * 13 + 6}, $${i * 13 + 7}, $${i * 13 + 8}, $${i * 13 + 9}, $${i * 13 + 10}, $${i * 13 + 11}, $${i * 13 + 12}, $${i * 13 + 13})`
        ).join(', ')}
        ON CONFLICT (brand_number, size_ml, pack_quantity, pack_type) DO UPDATE SET
            brand_name = CASE 
                WHEN EXCLUDED.standard_mrp > master_brands.standard_mrp THEN EXCLUDED.brand_name 
                ELSE master_brands.brand_name 
            END,
            size_code = CASE 
                WHEN EXCLUDED.standard_mrp > master_brands.standard_mrp THEN EXCLUDED.size_code 
                ELSE master_brands.size_code 
            END,
            product_type = CASE 
                WHEN EXCLUDED.standard_mrp > master_brands.standard_mrp THEN EXCLUDED.product_type 
                ELSE master_brands.product_type 
            END,
            pack_type = CASE 
                WHEN EXCLUDED.standard_mrp > master_brands.standard_mrp THEN EXCLUDED.pack_type 
                ELSE master_brands.pack_type 
            END,
            pack_quantity = CASE 
                WHEN EXCLUDED.standard_mrp > master_brands.standard_mrp THEN EXCLUDED.pack_quantity 
                ELSE master_brands.pack_quantity 
            END,
            standard_mrp = CASE 
                WHEN EXCLUDED.standard_mrp > master_brands.standard_mrp THEN EXCLUDED.standard_mrp 
                ELSE master_brands.standard_mrp 
            END,
            invoice = EXCLUDED.invoice,
            special_margin = EXCLUDED.special_margin,
            special_excise_cess = EXCLUDED.special_excise_cess,
            brand_kind = CASE 
                WHEN EXCLUDED.standard_mrp > master_brands.standard_mrp THEN EXCLUDED.brand_kind 
                ELSE master_brands.brand_kind 
            END,
            is_active = EXCLUDED.is_active
        RETURNING id, brand_number, size_ml;
    `;

    const values = records.flatMap(record => [
        record.brandNumber,
        record.sizeML,
        record.brandName,
        record.sizeCode,
        record.productType,
        record.packType,
        record.packQuantity,
        record.standardMRP,
        record.issuePrice,
        record.specialMargin,
        record.specialExciseCess,
        record.brandKind,
        record.isActive
    ]);

    try {
        const result = await pool.query(query, values);
        stats.successfulInserts += result.rows.length;
        
        // Log sample of successful insertions
        if (result.rows.length > 0) {
            console.log(`✓ Inserted/Updated ${result.rows.length} records (sample: ${result.rows[0].brand_number})`);
        }
    } catch (error) {
        if (error.code === '23505') {
            // Unique constraint violation - shouldn't happen with ON CONFLICT, but just in case
            stats.duplicates += records.length;
            console.warn(`⚠ Duplicate entries detected in batch`);
        } else {
            stats.errors += records.length;
            console.error(`✗ Batch insert failed:`, error.message);
            
            // Try individual inserts to identify problematic records
            for (const record of records) {
                try {
                    await insertSingleRecord(record);
                } catch (singleError) {
                    console.error(`✗ Failed to insert brand ${record.brandNumber}: ${singleError.message}`);
                }
            }
        }
    }
}

/**
 * Inserts a single record (fallback for batch failures)
 */
async function insertSingleRecord(record) {
    const query = `
        INSERT INTO master_brands (
            brand_number, size_ml, brand_name, size_code, 
            product_type, pack_type, pack_quantity, standard_mrp, 
            invoice, special_margin, special_excise_cess, brand_kind, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (brand_number, size_ml, pack_quantity, pack_type) DO UPDATE SET
            brand_name = CASE 
                WHEN EXCLUDED.standard_mrp > master_brands.standard_mrp THEN EXCLUDED.brand_name 
                ELSE master_brands.brand_name 
            END,
            size_code = CASE 
                WHEN EXCLUDED.standard_mrp > master_brands.standard_mrp THEN EXCLUDED.size_code 
                ELSE master_brands.size_code 
            END,
            product_type = CASE 
                WHEN EXCLUDED.standard_mrp > master_brands.standard_mrp THEN EXCLUDED.product_type 
                ELSE master_brands.product_type 
            END,
            pack_type = CASE 
                WHEN EXCLUDED.standard_mrp > master_brands.standard_mrp THEN EXCLUDED.pack_type 
                ELSE master_brands.pack_type 
            END,
            pack_quantity = CASE 
                WHEN EXCLUDED.standard_mrp > master_brands.standard_mrp THEN EXCLUDED.pack_quantity 
                ELSE master_brands.pack_quantity 
            END,
            standard_mrp = CASE 
                WHEN EXCLUDED.standard_mrp > master_brands.standard_mrp THEN EXCLUDED.standard_mrp 
                ELSE master_brands.standard_mrp 
            END,
            brand_kind = CASE 
                WHEN EXCLUDED.standard_mrp > master_brands.standard_mrp THEN EXCLUDED.brand_kind 
                ELSE master_brands.brand_kind 
            END,
            invoice = EXCLUDED.invoice,
            special_margin = EXCLUDED.special_margin,
            special_excise_cess = EXCLUDED.special_excise_cess,
            is_active = EXCLUDED.is_active
        RETURNING id;
    `;

    const values = [
        record.brandNumber,
        record.sizeML,
        record.brandName,
        record.sizeCode,
        record.productType,
        record.packType,
        record.packQuantity,
        record.standardMRP,
        record.issuePrice,
        record.specialMargin,
        record.specialExciseCess,
        record.brandKind,
        record.isActive
    ];

    const result = await pool.query(query, values);
    stats.successfulInserts++;
    return result.rows[0].id;
}

/**
 * Main import function
 */
async function importMasterBrands() {
    const csvFilePath = path.join(__dirname, '../masterbrands.csv');
    
    if (!fs.existsSync(csvFilePath)) {
        throw new Error(`CSV file not found: ${csvFilePath}`);
    }

    console.log('🚀 Starting Master Brands Import...');
    console.log(`📁 Reading from: ${csvFilePath}`);
    console.log(`🔄 Mode: ${isDryRun ? 'DRY RUN' : 'LIVE IMPORT'}`);
    console.log('');

    // Test database connection
    try {
        await pool.query('SELECT 1');
        console.log('✓ Database connection successful');
    } catch (error) {
        throw new Error(`Database connection failed: ${error.message}`);
    }

    // Check if master_brands table exists
    try {
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'master_brands'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            throw new Error('master_brands table does not exist. Please run the schema deployment first.');
        }
        console.log('✓ master_brands table exists');
    } catch (error) {
        throw new Error(`Table check failed: ${error.message}`);
    }

    return new Promise((resolve, reject) => {
        const records = [];
        const batchSize = 100; // Process in batches of 100

        const stream = fs.createReadStream(csvFilePath)
            .pipe(csv())
            .on('data', (row) => {
                stats.totalRows++;
                
                try {
                    const processedRecord = processCSVRow(row);
                    records.push(processedRecord);
                    
                    // Process batch when it reaches batchSize
                    if (records.length >= batchSize) {
                        stream.pause();
                        
                        if (!isDryRun) {
                            insertBatch(records.splice(0, batchSize))
                                .then(() => stream.resume())
                                .catch(error => {
                                    console.error('Batch processing error:', error);
                                    stream.resume();
                                });
                        } else {
                            // In dry run mode, just log the batch
                            const batch = records.splice(0, batchSize);
                            console.log(`📋 [DRY RUN] Would process batch of ${batch.length} records (sample: ${batch[0].brandNumber})`);
                            stream.resume();
                        }
                    }
                    
                    // Progress indicator
                    if (stats.totalRows % 500 === 0) {
                        console.log(`📊 Processed ${stats.totalRows} rows...`);
                    }
                    
                } catch (error) {
                    stats.errors++;
                    stats.skippedRows++;
                    console.error(`✗ Row ${stats.totalRows} error: ${error.message}`);
                    console.error(`   Raw data:`, JSON.stringify(row, null, 2));
                }
            })
            .on('end', async () => {
                console.log('📁 CSV file reading completed');
                
                // Process remaining records
                if (records.length > 0) {
                    if (!isDryRun) {
                        try {
                            await insertBatch(records);
                        } catch (error) {
                            console.error('Final batch processing error:', error);
                        }
                    } else {
                        console.log(`📋 [DRY RUN] Would process final batch of ${records.length} records`);
                    }
                }
                
                resolve();
            })
            .on('error', (error) => {
                reject(new Error(`CSV reading error: ${error.message}`));
            });
    });
}

/**
 * Prints final import statistics
 */
function printStatistics() {
    console.log('\n' + '='.repeat(50));
    console.log('📊 IMPORT STATISTICS');
    console.log('='.repeat(50));
    console.log(`Total rows processed: ${stats.totalRows}`);
    console.log(`Successful inserts: ${stats.successfulInserts}`);
    console.log(`Skipped rows: ${stats.skippedRows}`);
    console.log(`Duplicates handled: ${stats.duplicates}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`Success rate: ${((stats.successfulInserts / Math.max(stats.totalRows - stats.skippedRows, 1)) * 100).toFixed(2)}%`);
    console.log('='.repeat(50));
    
    if (isDryRun) {
        console.log('🔍 This was a DRY RUN - no data was actually inserted');
        console.log('   Run without --dry-run flag to perform actual import');
    } else {
        console.log('✅ Import completed successfully!');
    }
}

/**
 * Validates sample data and shows what would be imported
 */
async function validateSampleData() {
    const csvFilePath = path.join(__dirname, '../masterbrands.csv');
    
    console.log('🔍 Validating sample data...\n');
    
    return new Promise((resolve, reject) => {
        let count = 0;
        const sampleSize = 10;
        
        fs.createReadStream(csvFilePath)
            .pipe(csv())
            .on('data', (row) => {
                if (count < sampleSize) {
                    try {
                        const processed = processCSVRow(row);
                        console.log(`✓ Sample ${count + 1}:`);
                        console.log(`  Brand: ${processed.brandNumber} | ${processed.brandName}`);
                        console.log(`  Size: ${processed.sizeML}ml (${processed.sizeCode}) | Pack: ${processed.packQuantity} ${processed.packType}`);
                        console.log(`  Type: ${processed.productType} | Kind: ${processed.brandKind || 'N/A'}`);
                        console.log(`  💰 MRP: ₹${processed.standardMRP || 'N/A'} | Invoice/bottle: ₹${processed.issuePrice || 'N/A'} | Margin: ₹${processed.specialMargin || 'N/A'} | Cess: ₹${processed.specialExciseCess || 'N/A'}`);
                        console.log('');
                    } catch (error) {
                        console.error(`✗ Sample ${count + 1} error: ${error.message}`);
                    }
                }
                count++;
            })
            .on('end', () => {
                console.log(`📊 Total records in CSV: ${count}`);
                resolve();
            })
            .on('error', reject);
    });
}

// Main execution
async function main() {
    try {
        console.log('🍷 Master Brands Import Script');
        console.log('================================\n');
        
        // Show sample data validation first
        await validateSampleData();
        
        // Perform the import
        await importMasterBrands();
        
        // Print final statistics
        printStatistics();
        
    } catch (error) {
        console.error('💥 Import failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n⏹ Import interrupted by user');
    printStatistics();
    await pool.end();
    process.exit(0);
});

// Execute if called directly
if (require.main === module) {
    main();
}

module.exports = { importMasterBrands, processCSVRow, formatBrandNumber };
