// Backfill supplier_code in received_stock_records
// - Ensures column/constraint/index exist
// - Sets supplier_code = 'TGBCL' for invoice-derived rows
// - Attempts to populate supplier_code for transfers using 7-digit code in transfer_reference

/*
  Usage:
    node backend/scripts/backfillSupplierCode.js

  Notes:
  - Uses DATABASE_PUBLIC_URL from your .env automatically (falls back to DATABASE_URL via backend/database.js)
*/

const { pool } = require('../database');

async function ensureSchemaArtifacts(client) {
  // Idempotent DDL (safe to run multiple times)
  const statements = [
    `ALTER TABLE received_stock_records
       ADD COLUMN IF NOT EXISTS supplier_code VARCHAR(10);`,
    `ALTER TABLE received_stock_records
       DROP CONSTRAINT IF EXISTS chk_supplier_code_valid;`,
    `ALTER TABLE received_stock_records
       ADD CONSTRAINT chk_supplier_code_valid
       CHECK (supplier_code IS NULL OR supplier_code ~ '^(TGBCL|\\d{7})$');`,
    `CREATE INDEX IF NOT EXISTS idx_received_stock_supplier_code
       ON received_stock_records(supplier_code);`
  ];

  for (const sql of statements) {
    await client.query(sql);
  }
}

async function runBackfill(client) {
  // 1) Set TGBCL where invoices contributed quantity
  const tgbclRes = await client.query(
    `UPDATE received_stock_records
       SET supplier_code = 'TGBCL'
     WHERE supplier_code IS NULL
       AND invoice_quantity > 0;`
  );

  // 2) Extract retailer code for transfers if present in reference text
  const transferRes = await client.query(
    `UPDATE received_stock_records
       SET supplier_code = substring(transfer_reference from '(\\d{7})')
     WHERE supplier_code IS NULL
       AND transfer_quantity <> 0
       AND transfer_reference ~ '\\d{7}';`
  );

  return { tgbcl: tgbclRes.rowCount || 0, transfers: transferRes.rowCount || 0 };
}

async function verify(client) {
  const res = await client.query(
    `SELECT COALESCE(supplier_code, '<NULL>') AS supplier_code, COUNT(*) AS count
       FROM received_stock_records
      GROUP BY 1
      ORDER BY 1;`
  );
  return res.rows;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('🔄 Starting supplier_code backfill...');
    await client.query('BEGIN');

    await ensureSchemaArtifacts(client);
    const affected = await runBackfill(client);

    await client.query('COMMIT');
    console.log(`✅ Backfill complete. Updated rows → TGBCL (invoice): ${affected.tgbcl}, transfers (retailer_code): ${affected.transfers}`);

    const summary = await verify(client);
    console.log('📊 Distribution by supplier_code:');
    for (const row of summary) {
      console.log(`  ${row.supplier_code}: ${row.count}`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Backfill failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    // allow process to exit after pool drains
    setTimeout(() => pool.end().catch(() => {}), 0);
  }
}

main().catch((e) => {
  console.error('❌ Unexpected error:', e);
  process.exitCode = 1;
});


