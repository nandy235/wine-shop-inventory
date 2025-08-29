const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const pdfParse = require('pdf-parse');
// Load master brands from database instead of JSON file
let masterBrandsData = [];

// Helper function to get business date (day starts at 11:30 AM)
function getBusinessDate() {
  const now = new Date();
  
  // Check if server is already in IST timezone
  const serverTimezoneOffset = now.getTimezoneOffset();
  const istTimezoneOffset = -330; // IST is UTC+5:30, so offset is -330 minutes
  
  let istTime;
  if (serverTimezoneOffset === istTimezoneOffset) {
    // Server is already in IST (local server), use current time
    istTime = now;
    console.log('Server already in IST timezone');
  } else {
    // Server is in UTC (Railway), convert to IST
    const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
    istTime = new Date(now.getTime() + istOffset);
    console.log('Converting from UTC to IST');
  }
  
  console.log('Server time:', now.toString());
  console.log('IST time:', istTime.toString());
  console.log('IST hours:', istTime.getHours(), 'minutes:', istTime.getMinutes());
  console.log('Timezone offset (minutes):', serverTimezoneOffset);
  
  if (istTime.getHours() < 11 || (istTime.getHours() === 11 && istTime.getMinutes() < 30)) {
    // Before 11:30 AM IST - use previous day
    const yesterday = new Date(istTime);
    yesterday.setDate(yesterday.getDate() - 1);
    const businessDate = yesterday.toLocaleDateString('en-CA');
    console.log('Business date (before 11:30 AM):', businessDate);
    return businessDate;
  } else {
    // After 11:30 AM IST - use current day
    const businessDate = istTime.toLocaleDateString('en-CA');
    console.log('Business date (after 11:30 AM):', businessDate);
    return businessDate;
  }
}

async function loadMasterBrandsFromDB(packTypeFilter = null) {
  try {
    const { pool } = require('./database');
    
    let query = `
      SELECT 
        id,
        brand_number as "brandNumber",
        brand_name as name,
        size_ml as size,
        size_code as "sizeCode",
        product_type as "productType",
        pack_type as "packType",
        pack_quantity as "packQuantity",
        standard_mrp as mrp,
        issue_price as "issuePrice",
        special_margin as "specialMargin",
        special_excise_cess as "specialExciseCess",
        brand_kind as "brandKind",
        CASE 
          WHEN product_type = 'IML' THEN 'IML'
          WHEN product_type = 'DUTY_PAID' THEN 'Duty Paid'
          WHEN product_type = 'BEER' THEN 'Beer'
          WHEN product_type = 'DUTY_FREE' THEN 'Duty Free'
          ELSE product_type
        END as category,
        is_active
      FROM master_brands 
      WHERE is_active = true`;
    
    const queryParams = [];
    
    if (packTypeFilter && packTypeFilter.length > 0) {
      query += ` AND pack_type = ANY($1)`;
      queryParams.push(packTypeFilter);
    }
    
    query += ` ORDER BY brand_number, size_ml`;
    
    const result = await pool.query(query, queryParams);
    
    const loadedData = result.rows;
    console.log(`✅ Loaded ${loadedData.length} master brands from database${packTypeFilter ? ` (filtered by pack types: ${packTypeFilter.join(', ')})` : ''}`);
    
    // Only update global cache if loading all brands
    if (!packTypeFilter) {
      masterBrandsData = loadedData;
    }
    
    return loadedData;
  } catch (error) {
    console.error('❌ Failed to load master brands from database:', error.message);
    return packTypeFilter ? [] : masterBrandsData;
  }
}
// Import the enhanced invoice parser
const HybridInvoiceParser = require('./invoiceParser');
const invoiceParser = new HybridInvoiceParser();
// Import database service
const dbService = require('./databaseService');

// Helper function for formatting size - must match invoiceParser format
const formatSize = (sizeCode, size) => {
  if (sizeCode && size) {
    return `${sizeCode}(${size})`;
  }
  return size || '';
};

const app = express();
// --- Healthcheck (no auth) ---
app.get(['/health', '/_health'], (req, res) => {
  res.status(200).send('ok');
});

const PORT = process.env.PORT || 3001;

const JWT_SECRET = process.env.JWT_SECRET || 'your-wine-shop-secret-key-2024';

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://wine-shop-inventory.vercel.app',
    'https://wine-shop-inventory-gbaha94u9-nkstories0-5188s-projects.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

const authenticateToken = (req, res, next) => {
 const authHeader = req.headers['authorization'];
 const token = authHeader && authHeader.split(' ')[1];

 if (!token) {
   return res.status(401).json({ message: 'Access token required' });
 }

 jwt.verify(token, JWT_SECRET, (err, user) => {
   if (err) {
     return res.status(403).json({ message: 'Invalid or expired token' });
   }
   req.user = user;
   next();
 });
};
// Import database configuration
const { connectDB, initializeTables } = require('./database');

const generateId = () => Date.now().toString();

// ===== IN-MEMORY STORAGE FOR PENDING INVOICES =====
const pendingInvoices = new Map();

// Generate temporary ID for pending invoices
const generateTempId = () => {
  return 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

// Store pending invoice with TTL (30 minutes)
const storePendingInvoice = (tempId, data, userId, shopId) => {
  pendingInvoices.set(tempId, {
    data: data,
    userId: userId,
    shopId: shopId,
    createdAt: new Date(),
    lastAccessed: new Date(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000)  // 30 min TTL
  });
  
  console.log(`📦 Stored pending invoice ${tempId}, total pending: ${pendingInvoices.size}`);
};

// Cleanup expired invoices
const cleanupExpiredInvoices = () => {
  const now = new Date();
  let cleanedCount = 0;
  
  for (const [tempId, invoice] of pendingInvoices) {
    if (now > invoice.expiresAt) {
      pendingInvoices.delete(tempId);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} expired invoices. Remaining: ${pendingInvoices.size}`);
  }
};

// Run cleanup every 10 minutes
setInterval(cleanupExpiredInvoices, 10 * 60 * 1000);

// ===== CLOSING STOCK UPDATE ENDPOINT =====

// Update closing stock for multiple products
app.post('/api/closing-stock/update', authenticateToken, async (req, res) => {
  try {
    console.log('\n📦 Closing stock update started...');
    
    const { date, stockUpdates } = req.body;
    const userId = req.user.userId;
    const shopId = req.user.shopId;
    
    if (!shopId) {
      return res.status(400).json({ message: 'Shop ID not found in token' });
    }
    
    if (!date || !stockUpdates || !Array.isArray(stockUpdates)) {
      return res.status(400).json({ message: 'Invalid request data' });
    }
    
    console.log(`👤 User: ${userId}, Shop: ${shopId}`);
    console.log(`📅 Date: ${date}`);
    console.log(`📊 Updating ${stockUpdates.length} products`);

    let updatedCount = 0;
    
    // Process each stock update
    for (const update of stockUpdates) {
      try {
        const { id, closingStock } = update;
        
        if (typeof id === 'undefined' || typeof closingStock === 'undefined') {
          console.warn(`⚠️ Skipping invalid update:`, update);
          continue;
        }

        // Update closing stock specifically
        await dbService.updateClosingStock(id, date, parseInt(closingStock));
        
        updatedCount++;
        
      } catch (error) {
        console.error(`❌ Error updating stock for product ${update.id}:`, error);
        // Continue with other updates even if one fails
      }
    }
    
    console.log(`✅ Successfully updated ${updatedCount} products`);
    
    res.json({
      message: 'Closing stock updated successfully',
      updatedCount: updatedCount,
      totalRequested: stockUpdates.length
    });

  } catch (error) {
    console.error('❌ Closing stock update error:', error);
    res.status(500).json({ 
      message: 'Server error during closing stock update', 
      error: error.message 
    });
  }
});

// ===== INVOICE UPLOAD & PARSING ENDPOINTS =====

// Parse uploaded invoice PDF
app.post('/api/invoice/upload', authenticateToken, upload.single('invoice'), async (req, res) => {
  try {
    console.log('\n🚀 Invoice upload started...');
    
    // Get user and shop info from JWT token
    const userId = req.user.userId;
    const shopId = req.user.shopId;
    
    if (!shopId) {
      return res.status(400).json({ message: 'Shop ID not found in token' });
    }
    
    if (!req.file) {
      return res.status(400).json({ message: 'No PDF file uploaded' });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ message: 'Only PDF files are allowed' });
    }
    
    console.log(`👤 User: ${userId}, Shop: ${shopId}`);
    console.log(`📄 Processing PDF: ${req.file.originalname} (${req.file.size} bytes)`);

    // Load fresh master brands from database for validation
    const masterBrands = await loadMasterBrandsFromDB();
    console.log(`📚 Loaded ${masterBrands.length} master brands from database for validation`);

    // Parse the PDF using your hybrid parser with masterBrands validation
    const parseResult = await invoiceParser.parseInvoiceWithValidation(
      req.file.buffer, 
      masterBrands // Master brands loaded from database
    );

    if (!parseResult.success) {
      console.error('❌ Parsing failed:', parseResult.error);
      return res.status(400).json({ 
        message: 'Failed to parse invoice', 
        error: parseResult.error,
        confidence: parseResult.confidence 
      });
    }

    console.log(`✅ Parsing successful!`);
    console.log(`   Method: ${parseResult.method}`);
    console.log(`   Confidence: ${parseResult.confidence}`);
    console.log(`   Items found: ${parseResult.data.items.length}`);
    console.log(`   Items validated: ${parseResult.data.summary.validatedItems}`);
    console.log(`   Items skipped: ${parseResult.data.summary.skippedItems}`);

    // Generate temp ID and store data in memory
    const tempId = generateTempId();
    storePendingInvoice(tempId, parseResult.data, userId, shopId);

    // Return the parsed and validated data WITH tempId for frontend display
    res.json({
      tempId: tempId,
      message: 'Invoice parsed successfully',
      confidence: parseResult.confidence,
      method: parseResult.method,
      invoiceNumber: parseResult.data.invoiceNumber,
      date: parseResult.data.date,
      totalAmount: parseResult.data.totalAmount,
      netInvoiceValue: parseResult.data.netInvoiceValue,
      mrpRoundingOff: parseResult.data.mrpRoundingOff,
      retailExciseTax: parseResult.data.retailExciseTax,
      specialExciseCess: parseResult.data.specialExciseCess,
      tcs: parseResult.data.tcs,
      items: parseResult.data.items, // Only validated items for display
      summary: parseResult.data.summary,
      warnings: parseResult.warnings || [],
      skippedItems: parseResult.data.skippedItems || []
    });

  } catch (error) {
    console.error('❌ Invoice upload error:', error);
    res.status(500).json({ 
      message: 'Server error during invoice processing', 
      error: error.message 
    });
  }
});

// Confirm and add parsed invoice data to stock
app.post('/api/invoice/confirm', authenticateToken, async (req, res) => {
  try {
    console.log('\n📦 Invoice confirmation started...');
    
    const { tempId } = req.body;
    const userId = req.user.userId;
    const shopId = req.user.shopId;
    const today = getBusinessDate();

    if (!tempId) {
      return res.status(400).json({ message: 'No tempId provided' });
    }

    if (!shopId) {
      return res.status(400).json({ message: 'Shop ID not found in token' });
    }

    // Retrieve stored invoice data from memory
    const pendingInvoice = pendingInvoices.get(tempId);
    if (!pendingInvoice) {
      return res.status(404).json({ 
        message: 'Invoice data expired or not found. Please upload again.',
        code: 'INVOICE_EXPIRED'
      });
    }

    // Verify ownership
    if (pendingInvoice.userId !== userId || pendingInvoice.shopId !== shopId) {
      return res.status(403).json({ message: 'Unauthorized access to invoice data' });
    }

    // Update last accessed time
    pendingInvoice.lastAccessed = new Date();
    
    const invoiceData = pendingInvoice.data;

    if (!invoiceData || !invoiceData.items || invoiceData.items.length === 0) {
      return res.status(400).json({ message: 'No invoice data or items found' });
    }

    console.log(`👤 User: ${userId}, Shop: ${shopId}`);
    console.log(`📅 Date: ${today}`);
    console.log(`📦 Items to process: ${invoiceData.items.length}`);
    console.log(`🗂️ Processing tempId: ${tempId}`);

    let updatedCount = 0;
    let addedToInventory = 0;
    const processedItems = [];
    const errors = [];

    // Process each validated item
    for (const item of invoiceData.items) {
      try {
        console.log(`\n📄 Processing: ${item.brandNumber} ${item.size} (Qty: ${item.totalQuantity})`);

        // Check if product exists in shop inventory
        let shopProducts = await dbService.getShopProducts(userId);
        console.log(`🔍 Looking for: ${item.brandNumber} ${item.formattedSize}`);
        console.log(`📦 Available products: ${shopProducts.length}`);
        
        let shopProduct = shopProducts.find(product => {
          const productFormattedSize = formatSize(product.sizeCode, product.size);
          const matches = product.brandNumber === item.brandNumber && productFormattedSize === item.formattedSize;
          if (matches) {
            console.log(`✅ Match found: ${product.brandNumber} ${productFormattedSize}`);
          }
          return matches;
        });

        // If not in inventory, add it (using masterBrand data)
        if (!shopProduct) {
          console.log(`➕ Adding new product to inventory: ${item.brandNumber}`);
          
          const newShopProduct = await dbService.addShopProduct({
            masterBrandId: item.masterBrandId,
            shopId: shopId,
            markupPrice: 0, // Default markup
            finalPrice: item.mrp, // Can be updated later
            currentQuantity: item.totalQuantity
          });
          
          shopProduct = newShopProduct;
          addedToInventory++;
        } else {
          // Product exists, update quantity
          console.log(`📦 Updating existing product quantity: ${item.brandNumber}`);
          await dbService.updateShopProductQuantity(shopId, item.masterBrandId, item.totalQuantity, null, null);
        }

        // Create or update daily stock record for received quantity
        const stockRecord = await dbService.createOrUpdateDailyStockRecord({
          shopInventoryId: shopProduct.id,
          stockDate: today,
          openingStock: 0, // Will be handled by the UPSERT logic
          receivedStock: item.totalQuantity,
          closingStock: null, // Will auto-calculate
          pricePerUnit: shopProduct.final_price
        });

        updatedCount++;
        processedItems.push({
          brandNumber: item.brandNumber,
          description: item.description,
          size: item.formattedSize,
          receivedQuantity: item.totalQuantity,
          newTotal: (stockRecord.opening_stock || 0) + (stockRecord.received_stock || 0),
          newClosing: stockRecord.closing_stock
        });

        console.log(`✅ Updated: ${item.brandNumber} - Received: ${item.totalQuantity}, Opening: ${stockRecord.opening_stock}, Received: ${stockRecord.received_stock}`);

      } catch (itemError) {
        console.error(`❌ Error processing item ${item.brandNumber}:`, itemError);
        errors.push({
          brandNumber: item.brandNumber,
          error: itemError.message
        });
      }
    }

    // Save the invoice record AND individual items to database
    const invoiceRecord = await dbService.saveInvoiceWithItems({
      userId,
      invoiceNumber: invoiceData.invoiceNumber,
      date: invoiceData.date,
      uploadDate: today,
      totalValue: invoiceData.invoiceValue, // Store actual Invoice Value from PDF
      netInvoiceValue: invoiceData.netInvoiceValue,
      mrpRoundingOff: invoiceData.mrpRoundingOff,
      retailExciseTax: invoiceData.retailExciseTax,
      specialExciseCess: invoiceData.specialExciseCess,
      tcs: invoiceData.tcs,
      itemsCount: invoiceData.items.length,
      processedItemsCount: updatedCount
    }, invoiceData.items); // Pass the validated items

    // Clean up - remove from memory after successful processing
    pendingInvoices.delete(tempId);
    console.log(`🗑️ Cleaned up tempId: ${tempId}`);

    console.log(`\n🎉 Invoice processing completed!`);
    console.log(`   ✅ Items processed: ${updatedCount}`);
    console.log(`   ➕ Added to inventory: ${addedToInventory}`);
    console.log(`   ❌ Errors: ${errors.length}`);

    res.json({
      message: 'Invoice processed and stock updated successfully',
      invoiceNumber: invoiceData.invoiceNumber,
      date: invoiceData.date,
      updatedCount,
      addedToInventory,
      totalItems: invoiceData.items.length,
      processedItems,
      errors: errors.length > 0 ? errors : undefined,
      invoiceRecord: {
        id: invoiceRecord.id,
        invoiceNumber: invoiceRecord.invoice_number,
        totalValue: invoiceRecord.total_value,
        date: invoiceRecord.date
      }
    });

  } catch (error) {
    console.error('❌ Invoice confirmation error:', error);
    console.error('❌ Stack trace:', error.stack);
    res.status(500).json({ 
      message: 'Server error during invoice confirmation', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Cancel pending invoice (manual cleanup)
app.post('/api/invoice/cancel', authenticateToken, async (req, res) => {
  try {
    const { tempId } = req.body;
    const userId = req.user.userId;
    const shopId = req.user.shopId;

    if (!tempId) {
      return res.status(400).json({ message: 'No tempId provided' });
    }

    const pendingInvoice = pendingInvoices.get(tempId);
    if (!pendingInvoice) {
      return res.status(404).json({ message: 'Invoice data not found or already expired' });
    }

    // Verify ownership
    if (pendingInvoice.userId !== userId || pendingInvoice.shopId !== shopId) {
      return res.status(403).json({ message: 'Unauthorized access to invoice data' });
    }

    // Remove from memory
    pendingInvoices.delete(tempId);
    console.log(`❌ Cancelled and cleaned up tempId: ${tempId}`);

    res.json({
      message: 'Invoice upload cancelled successfully',
      tempId: tempId
    });

  } catch (error) {
    console.error('❌ Invoice cancel error:', error);
    res.status(500).json({ 
      message: 'Server error during invoice cancellation', 
      error: error.message 
    });
  }
});

// Optional: Get invoice history
app.get('/api/invoices', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const shopId = req.user.shopId;
    
    if (!shopId) {
      return res.status(400).json({ message: 'Shop ID not found in token' });
    }
    
    const userInvoices = await dbService.getInvoices(userId);

    res.json({
      invoices: userInvoices,
      totalCount: userInvoices.length,
      totalValue: userInvoices.reduce((sum, inv) => sum + (inv.total_value || 0), 0),
      shopId: shopId
    });
  } catch (error) {
    console.error('Error getting invoices:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Debug endpoint to check pending invoices (development only)
if (process.env.NODE_ENV === 'development') {
  app.get('/api/debug/pending-invoices', authenticateToken, (req, res) => {
    const pendingList = [];
    for (const [tempId, invoice] of pendingInvoices) {
      pendingList.push({
        tempId,
        userId: invoice.userId,
        shopId: invoice.shopId,
        createdAt: invoice.createdAt,
        expiresAt: invoice.expiresAt,
        itemCount: invoice.data.items?.length || 0
      });
    }
    
    res.json({
      totalPending: pendingInvoices.size,
      invoices: pendingList
    });
  });
}

// Auth endpoints
app.post('/api/login', async (req, res) => {
 try {
   const { retailerCode, password } = req.body;
   
   // Validate retailer code format (exactly 7 digits)
   if (!retailerCode || !/^\d{7}$/.test(retailerCode)) {
     return res.status(400).json({ message: 'Retailer code must be exactly 7 digits' });
   }
   
   const user = await dbService.findUserByRetailerCode(retailerCode);
   if (!user) {
     return res.status(400).json({ message: 'Invalid retailer code or password' });
   }
   
   const isValidPassword = await bcrypt.compare(password, user.password);
   if (!isValidPassword) {
     return res.status(400).json({ message: 'Invalid credentials' });
   }
   
     const token = jwt.sign(
    { 
      userId: user.id, 
      shopId: user.shop_id,
      email: user.email,
      shopName: user.shop_name,
      retailerCode: user.retailer_code
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
   
   res.json({ 
     message: 'Login successful',
     token: token,
     user: { 
       id: user.id, 
       name: user.name, 
       email: user.email, 
       shopName: user.shop_name 
     }
   });
 } catch (error) {
   console.error('Login error:', error);
   res.status(500).json({ message: 'Server error during login', error: error.message });
 }
});

app.get('/api/verify-token', authenticateToken, (req, res) => {
 res.json({ 
   message: 'Token is valid',
   user: req.user 
 });
});

app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, shopName, retailerCode, address, licenseNumber } = req.body;
    
    // Validation
    if (!name || !email || !password || !shopName || !retailerCode) {
      return res.status(400).json({ message: 'Name, email, password, shop name, and retailer code are required' });
    }
    
    // Validate retailer code format (exactly 7 digits)
    if (!/^\d{7}$/.test(retailerCode)) {
      return res.status(400).json({ message: 'Retailer code must be exactly 7 digits' });
    }
    
    // Check if retailer code already exists (each shop must have unique retailer code)
    const existingRetailerCode = await dbService.findUserByRetailerCode(retailerCode);
    if (existingRetailerCode) {
      return res.status(400).json({ message: 'This retailer code is already registered' });
    }

    // Note: We allow same email for multiple shops (one user can own multiple wine shops)
    
    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Create new user and shop in database
    const newUser = await dbService.createUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      shopName: shopName.trim(),
      retailerCode: retailerCode?.trim(),
      address: address?.trim() || null,
      licenseNumber: licenseNumber?.trim() || null
    });
    
    res.status(201).json({ 
      message: 'User registered successfully',
      user: { 
        id: newUser.id, 
        name: newUser.name, 
        email: newUser.email, 
        shop_name: newUser.shop_name 
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration', error: error.message });
  }
});

// Enhanced stock initialization with auto-recovery
app.post('/api/stock/initialize-today', authenticateToken, async (req, res) => {
  try {
    const shopId = req.user.shopId;
    const today = getBusinessDate();
    
    const result = await dbService.initializeTodayStock(shopId, today);
    res.json(result);
    
  } catch (error) {
    console.error('Error initializing today stock:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Master brands endpoint - always get fresh data from database
app.get('/api/master-brands', authenticateToken, async (req, res) => {
  try {
    // Check if filtering by pack types for stock onboarding
    const { packTypes } = req.query;
    
    if (packTypes) {
      // Filter for stock onboarding (G, B, C pack types only)
      const allowedPackTypes = packTypes.split(',').map(p => p.trim());
      const freshMasterBrands = await loadMasterBrandsFromDB(allowedPackTypes);
      res.json(freshMasterBrands);
    } else {
      // Get all master brands
      const freshMasterBrands = await loadMasterBrandsFromDB();
      res.json(freshMasterBrands);
    }
  } catch (error) {
    console.error('Error fetching master brands:', error);
    // Fallback to cached data if available
    res.json(masterBrandsData);
  }
});

// Shop product management
app.post('/api/shop/add-product', authenticateToken, async (req, res) => {
 try {
   const { masterBrandId, quantity, shopMarkup = 0 } = req.body;
   const shopId = req.user.shopId;
   const today = getBusinessDate();
   const { pool } = require('./database');
   
   // Get master brand from database
   const masterBrandResult = await pool.query(`
     SELECT 
       id,
       brand_number,
       brand_name,
       size_ml,
       size_code,
       standard_mrp,
       product_type,
       brand_kind,
       CASE 
         WHEN product_type = 'IML' THEN 'IML'
         WHEN product_type = 'DUTY_PAID' THEN 'Duty Paid'
         WHEN product_type = 'BEER' THEN 'Beer'
         WHEN product_type = 'DUTY_FREE' THEN 'Duty Free'
         ELSE product_type
       END as category
     FROM master_brands 
     WHERE id = $1 AND is_active = true
   `, [masterBrandId]);
   
   if (masterBrandResult.rows.length === 0) {
     return res.status(404).json({ message: 'Brand not found in master database' });
   }
   
   const masterBrand = masterBrandResult.rows[0];
   const markupPrice = parseFloat(shopMarkup);
   const finalPrice = masterBrand.standard_mrp + markupPrice;
   const receivedQuantity = parseInt(quantity);
   
   // Add or update product using UPSERT (handles both new and existing products)
   const productResult = await dbService.addShopProduct({
     masterBrandId: parseInt(masterBrandId),
     shopId: shopId,
     markupPrice: markupPrice,
     finalPrice: finalPrice,
     currentQuantity: receivedQuantity
   });
   
   const shopInventoryId = productResult.id;
   const wasUpdated = productResult.action === 'updated';
   
   if (wasUpdated) {
     console.log(`✅ Updated existing product: ${masterBrand.brand_name} (${masterBrand.size_ml}ml)`);
     console.log(`   Added quantity: ${receivedQuantity}, New total: ${productResult.current_quantity}`);
   } else {
     console.log(`✅ Added new product: ${masterBrand.brand_name} (${masterBrand.size_ml}ml) - Quantity: ${receivedQuantity}`);
   }
  
  // Add to daily stock records (received column)
  await dbService.createOrUpdateDailyStockRecord({
    shopInventoryId: shopInventoryId,
     stockDate: today,
     openingStock: 0,
     receivedStock: receivedQuantity,
     closingStock: null,
     pricePerUnit: finalPrice
   });
   
   res.status(201).json({ 
     message: wasUpdated ? 'Product quantity updated' : 'New product added',
     brandNumber: masterBrand.brand_number,
     brandName: masterBrand.brand_name,
     size: `${masterBrand.size_code}(${masterBrand.size_ml}ml)`,
     receivedQuantity: receivedQuantity,
     finalPrice: finalPrice,
     isNewProduct: !wasUpdated,
     totalQuantity: productResult.current_quantity
   });
 } catch (error) {
   console.error('Error adding shop product:', error);
   res.status(500).json({ message: 'Server error', error: error.message });
 }
});

app.put('/api/shop/update-sort-order', authenticateToken, async (req, res) => {
  try {
    const { sortedBrandGroups } = req.body;
    const shopId = req.user.shopId;
    
    const result = await dbService.updateSortOrder(shopId, sortedBrandGroups);
    res.json(result);
  } catch (error) {
    console.error('Error updating sort order:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/shop/products', authenticateToken, async (req, res) => {
  try {
    const shopId = req.user.shopId;
    const { date } = req.query;
    const targetDate = date || getBusinessDate();
    
    console.log(`📊 Fetching products for shop ${shopId} on date ${targetDate}`);
    
    // Initialize today's stock records if they don't exist
    const initializedCount = await dbService.initializeTodayStock(shopId, targetDate);
    console.log(`📦 Initialized ${initializedCount} stock records for today`);
    
    const products = await dbService.getShopProducts(shopId, targetDate);
    console.log(`📋 Found ${products.length} products in shop inventory`);
    
    // Check if closing stock is already saved
    const closingStockStatus = await dbService.isClosingStockSaved(shopId, targetDate);
    
    res.json({
      products: products,
      closingStockStatus: closingStockStatus,
      businessDate: targetDate
    });
  } catch (error) {
    console.error('Error getting shop products:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.put('/api/shop/update-product/:id', authenticateToken, async (req, res) => {
 try {
   const { id } = req.params;
   const { quantity, finalPrice } = req.body;
   const shopId = req.user.shopId;
   
   const { pool } = require('./database');
   
   // Get current product to calculate markup
   const currentProduct = await pool.query(`
     SELECT si.*, mb.standard_mrp 
     FROM shop_inventory si 
     JOIN master_brands mb ON si.master_brand_id = mb.id 
     WHERE si.id = $1 AND si.shop_id = $2
   `, [id, shopId]);
   
   if (currentProduct.rows.length === 0) {
     return res.status(404).json({ message: 'Product not found' });
   }
   
   const product = currentProduct.rows[0];
   const newFinalPrice = finalPrice ? parseFloat(finalPrice) : product.final_price;
   const newMarkupPrice = newFinalPrice - product.standard_mrp;
   const newQuantity = quantity !== undefined ? parseInt(quantity) : product.current_quantity;
   
   // Update the product
   const updateQuery = `
     UPDATE shop_inventory 
     SET 
       current_quantity = $1,
       markup_price = $2,
       final_price = $3,
       last_updated = CURRENT_TIMESTAMP
     WHERE id = $4 AND shop_id = $5
     RETURNING *
   `;
   
   const result = await pool.query(updateQuery, [
     newQuantity, newMarkupPrice, newFinalPrice, id, shopId
   ]);
   
   if (result.rows.length > 0) {
     res.json({ 
       message: 'Product updated successfully',
       updatedProduct: result.rows[0]
     });
   } else {
     res.status(404).json({ message: 'Product not found or not authorized' });
   }
 } catch (error) {
   console.error('Error updating shop product:', error);
   res.status(500).json({ message: 'Server error', error: error.message });
 }
});

app.delete('/api/shop/delete-product/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const shopId = req.user.shopId;
    
    const { pool } = require('./database');
    
    // Verify the product belongs to this shop
    const productCheck = await pool.query(
      'SELECT * FROM shop_inventory WHERE id = $1 AND shop_id = $2', 
      [id, shopId]
    );
    
    if (productCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found or not authorized' });
    }
    
    // Start transaction
    await pool.query('BEGIN');
    
    try {
      // 1. Delete from daily_stock_records (cascade delete)
      await pool.query(
        'DELETE FROM daily_stock_records WHERE shop_inventory_id = $1', 
        [id]
      );
      
      // 2. Delete from shop_inventory (hard delete)
      const deleteResult = await pool.query(
        'DELETE FROM shop_inventory WHERE id = $1 AND shop_id = $2 RETURNING *', 
        [id, shopId]
      );
      
      // Commit transaction
      await pool.query('COMMIT');
      
      res.json({ 
        message: 'Product completely deleted from inventory and stock records',
        deletedProduct: deleteResult.rows[0]
      });
      
    } catch (error) {
      // Rollback transaction on error
      await pool.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('Error deleting shop product:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update daily stock record (for editing Received and Price)
app.put('/api/shop/update-daily-stock/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params; // shop_inventory.id
    const { receivedStock, finalPrice } = req.body;
    const shopId = req.user.shopId;
    
    const { pool } = require('./database');
    
    // Verify the shop_inventory item belongs to this shop
    const inventoryCheck = await pool.query(`
      SELECT si.*, mb.standard_mrp 
      FROM shop_inventory si 
      JOIN master_brands mb ON si.master_brand_id = mb.id
      WHERE si.id = $1 AND si.shop_id = $2
    `, [id, shopId]);
    
    if (inventoryCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found or not authorized' });
    }
    
    const product = inventoryCheck.rows[0];
    const today = getBusinessDate();
    
    // Update or create daily stock record
    const upsertDailyStock = `
      INSERT INTO daily_stock_records (
        shop_inventory_id, stock_date, opening_stock, received_stock, price_per_unit
      ) VALUES ($1, $2, 0, $3, $4)
      ON CONFLICT (shop_inventory_id, stock_date) 
      DO UPDATE SET 
        received_stock = EXCLUDED.received_stock,
        price_per_unit = EXCLUDED.price_per_unit
      RETURNING *
    `;
    
    const stockResult = await pool.query(upsertDailyStock, [
      id, today, receivedStock || 0, finalPrice || 0
    ]);
    
    // Update shop_inventory final_price and current_quantity
    const newMarkupPrice = (finalPrice || 0) - product.standard_mrp;
    const updateInventory = `
      UPDATE shop_inventory 
      SET 
        markup_price = $1,
        final_price = $2,
        current_quantity = (
          SELECT COALESCE(opening_stock, 0) + COALESCE(received_stock, 0)
          FROM daily_stock_records 
          WHERE shop_inventory_id = $3 AND stock_date = $4
        ),
        last_updated = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;
    
    const inventoryResult = await pool.query(updateInventory, [
      newMarkupPrice, finalPrice, id, today
    ]);
    
    res.json({
      message: 'Daily stock updated successfully',
      dailyStock: stockResult.rows[0],
      inventory: inventoryResult.rows[0]
    });
    
  } catch (error) {
    console.error('Error updating daily stock:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Enhanced closing stock update with validation
app.post('/api/stock/update-closing', authenticateToken, async (req, res) => {
  try {
    const { date, stockUpdates } = req.body;
    const shopId = req.user.shopId;
    
    const result = await dbService.updateClosingStock(shopId, date, stockUpdates);
    
    res.json({
      message: 'Closing stock updated successfully',
      updatedRecords: result.updatedRecords.length,
      warnings: result.warnings,
      details: result.updatedRecords.map(r => ({
        product: `${r.brand_number} - ${r.size}`,
        opening: r.opening_stock,
        received: r.received,
        total: r.total,
        closing: r.closing_stock,
        sales: r.sale
      }))
    });
  } catch (error) {
    console.error('Error updating closing stock:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Summary endpoint with improved stock value calculation
app.get('/api/summary', authenticateToken, async (req, res) => {
  try {
    const shopId = req.user.shopId;
    const today = getBusinessDate();
    
    if (!shopId) {
      return res.status(400).json({ message: 'Shop ID not found in token' });
    }
    
    const summary = await dbService.getSummary(shopId, today);
    res.json(summary);
  } catch (error) {
    console.error('Error getting summary:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Income and Expenses endpoints
app.get('/api/income-expenses/income', authenticateToken, async (req, res) => {
  try {
    const shopId = req.user.shopId;
    const { date } = req.query;
    const targetDate = date || getBusinessDate();
    
    console.log(`📊 Fetching income for shop ${shopId} on date ${targetDate}`);
    
    const result = await dbService.getIncome(shopId, targetDate);
    res.json(result);
  } catch (error) {
    console.error('Error fetching income:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/income-expenses/expenses', authenticateToken, async (req, res) => {
  try {
    const shopId = req.user.shopId;
    const { date } = req.query;
    const targetDate = date || getBusinessDate();
    
    console.log(`📊 Fetching expenses for shop ${shopId} on date ${targetDate}`);
    
    const result = await dbService.getExpenses(shopId, targetDate);
    res.json(result);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/income-expenses/save-income', authenticateToken, async (req, res) => {
  try {
    const shopId = req.user.shopId;
    const { date, income } = req.body;
    const targetDate = date || getBusinessDate();
    
    if (!income || !Array.isArray(income)) {
      return res.status(400).json({ message: 'Income array is required' });
    }
    
    console.log(`💰 Saving income for shop ${shopId} on date ${targetDate}`);
    
    const result = await dbService.saveIncome(shopId, targetDate, income);
    res.json(result);
  } catch (error) {
    console.error('Error saving income:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/income-expenses/save-expenses', authenticateToken, async (req, res) => {
  try {
    const shopId = req.user.shopId;
    const { date, expenses } = req.body;
    const targetDate = date || getBusinessDate();
    
    if (!expenses || !Array.isArray(expenses)) {
      return res.status(400).json({ message: 'Expenses array is required' });
    }
    
    console.log(`💸 Saving expenses for shop ${shopId} on date ${targetDate}`);
    
    const result = await dbService.saveExpenses(shopId, targetDate, expenses);
    res.json(result);
  } catch (error) {
    console.error('Error saving expenses:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/analytics/web-vitals', (req, res) => {
  try {
    const { name, value, rating, delta, id, timestamp, url, userAgent } = req.body;
    
    // Log the performance metric
    console.log(`📊 Web Vital: ${name} = ${value}ms (${rating}) - ${url}`);
    
    // TODO: Store in database for analysis
    // You can save this data to analyze user experience later
    // appData.webVitals = appData.webVitals || [];
    // appData.webVitals.push(req.body);
    // saveData(appData);
    
    res.status(200).json({ received: true });
  } catch (error) {
    // Silent fail - don't break the frontend
    res.status(200).json({ received: false });
  }
});

// Debug endpoint to check timezone and business date
app.get('/api/debug/time', (req, res) => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  
  res.json({
    serverUTCTime: now.toString(),
    serverISTTime: istTime.toString(),
    serverHours: istTime.getHours(),
    serverMinutes: istTime.getMinutes(),
    businessDate: getBusinessDate(),
    timezone: process.env.TZ || 'Not set',
    currentBusinessLogic: istTime.getHours() >= 11 && !(istTime.getHours() === 11 && istTime.getMinutes() < 30) ? 'After 11:30 AM - using today' : 'Before 11:30 AM - using yesterday'
  });
});

// Basic route
app.get('/', (req, res) => {
 res.json({ message: 'Wine Shop Inventory API is running!' });
});

// --- Start the server FIRST ---
const server = app.listen(PORT, '0.0.0.0', () => {
  const addr = server.address();
  console.log(`Server is running on ${addr.address}:${addr.port}`);
});

// --- Now do DB work in the background ---
(async () => {
  try {
    const dbConnected = await connectDB();
    if (dbConnected) {
      await initializeTables();
      
      // Load master brands from database
      await loadMasterBrandsFromDB();
      
      console.log('App initialized with PostgreSQL');
      console.log('Server connected to PostgreSQL database');
      console.log('Server is ready to accept requests');
    } else {
      console.error('DB not connected');
    }
  } catch (error) {
    console.error('Server startup failed (DB):', error);
    // IMPORTANT: Do NOT process.exit(1) here on Railway; keep server up so health stays green.
  }
})();

function shutdown(signal) {
  console.log(`${signal} received: closing server`);
  server.close(async () => {
    try { await pool?.end?.(); } catch (e) { console.error('Error closing DB', e); }
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
