# Wine Shop Inventory Management System - Database Schema

## Overview

This directory contains the complete PostgreSQL database schema for the Wine Shop Inventory Management System, designed to handle **3000+ shops** and **3000+ brands** with high performance and data integrity.

## Architecture Highlights

- **Normalized Design**: Single source of truth with master brands reference table
- **Auto-linking System**: Automatic invoice brand matching with confidence scoring
- **Generated Columns**: Real-time calculations for stock, sales, and pricing
- **Trigger-based Logic**: Automatic price propagation and stock management
- **Performance Optimized**: Strategic indexing for large-scale operations

## File Structure

```
schema/
├── deploy_schema.sql           # Master deployment script
├── 01_extensions_and_tables.sql   # Extensions & 10 core tables
├── 02_triggers_and_functions.sql  # Business logic triggers
├── 03_views.sql               # Optimized reporting views
├── 04_indexes.sql             # Performance indexes
├── 05_sanity_checks.sql       # Comprehensive tests
└── README.md                  # This documentation
```

## Quick Deployment

### Option 1: Full Deployment (Recommended)
```bash
cd backend/schema
psql -d your_database -f deploy_schema.sql
```

### Option 2: Step-by-step Deployment
```bash
psql -d your_database -f 01_extensions_and_tables.sql
psql -d your_database -f 02_triggers_and_functions.sql
psql -d your_database -f 03_views.sql
psql -d your_database -f 04_indexes.sql
psql -d your_database -f 05_sanity_checks.sql
```

## Core Tables (10)

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `users` | User accounts | Case-insensitive email with citext |
| `shops` | Wine shop locations | Multi-shop support per user |
| `master_brands` | State-wide brand reference | Unique (brand_number, size_ml) |
| `shop_inventory` | Shop-specific inventory | Auto-calculated final_price |
| `daily_stock_records` | Daily stock movements | Generated sales calculations |
| `invoices` | Purchase invoices | Auto-calculated net values |
| `invoice_brands` | Invoice line items | Auto-linking to master brands |
| `expenses` | Operational expenses | Category-based tracking |
| `other_income` | Non-sales income | Source-based tracking |
| `daily_payments` | Payment collections | Multi-method support |

## Key Features

### 1. Auto-linking Invoice Brands
- **Exact Match (100% confidence)**: Perfect (brand_number, size_ml) match
- **Fuzzy Match (85% confidence)**: Similar brand names with exact size
- **Size Tolerance (50-90% confidence)**: Exact brand with size variations
- **Manual Override**: Preserve manually set matches

### 2. Automated Stock Management
- **Opening Stock**: Auto-copied from previous day's closing
- **Total Stock**: Opening + Received (generated column)
- **Sales**: Total - Closing (generated column) 
- **Sale Value**: Sales × Price (generated column)

### 3. Dynamic Pricing
- **Final Price**: Standard MRP + Shop Markup (trigger-maintained)
- **Price Propagation**: MRP changes update all shop inventories
- **Price Snapshots**: Historical pricing in daily records

### 4. Performance Optimization
- **Strategic Indexing**: 25+ indexes for common query patterns
- **Partial Indexes**: Condition-specific performance boosts
- **Similarity Indexes**: Fast fuzzy matching with pg_trgm
- **Composite Indexes**: Multi-column query optimization

## Business Logic Rules

### Stock Management Flow
1. **Daily Initialization**: Opening stock = Previous day's closing
2. **Invoice Processing**: Updates received_stock for today
3. **Default Behavior**: Closing stock defaults to total_stock
4. **User Override**: Manual closing stock entry recalculates sales
5. **Auto-calculation**: Sales and sale_value update automatically

### Invoice Processing Workflow
1. Read invoice PDF → Extract brand details
2. Insert into `invoice_brands` → Auto-linking trigger fires
3. Check `match_confidence` and `match_method` for quality
4. Manual review for unmatched brands (`master_brand_id IS NULL`)
5. Update `daily_stock_records.received_stock` for matched brands

### Pricing Logic
- **Shop Level**: Final Price = Standard MRP + Shop Markup
- **Propagation**: MRP changes automatically update all shops
- **History**: Price snapshots preserved in daily records

## Monitoring & Maintenance

### Auto-linking Performance
```sql
-- Check matching success rate
SELECT 
    COUNT(*) as total_brands,
    COUNT(master_brand_id) as matched,
    ROUND(COUNT(master_brand_id) * 100.0 / COUNT(*), 2) as match_rate
FROM invoice_brands;
```

### Unmatched Brands Analysis
```sql
-- Find patterns in unmatched brands
SELECT brand_number, size_ml, COUNT(*) as frequency
FROM invoice_brands 
WHERE master_brand_id IS NULL 
GROUP BY brand_number, size_ml 
ORDER BY COUNT(*) DESC;
```

### Index Usage Monitoring
```sql
-- Monitor index effectiveness
SELECT * FROM v_index_usage_stats 
ORDER BY idx_scan DESC;
```

## Views for Reporting

| View | Purpose | Key Metrics |
|------|---------|-------------|
| `v_daily_stock` | Daily stock with all details | Sales %, stock values, status |
| `v_invoice_brands_status` | Brand matching status | Match quality, confidence scores |
| `v_shop_inventory_summary` | Shop-level inventory | Stock values, brand counts |
| `v_daily_sales_summary` | Daily sales performance | Sales rates, revenue |
| `v_invoice_processing_queue` | Processing priority | Match rates, pending reviews |

## Data Integrity Features

### Constraints
- **Non-negative Values**: All quantities, prices, amounts ≥ 0
- **Logical Stock**: Closing stock ≤ total stock
- **Unique Constraints**: Prevent duplicate records
- **Referential Integrity**: Proper foreign key relationships

### Validation Rules
- **Product Types**: IML, BEER, DUTY_PAID, DUTY_FREE
- **Pack Types**: G (Glass), P (Plastic), C (Can)
- **Match Confidence**: 0-100 range
- **Email Uniqueness**: Case-insensitive with citext

## Migration from Existing Schema

If you have existing data in the old schema format:

1. **Backup Current Data**
   ```bash
   pg_dump your_database > backup_before_migration.sql
   ```

2. **Deploy New Schema** (on fresh database)
   ```bash
   psql -d new_database -f deploy_schema.sql
   ```

3. **Data Migration** (create custom migration scripts based on your current structure)

4. **Validation** (run sanity checks)
   ```bash
   psql -d new_database -f 05_sanity_checks.sql
   ```

## Performance Considerations

### For 3000+ Shops & Brands
- **Connection Pooling**: Use pgbouncer or similar
- **Regular VACUUM**: Automated maintenance schedule  
- **Statistics Updates**: Regular ANALYZE for query optimization
- **Partition Consideration**: For daily_stock_records if >1M records/month

### Query Optimization
- Use provided views for complex reporting queries
- Leverage indexes for WHERE clauses and JOINs
- Consider materialized views for heavy analytical queries
- Monitor slow query log and optimize accordingly

## Troubleshooting

### Common Issues

1. **Auto-linking Not Working**
   - Check pg_trgm extension is installed
   - Verify similarity indexes exist
   - Review NOTICE messages in logs

2. **Performance Issues**
   - Run ANALYZE on large tables
   - Check index usage with v_index_usage_stats
   - Consider adding application-specific indexes

3. **Constraint Violations**
   - Review CHECK constraints for data validation
   - Ensure referential integrity with master brands
   - Validate date ranges and stock logic

### Debug Queries

```sql
-- Check trigger functions
SELECT routine_name, routine_definition 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name LIKE 'trg_%';

-- Verify constraints
SELECT conname, contype, confupdtype, confdeltype 
FROM pg_constraint 
WHERE connamespace = 'public'::regnamespace;

-- Monitor table sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## Support & Maintenance

### Regular Tasks
- Weekly: Review unmatched invoice brands
- Monthly: Analyze index usage and performance
- Quarterly: Update table statistics and optimize
- Annually: Review and update master brands database

### Monitoring Alerts
- High percentage of unmatched invoice brands (>10%)
- Slow query performance (>1s for common operations)
- Large table growth without corresponding index usage
- Failed constraint validations

## Version History

- **v1.0**: Initial schema with 10 core tables
- **v1.1**: Added auto-linking triggers and fuzzy matching
- **v1.2**: Performance optimization with strategic indexing
- **v1.3**: Enhanced views and monitoring capabilities

---

For questions or support, refer to the application documentation or database administrator.
