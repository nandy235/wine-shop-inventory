// ===============================================
// Wine Shop Inventory Management System
// Enhanced Database Configuration
// Compatible with new normalized schema
// ===============================================

// Load environment variables from .env file
require('dotenv').config();

const { Pool } = require('pg');

// Database connection configuration
// Use public URL for local development, internal URL for Railway deployment
const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;

console.log('🔍 Environment check:');
console.log('DATABASE_PUBLIC_URL:', process.env.DATABASE_PUBLIC_URL ? 'Set' : 'Not set');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
console.log('Using connection:', process.env.DATABASE_PUBLIC_URL ? 'Public (Local)' : 'Internal (Railway)');
console.log('PGHOST:', process.env.PGHOST || 'Not set');

const pool = new Pool(connectionString ? {
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false },
  // Connection pool configuration
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 30000, // Return an error after 30 seconds if connection could not be established
  maxUses: 7500, // Close (and replace) a connection after it has been used 7500 times
  // Query timeout
  query_timeout: 60000, // 60 seconds for query timeout
  // Keep alive settings
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
} : {
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
  // Connection pool configuration
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  maxUses: 7500,
  // Query timeout
  query_timeout: 60000,
  // Keep alive settings
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Add connection pool event listeners
pool.on('connect', (client) => {
  console.log('🔗 New client connected to database');
});

pool.on('error', (err, client) => {
  console.error('❌ Unexpected error on idle client:', err);
});

pool.on('remove', (client) => {
  console.log('🔌 Client removed from pool');
});

// Retry mechanism for database operations
const retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.log(`❌ Database operation failed (attempt ${attempt}/${maxRetries}):`, error.message);
      
      if (attempt === maxRetries) {
        console.error('🚨 All retry attempts exhausted');
        throw error;
      }
      
      // Exponential backoff
      const waitTime = delay * Math.pow(2, attempt - 1);
      console.log(`⏳ Retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
};

// Test connection with retry
const connectDB = async () => {
  return await retryOperation(async () => {
    const client = await pool.connect();
    try {
      await client.query('SELECT NOW()');
      console.log('✅ Database connected successfully');
      console.log(`📊 Pool status: ${pool.totalCount} total, ${pool.idleCount} idle, ${pool.waitingCount} waiting`);
      return true;
    } finally {
      client.release();
    }
  }).catch(error => {
    console.error('❌ Database connection failed after all retries:', error);
    return false;
  });
};

// Check if new schema is deployed
const checkSchemaVersion = async () => {
  try {
    // Check if new tables exist
    const result = await pool.query(`
      SELECT COUNT(*) as table_count
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('users', 'shops', 'master_brands', 'shop_inventory', 'daily_stock_records', 'invoices', 'expenses', 'other_income', 'daily_payments', 'received_stock_records')
    `);
    
    const tableCount = parseInt(result.rows[0].table_count);
    
    if (tableCount === 10) {
      console.log('✅ New schema fully deployed - all 10 tables found');
      return 'complete';
    } else if (tableCount > 0) {
      console.log(`⚠️  Partial schema detected - found ${tableCount}/10 tables`);
      return 'partial';
    } else {
      console.log('🆕 Fresh database - no tables found');
      return 'fresh';
    }
  } catch (error) {
    console.error('❌ Schema version check failed:', error);
    return 'unknown';
  }
};

// Initialize database with new schema
const initializeTables = async () => {
  try {
    const connected = await connectDB();
    if (!connected) {
      throw new Error('Database connection failed');
    }
    
    const schemaVersion = await checkSchemaVersion();
    
    if (schemaVersion === 'complete') {
      console.log('✅ New schema is ready!');
      
      // Verify critical components
      await verifySchemaComponents();
    } else if (schemaVersion === 'partial') {
      console.log('⚠️  Incomplete schema detected. Please complete deployment:');
      console.log('📋 Run: cd backend/schema && psql -d your_database -f deploy_schema.sql');
      throw new Error('Incomplete schema - deployment required');
    } else {
      console.log('🚀 Fresh database detected. Deploying new schema...');
      console.log('📋 Please run: cd backend/schema && psql -d your_database -f deploy_schema.sql');
      console.log('🔄 Then restart the server');
      throw new Error('Schema deployment required');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    console.error('💡 Make sure to deploy the schema first:');
    console.error('   cd backend/schema && psql -d your_database -f deploy_schema.sql');
    return false;
  }
};



// Verify new schema components
const verifySchemaComponents = async () => {
  try {
    // Check tables
    const tablesResult = await pool.query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    
    // Check views  
    const viewsResult = await pool.query(`
      SELECT COUNT(*) as count FROM information_schema.views 
      WHERE table_schema = 'public' AND table_name LIKE 'v_%'
    `);
    
    // Check triggers
    const triggersResult = await pool.query(`
      SELECT COUNT(*) as count FROM information_schema.triggers 
      WHERE trigger_schema = 'public'
    `);
    
    console.log('📊 Schema Component Verification:');
    console.log(`   Tables: ${tablesResult.rows[0].count}`);
    console.log(`   Views: ${viewsResult.rows[0].count}`);
    console.log(`   Triggers: ${triggersResult.rows[0].count}`);
    
    if (parseInt(tablesResult.rows[0].count) >= 10) {
      console.log('✅ Schema verification passed');
    } else {
      console.log('⚠️  Schema verification incomplete - some components missing');
    }
  } catch (error) {
    console.error('❌ Schema verification failed:', error);
  }
};

// Health check query
const healthCheck = async () => {
  try {
    const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    return {
      status: 'healthy',
      timestamp: result.rows[0].current_time,
      version: result.rows[0].pg_version
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
};

module.exports = { 
  pool, 
  connectDB, 
  initializeTables,
  checkSchemaVersion,
  healthCheck,
  retryOperation
};
