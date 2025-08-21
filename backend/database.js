const { Pool } = require('pg');

// Database connection configuration
const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
const connectDB = async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log('Database connected successfully');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
};

// Create tables
const initializeTables = async () => {
  const createTablesQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      shop_name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shop_inventory (
      id SERIAL PRIMARY KEY,
      master_brand_id INTEGER,
      user_id INTEGER NOT NULL,
      name VARCHAR(255) NOT NULL,
      brand_number VARCHAR(50),
      category VARCHAR(100),
      pack_quantity INTEGER DEFAULT 12,
      size VARCHAR(50),
      size_code VARCHAR(10),
      mrp DECIMAL(10,2),
      shop_markup DECIMAL(10,2) DEFAULT 0,
      final_price DECIMAL(10,2),
      sort_order INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_stock_records (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      date DATE NOT NULL,
      brand_number VARCHAR(50),
      brand_name VARCHAR(255),
      size VARCHAR(50),
      opening_stock INTEGER DEFAULT 0,
      received INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      closing_stock INTEGER DEFAULT 0,
      sale INTEGER DEFAULT 0,
      price DECIMAL(10,2),
      sale_amount DECIMAL(10,2),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      invoice_number VARCHAR(255),
      date DATE,
      upload_date DATE,
      total_value DECIMAL(10,2),
      net_invoice_value DECIMAL(10,2),
      retail_excise_tax DECIMAL(10,2),
      special_excise_cess DECIMAL(10,2),
      tcs DECIMAL(10,2),
      items_count INTEGER,
      processed_items_count INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(createTablesQuery);
    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
  }
};

module.exports = { pool, connectDB, initializeTables };