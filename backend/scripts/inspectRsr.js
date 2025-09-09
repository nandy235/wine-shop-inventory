// Inspect a received_stock_records row and linked inventory/daily rows
// Usage: node backend/scripts/inspectRsr.js <rsr_id>

const { pool } = require('../database');

async function main() {
  const id = parseInt(process.argv[2] || '', 10);
  if (!id) {
    console.error('Usage: node backend/scripts/inspectRsr.js <id>');
    process.exit(1);
  }
  const client = await pool.connect();
  try {
    const rsr = await client.query(
      `SELECT id, shop_id, master_brand_id, record_date, invoice_quantity, manual_quantity, transfer_quantity
         FROM received_stock_records WHERE id = $1`, [id]
    );
    if (rsr.rows.length === 0) {
      console.error('RSR not found');
      return;
    }
    const r = rsr.rows[0];
    console.log('RSR:', r);

    const inv = await client.query(
      `SELECT id, current_quantity, final_price FROM shop_inventory WHERE shop_id = $1 AND master_brand_id = $2`,
      [r.shop_id, r.master_brand_id]
    );
    console.log('Inventory:', inv.rows[0] || null);

    const daily = await client.query(
      `SELECT received_stock, opening_stock, closing_stock, price_per_unit
         FROM daily_stock_records WHERE shop_inventory_id = $1 AND stock_date = $2`,
      [inv.rows[0]?.id || -1, r.record_date]
    );
    console.log('Daily on record_date:', daily.rows[0] || null);
  } catch (e) {
    console.error('Failed:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    setTimeout(() => pool.end().catch(() => {}), 0);
  }
}

main();


