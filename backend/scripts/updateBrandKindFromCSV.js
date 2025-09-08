// Updates master_brands.brand_kind from masterbrands.csv Sub Category
// Usage: node backend/scripts/updateBrandKindFromCSV.js

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Pool } = require('pg');

// Load env from project root then backend/.env
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_PUBLIC_URL/DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

function formatBrandNumber(brandNumber) {
  if (!brandNumber) return null;
  const cleaned = String(brandNumber).trim();
  if (/^\d{4}$/.test(cleaned)) return cleaned;
  const n = parseInt(cleaned, 10);
  if (!isNaN(n) && n >= 0 && n <= 9999) return n.toString().padStart(4, '0');
  return null;
}

function mapBrandKind(subCategory) {
  if (!subCategory) return null;
  const cleaned = subCategory.toString().trim().toUpperCase();
  if (cleaned === 'SUB CATEGORY' || cleaned === '') return null;
  // Normalize a few common aliases
  if (cleaned === 'LIQUOR') return 'LIQUEUR';
  if (cleaned === 'RTD' || cleaned === 'READY-TO-DRINK') return 'READY TO DRINK';
  return cleaned;
}

async function main() {
  const csvFile = path.resolve(process.cwd(), 'masterbrands.csv');
  if (!fs.existsSync(csvFile)) {
    console.error(`❌ CSV not found: ${csvFile}`);
    process.exit(1);
  }

  console.log('🔗 DB:', databaseUrl.replace(/\/\/.*@/, '//***:***@'));
  console.log('📁 CSV:', csvFile);

  const updates = [];

  await new Promise((resolve, reject) => {
    fs.createReadStream(csvFile)
      .pipe(csv())
      .on('data', (row) => {
        try {
          const brandNumber = formatBrandNumber(row['Brand Number']);
          const sizeML = parseInt(row['Size_ml'], 10);
          const packQty = parseInt(row['Pack Quantity'], 10);
          const packType = (row['Pack Type'] || '').toString().trim().toUpperCase();
          const kind = mapBrandKind(row[' Sub Category']);
          if (!brandNumber || !sizeML || !packQty || !packType || !kind) return;
          updates.push({ brandNumber, sizeML, packQty, packType, kind });
        } catch (_) {}
      })
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`🔄 Prepared ${updates.length} potential updates`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let total = 0;
    const stmt = 'UPDATE master_brands SET brand_kind = $1 WHERE brand_number = $2 AND size_ml = $3 AND pack_quantity = $4 AND pack_type = $5';
    for (const u of updates) {
      const res = await client.query(stmt, [u.kind, u.brandNumber, u.sizeML, u.packQty, u.packType]);
      total += res.rowCount;
    }
    console.log(`✅ Updated brand_kind for ${total} rows`);

    // Also fix product_type when brand_kind indicates BEER but product_type is IML
    const fixBeer = await client.query(
      "UPDATE master_brands SET product_type = 'BEER' WHERE UPPER(COALESCE(brand_kind,'') ) = 'BEER' AND product_type = 'IML'"
    );
    console.log(`✅ Fixed product_type to BEER for ${fixBeer.rowCount} rows where brand_kind=BEER & product_type=IML`);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Update failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();


