const { pool } = require('./database');

class DatabaseService {
  // User Management
  async createUser(userData) {
    const { name, email, password, shopName } = userData;
    const query = `
      INSERT INTO users (name, email, password, shop_name)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, shop_name, created_at
    `;
    const values = [name, email, password, shopName];
    
    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Full database error:', error);
      console.error('Error code:', error.code);
      console.error('Error detail:', error.detail);
      throw error; // Throw the original error, don't wrap it
    }
  }

  async findUserByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = $1';
    
    try {
      const result = await pool.query(query, [email]);
      return result.rows[0] || null;
    } catch (error) {
      throw new Error(`Error finding user: ${error.message}`);
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
    const {
      masterBrandId, name, brandNumber, category, packQuantity,
      size, sizeCode, mrp, shopMarkup, finalPrice, userId
    } = productData;
    
    const query = `
      INSERT INTO shop_inventory 
      (master_brand_id, user_id, name, brand_number, category, pack_quantity, size, size_code, mrp, shop_markup, final_price)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    
    const values = [
      masterBrandId, userId, name, brandNumber, category, packQuantity,
      size, sizeCode, mrp, shopMarkup, finalPrice
    ];
    
    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error adding shop product: ${error.message}`);
    }
  }

  async getShopProducts(userId, date = null) {
    const query = `
      SELECT si.*, 
             COALESCE(dsr.closing_stock, 0) as quantity
      FROM shop_inventory si
      LEFT JOIN daily_stock_records dsr ON 
        si.user_id = dsr.user_id AND 
        si.brand_number = dsr.brand_number AND 
        si.size = dsr.size AND
        dsr.date = COALESCE($2, CURRENT_DATE)
      WHERE si.user_id = $1
      ORDER BY si.sort_order, si.brand_number
    `;
    
    try {
      const result = await pool.query(query, [userId, date]);
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
      userId, date, brandNumber, brandName, size, price,
      received = 0, closingStock = null
    } = recordData;
    
    // Check if record exists
    const existingQuery = `
      SELECT * FROM daily_stock_records 
      WHERE user_id = $1 AND date = $2 AND brand_number = $3 AND size = $4
    `;
    
    try {
      const existingResult = await pool.query(existingQuery, [userId, date, brandNumber, size]);
      let record = existingResult.rows[0];
      
      if (!record) {
        // Get previous day's closing stock
        const openingStock = await this.getPreviousDayClosingStock(userId, date, brandNumber, size);
        
        // Create new record
        const insertQuery = `
          INSERT INTO daily_stock_records 
          (user_id, date, brand_number, brand_name, size, opening_stock, received, total, closing_stock, price, sale, sale_amount)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING *
        `;
        
        const total = openingStock + received;
        const closing = closingStock !== null ? closingStock : total;
        const sale = total - closing;
        const saleAmount = sale * price;
        
        const values = [
          userId, date, brandNumber, brandName, size, openingStock,
          received, total, closing, price, sale, saleAmount
        ];
        
        const insertResult = await pool.query(insertQuery, values);
        record = insertResult.rows[0];
      } else {
        // Update existing record
        if (received !== 0) record.received += received;
        if (closingStock !== null) {
          record.closing_stock = Math.max(0, Math.min(closingStock, record.total));
        }
        if (price !== 0) record.price = price;
        
        // Recalculate derived fields
        record.total = record.opening_stock + record.received;
        if (closingStock === null) {
          record.closing_stock = record.total;
        }
        record.sale = record.total - record.closing_stock;
        record.sale_amount = record.sale * record.price;
        
        const updateQuery = `
          UPDATE daily_stock_records 
          SET received = $1, total = $2, closing_stock = $3, price = $4, 
              sale = $5, sale_amount = $6, updated_at = CURRENT_TIMESTAMP
          WHERE id = $7
          RETURNING *
        `;
        
        const values = [
          record.received, record.total, record.closing_stock, record.price,
          record.sale, record.sale_amount, record.id
        ];
        
        const updateResult = await pool.query(updateQuery, values);
        record = updateResult.rows[0];
      }
      
      return record;
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
      userId, invoiceNumber, date, uploadDate, totalValue,
      netInvoiceValue, retailExciseTax, specialExciseCess, tcs,
      itemsCount, processedItemsCount
    } = invoiceData;
    
    const query = `
      INSERT INTO invoices 
      (user_id, invoice_number, date, upload_date, total_value, net_invoice_value, 
       retail_excise_tax, special_excise_cess, tcs, items_count, processed_items_count)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    
    const values = [
      userId, invoiceNumber, date, uploadDate, totalValue, netInvoiceValue,
      retailExciseTax, specialExciseCess, tcs, itemsCount, processedItemsCount
    ];
    
    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error saving invoice: ${error.message}`);
    }
  }

  async getInvoices(userId) {
    const query = `
      SELECT * FROM invoices 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `;
    
    try {
      const result = await pool.query(query, [userId]);
      return result.rows;
    } catch (error) {
      throw new Error(`Error getting invoices: ${error.message}`);
    }
  }

  // Summary and Analytics
  async getSummary(userId, date) {
    try {
      // Get today's stock records
      const stockRecords = await this.getDailyStockRecords(userId, date);
      
      // Calculate total sales
      const totalSalesAmount = stockRecords.reduce((sum, record) => sum + (record.sale_amount || 0), 0);
      
      // Calculate stock value
      let stockValue = 0;
      let recordsUsed = 0;
      
      if (stockRecords.length > 0) {
        for (const record of stockRecords) {
          if (record.closing_stock > 0) {
            // Get MRP from shop inventory
            const productQuery = `
              SELECT mrp FROM shop_inventory 
              WHERE user_id = $1 AND brand_number = $2 AND size = $3
            `;
            const productResult = await pool.query(productQuery, [userId, record.brand_number, record.size]);
            
            if (productResult.rows.length > 0) {
              recordsUsed++;
              stockValue += record.closing_stock * productResult.rows[0].mrp;
            }
          }
        }
      } else {
        // If no records for today, use the most recent closing stock
        const latestStockQuery = `
          SELECT DISTINCT ON (brand_number, size) 
            brand_number, size, closing_stock
          FROM daily_stock_records 
          WHERE user_id = $1 
          ORDER BY brand_number, size, date DESC
        `;
        
        const latestStockResult = await pool.query(latestStockQuery, [userId]);
        
        for (const record of latestStockResult.rows) {
          if (record.closing_stock > 0) {
            const productQuery = `
              SELECT mrp FROM shop_inventory 
              WHERE user_id = $1 AND brand_number = $2 AND size = $3
            `;
            const productResult = await pool.query(productQuery, [userId, record.brand_number, record.size]);
            
            if (productResult.rows.length > 0) {
              recordsUsed++;
              stockValue += record.closing_stock * productResult.rows[0].mrp;
            }
          }
        }
      }
      
      // Calculate stock lifted (total purchase value)
      const invoices = await this.getInvoices(userId);
      const stockLifted = invoices.reduce((sum, invoice) => sum + (invoice.total_value || 0), 0);
      
      // Calculate counter balance (simplified - you can add expenses tracking later)
      const counterBalance = totalSalesAmount - stockLifted;
      
      return {
        date,
        stockValue,
        stockLifted,
        totalSales: totalSalesAmount,
        counterBalance,
        todayStockRecords: stockRecords.length,
        recordsWithStock: stockRecords.filter(r => r.closing_stock > 0).length,
        hasRecordsForToday: stockRecords.length > 0
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
