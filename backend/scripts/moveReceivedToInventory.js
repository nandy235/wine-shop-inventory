// Move the quantity from a specific received_stock_records row into shop_inventory.current_quantity
// Usage: node backend/scripts/moveReceivedToInventory.js <rsr_id>

const { pool } = require('../database');

async function main() {
  const idArg = process.argv[2] ? parseInt(process.argv[2], 10) : null;
  if (!idArg) {
    console.error('Provide received_stock_records id. Example: node backend/scripts/moveReceivedToInventory.js 453');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const rs = await client.query(
      `SELECT id, shop_id, master_brand_id,
              COALESCE(invoice_quantity,0) + COALESCE(manual_quantity,0) + COALESCE(transfer_quantity,0) AS delta
         FROM received_stock_records
        WHERE id = $1
        FOR UPDATE`,
      [idArg]
    );
    if (rs.rows.length === 0) {
      throw new Error(`received_stock_records id ${idArg} not found`);
    }
    const { shop_id, master_brand_id, delta } = rs.rows[0];

    // Ensure inventory row exists
    const mrp = await client.query('SELECT standard_mrp FROM master_brands WHERE id = $1', [master_brand_id]);
    const defaultFinal = parseFloat(mrp.rows[0]?.standard_mrp || 0) || 0;
    await client.query(
      `INSERT INTO shop_inventory (shop_id, master_brand_id, current_quantity, markup_price, final_price, is_active, last_updated)
       VALUES ($1,$2,0,0,$3,true,CURRENT_TIMESTAMP)
       ON CONFLICT (shop_id, master_brand_id) DO NOTHING`,
      [shop_id, master_brand_id, defaultFinal]
    );

    // Update quantity (delta can be negative for shift out)
    await client.query(
      `UPDATE shop_inventory
          SET current_quantity = GREATEST(current_quantity + $3, 0),
              last_updated = CURRENT_TIMESTAMP
        WHERE shop_id = $1 AND master_brand_id = $2`,
      [shop_id, master_brand_id, parseInt(delta, 10) || 0]
    );

    await client.query('COMMIT');
    console.log(`✅ Moved ${delta} bottles from received record ${idArg} into shop_inventory (shop ${shop_id}, brand ${master_brand_id}).`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    setTimeout(() => pool.end().catch(() => {}), 0);
  }
}

main();


