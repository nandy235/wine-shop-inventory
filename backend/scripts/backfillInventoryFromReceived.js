// Ensure a shop_inventory row exists for a received_stock_records row (or for all)
// Usage:
//   node backend/scripts/backfillInventoryFromReceived.js               # backfill all pairs
//   node backend/scripts/backfillInventoryFromReceived.js 453           # backfill only rsr.id = 453

const { pool } = require('../database');

async function ensureInventory(shopId, masterBrandId) {
  // Determine default final_price from master_brands.standard_mrp
  const mrpRes = await pool.query('SELECT standard_mrp FROM master_brands WHERE id = $1', [masterBrandId]);
  const defaultFinal = parseFloat(mrpRes.rows[0]?.standard_mrp || 0) || 0;

  await pool.query(
    `INSERT INTO shop_inventory (shop_id, master_brand_id, current_quantity, markup_price, final_price, is_active, last_updated)
     VALUES ($1, $2, 0, 0, $3, true, CURRENT_TIMESTAMP)
     ON CONFLICT (shop_id, master_brand_id) DO NOTHING`,
    [shopId, masterBrandId, defaultFinal]
  );
}

async function runOne(id) {
  const res = await pool.query('SELECT shop_id, master_brand_id FROM received_stock_records WHERE id = $1', [id]);
  if (res.rows.length === 0) {
    console.log(`No received_stock_records found with id=${id}`);
    return 0;
  }
  const { shop_id, master_brand_id } = res.rows[0];
  await ensureInventory(shop_id, master_brand_id);
  console.log(`Ensured inventory for shop_id=${shop_id}, master_brand_id=${master_brand_id}`);
  return 1;
}

async function runAll() {
  const res = await pool.query(`
    SELECT DISTINCT shop_id, master_brand_id
    FROM received_stock_records
  `);
  let count = 0;
  for (const row of res.rows) {
    await ensureInventory(row.shop_id, row.master_brand_id);
    count++;
  }
  console.log(`Ensured inventory for ${count} (shop, brand) pairs`);
  return count;
}

async function main() {
  const idArg = process.argv[2] ? parseInt(process.argv[2], 10) : null;
  try {
    if (idArg) {
      await runOne(idArg);
    } else {
      await runAll();
    }
  } catch (e) {
    console.error('Backfill error:', e.message);
    process.exitCode = 1;
  } finally {
    setTimeout(() => pool.end().catch(() => {}), 0);
  }
}

main();


