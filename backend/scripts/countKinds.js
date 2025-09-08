// Count distinct brand_kind values in master_brands and print counts
// Usage: node backend/scripts/countKinds.js

const path = require('path');
// Load .env from project root, then fallback to backend/.env
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { pool } = require('../database');

async function main() {
  try {
    console.log('🔎 Counting kinds from master_brands...');

    const kindsSql = `
      SELECT kind_label, count(*)::int AS count FROM (
        SELECT 
          CASE 
            WHEN brand_kind IS NULL OR trim(brand_kind) = '' THEN '(NULL/EMPTY)'
            ELSE upper(trim(brand_kind))
          END AS kind_label
        FROM master_brands
        WHERE is_active = true
      ) t
      GROUP BY kind_label
      ORDER BY (CASE WHEN kind_label = '(NULL/EMPTY)' THEN 1 ELSE 0 END), count DESC, kind_label ASC
    `;

    const resKinds = await pool.query(kindsSql);

    const totalActiveSql = `SELECT COUNT(*)::int AS total FROM master_brands WHERE is_active = true`;
    const totalActive = (await pool.query(totalActiveSql)).rows[0].total;

    console.log(`\nTotal active master brands: ${totalActive}`);
    console.log('\nKind counts (brand_kind → count):');
    console.log('---------------------------------');
    resKinds.rows.forEach((r) => {
      console.log(`${r.kind_label.padEnd(18)} ${String(r.count).padStart(6)}`);
    });

    // Also show product_type × brand_kind matrix (to verify alignment)
    const matrixSql = `
      SELECT 
        product_type,
        CASE 
          WHEN brand_kind IS NULL OR trim(brand_kind) = '' THEN '(NULL/EMPTY)'
          ELSE upper(trim(brand_kind))
        END AS kind_label,
        COUNT(*)::int AS count
      FROM master_brands
      WHERE is_active = true
      GROUP BY product_type, kind_label
      ORDER BY product_type, kind_label
    `;

    const resMatrix = await pool.query(matrixSql);
    console.log('\nproduct_type × kind matrix:');
    console.log('----------------------------');
    resMatrix.rows.forEach((r) => {
      console.log(`${r.product_type.padEnd(10)} | ${r.kind_label.padEnd(18)} ${String(r.count).padStart(6)}`);
    });

  } catch (err) {
    console.error('❌ Error counting kinds:', err.message);
    process.exitCode = 1;
  } finally {
    try { await pool.end(); } catch (_) {}
  }
}

main();


