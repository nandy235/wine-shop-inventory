const { pool, retryOperation } = require('./database');

class DatabaseService {
  // User Management - Updated for new normalized schema
  async createUser(userData) {
    const { name, email, password, shopName, retailerCode, address, licenseNumber } = userData;
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if user already exists (for multiple shops per user)
      let user;
      const existingUserQuery = 'SELECT id, name, email, created_at FROM users WHERE email = $1';
      const existingUserResult = await client.query(existingUserQuery, [email]);
      
      if (existingUserResult.rows.length > 0) {
        // User exists, use existing user for new shop
        user = existingUserResult.rows[0];
        console.log(`Using existing user ${user.email} for new shop: ${shopName}`);
      } else {
        // Create new user (without password - password is shop-specific)
        const userQuery = `
          INSERT INTO users (name, email)
          VALUES ($1, $2)
          RETURNING id, name, email, created_at
        `;
        const userValues = [name, email];
        const userResult = await client.query(userQuery, userValues);
        user = userResult.rows[0];
        console.log(`Created new user: ${user.email}`);
      }
      
      // Create shop with password and link to user
      const shopQuery = `
        INSERT INTO shops (user_id, shop_name, address, license_number, retailer_code, password)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, shop_name, address, license_number, retailer_code, created_at
      `;
      const shopValues = [user.id, shopName, address || null, licenseNumber || null, retailerCode, password];
      const shopResult = await client.query(shopQuery, shopValues);
      const shop = shopResult.rows[0];
      
      await client.query('COMMIT');
      
      console.log(`Created shop: ${shop.shop_name} for user: ${user.email}`);
      
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

  // Get all shops for a user (for multi-shop dashboard)
  async getUserShops(userId) {
    const query = `
      SELECT 
        id, shop_name, retailer_code, address, license_number, created_at
      FROM shops 
      WHERE user_id = $1
      ORDER BY created_at ASC
    `;
    
    try {
      const result = await pool.query(query, [userId]);
      return result.rows;
    } catch (error) {
      throw new Error(`Error getting user shops: ${error.message}`);
    }
  }

  async findUserByEmail(email) {
    const query = `
      SELECT 
        u.id, u.name, u.email, u.created_at,
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
        u.id, u.name, u.email, u.created_at,
        s.id as shop_id, s.shop_name, s.address, s.license_number, s.retailer_code, s.password
      FROM shops s
      JOIN users u ON s.user_id = u.id
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
        password: user.password,        // Now from shops table
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

  async getShopProducts(shopId, date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const query = `
      SELECT 
        si.id,
        si.master_brand_id,
        si.markup_price,
        si.final_price as "finalPrice",
        si.current_quantity as quantity,
        si.is_active,
        si.last_updated,
        COALESCE(si.sort_order, 999) as sort_order,
        mb.standard_mrp as mrp,
        mb.brand_number as "brandNumber",
        mb.brand_name as name,
        mb.size_ml as size,
        mb.size_code as "sizeCode",
        mb.brand_kind,
        mb.product_type,
        mb.pack_type as "packType",
        CASE 
          WHEN mb.product_type = 'IML' THEN 'IML'
          WHEN mb.product_type = 'DUTY_PAID' THEN 'Duty Paid'
          WHEN mb.product_type = 'BEER' THEN 'Beer'
          WHEN mb.product_type = 'DUTY_FREE' THEN 'Duty Free'
          ELSE mb.product_type
        END as category,
        -- Get stock data for the specified date
        COALESCE(dsr.opening_stock, 0) as "openingStock",
        COALESCE(dsr.received_stock, 0) as "receivedStock",
        COALESCE(dsr.total_stock, COALESCE(dsr.opening_stock, 0) + COALESCE(dsr.received_stock, 0)) as "totalStock",
        dsr.closing_stock as "closingStock"
      FROM shop_inventory si
      JOIN master_brands mb ON si.master_brand_id = mb.id
      LEFT JOIN daily_stock_records dsr ON si.id = dsr.shop_inventory_id 
        AND dsr.stock_date = $2
      WHERE si.shop_id = $1 AND si.is_active = true
      ORDER BY COALESCE(si.sort_order, 999), mb.brand_number, mb.size_ml
    `;
    
    try {
      const result = await pool.query(query, [shopId, targetDate]);
      return result.rows;
    } catch (error) {
      throw new Error(`Error getting shop products: ${error.message}`);
    }
  }

  async updateSortOrder(shopId, sortedBrandGroups) {
    try {
      console.log('🔄 Updating sort order for shop:', shopId);
      console.log('📋 Sorted groups:', sortedBrandGroups);
      
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        let sortOrder = 1;
        
        for (const group of sortedBrandGroups) {
          // Update sort order for each product in the group
          for (const productId of group.productIds) {
            await client.query(
              'UPDATE shop_inventory SET sort_order = $1 WHERE id = $2 AND shop_id = $3',
              [sortOrder, productId, shopId]
            );
            sortOrder++;
          }
        }
        
        await client.query('COMMIT');
        console.log('✅ Sort order updated successfully');
        
        return { 
          message: 'Sort order updated successfully',
          totalUpdated: sortOrder - 1
        };
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      throw new Error(`Error updating sort order: ${error.message}`);
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

  // Specific method for updating closing stock only
  async updateClosingStock(shopInventoryId, stockDate, closingStock) {
    try {
      const updateQuery = `
        UPDATE daily_stock_records 
        SET closing_stock = $3
        WHERE shop_inventory_id = $1 AND stock_date = $2
        RETURNING *
      `;
      
      const values = [shopInventoryId, stockDate, closingStock];
      const result = await pool.query(updateQuery, values);
      
      if (result.rows.length === 0) {
        // If no record exists, we need to get the previous day's closing stock as opening stock
        const prevClosingQuery = `
          SELECT closing_stock 
          FROM daily_stock_records 
          WHERE shop_inventory_id = $1 AND stock_date < $2 
          ORDER BY stock_date DESC 
          LIMIT 1
        `;
        
        const prevResult = await pool.query(prevClosingQuery, [shopInventoryId, stockDate]);
        const openingStock = prevResult.rows[0]?.closing_stock || 0;
        
        // Create new record with proper opening stock
        return await this.createOrUpdateDailyStockRecord({
          shopInventoryId,
          stockDate,
          openingStock,
          receivedStock: 0,
          closingStock,
          pricePerUnit: null
        });
      }
      
      return result;
    } catch (error) {
      throw new Error(`Error updating closing stock: ${error.message}`);
    }
  }

  // Initialize today's stock records for all shop products
  async initializeTodayStock(shopId, date) {
    return await retryOperation(async () => {
      // First, let's check how many products exist in shop_inventory
      const inventoryCheck = await pool.query(
        'SELECT COUNT(*) as count FROM shop_inventory WHERE shop_id = $1 AND is_active = true',
        [shopId]
      );
      
      // Check if any daily stock records already exist for this date
      const existingCheck = await pool.query(
        'SELECT COUNT(*) as count FROM daily_stock_records dsr JOIN shop_inventory si ON dsr.shop_inventory_id = si.id WHERE si.shop_id = $1 AND dsr.stock_date = $2',
        [shopId, date]
      );
      
      // Debug: Check previous day's data
      const prevDayCheck = await pool.query(`
        SELECT COUNT(*) as count, 
               COUNT(CASE WHEN closing_stock IS NOT NULL THEN 1 END) as with_closing,
               COUNT(CASE WHEN closing_stock IS NULL THEN 1 END) as without_closing
        FROM daily_stock_records dsr 
        JOIN shop_inventory si ON dsr.shop_inventory_id = si.id 
        WHERE si.shop_id = $1 AND dsr.stock_date < $2
      `, [shopId, date]);
      console.log(`📊 Previous days data: ${prevDayCheck.rows[0].count} total, ${prevDayCheck.rows[0].with_closing} with closing, ${prevDayCheck.rows[0].without_closing} without closing`);
      
      const query = `
        INSERT INTO daily_stock_records (shop_inventory_id, stock_date, opening_stock, received_stock, closing_stock)
        SELECT 
          si.id,
          $2,
          CASE 
            WHEN prev.closing_stock IS NOT NULL THEN prev.closing_stock
            WHEN prev.closing_stock IS NULL AND prev.total_stock IS NOT NULL AND prev.total_stock > 0 THEN prev.opening_stock
            WHEN record_count.total_records IS NULL OR record_count.first_record_date = $2 THEN 0
            WHEN prev.shop_inventory_id IS NULL OR (prev.total_stock IS NULL OR prev.total_stock = 0) THEN si.current_quantity
            ELSE 0
          END as opening_stock,
          CASE 
            WHEN prev.closing_stock IS NOT NULL THEN 0
            WHEN prev.closing_stock IS NULL AND prev.total_stock IS NOT NULL AND prev.total_stock > 0 THEN prev.received_stock
            ELSE 0
          END as received_stock,
          NULL as closing_stock
        FROM shop_inventory si
        LEFT JOIN daily_stock_records prev ON prev.shop_inventory_id = si.id 
          AND prev.stock_date = (
            SELECT MAX(stock_date) 
            FROM daily_stock_records 
            WHERE shop_inventory_id = si.id AND stock_date < $2
          )
        LEFT JOIN (
          SELECT shop_inventory_id, COUNT(*) as total_records, MIN(stock_date) as first_record_date
          FROM daily_stock_records 
          GROUP BY shop_inventory_id
        ) record_count ON record_count.shop_inventory_id = si.id
        WHERE si.shop_id = $1 
          AND si.is_active = true
        ON CONFLICT (shop_inventory_id, stock_date) 
        DO UPDATE SET 
          opening_stock = EXCLUDED.opening_stock,
          -- Only reset received_stock to 0 if it's currently NULL
          received_stock = CASE 
            WHEN daily_stock_records.received_stock IS NULL THEN 0
            ELSE daily_stock_records.received_stock 
          END
      `;
      
      const result = await pool.query(query, [shopId, date]);
      return result.rowCount;
    }).catch(error => {
      console.error(`❌ Error initializing stock for shop ${shopId}:`, error);
      throw new Error(`Error initializing today's stock: ${error.message}`);
    });
  }

  async getPreviousDayClosingStock(shopId, currentDate, brandNumber, size) {
    const query = `
      SELECT dsr.closing_stock 
      FROM daily_stock_records dsr
      JOIN shop_inventory si ON dsr.shop_inventory_id = si.id  
      JOIN master_brands mb ON si.master_brand_id = mb.id
      WHERE si.shop_id = $1 AND mb.brand_number = $2 AND mb.size_ml = $3 AND dsr.stock_date < $4
      ORDER BY dsr.stock_date DESC 
      LIMIT 1
    `;
    
    try {
      const result = await pool.query(query, [shopId, brandNumber, size, currentDate]);
      return result.rows.length > 0 ? result.rows[0].closing_stock : 0;
    } catch (error) {
      throw new Error(`Error getting previous closing stock: ${error.message}`);
    }
  }

  async getDailyStockRecords(shopId, date) {
    const query = `
      SELECT dsr.*, mb.brand_number, mb.size_ml as size
      FROM daily_stock_records dsr
      JOIN shop_inventory si ON dsr.shop_inventory_id = si.id
      JOIN master_brands mb ON si.master_brand_id = mb.id
      WHERE si.shop_id = $1 AND dsr.stock_date = $2
      ORDER BY mb.brand_number, mb.size_ml
    `;
    
    try {
      const result = await pool.query(query, [shopId, date]);
      return result.rows;
    } catch (error) {
      throw new Error(`Error getting daily stock records: ${error.message}`);
    }
  }

  async isClosingStockSaved(shopId, date) {
    const query = `
      SELECT COUNT(*) as total_products,
             COUNT(CASE WHEN dsr.closing_stock IS NOT NULL THEN 1 END) as saved_products
      FROM shop_inventory si
      LEFT JOIN daily_stock_records dsr ON si.id = dsr.shop_inventory_id AND dsr.stock_date = $2
      WHERE si.shop_id = $1 AND si.is_active = true
    `;
    
    try {
      const result = await pool.query(query, [shopId, date]);
      const { total_products, saved_products } = result.rows[0];
      
      return {
        totalProducts: parseInt(total_products),
        savedProducts: parseInt(saved_products),
        isFullySaved: parseInt(total_products) > 0 && parseInt(total_products) === parseInt(saved_products),
        isPartiallySaved: parseInt(saved_products) > 0
      };
    } catch (error) {
      throw new Error(`Error checking closing stock status: ${error.message}`);
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
        userId, invoiceNumber, date, originalInvoiceDate, totalValue,
        netInvoiceValue, mrpRoundingOff, retailExciseTurnoverTax, specialExciseCess, tcs
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
         retail_shop_excise_turnover_tax, special_excise_cess, tcs)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `;
      
      const invoiceValues = [
        shopId, invoiceNumber, originalInvoiceDate || date, totalValue, mrpRoundingOff,
        retailExciseTurnoverTax, specialExciseCess, tcs
      ];
      
      const invoiceResult = await client.query(invoiceQuery, invoiceValues);
      const invoiceId = invoiceResult.rows[0].id;
      
      console.log(`💾 Invoice saved with ID: ${invoiceId}`);
      
      // 2. Process shop_inventory records for all matched items
      if (items && items.length > 0) {
        for (const item of items) {
          if (item.masterBrandId) {
            // Check if shop_inventory record exists for this product
            const inventoryCheck = await client.query(`
              SELECT id, current_quantity FROM shop_inventory 
              WHERE shop_id = $1 AND master_brand_id = $2
            `, [shopId, item.masterBrandId]);
            
            if (inventoryCheck.rows.length === 0) {
              // Create shop_inventory record for new product
              await client.query(`
                INSERT INTO shop_inventory 
                (shop_id, master_brand_id, current_quantity, markup_price, final_price, is_active, last_updated)
                VALUES ($1, $2, $3, 0, $4, true, CURRENT_TIMESTAMP)
              `, [shopId, item.masterBrandId, item.totalQuantity, item.mrp || 0]);
              
              console.log(`📦 Created shop_inventory record for ${item.brandNumber} ${item.size} with quantity: ${item.totalQuantity}`);
            } else {
              // Update existing shop_inventory record - add the new stock
              const currentQty = inventoryCheck.rows[0].current_quantity || 0;
              const newQty = currentQty + item.totalQuantity;
              
              await client.query(`
                UPDATE shop_inventory 
                SET current_quantity = $1, 
                    final_price = COALESCE($2, final_price),
                    last_updated = CURRENT_TIMESTAMP
                WHERE shop_id = $3 AND master_brand_id = $4
              `, [newQty, item.mrp || null, shopId, item.masterBrandId]);
              
              console.log(`📦 Updated shop_inventory for ${item.brandNumber} ${item.size}: ${currentQty} + ${item.totalQuantity} = ${newQty}`);
            }
          }
        }
      }

      // 3. Save invoice items to received_stock_records (invoice_quantity column)
      if (items && items.length > 0) {
        const recordDate = new Date(date).toISOString().split('T')[0]; // Use business date for record_date
        
        for (const item of items) {
          // Only save items that have a master_brand_id (matched items)
          if (item.masterBrandId) {
            // Check if record already exists first
            const existingRecordQuery = `
              SELECT id, invoice_quantity FROM received_stock_records 
              WHERE shop_id = $1 AND master_brand_id = $2 AND record_date = $3 AND invoice_id = $4
            `;
            
            const existingRecord = await client.query(existingRecordQuery, [
              shopId, item.masterBrandId, recordDate, invoiceId
            ]);
            
            if (existingRecord.rows.length > 0) {
              // Update existing record
              const receivedStockQuery = `
                UPDATE received_stock_records 
                SET invoice_quantity = invoice_quantity + $1,
                    mrp_price = COALESCE($2, mrp_price),
                    notes = COALESCE($3, notes),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $4
              `;
              
              await client.query(receivedStockQuery, [
                item.totalQuantity,
                item.mrp || null,
                `From invoice: ${invoiceNumber} - ${item.brandNumber} ${item.description || item.brandName}`,
                existingRecord.rows[0].id
              ]);
            } else {
              // Insert new record
              const receivedStockQuery = `
                INSERT INTO received_stock_records 
                (shop_id, master_brand_id, record_date, invoice_quantity, 
                 mrp_price, invoice_id, notes, created_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              `;
              
              await client.query(receivedStockQuery, [
                shopId,
                item.masterBrandId,
                recordDate,
                item.totalQuantity,
                item.mrp || 0,
                invoiceId,
                `From invoice: ${invoiceNumber} - ${item.brandNumber} ${item.description || item.brandName}`,
                userId
              ]);
            }
            
            console.log(`📦 Added to received stock: ${item.brandNumber} ${item.size} (Qty: ${item.totalQuantity})`);
          } else {
            console.log(`⚠️ Skipped unmatched item: ${item.brandNumber} ${item.size} (no master_brand_id)`);
          }
        }
        
        console.log(`💾 Saved ${items.filter(item => item.masterBrandId).length} matched invoice items to received_stock_records`);
        console.log(`🔄 Database trigger should automatically update daily_stock_records.received_stock`);
      }
      
      await client.query('COMMIT');
      
      return {
        id: invoiceId,
        invoice_number: invoiceNumber,
        total_value: totalValue,
        date: date,
        itemsCount: items ? items.length : 0,
        matchedItemsCount: items ? items.filter(item => item.masterBrandId).length : 0,
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
  async getSummary(shopId, date) {
    return await retryOperation(async () => {
      // Validate shopId parameter
      if (!shopId) {
        throw new Error('Shop ID is required');
      }
      
      // Get today's stock records with product details and current inventory
      const stockRecordsQuery = `
        SELECT 
          dsr.*,
          mb.standard_mrp,
          mb.brand_name,
          mb.brand_number,
          mb.size_ml,
          si.current_quantity,
          si.final_price
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
          // Correct logic: Use closing_stock if set, otherwise use total_stock (opening + received)
          const stockForValue = record.closing_stock !== null ? record.closing_stock : (record.total_stock || 0);
          const sales = record.sales || 0;
          
          // Stock value = stock quantity * MRP
          if (stockForValue > 0 && record.standard_mrp) {
            const itemValue = stockForValue * parseFloat(record.standard_mrp);
            stockValue += itemValue;
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
            si.final_price,
            mb.brand_number,
            mb.brand_name,
            mb.size_ml
          FROM shop_inventory si
          JOIN master_brands mb ON si.master_brand_id = mb.id
          WHERE si.shop_id = $1 AND si.is_active = true AND si.current_quantity > 0
        `;
        
        const inventoryResult = await pool.query(inventoryQuery, [shopId]);
        
        for (const item of inventoryResult.rows) {
          if (item.current_quantity > 0 && item.standard_mrp) {
            const itemValue = item.current_quantity * parseFloat(item.standard_mrp);
            stockValue += itemValue;
          }
        }
      }
      
      // Calculate stock lifted - two values for this month
      const currentMonth = new Date(date).getMonth() + 1; // 1-12
      const currentYear = new Date(date).getFullYear();
      
      // 1. Cumulative Invoice Value (at actual invoice prices) - based on upload date
      const invoiceValueQuery = `
        SELECT COALESCE(SUM(invoice_value), 0) as cumulative_invoice_value
        FROM invoices 
        WHERE shop_id = $1 
        AND EXTRACT(MONTH FROM created_at) = $2 
        AND EXTRACT(YEAR FROM created_at) = $3
      `;
      const invoiceValueResult = await pool.query(invoiceValueQuery, [shopId, currentMonth, currentYear]);
      const cumulativeInvoiceValue = parseFloat(invoiceValueResult.rows[0].cumulative_invoice_value || 0);
      
      // 2. Monthly MRP Value (from received_stock_records with stored MRP prices)
      const mrpValueQuery = `
        SELECT COALESCE(SUM(
          rsr.invoice_quantity * COALESCE(rsr.mrp_price, 0)
        ), 0) as cumulative_mrp_value
        FROM received_stock_records rsr
        WHERE rsr.shop_id = $1 
        AND rsr.invoice_quantity > 0
        AND EXTRACT(MONTH FROM rsr.created_at) = $2 
        AND EXTRACT(YEAR FROM rsr.created_at) = $3
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
    }).catch(error => {
      throw new Error(`Error getting summary: ${error.message}`);
    });
  }

  // Income and Expenses methods
  async ensureIncomeCategoriesTable() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS income_categories (
        id SERIAL PRIMARY KEY,
        shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;
    const createUniqueIndexQuery = `
      CREATE UNIQUE INDEX IF NOT EXISTS income_categories_unique_shop_lower_name
      ON income_categories (shop_id, lower(name));
    `;
    try {
      await pool.query(createTableQuery);
      await pool.query(createUniqueIndexQuery);
    } catch (error) {
      throw new Error(`Error ensuring income_categories table: ${error.message}`);
    }
  }

  async seedDefaultIncomeCategories(shopId) {
    await this.ensureIncomeCategoriesTable();
    // Always attempt to upsert defaults/repairs; safe due to NOT EXISTS guards

    const defaults = [
      { name: 'Sitting', is_default: true, sort_order: 1 },
      { name: 'Cash discounts', is_default: true, sort_order: 2 },
      { name: 'Used bottles/cartons sale', is_default: true, sort_order: 3 },
      { name: 'Others', is_default: true, sort_order: 4 }
    ];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const d of defaults) {
        await client.query(
          `INSERT INTO income_categories (shop_id, name, sort_order, is_default)
           SELECT $1, $2, $3, $4
           WHERE NOT EXISTS (
             SELECT 1 FROM income_categories
             WHERE shop_id = $1 AND lower(name) = lower($2)
           )`,
          [shopId, d.name, d.sort_order, d.is_default]
        );
      }

      // Ensure 'Used bottles/cartons sale' is the default (order 3)
      await client.query(
        `UPDATE income_categories
         SET is_default = TRUE, sort_order = 3
         WHERE shop_id = $1 AND lower(name) = lower('Used bottles/cartons sale')`,
        [shopId]
      );

      // Make alternative text non-default so it can be deleted from UI
      await client.query(
        `UPDATE income_categories
         SET is_default = FALSE
         WHERE shop_id = $1 AND lower(name) = lower('sold old cartons/used bottles')`,
        [shopId]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Error seeding default income categories: ${error.message}`);
    } finally {
      client.release();
    }
  }

  async getIncomeCategories(shopId) {
    await this.ensureIncomeCategoriesTable();
    await this.seedDefaultIncomeCategories(shopId);
    const query = `
      SELECT id, name, sort_order, is_default
      FROM income_categories
      WHERE shop_id = $1
      ORDER BY sort_order ASC, name ASC
    `;
    try {
      const result = await pool.query(query, [shopId]);
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching income categories: ${error.message}`);
    }
  }

  async addIncomeCategory(shopId, name) {
    await this.ensureIncomeCategoriesTable();
    await this.seedDefaultIncomeCategories(shopId);

    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new Error('Category name is required');
    }

    // Prevent naming as Others (reserved)
    if (trimmed.toLowerCase() === 'others') {
      throw new Error('Category name "Others" is reserved');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Ensure Others exists
      const othersRes = await client.query(
        `SELECT id, sort_order FROM income_categories WHERE shop_id = $1 AND lower(name) = 'others'`,
        [shopId]
      );

      if (othersRes.rows.length === 0) {
        // Create Others at the end if missing
        const maxRes = await client.query(
          `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM income_categories WHERE shop_id = $1`,
          [shopId]
        );
        const nextOrder = (parseInt(maxRes.rows[0].max_order, 10) || 0) + 1;
        await client.query(
          `INSERT INTO income_categories (shop_id, name, sort_order, is_default)
           SELECT $1, 'Others', $2, true
           WHERE NOT EXISTS (
             SELECT 1 FROM income_categories WHERE shop_id = $1 AND lower(name) = 'others'
           )`,
          [shopId, nextOrder]
        );
      }

      // Find max sort among non-Others
      const maxNonOthersRes = await client.query(
        `SELECT COALESCE(MAX(sort_order), 0) AS max_non_others
         FROM income_categories
         WHERE shop_id = $1 AND lower(name) <> 'others'`,
        [shopId]
      );
      const maxNonOthers = parseInt(maxNonOthersRes.rows[0].max_non_others, 10) || 0;

      // Insert new category right before Others
      const newOrder = maxNonOthers + 1;
      await client.query(
        `INSERT INTO income_categories (shop_id, name, sort_order, is_default)
         SELECT $1, $2, $3, false
         WHERE NOT EXISTS (
           SELECT 1 FROM income_categories WHERE shop_id = $1 AND lower(name) = lower($2)
         )`,
        [shopId, trimmed, newOrder]
      );

      // Move Others to last (after the newly added)
      const maxAfterInsertRes = await client.query(
        `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM income_categories WHERE shop_id = $1`,
        [shopId]
      );
      const maxOrder = parseInt(maxAfterInsertRes.rows[0].max_order, 10) || newOrder;
      await client.query(
        `UPDATE income_categories
         SET sort_order = $2
         WHERE shop_id = $1 AND lower(name) = 'others'`,
        [shopId, maxOrder + 1]
      );

      await client.query('COMMIT');

      // Return updated list
      const updated = await this.getIncomeCategories(shopId);
      return updated;
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Error adding income category: ${error.message}`);
    } finally {
      client.release();
    }
  }

  async deleteIncomeCategory(shopId, name) {
    await this.ensureIncomeCategoriesTable();
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new Error('Category name is required');
    }

    // Do not allow deleting defaults
    const defaults = ['sitting', 'cash discounts', 'used bottles/cartons sale', 'others'];
    if (defaults.includes(trimmed.toLowerCase())) {
      throw new Error('Cannot delete default categories');
    }

    try {
      const result = await pool.query(
        `DELETE FROM income_categories 
         WHERE shop_id = $1 AND lower(name) = lower($2) AND is_default = FALSE
         RETURNING id, name`,
        [shopId, trimmed]
      );
      if (result.rowCount === 0) {
        throw new Error('Category not found or cannot be deleted');
      }
      // Return updated list
      return await this.getIncomeCategories(shopId);
    } catch (error) {
      throw new Error(`Error deleting income category: ${error.message}`);
    }
  }
  async getIncome(shopId, date) {
    const query = `
      SELECT source, amount, description 
      FROM other_income 
      WHERE shop_id = $1 AND income_date = $2
      ORDER BY source
    `;
    
    return await retryOperation(async () => {
      const result = await pool.query(query, [shopId, date]);
      return result.rows;
    }).catch(error => {
      console.error('Error fetching income:', error);
      throw error;
    });
  }

  async getExpenses(shopId, date) {
    const query = `
      SELECT category, amount, description 
      FROM expenses 
      WHERE shop_id = $1 AND expense_date = $2
      ORDER BY category
    `;
    
    return await retryOperation(async () => {
      const result = await pool.query(query, [shopId, date]);
      return result.rows;
    }).catch(error => {
      console.error('Error fetching expenses:', error);
      throw error;
    });
  }

  async saveIncome(shopId, date, incomeEntries) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Delete existing income for this date
      await client.query(
        'DELETE FROM other_income WHERE shop_id = $1 AND income_date = $2',
        [shopId, date]
      );
      
      // Insert new income entries
      for (const entry of incomeEntries) {
        if (entry.amount > 0) {
          await client.query(
            'INSERT INTO other_income (shop_id, income_date, source, amount, description) VALUES ($1, $2, $3, $4, $5)',
            [shopId, date, entry.category, entry.amount, entry.description || null]
          );
        }
      }
      
      await client.query('COMMIT');
      return { success: true, message: 'Income saved successfully' };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error saving income:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async saveExpenses(shopId, date, expenseEntries) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Delete existing expenses for this date
      await client.query(
        'DELETE FROM expenses WHERE shop_id = $1 AND expense_date = $2',
        [shopId, date]
      );
      
      // Insert new expense entries
      for (const entry of expenseEntries) {
        if (entry.amount > 0) {
          await client.query(
            'INSERT INTO expenses (shop_id, expense_date, category, amount, description) VALUES ($1, $2, $3, $4, $5)',
            [shopId, date, entry.category, entry.amount, entry.description || null]
          );
        }
      }
      
      await client.query('COMMIT');
      return { success: true, message: 'Expenses saved successfully' };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error saving expenses:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Payment methods
  async getPaymentRecord(shopId, date) {
    const query = `
      SELECT id, payment_date, cash_amount, upi_amount, card_amount, total_amount, created_at
      FROM daily_payments 
      WHERE shop_id = $1 AND payment_date = $2
    `;
    
    return await retryOperation(async () => {
      const result = await pool.query(query, [shopId, date]);
      return result.rows[0] || null;
    }).catch(error => {
      console.error('Error fetching payment record:', error);
      throw error;
    });
  }

  async getRecentPayments(shopId, days = 7) {
    const query = `
      SELECT id, payment_date, cash_amount, upi_amount, card_amount, total_amount, created_at
      FROM daily_payments 
      WHERE shop_id = $1 AND payment_date >= CURRENT_DATE - INTERVAL '${days} days'
      ORDER BY payment_date DESC
      LIMIT 10
    `;
    
    try {
      const result = await pool.query(query, [shopId]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching recent payments:', error);
      throw error;
    }
  }

  async savePaymentRecord(shopId, paymentDate, cashAmount, upiAmount, cardAmount) {
    // First, calculate the closing counter balance
    const closingBalance = await this.calculateClosingCounterBalance(shopId, paymentDate, cashAmount, upiAmount, cardAmount);
    
    const query = `
      INSERT INTO daily_payments (shop_id, payment_date, cash_amount, upi_amount, card_amount, closing_counter_balance)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (shop_id, payment_date)
      DO UPDATE SET
        cash_amount = EXCLUDED.cash_amount,
        upi_amount = EXCLUDED.upi_amount,
        card_amount = EXCLUDED.card_amount,
        closing_counter_balance = EXCLUDED.closing_counter_balance
      RETURNING id, payment_date, cash_amount, upi_amount, card_amount, total_amount, closing_counter_balance, created_at
    `;
    
    // Retry logic for database connection issues
    const maxRetries = 3;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`💾 Attempting to save payment record with closing balance (attempt ${attempt}/${maxRetries})`);
        const result = await pool.query(query, [shopId, paymentDate, cashAmount, upiAmount, cardAmount, closingBalance]);
        console.log(`✅ Payment record saved successfully on attempt ${attempt} with closing balance: ${closingBalance}`);
        return result.rows[0];
      } catch (error) {
        lastError = error;
        console.error(`❌ Attempt ${attempt} failed:`, error.message);
        
        // Check if it's a connection error that might be retryable
        if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.errno === -54) {
          if (attempt < maxRetries) {
            console.log(`🔄 Retrying in ${attempt * 1000}ms...`);
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
            continue;
          }
        }
        
        // If it's not a retryable error or we've exhausted retries, throw immediately
        console.error('❌ Final error saving payment record:', error);
        throw error;
      }
    }
    
    // If we get here, all retries failed
    throw lastError;
  }

  // Helper method to calculate closing counter balance
  async calculateClosingCounterBalance(shopId, paymentDate, cashAmount, upiAmount, cardAmount) {
    try {
      console.log(`🔄 Calculating closing counter balance for shop ${shopId} on ${paymentDate}`);
      
      // Get the summary data for the date to calculate closing balance
      const summaryData = await this.getSummary(shopId, paymentDate);
      
      // Calculate total amount collected
      const totalAmountCollected = parseFloat(cashAmount) + parseFloat(upiAmount) + parseFloat(cardAmount);
      
      // Closing Balance = Opening + Sales + Other Income - Expenses - Total Amount Collected
      const closingBalance = summaryData.openingBalance + summaryData.totalSales + summaryData.totalOtherIncome - summaryData.totalExpenses - totalAmountCollected;
      
      console.log(`💾 Closing balance calculated: ${closingBalance} (will be saved to daily_payments)`);
      
      return Math.round(closingBalance * 100) / 100; // Round to 2 decimal places
    } catch (error) {
      console.error('❌ Error calculating closing counter balance:', error);
      return 0; // Default to 0 if calculation fails
    }
  }

  // ===============================================
  // NEW STOCK TABLES METHODS
  // ===============================================

  // Received Stock Records Management
  async addReceivedStock(stockData) {
    const {
      shopId, masterBrandId, recordDate, invoiceQuantity = 0, 
      manualQuantity = 0, transferQuantity = 0, invoiceId = null,
      transferReference = null, notes = null, createdBy = null
    } = stockData;
    
    const query = `
      INSERT INTO received_stock_records (
        shop_id, master_brand_id, record_date, invoice_quantity, 
        manual_quantity, transfer_quantity, invoice_id, 
        transfer_reference, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    
    const values = [
      shopId, masterBrandId, recordDate, invoiceQuantity,
      manualQuantity, transferQuantity, invoiceId,
      transferReference, notes, createdBy
    ];
    
    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error adding received stock: ${error.message}`);
    }
  }

  async getReceivedStock(shopId, date = null, masterBrandId = null) {
    let query = `
      SELECT 
        rs.*,
        mb.brand_number,
        mb.brand_name,
        mb.size_ml,
        mb.size_code,
        u.name as created_by_name,
        i.icdc_number as invoice_number
      FROM received_stock_records rs
      JOIN master_brands mb ON rs.master_brand_id = mb.id
      LEFT JOIN users u ON rs.created_by = u.id
      LEFT JOIN invoices i ON rs.invoice_id = i.id
      WHERE rs.shop_id = $1
    `;
    
    const params = [shopId];
    let paramCount = 1;
    
    if (date) {
      paramCount++;
      query += ` AND rs.record_date = $${paramCount}`;
      params.push(date);
    }
    
    if (masterBrandId) {
      paramCount++;
      query += ` AND rs.master_brand_id = $${paramCount}`;
      params.push(masterBrandId);
    }
    
    query += ` ORDER BY rs.record_date DESC, rs.created_at DESC`;
    
    try {
      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Error getting received stock: ${error.message}`);
    }
  }

  async updateReceivedStock(id, updates) {
    const {
      invoiceQuantity, manualQuantity, transferQuantity,
      transferReference, notes
    } = updates;
    
    const query = `
      UPDATE received_stock_records 
      SET 
        invoice_quantity = COALESCE($2, invoice_quantity),
        manual_quantity = COALESCE($3, manual_quantity),
        transfer_quantity = COALESCE($4, transfer_quantity),
        transfer_reference = COALESCE($5, transfer_reference),
        notes = COALESCE($6, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const values = [id, invoiceQuantity, manualQuantity, transferQuantity, transferReference, notes];
    
    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error updating received stock: ${error.message}`);
    }
  }

  async deleteReceivedStock(id, shopId) {
    const query = `
      DELETE FROM received_stock_records 
      WHERE id = $1 AND shop_id = $2
      RETURNING *
    `;
    
    try {
      const result = await pool.query(query, [id, shopId]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error deleting received stock: ${error.message}`);
    }
  }

  // Stock Transfer Methods
  async createStockTransfer(transferData) {
    const {
      fromShopId, toShopId, masterBrandId, quantity, 
      transferReference, notes, createdBy, recordDate
    } = transferData;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const transferDate = recordDate || new Date().toISOString().split('T')[0];
      
      // Create outgoing transfer record (negative quantity)
      const outgoingQuery = `
        INSERT INTO received_stock_records (
          shop_id, master_brand_id, record_date, transfer_quantity,
          transfer_reference, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `;
      
      const outgoingResult = await client.query(outgoingQuery, [
        fromShopId, masterBrandId, transferDate, -quantity,
        `Transfer to Shop ${toShopId}: ${transferReference}`, notes, createdBy
      ]);
      
      // Create incoming transfer record (positive quantity)
      const incomingQuery = `
        INSERT INTO received_stock_records (
          shop_id, master_brand_id, record_date, transfer_quantity,
          transfer_reference, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `;
      
      const incomingResult = await client.query(incomingQuery, [
        toShopId, masterBrandId, transferDate, quantity,
        `Transfer from Shop ${fromShopId}: ${transferReference}`, notes, createdBy
      ]);
      
      await client.query('COMMIT');
      
      return {
        outgoingId: outgoingResult.rows[0].id,
        incomingId: incomingResult.rows[0].id,
        quantity: quantity,
        transferDate: transferDate
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Error creating stock transfer: ${error.message}`);
    } finally {
      client.release();
    }
  }

  async getStockTransfers(shopId, date = null) {
    const query = `
      SELECT 
        rs.*,
        mb.brand_number,
        mb.brand_name,
        mb.size_ml,
        mb.size_code,
        u.name as created_by_name,
        CASE 
          WHEN rs.transfer_quantity > 0 THEN 'RECEIVED'
          WHEN rs.transfer_quantity < 0 THEN 'TRANSFERRED_OUT'
          ELSE 'NO_TRANSFER'
        END as transfer_type
      FROM received_stock_records rs
      JOIN master_brands mb ON rs.master_brand_id = mb.id
      LEFT JOIN users u ON rs.created_by = u.id
      WHERE rs.shop_id = $1 AND rs.transfer_quantity != 0
      ${date ? 'AND rs.record_date = $2' : ''}
      ORDER BY rs.record_date DESC, rs.created_at DESC
    `;
    
    const params = date ? [shopId, date] : [shopId];
    
    try {
      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Error getting stock transfers: ${error.message}`);
    }
  }

  // Closing Stock Records Management
  async createOrUpdateClosingStock(stockData) {
    const {
      shopId, masterBrandId, recordDate, openingStock = 0,
      closingStock = null, unitPrice = null, isFinalized = false,
      varianceNotes = null, createdBy = null, finalizedBy = null
    } = stockData;
    
    const query = `
      INSERT INTO closing_stock_records (
        shop_id, master_brand_id, record_date, opening_stock,
        closing_stock, unit_price, is_finalized, variance_notes,
        created_by, finalized_by, finalized_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (shop_id, master_brand_id, record_date)
      DO UPDATE SET
        closing_stock = COALESCE(EXCLUDED.closing_stock, closing_stock_records.closing_stock),
        unit_price = COALESCE(EXCLUDED.unit_price, closing_stock_records.unit_price),
        is_finalized = EXCLUDED.is_finalized,
        variance_notes = COALESCE(EXCLUDED.variance_notes, closing_stock_records.variance_notes),
        finalized_by = CASE WHEN EXCLUDED.is_finalized THEN EXCLUDED.finalized_by ELSE closing_stock_records.finalized_by END,
        finalized_at = CASE WHEN EXCLUDED.is_finalized THEN CURRENT_TIMESTAMP ELSE closing_stock_records.finalized_at END,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    
    const values = [
      shopId, masterBrandId, recordDate, openingStock,
      closingStock, unitPrice, isFinalized, varianceNotes,
      createdBy, finalizedBy, isFinalized ? new Date() : null
    ];
    
    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error creating/updating closing stock: ${error.message}`);
    }
  }

  async getClosingStock(shopId, date = null, masterBrandId = null) {
    let query = `
      SELECT 
        cs.*,
        mb.brand_number,
        mb.brand_name,
        mb.size_ml,
        mb.size_code,
        u1.name as created_by_name,
        u2.name as finalized_by_name
      FROM closing_stock_records cs
      JOIN master_brands mb ON cs.master_brand_id = mb.id
      LEFT JOIN users u1 ON cs.created_by = u1.id
      LEFT JOIN users u2 ON cs.finalized_by = u2.id
      WHERE cs.shop_id = $1
    `;
    
    const params = [shopId];
    let paramCount = 1;
    
    if (date) {
      paramCount++;
      query += ` AND cs.record_date = $${paramCount}`;
      params.push(date);
    }
    
    if (masterBrandId) {
      paramCount++;
      query += ` AND cs.master_brand_id = $${paramCount}`;
      params.push(masterBrandId);
    }
    
    query += ` ORDER BY cs.record_date DESC, mb.brand_number`;
    
    try {
      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Error getting closing stock: ${error.message}`);
    }
  }

  async finalizeClosingStock(shopId, date, closingStockUpdates, finalizedBy) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      let updatedCount = 0;
      
      for (const update of closingStockUpdates) {
        const { masterBrandId, closingStock, varianceNotes } = update;
        
        await client.query(`
          UPDATE closing_stock_records 
          SET 
            closing_stock = $1,
            variance_notes = $2,
            is_finalized = TRUE,
            finalized_by = $3,
            finalized_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE shop_id = $4 AND master_brand_id = $5 AND record_date = $6
        `, [closingStock, varianceNotes, finalizedBy, shopId, masterBrandId, date]);
        
        updatedCount++;
      }
      
      await client.query('COMMIT');
      
      return {
        message: 'Closing stock finalized successfully',
        updatedCount: updatedCount,
        date: date
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Error finalizing closing stock: ${error.message}`);
    } finally {
      client.release();
    }
  }

  // Enhanced Daily Stock Summary with new tables
  async getEnhancedDailyStockSummary(shopId, date) {
    const query = `
      SELECT * FROM v_daily_stock_summary_enhanced
      WHERE shop_id = $1 AND record_date = $2
      ORDER BY brand_number, size_ml
    `;
    
    try {
      const result = await pool.query(query, [shopId, date]);
      return result.rows;
    } catch (error) {
      throw new Error(`Error getting enhanced daily stock summary: ${error.message}`);
    }
  }

  // Aggregated Sales (uses generated dsr.sales) between dates
  async getAggregatedSalesByBrand(shopId, startDate, endDate) {
    const query = `
      SELECT 
        mb.id AS master_brand_id,
        mb.brand_number,
        mb.brand_name,
        mb.size_ml,
        mb.size_code,
        mb.standard_mrp,
        mb.pack_quantity,
        mb.brand_kind,
        SUM(dsr.sales) AS sold_bottles
      FROM daily_stock_records dsr
      JOIN shop_inventory si ON dsr.shop_inventory_id = si.id
      JOIN master_brands mb ON si.master_brand_id = mb.id
      WHERE si.shop_id = $1
        AND dsr.stock_date BETWEEN $2 AND $3
      GROUP BY 
        mb.id, mb.brand_number, mb.brand_name, mb.size_ml, mb.size_code, 
        mb.standard_mrp, mb.pack_quantity, mb.brand_kind
      ORDER BY mb.brand_number, mb.size_ml
    `;

    try {
      const result = await pool.query(query, [shopId, startDate, endDate]);
      return result.rows;
    } catch (error) {
      throw new Error(`Error getting aggregated sales: ${error.message}`);
    }
  }

  // Initialize closing stock records for a date
  async initializeClosingStockRecords(shopId, date) {
    const query = `
      INSERT INTO closing_stock_records (shop_id, master_brand_id, record_date, opening_stock, unit_price)
      SELECT 
        si.shop_id,
        si.master_brand_id,
        $2,
        COALESCE(prev_cs.closing_stock, 0) as opening_stock,
        si.final_price as unit_price
      FROM shop_inventory si
      LEFT JOIN closing_stock_records prev_cs ON prev_cs.shop_id = si.shop_id 
        AND prev_cs.master_brand_id = si.master_brand_id 
        AND prev_cs.record_date = $2::date - 1
        AND prev_cs.is_finalized = TRUE
      WHERE si.shop_id = $1 AND si.is_active = TRUE
      ON CONFLICT (shop_id, master_brand_id, record_date) DO NOTHING
    `;
    
    try {
      const result = await pool.query(query, [shopId, date]);
      return result.rowCount;
    } catch (error) {
      throw new Error(`Error initializing closing stock records: ${error.message}`);
    }
  }

  // Master Brands Search Method
  async searchMasterBrands(searchTerm, limit = 20) {
    const query = `
      SELECT 
        id,
        brand_number,
        brand_name,
        size_ml,
        size_code,
        standard_mrp,
        product_type,
        pack_quantity,
        pack_type,
        brand_kind,
        invoice,
        special_margin,
        special_excise_cess,
        CASE 
          WHEN product_type = 'IML' THEN 'IML'
          WHEN product_type = 'DUTY_PAID' THEN 'Duty Paid'
          WHEN product_type = 'BEER' THEN 'Beer'
          WHEN product_type = 'DUTY_FREE' THEN 'Duty Free'
          ELSE product_type
        END as category
      FROM master_brands 
      WHERE is_active = true
        AND (
          brand_number ILIKE $1 
          OR brand_name ILIKE $1
        )
      ORDER BY 
        CASE 
          WHEN brand_number ILIKE $2 THEN 1
          WHEN brand_name ILIKE $2 THEN 2
          ELSE 3
        END,
        brand_number
      LIMIT $3
    `;
    
    try {
      const result = await pool.query(query, [`%${searchTerm}%`, `${searchTerm}%`, limit]);
      return result.rows;
    } catch (error) {
      throw new Error(`Error searching master brands: ${error.message}`);
    }
  }


}

module.exports = new DatabaseService();
