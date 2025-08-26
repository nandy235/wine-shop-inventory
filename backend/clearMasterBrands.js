#!/usr/bin/env node

/**
 * Clear Master Brands Data
 * 
 * Deletes all existing data from the master_brands table for fresh import
 * 
 * Usage: node clearMasterBrands.js
 */

const { Pool } = require('pg');

// Load environment variables
require('dotenv').config();

// Database configuration - Railway setup
const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || 'postgresql://localhost:5432/wine_inventory';
const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('railway') ? { rejectUnauthorized: false } : false
});

async function clearMasterBrands() {
    console.log('🧹 Starting master_brands table cleanup...');
    console.log('🔗 Connecting to database:', databaseUrl.replace(/\/\/.*@/, '//***:***@'));
    
    try {
        // Test connection
        await pool.query('SELECT 1');
        console.log('✅ Database connection successful');
        
        // Check current record count
        const countBefore = await pool.query('SELECT COUNT(*) FROM master_brands');
        const recordCount = parseInt(countBefore.rows[0].count);
        
        console.log(`📊 Current records in master_brands: ${recordCount}`);
        
        if (recordCount === 0) {
            console.log('✅ Table is already empty, no cleanup needed');
            return;
        }
        
        // Confirm deletion
        console.log('⚠️  About to delete all records from master_brands table...');
        
        // Delete all records
        const deleteResult = await pool.query('DELETE FROM master_brands');
        console.log(`🗑️  Deleted ${deleteResult.rowCount} records`);
        
        // Reset the sequence (auto-increment ID)
        await pool.query('ALTER SEQUENCE master_brands_id_seq RESTART WITH 1');
        console.log('🔄 Reset ID sequence to start from 1');
        
        // Verify table is empty
        const countAfter = await pool.query('SELECT COUNT(*) FROM master_brands');
        const finalCount = parseInt(countAfter.rows[0].count);
        
        if (finalCount === 0) {
            console.log('🎉 master_brands table successfully cleared!');
            console.log('   Ready for fresh import');
        } else {
            throw new Error(`Table cleanup incomplete. ${finalCount} records remain.`);
        }
        
    } catch (error) {
        console.error('❌ Cleanup failed:', error.message);
        throw error;
    } finally {
        await pool.end();
    }
}

// Execute cleanup
if (require.main === module) {
    clearMasterBrands().catch(error => {
        console.error('💥 Cleanup script failed:', error.message);
        process.exit(1);
    });
}

module.exports = { clearMasterBrands };
