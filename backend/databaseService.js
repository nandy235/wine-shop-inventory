const { pool } = require('./database');

class DatabaseService {
  // User Management - Updated for new normalized schema
  async createUser(userData) {
    const { name, email, password, shopName, retailerCode, address, licenseNumber } = userData;
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if user already exists, if so use existing user
      let user;
      const existingUserQuery = 'SELECT id, name, email, created_at FROM users WHERE email = $1';
      const existingUserResult = await client.query(existingUserQuery, [email]);
      
      if (existingUserResult.rows.length > 0) {
        // User exists, use existing user for new shop
        user = existingUserResult.rows[0];
        console.log(`Using existing user ${user.email} for new shop: ${shopName}`);
      } else {
        // Create new user
        const userQuery = `
          INSERT INTO users (name, email, password)
          VALUES ($1, $2, $3)
          RETURNING id, name, email, created_at
        `;
        const userValues = [name, email, password];
        const userResult = await client.query(userQuery, userValues);
        user = userResult.rows[0];
        console.log(`Created new user ${user.email}`);
      }
      
      // Create shop for the user (new or existing)
      const shopQuery = `
        INSERT INTO shops (user_id, shop_name, address, license_number, retailer_code)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, shop_name, address, license_number, retailer_code, created_at
      `;
      const shopValues = [user.id, shopName, address || null, licenseNumber || null, retailerCode];
      const shopResult = await client.query(shopQuery, shopValues);
      const shop = shopResult.rows[0];
      
      await client.query('COMMIT');
      
      // Return combined user and shop data for compatibility
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        shop_name: shop.shop_name,
        shop_id: shop.id,
        retailer_code: shop.retailer_code,
        address: shop.address,
        license_number: shop.license_number,
        created_at: user.created_at
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Full database error:', error);
      console.error('Error code:', error.code);
      console.error('Error detail:', error.detail);
      throw error;
    } finally {
      client.release();
    }
  }

  async findUserByEmail(email) {
    const query = `
      SELECT 
        u.id, u.name, u.email, u.password, u.created_at,
        s.id as shop_id, s.shop_name, s.address, s.license_number, s.gazette_code
      FROM users u
      LEFT JOIN shops s ON s.user_id = u.id
      WHERE u.email = $1
    `;
    
    try {
      const result = await pool.query(query, [email]);
      const user = result.rows[0];
      if (!user) return null;
      
      // Format for compatibility with existing code
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        password: user.password,
        shop_name: user.shop_name,
        shop_id: user.shop_id,
        gazette_code: user.gazette_code,
        address: user.address,
        license_number: user.license_number,
        created_at: user.created_at
      };
    } catch (error) {
      throw new Error(`Error finding user: ${error.message}`);
    }
  }

  async findUserByLicenseNumber(licenseNumber) {
    const query = `
      SELECT 
        u.id, u.name, u.email, u.password, u.created_at,
        s.id as shop_id, s.shop_name, s.address, s.license_number, s.retailer_code
      FROM users u
      JOIN shops s ON s.user_id = u.id
      WHERE s.license_number = $1
    `;
    
    try {
      const result = await pool.query(query, [licenseNumber]);
      const user = result.rows[0];
      if (!user) return null;
      
      // Format for compatibility with existing code
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        password: user.password,
        shop_name: user.shop_name,
        shop_id: user.shop_id,
        retailer_code: user.retailer_code,
        address: user.address,
        license_number: user.license_number,
        created_at: user.created_at
      };
    } catch (error) {
      throw new Error(`Error finding user by license number: ${error.message}`);
    }
  }

  async findUserByRetailerCode(retailerCode) {
    const query = `
      SELECT 
        u.id, u.name, u.email, u.password, u.created_at,
        s.id as shop_id, s.shop_name, s.address, s.license_number, s.retailer_code
      FROM users u
      JOIN shops s ON s.user_id = u.id
      WHERE s.retailer_code = $1
    `;
    
    try {
      const result = await pool.query(query, [retailerCode]);
      const user = result.rows[0];
      if (!user) return null;
      
      // Format for compatibility with existing code
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        password: user.password,
        shop_name: user.shop_name,
        shop_id: user.shop_id,
        retailer_code: user.retailer_code,
        address: user.address,
        license_number: user.license_number,
        created_at: user.created_at
      };
    } catch (error) {
      throw new Error(`Error finding user by retailer code: ${error.message}`);
    }
  }

  async findUserById(id) {
    const query = 'SELECT id, name, email, shop_name, created_at FROM users WHERE id = $1';
    
    try {
      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      throw new Error(`Error finding user: ${error.message}`);
    }
  }

  async deleteUser(id) {
    const query = 'DELETE FROM users WHERE id = $1 RETURNING *';
    
    try {
      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      throw new Error(`Error deleting user: ${error.message}`);
    }
  }

  // Shop Inventory Management
  async addShopProduct(productData) {
    const { masterBrandId, shopId, markupPrice, finalPrice, currentQuantity } = productData;
    
    // Use UPSERT to handle potential race conditions
    const query = `
      INSERT INTO shop_inventory 
      (master_brand_id, shop_id, markup_price, final_price, current_quantity, is_active, last_updated)
      VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP)
      ON CONFLICT (shop_id, master_brand_id) 
      DO UPDATE SET
        current_quantity = shop_inventory.current_quantity + EXCLUDED.current_quantity,
        markup_price = EXCLUDED.markup_price,
        final_price = EXCLUDED.final_price,
        is_active = true,
        last_updated = CURRENT_TIMESTAMP
      RETURNING *, 
        CASE WHEN xmax = 0 THEN 'inserted' ELSE 'updated' END as action
    `;
    
    const values = [masterBrandId, shopId, markupPrice, finalPrice, currentQuantity];
    
    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error adding shop product: ${error.message}`);
    }
  }

  async updateShopProductQuantity(shopId, masterBrandId, additionalQuantity, newMarkupPrice = null, newFinalPrice = null) {
    const query = `
      UPDATE shop_inventory 
      SET 
        current_quantity = current_quantity + $3,
        markup_price = COALESCE($4, markup_price),
        final_price = COALESCE($5, final_price),
        last_updated = CURRENT_TIMESTAMP
      WHERE shop_id = $1 AND master_brand_id = $2
      RETURNING *
    `;
    
    const values = [shopId, masterBrandId, additionalQuantity, newMarkupPrice, newFinalPrice];
    
    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error updating shop product quantity: ${error.message}`);
    }
  }

  async findShopProduct(shopId, masterBrandId) {
    const query = `
      SELECT * FROM shop_inventory 
      WHERE shop_id = $1 AND master_brand_id = $2 AND is_active = true
    `;
    
    try {
      const result = await pool.query(query, [shopId, masterBrandId]);
      return result.rows[0] || null;
    } catch (error) {
      throw new Error(`Error finding shop product: ${error.message}`);
    }
  }

  async getShopProducts(userId, date = null) {
    // First get shop_id from user_id
    const shopQuery = `SELECT id as shop_id FROM shops WHERE user_id = $1`;
    const shopResult = await pool.query(shopQuery, [userId]);
    
    if (shopResult.rows.length === 0) {
      throw new Error('Shop not found for user');
    }
    
    const shopId = shopResult.rows[0].shop_id;
    
    const query = `
      SELECT 
        si.id,
        si.master_brand_id,
        si.markup_price,
        si.final_price as "finalPrice",
        si.current_quantity as quantity,
        si.is_active,
        si.last_updated,
        mb.standard_mrp as mrp,
        mb.brand_number as "brandNumber",
        mb.brand_name as name,
        mb.size_ml as size,
        mb.size_code as "sizeCode",
        mb.brand_kind,
        mb.product_type,
        CASE 
          WHEN mb.product_type = 'IML' THEN 'IML'
          WHEN mb.product_type = 'DUTY_PAID' THEN 'Duty Paid'
          WHEN mb.product_type = 'BEER' THEN 'Beer'
          WHEN mb.product_type = 'DUTY_FREE' THEN 'Duty Free'
          ELSE mb.product_type
        END as category,
        -- Get today's stock data
        COALESCE(dsr.opening_stock, 0) as "openingStock",
        COALESCE(dsr.received_stock, 0) as "receivedStock",
        COALESCE(dsr.total_stock, 0) as "totalStock",
        COALESCE(dsr.closing_stock, dsr.total_stock, 0) as "closingStock"
      FROM shop_inventory si
      JOIN master_brands mb ON si.master_brand_id = mb.id
      LEFT JOIN daily_stock_records dsr ON si.id = dsr.shop_inventory_id 
        AND dsr.stock_date = CURRENT_DATE
      WHERE si.shop_id = $1 AND si.is_active = true
      ORDER BY mb.brand_number, mb.size_ml
    `;
    
    try {
      const result = await pool.query(query, [shopId]);
      return result.rows;
    } catch (error) {
      throw new Error(`Error getting shop products: ${error.message}`);
    }
  }

  async updateShopProduct(id, userId, updates) {
    const { quantity, finalPrice, shopMarkup } = updates;
    
    // Update shop inventory
    if (finalPrice !== undefined) {
      const updateQuery = `
        UPDATE shop_inventory 
        SET final_price = $1, shop_markup = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3 AND user_id = $4
        RETURNING *
      `;
      
      try {
        await pool.query(updateQuery, [finalPrice, shopMarkup || 0, id, userId]);
      } catch (error) {
        throw new Error(`Error updating shop product: ${error.message}`);
      }
    }
    
    // Update daily stock record if quantity provided
    if (quantity !== undefined) {
      const today = new Date().toISOString().split('T')[0];
      
      // Get product details
      const productQuery = 'SELECT * FROM shop_inventory WHERE id = $1 AND user_id = $2';
      const productResult = await pool.query(productQuery, [id, userId]);
      
      if (productResult.rows.length > 0) {
        const product = productResult.rows[0];
        await this.createOrUpdateDailyStockRecord({
          userId,
          date: today,
          brandNumber: product.brand_number,
          brandName: product.name,
          size: product.size,
          price: product.final_price,
          received: quantity,
          closingStock: null
        });
      }
    }
    
    return { message: 'Product updated successfully' };
  }

  async deleteShopProduct(id, userId) {
    const query = 'DELETE FROM shop_inventory WHERE id = $1 AND user_id = $2 RETURNING *';
    
    try {
      const result = await pool.query(query, [id, userId]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error deleting shop product: ${error.message}`);
    }
  }

  async updateSortOrder(userId, sortedBrandGroups) {
    try {
      let sortOrder = 1;
      
      for (const brandNumber of sortedBrandGroups) {
        const updateQuery = `
          UPDATE shop_inventory 
          SET sort_order = $1 
          WHERE user_id = $2 AND brand_number = $3
        `;
        await pool.query(updateQuery, [sortOrder, userId, brandNumber]);
        sortOrder++;
      }
      
      return { message: 'Sort order updated successfully' };
    } catch (error) {
      throw new Error(`Error updating sort order: ${error.message}`);
    }
  }

  // Daily Stock Records Management
  async createOrUpdateDailyStockRecord(recordData) {
    const {
      shopInventoryId, stockDate, openingStock = 0, receivedStock = 0, 
      closingStock = null, pricePerUnit = null
    } = recordData;
    
    try {
      // Use UPSERT to create or update the daily stock record
      const upsertQuery = `
        INSERT INTO daily_stock_records (
          shop_inventory_id, stock_date, opening_stock, received_stock, 
          closing_stock, price_per_unit
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (shop_inventory_id, stock_date) 
        DO UPDATE SET 
          opening_stock = CASE 
            WHEN EXCLUDED.opening_stock > 0 THEN EXCLUDED.opening_stock 
            ELSE daily_stock_records.opening_stock 
          END,
          received_stock = daily_stock_records.received_stock + EXCLUDED.received_stock,
          closing_stock = COALESCE(EXCLUDED.closing_stock, daily_stock_records.closing_stock),
          price_per_unit = COALESCE(EXCLUDED.price_per_unit, daily_stock_records.price_per_unit)
        RETURNING *
      `;
      
      const values = [
        shopInventoryId, 
        stockDate, 
        openingStock, 
        receivedStock, 
        closingStock, 
        pricePerUnit
      ];
      
      const result = await pool.query(upsertQuery, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error managing daily stock record: ${error.message}`);
    }
  }

  async getPreviousDayClosingStock(userId, currentDate, brandNumber, size) {
    const query = `
      SELECT closing_stock 
      FROM daily_stock_records 
      WHERE user_id = $1 AND brand_number = $2 AND size = $3 AND date < $4
      ORDER BY date DESC 
      LIMIT 1
    `;
    
    try {
      const result = await pool.query(query, [userId, brandNumber, size, currentDate]);
      return result.rows.length > 0 ? result.rows[0].closing_stock : 0;
    } catch (error) {
      throw new Error(`Error getting previous closing stock: ${error.message}`);
    }
  }

  async getDailyStockRecords(userId, date) {
    const query = `
      SELECT * FROM daily_stock_records 
      WHERE user_id = $1 AND date = $2
      ORDER BY brand_number, size
    `;
    
    try {
      const result = await pool.query(query, [userId, date]);
      return result.rows;
    } catch (error) {
      throw new Error(`Error getting daily stock records: ${error.message}`);
    }
  }

  async updateClosingStock(userId, date, stockUpdates) {
    const updatedRecords = [];
    const warnings = [];
    
    try {
      for (const update of stockUpdates) {
        const { brandNumber, size, closingStock } = update;
        
        const recordQuery = `
          SELECT * FROM daily_stock_records 
          WHERE user_id = $1 AND date = $2 AND brand_number = $3 AND size = $4
        `;
        
        const recordResult = await pool.query(recordQuery, [userId, date, brandNumber, size]);
        let record = recordResult.rows[0];
        
        if (record) {
          const closingStockNum = parseInt(closingStock);
          
          // Validation
          if (closingStockNum > record.total) {
            warnings.push({
              product: `${brandNumber} - ${size}`,
              issue: `Closing stock (${closingStockNum}) exceeds total available (${record.total})`,
              action: `Capped at ${record.total}`
            });
          }
          
          if (closingStockNum < 0) {
            warnings.push({
              product: `${brandNumber} - ${size}`,
              issue: 'Negative closing stock not allowed',
              action: 'Set to 0'
            });
          }
          
          // Update with validation
          const validatedClosingStock = Math.max(0, Math.min(closingStockNum, record.total));
          const sale = record.total - validatedClosingStock;
          const saleAmount = sale * record.price;
          
          const updateQuery = `
            UPDATE daily_stock_records 
            SET closing_stock = $1, sale = $2, sale_amount = $3, updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
            RETURNING *
          `;
          
          const updateResult = await pool.query(updateQuery, [validatedClosingStock, sale, saleAmount, record.id]);
          updatedRecords.push(updateResult.rows[0]);
        }
      }
      
      return { updatedRecords, warnings };
    } catch (error) {
      throw new Error(`Error updating closing stock: ${error.message}`);
    }
  }

  // Invoice Management
  async saveInvoice(invoiceData) {
    const {
      userId, invoiceNumber, date, totalValue,
      netInvoiceValue, retailExciseTax, specialExciseCess, tcs
    } = invoiceData;
    
    // Get shop_id from user_id
    const shopQuery = await pool.query('SELECT id as shop_id FROM shops WHERE user_id = $1', [userId]);
    if (shopQuery.rows.length === 0) {
      throw new Error('Shop not found for user');
    }
    const shopId = shopQuery.rows[0].shop_id;
    
    const query = `
      INSERT INTO invoices 
      (shop_id, icdc_number, invoice_date, invoice_value, 
       retail_shop_excise_tax, special_excise_cess, tcs)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const values = [
      shopId, invoiceNumber, date, totalValue,
      retailExciseTax, specialExciseCess, tcs
    ];
    
    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error saving invoice: ${error.message}`);
    }
  }

  async saveInvoiceWithItems(invoiceData, items) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. Save invoice record
      const {
        userId, invoiceNumber, date, totalValue,
        netInvoiceValue, mrpRoundingOff, retailExciseTax, specialExciseCess, tcs
      } = invoiceData;
      
      // Get shop_id from user_id
      const shopQuery = await client.query('SELECT id as shop_id FROM shops WHERE user_id = $1', [userId]);
      if (shopQuery.rows.length === 0) {
        throw new Error('Shop not found for user');
      }
      const shopId = shopQuery.rows[0].shop_id;
      
      // Check if invoice already exists
      const existingInvoiceQuery = `
        SELECT id FROM invoices 
        WHERE shop_id = $1 AND icdc_number = $2
      `;
      const existingInvoice = await client.query(existingInvoiceQuery, [shopId, invoiceNumber]);
      
      if (existingInvoice.rows.length > 0) {
        throw new Error(`Invoice ${invoiceNumber} has already been processed for this shop. Each invoice can only be confirmed once.`);
      }
      
      const invoiceQuery = `
        INSERT INTO invoices 
        (shop_id, icdc_number, invoice_date, invoice_value, mrp_rounding_off,
         retail_shop_excise_tax, special_excise_cess, tcs)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `;
      
      const invoiceValues = [
        shopId, invoiceNumber, date, totalValue, mrpRoundingOff,
        retailExciseTax, specialExciseCess, tcs
      ];
      
      const invoiceResult = await client.query(invoiceQuery, invoiceValues);
      const invoiceId = invoiceResult.rows[0].id;
      
      console.log(`💾 Invoice saved with ID: ${invoiceId}`);
      
      // 2. Save invoice items (invoice_brands)
      if (items && items.length > 0) {
        const itemQuery = `
          INSERT INTO invoice_brands 
          (invoice_id, brand_number, brand_name, product_type, size_ml, size_code, 
           cases, bottles, pack_quantity, pack_type, unit_price, master_brand_id, 
           match_confidence, match_method, matched_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `;
        
        for (const item of items) {
          const itemValues = [
            invoiceId,
            item.brandNumber,
            item.description || item.brandName,
            item.productType || 'IML',
            parseInt(item.size.replace('ml', '')), // Convert "750ml" to 750
            item.sizeCode,
            item.cases || 0,
            item.bottles || 0,
            item.packQty || 12,
            item.packType || 'G', // Pack type (G, B, C, P)
            item.unitPrice || null, // Can be null if not provided
            item.masterBrandId || null, // Will be null for unmatched items
            item.matched ? 95.0 : null, // High confidence for matched items
            item.matched ? 'exact' : null, // Match method
            item.matched ? new Date() : null // Matched timestamp
          ];
          
          await client.query(itemQuery, itemValues);
          console.log(`📦 Item saved: ${item.brandNumber} ${item.size} (Qty: ${item.totalQuantity})`);
        }
        
        console.log(`💾 Saved ${items.length} invoice items`);
      }
      
      await client.query('COMMIT');
      
      return {
        invoiceId: invoiceId,
        itemsCount: items ? items.length : 0,
        success: true
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Error saving invoice with items: ${error.message}`);
    } finally {
      client.release();
    }
  }

  async getInvoices(userId) {
    // Get shop_id from user_id
    const shopQuery = await pool.query('SELECT id as shop_id FROM shops WHERE user_id = $1', [userId]);
    if (shopQuery.rows.length === 0) {
      throw new Error('Shop not found for user');
    }
    const shopId = shopQuery.rows[0].shop_id;
    
    const query = `
      SELECT * FROM invoices 
      WHERE shop_id = $1 
      ORDER BY created_at DESC
    `;
    
    try {
      const result = await pool.query(query, [shopId]);
      return result.rows;
    } catch (error) {
      throw new Error(`Error getting invoices: ${error.message}`);
    }
  }

  // Summary and Analytics
  async getSummary(userId, date) {
    try {
      // Get user's shop_id
      const shopQuery = await pool.query('SELECT id as shop_id FROM shops WHERE user_id = $1', [userId]);
      if (shopQuery.rows.length === 0) {
        throw new Error('Shop not found for user');
      }
      const shopId = shopQuery.rows[0].shop_id;
      
      // Get today's stock records with product details
      const stockRecordsQuery = `
        SELECT 
          dsr.*,
          mb.standard_mrp,
          mb.brand_name,
          mb.brand_number,
          mb.size_ml
        FROM daily_stock_records dsr
        JOIN shop_inventory si ON dsr.shop_inventory_id = si.id
        JOIN master_brands mb ON si.master_brand_id = mb.id
        WHERE si.shop_id = $1 AND dsr.stock_date = $2
        ORDER BY mb.brand_number, mb.size_ml
      `;
      
      const stockRecords = await pool.query(stockRecordsQuery, [shopId, date]);
      
      // Calculate metrics from current stock
      let stockValue = 0;
      let totalSalesAmount = 0;
      
      // If we have daily stock records, use them
      if (stockRecords.rows.length > 0) {
        for (const record of stockRecords.rows) {
          const closingStock = record.closing_stock || record.total_stock || 0;
          const sales = record.sales || 0;
          
          // Stock value = closing stock * MRP
          if (closingStock > 0 && record.standard_mrp) {
            stockValue += closingStock * parseFloat(record.standard_mrp);
          }
          
          // Sales value = sales * price_per_unit
          if (sales > 0 && record.price_per_unit) {
            totalSalesAmount += sales * parseFloat(record.price_per_unit);
          }
        }
      } else {
        // If no daily records, calculate from current shop inventory
        const inventoryQuery = `
          SELECT 
            si.current_quantity,
            mb.standard_mrp,
            si.final_price
          FROM shop_inventory si
          JOIN master_brands mb ON si.master_brand_id = mb.id
          WHERE si.shop_id = $1 AND si.is_active = true AND si.current_quantity > 0
        `;
        
        const inventoryResult = await pool.query(inventoryQuery, [shopId]);
        
        for (const item of inventoryResult.rows) {
          if (item.current_quantity > 0 && item.standard_mrp) {
            stockValue += item.current_quantity * parseFloat(item.standard_mrp);
          }
        }
      }
      
      // Calculate stock lifted - two values for this month
      const currentMonth = new Date(date).getMonth() + 1; // 1-12
      const currentYear = new Date(date).getFullYear();
      
      // 1. Cumulative Invoice Value (at actual invoice prices)
      const invoiceValueQuery = `
        SELECT COALESCE(SUM(invoice_value), 0) as cumulative_invoice_value
        FROM invoices 
        WHERE shop_id = $1 
        AND EXTRACT(MONTH FROM invoice_date) = $2 
        AND EXTRACT(YEAR FROM invoice_date) = $3
      `;
      const invoiceValueResult = await pool.query(invoiceValueQuery, [shopId, currentMonth, currentYear]);
      const cumulativeInvoiceValue = parseFloat(invoiceValueResult.rows[0].cumulative_invoice_value || 0);
      
      // 2. Cumulative MRP Value (same products but at MRP prices)
      const mrpValueQuery = `
        SELECT COALESCE(SUM(
          ib.total_quantity * COALESCE(mb.standard_mrp, 0)
        ), 0) as cumulative_mrp_value
        FROM invoices i
        JOIN invoice_brands ib ON i.id = ib.invoice_id
        LEFT JOIN master_brands mb ON ib.master_brand_id = mb.id
        WHERE i.shop_id = $1 
        AND EXTRACT(MONTH FROM i.invoice_date) = $2 
        AND EXTRACT(YEAR FROM i.invoice_date) = $3
      `;
      const mrpValueResult = await pool.query(mrpValueQuery, [shopId, currentMonth, currentYear]);
      const cumulativeMrpValue = parseFloat(mrpValueResult.rows[0].cumulative_mrp_value || 0);
      
      // Get today's expenses
      const expensesQuery = `
        SELECT COALESCE(SUM(amount), 0) as total_expenses
        FROM expenses 
        WHERE shop_id = $1 AND expense_date = $2
      `;
      const expensesResult = await pool.query(expensesQuery, [shopId, date]);
      const totalExpenses = parseFloat(expensesResult.rows[0].total_expenses || 0);
      
      // Get today's other income
      const otherIncomeQuery = `
        SELECT COALESCE(SUM(amount), 0) as total_other_income
        FROM other_income 
        WHERE shop_id = $1 AND income_date = $2
      `;
      const otherIncomeResult = await pool.query(otherIncomeQuery, [shopId, date]);
      const totalOtherIncome = parseFloat(otherIncomeResult.rows[0].total_other_income || 0);
      
      // Get today's total amount collected (cash + upi + card)
      const paymentsQuery = `
        SELECT 
          COALESCE(cash_amount, 0) as cash,
          COALESCE(upi_amount, 0) as upi,
          COALESCE(card_amount, 0) as card
        FROM daily_payments 
        WHERE shop_id = $1 AND payment_date = $2
      `;
      const paymentsResult = await pool.query(paymentsQuery, [shopId, date]);
      const payments = paymentsResult.rows[0] || { cash: 0, upi: 0, card: 0 };
      const totalAmountCollected = parseFloat(payments.cash) + parseFloat(payments.upi) + parseFloat(payments.card);
      
      // Get opening counter balance (previous day's closing counter balance or 0)
      // TODO: Add UI option to manually input opening balance when needed
      const openingBalanceQuery = `
        SELECT closing_counter_balance
        FROM daily_payments 
        WHERE shop_id = $1 AND payment_date < $2
        ORDER BY payment_date DESC
        LIMIT 1
      `;
      const openingBalanceResult = await pool.query(openingBalanceQuery, [shopId, date]);
      const openingBalance = parseFloat(openingBalanceResult.rows[0]?.closing_counter_balance || 0);
      
      // Counter Balance = Opening + Sales + Other Income - Expenses - Total Amount Collected
      // > 0 = Short (missing money), < 0 = Surplus (extra money)
      const counterBalance = openingBalance + totalSalesAmount + totalOtherIncome - totalExpenses - totalAmountCollected;
      
      return {
        date,
        stockValue: Math.round(stockValue * 100) / 100,
        stockLiftedInvoiceValue: Math.round(cumulativeInvoiceValue * 100) / 100,
        stockLiftedMrpValue: Math.round(cumulativeMrpValue * 100) / 100,
        totalSales: Math.round(totalSalesAmount * 100) / 100,
        counterBalance: Math.round(counterBalance * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        totalOtherIncome: Math.round(totalOtherIncome * 100) / 100,
        totalAmountCollected: Math.round(totalAmountCollected * 100) / 100,
        openingBalance: Math.round(openingBalance * 100) / 100,
        balanceStatus: counterBalance > 0 ? 'SHORT' : counterBalance < 0 ? 'SURPLUS' : 'BALANCED',
        currentMonth: `${currentYear}-${currentMonth.toString().padStart(2, '0')}`
      };
    } catch (error) {
      throw new Error(`Error getting summary: ${error.message}`);
    }
  }

  // Initialize today's stock records
  async initializeTodayStock(userId, date) {
    try {
      // Check if records already exist for today
      const existingRecords = await this.getDailyStockRecords(userId, date);
      
      if (existingRecords.length > 0) {
        // Fix existing records if needed
        let recordsFixed = 0;
        const fixedRecords = [];
        
        for (const record of existingRecords) {
          const correctOpeningStock = await this.getPreviousDayClosingStock(
            userId, date, record.brand_number, record.size
          );
          
          if ((correctOpeningStock > 0 && record.opening_stock === 0) || 
              (record.opening_stock !== correctOpeningStock && correctOpeningStock > 0)) {
            
            const updateQuery = `
              UPDATE daily_stock_records 
              SET opening_stock = $1, total = $2, updated_at = CURRENT_TIMESTAMP
              WHERE id = $3
            `;
            
            const newTotal = correctOpeningStock + record.received;
            await pool.query(updateQuery, [correctOpeningStock, newTotal, record.id]);
            
            recordsFixed++;
            fixedRecords.push({
              product: `${record.brand_number} - ${record.size}`,
              oldOpening: 0,
              newOpening: correctOpeningStock,
              closingStock: record.closing_stock
            });
          }
        }
        
        if (recordsFixed > 0) {
          return { 
            message: 'Fixed existing records with continuity issues',
            recordsFixed,
            details: fixedRecords
          };
        }
        
        return { 
          message: 'Records already exist for today',
          recordsCount: existingRecords.length
        };
      }
      
      // Get all products in shop inventory
      const shopProducts = await this.getShopProducts(userId);
      
      if (shopProducts.length === 0) {
        return { 
          message: 'No products in inventory',
          recordsCount: 0 
        };
      }
      
      let recordsCreated = 0;
      const createdRecords = [];
      
      // Create today's record for each product
      for (const product of shopProducts) {
        const openingStock = await this.getPreviousDayClosingStock(
          userId, date, product.brand_number, product.size
        );
        
        await this.createOrUpdateDailyStockRecord({
          userId,
          date,
          brandNumber: product.brand_number,
          brandName: product.name,
          size: product.size,
          price: product.final_price,
          received: 0,
          closingStock: openingStock
        });
        
        recordsCreated++;
        createdRecords.push({
          product: `${product.brand_number} - ${product.name}`,
          size: product.size,
          openingStock: openingStock,
          closingStock: openingStock
        });
      }
      
      return {
        message: 'Stock records initialized for today with proper continuity',
        date,
        recordsCreated,
        recordsWithStock: createdRecords.filter(r => r.openingStock > 0).length,
        details: createdRecords
      };
      
    } catch (error) {
      throw new Error(`Error initializing today stock: ${error.message}`);
    }
  }
}

module.exports = new DatabaseService();
