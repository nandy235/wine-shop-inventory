// Migration: add source_shop_id and supplier_shop_id to received_stock_records and backfill
// Usage: node backend/scripts/migrateSupplierLinkageIds.js

const { pool } = require('../database');

async function ensureColumns() {
  const ddl = [
    `ALTER TABLE received_stock_records ADD COLUMN IF NOT EXISTS source_shop_id BIGINT;`,
    `ALTER TABLE received_stock_records ADD COLUMN IF NOT EXISTS supplier_shop_id BIGINT;`,
    // Try to add FKs (ignore if already exist)
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_name = 'fk_rsr_source_shop' AND table_name = 'received_stock_records'
       ) THEN
         ALTER TABLE received_stock_records
           ADD CONSTRAINT fk_rsr_source_shop FOREIGN KEY (source_shop_id)
           REFERENCES shops(id) ON DELETE SET NULL;
       END IF;
     END $$;`,
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_name = 'fk_rsr_supplier_shop' AND table_name = 'received_stock_records'
       ) THEN
         ALTER TABLE received_stock_records
           ADD CONSTRAINT fk_rsr_supplier_shop FOREIGN KEY (supplier_shop_id)
           REFERENCES supplier_shops(id) ON DELETE SET NULL;
       END IF;
     END $$;`,
    `CREATE INDEX IF NOT EXISTS idx_rsr_source_shop ON received_stock_records(source_shop_id);`,
    `CREATE INDEX IF NOT EXISTS idx_rsr_supplier_shop ON received_stock_records(supplier_shop_id);`
  ];
  for (const q of ddl) {
    await pool.query(q);
  }
}

async function backfill() {
  // 1) External suppliers: set supplier_shop_id via correlated subquery
  const ext = await pool.query(`
    UPDATE received_stock_records rs
    SET supplier_shop_id = (
      SELECT ss.id FROM supplier_shops ss
      WHERE ss.shop_id = rs.shop_id
        AND ss.retailer_code = rs.supplier_code
      LIMIT 1
    )
    WHERE rs.supplier_shop_id IS NULL
      AND rs.supplier_code ~ '^\\d{7}$'
  `);

  // 2) Internal suppliers (other shops of same user): set source_shop_id via correlated subquery
  const internal = await pool.query(`
    UPDATE received_stock_records rs
    SET source_shop_id = (
      SELECT s_other.id
      FROM shops s_this
      JOIN shops s_other
        ON s_other.user_id = s_this.user_id
       AND s_other.retailer_code = rs.supplier_code
      WHERE s_this.id = rs.shop_id
      LIMIT 1
    )
    WHERE rs.source_shop_id IS NULL
      AND rs.supplier_code ~ '^\\d{7}$'
  `);

  // 3) For TGBCL, leave both ids null (no-op)

  return { externalUpdated: ext.rowCount || 0, internalUpdated: internal.rowCount || 0 };
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('🔄 Starting supplier linkage migration...');
    await client.query('BEGIN');
    await ensureColumns();
    const res = await backfill();
    await client.query('COMMIT');
    console.log(`✅ Migration complete. Backfilled → external: ${res.externalUpdated}, internal: ${res.internalUpdated}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    setTimeout(() => pool.end().catch(() => {}), 0);
  }
}

main().catch(err => {
  console.error('❌ Unexpected error:', err);
  process.exitCode = 1;
});


