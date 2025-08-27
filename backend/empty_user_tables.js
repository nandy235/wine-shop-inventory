// ===============================================
// Wine Shop Inventory Management System
// Script to Empty User-Specific Tables Only
// Preserves master_brands reference data
// ===============================================

require('dotenv').config();
const { pool } = require('./database.js');

const emptyUserTables = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🗑️  Starting to empty user-specific tables...');
    console.log('🛡️  Master brands table will be PRESERVED');
    
    // Begin transaction
    await client.query('BEGIN');
    
    // Disable triggers temporarily to avoid issues with generated columns
    await client.query('SET session_replication_role = replica');
    
    // Delete ONLY user-specific tables in reverse dependency order
    // master_brands is intentionally EXCLUDED to preserve reference data
    const userTables = [
      'daily_payments',
      'other_income', 
      'expenses',
      'invoice_brands',
      'invoices',
      'daily_stock_records',
      'shop_inventory',
      'shops',
      'users'
    ];
    
    console.log('📋 User tables to empty (in order):');
    userTables.forEach((table, index) => {
      console.log(`   ${index + 1}. ${table}`);
    });
    console.log('   ✅ master_brands - PRESERVED');
    
    // Count records before deletion
    console.log('\n📊 Current record counts:');
    for (const table of userTables) {
      const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`   ${table}: ${result.rows[0].count} records`);
    }
    
    // Also show master_brands count (preserved)
    const masterBrandsResult = await client.query(`SELECT COUNT(*) as count FROM master_brands`);
    console.log(`   master_brands: ${masterBrandsResult.rows[0].count} records (PRESERVED)`);
    
    console.log('\n🗑️  Emptying user tables...');
    
    // Empty each user table
    for (const table of userTables) {
      const result = await client.query(`DELETE FROM ${table}`);
      console.log(`   ✅ ${table}: ${result.rowCount} records deleted`);
    }
    
    // Reset sequences to start from 1 (excluding master_brands)
    console.log('\n🔄 Resetting ID sequences...');
    for (const table of userTables) {
      try {
        await client.query(`ALTER SEQUENCE ${table}_id_seq RESTART WITH 1`);
        console.log(`   ✅ ${table}_id_seq reset to 1`);
      } catch (error) {
        // Some tables might not have sequences, that's okay
        console.log(`   ⚠️  ${table}: No sequence to reset`);
      }
    }
    
    // Re-enable triggers
    await client.query('SET session_replication_role = DEFAULT');
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log('\n✅ User tables emptied successfully!');
    console.log('🔄 User table ID sequences reset to start from 1');
    console.log('🛡️  Master brands data preserved');
    
    // Verify user tables are empty and master_brands is preserved
    console.log('\n🔍 Verification - Final record counts:');
    for (const table of userTables) {
      const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`   ${table}: ${result.rows[0].count} records`);
    }
    
    const finalMasterBrandsResult = await client.query(`SELECT COUNT(*) as count FROM master_brands`);
    console.log(`   master_brands: ${finalMasterBrandsResult.rows[0].count} records (PRESERVED ✅)`);
    
  } catch (error) {
    console.error('❌ Error emptying user tables:', error);
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Run the script
const main = async () => {
  try {
    await emptyUserTables();
    console.log('\n🎉 User data cleanup completed successfully!');
    console.log('💡 Master brands reference data remains intact for future use');
    process.exit(0);
  } catch (error) {
    console.error('💥 Script failed:', error.message);
    process.exit(1);
  }
};

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = { emptyUserTables };
