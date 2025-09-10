// Recompute daily_stock_records.received_stock for a specific received_stock_records id
// Usage: node backend/scripts/recomputeDailyForRsr.js <rsr_id>

const { pool } = require('../database');

async function main() {
  const idArg = process.argv[2] ? parseInt(process.argv[2], 10) : null;
  if (!idArg) {
    console.error('Provide received_stock_records id. Example: node backend/scripts/recomputeDailyForRsr.js 453');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const rs = await client.query(
      `SELECT shop_id, master_brand_id, record_date
         FROM received_stock_records WHERE id = $1`,
      [idArg]
    );
    if (rs.rows.length === 0) throw new Error('received_stock_records not found');
    const { shop_id, master_brand_id, record_date } = rs.rows[0];

    const sumRes = await client.query(
      `SELECT COALESCE(SUM(COALESCE(invoice_quantity,0) + COALESCE(manual_quantity,0) + COALESCE(transfer_quantity,0)),0) AS total
         FROM received_stock_records
        WHERE shop_id = $1 AND master_brand_id = $2 AND record_date = $3`,
      [shop_id, master_brand_id, record_date]
    );
    const total = parseInt(sumRes.rows[0].total, 10) || 0;

    // Get shop_inventory id
    const inv = await client.query(
      `SELECT id, final_price FROM shop_inventory WHERE shop_id = $1 AND master_brand_id = $2`,
      [shop_id, master_brand_id]
    );
    if (inv.rows.length === 0) throw new Error('shop_inventory not found for this pair');
    const shopInventoryId = inv.rows[0].id;
    const unitPrice = parseFloat(inv.rows[0].final_price || 0) || 0;

    // Upsert daily_stock_records with new received_stock
    await client.query(
      `INSERT INTO daily_stock_records (shop_inventory_id, stock_date, opening_stock, received_stock, closing_stock, price_per_unit)
       VALUES ($1, $2, 0, $3, NULL, $4)
       ON CONFLICT (shop_inventory_id, stock_date)
       DO UPDATE SET received_stock = EXCLUDED.received_stock,
                     price_per_unit = COALESCE(EXCLUDED.price_per_unit, daily_stock_records.price_per_unit)` ,
      [shopInventoryId, record_date, total, unitPrice]
    );

    await client.query('COMMIT');
    console.log(`✅ Recomputed daily_stock_records for rsr ${idArg}: received_stock=${total}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Failed:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    setTimeout(() => pool.end().catch(() => {}), 0);
  }
}

main();



