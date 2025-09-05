// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const pdfParse = require('pdf-parse');
// Import database pool
const { pool } = require('./database');
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

async function loadMasterBrandsFromDB(packTypeFilter = null, applyStockOnboardingLogic = false) {
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
        invoice,
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
    
    query += ` ORDER BY brand_number, size_ml, pack_type`;
    
    const result = await pool.query(query, queryParams);
    
    let loadedData = result.rows;
    
    // Apply stock onboarding logic if requested
    if (applyStockOnboardingLogic) {
      const filteredData = [];
      const processedKeys = new Set();
      
      // Group by brand_number + size_code to handle G/P preference logic
      const brandGroups = {};
      
      loadedData.forEach(brand => {
        const key = `${brand.brandNumber}_${brand.sizeCode}`;
        if (!brandGroups[key]) {
          brandGroups[key] = [];
        }
        brandGroups[key].push(brand);
      });
      
      // Process each group
      Object.values(brandGroups).forEach(group => {
        // Always include C and B types
        const cAndBTypes = group.filter(brand => ['C', 'B'].includes(brand.packType));
        filteredData.push(...cAndBTypes);
        
        // Handle G and P types with preference logic
        const gTypes = group.filter(brand => brand.packType === 'G');
        const pTypes = group.filter(brand => brand.packType === 'P');
        
        if (gTypes.length > 0 && pTypes.length > 0) {
          // Both G and P exist - prefer G
          filteredData.push(...gTypes);
        } else if (gTypes.length > 0) {
          // Only G exists
          filteredData.push(...gTypes);
        } else if (pTypes.length > 0) {
          // Only P exists
          filteredData.push(...pTypes);
        }
      });
      
      loadedData = filteredData;
    }
    
    console.log(`✅ Loaded ${loadedData.length} master brands from database${packTypeFilter ? ` (filtered by pack types: ${packTypeFilter.join(', ')})` : ''}${applyStockOnboardingLogic ? ' with stock onboarding logic' : ''}`);
    
    // Only update global cache if loading all brands without special logic
    if (!packTypeFilter && !applyStockOnboardingLogic) {
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

// Helper function to aggregate products by brandNumber + sizeCode (combine pack types)
const aggregateProductsByBrandAndSize = (products) => {
  const aggregatedMap = new Map();
  
  products.forEach(product => {
    const key = `${product.brandNumber}_${product.sizeCode}`;
    
    if (aggregatedMap.has(key)) {
      // Product already exists, aggregate quantities
      const existing = aggregatedMap.get(key);
      existing.quantity += product.quantity || 0;
      existing.openingStock += product.openingStock || 0;
      existing.receivedStock += product.receivedStock || 0;
      existing.totalStock += product.totalStock || 0;
      // Handle closingStock aggregation properly - if any product has null closingStock, result should be null
      if (existing.closingStock !== null && product.closingStock !== null) {
        existing.closingStock = existing.closingStock + product.closingStock;
      } else if (existing.closingStock === null || product.closingStock === null) {
        existing.closingStock = null;
      }
      
      // Aggregate received quantities from new tables
      existing.totalReceivedToday = (existing.totalReceivedToday || 0) + (product.totalReceivedToday || 0);
      existing.invoiceReceivedToday = (existing.invoiceReceivedToday || 0) + (product.invoiceReceivedToday || 0);
      existing.manualReceivedToday = (existing.manualReceivedToday || 0) + (product.manualReceivedToday || 0);
      existing.transferReceivedToday = (existing.transferReceivedToday || 0) + (product.transferReceivedToday || 0);
      
      // Keep track of pack types for debugging
      existing.packTypes = existing.packTypes || [];
      if (!existing.packTypes.includes(product.packType)) {
        existing.packTypes.push(product.packType);
      }
    } else {
      // First occurrence of this brand+size combination
      aggregatedMap.set(key, {
        ...product,
        packTypes: [product.packType], // Track pack types for debugging
        // Note: We keep all other fields from the first occurrence
        // (id, master_brand_id, etc. will be from the first pack type found)
      });
    }
  });
  
  return Array.from(aggregatedMap.values());
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
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1 // Only allow single file upload
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
    const userId = parseInt(req.user.userId);
    const shopId = parseInt(req.user.shopId);
    
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
app.post('/api/invoice/upload', authenticateToken, (req, res, next) => {
  upload.single('invoice')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          message: 'File size exceeds limit'
        });
      }
      if (err.message === 'Only PDF files are allowed') {
        return res.status(400).json({
          success: false,
          message: 'Invalid file type'
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          success: false,
          message: 'Multiple file upload not supported'
        });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          success: false,
          message: 'Multiple file upload not supported'
        });
      }
      return res.status(400).json({
        success: false,
        message: 'File upload error'
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    console.log('\n🚀 Invoice upload started...');
    
    // Get user and shop info from JWT token (convert to integers)
    const userId = parseInt(req.user.userId);
    const shopId = parseInt(req.user.shopId);
    
    if (!shopId) {
      return res.status(400).json({ message: 'Shop ID not found in token' });
    }
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file provided' 
      });
    }

    // Check if file is empty (0 bytes)
    if (req.file.size === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'File is empty' 
      });
    }

    // Check file type more comprehensively
    const isValidPDF = req.file.mimetype === 'application/pdf' || 
                       req.file.originalname.toLowerCase().endsWith('.pdf');
    
    // Check for malicious file extensions
    const dangerousExtensions = ['.exe', '.php', '.js', '.bat', '.cmd', '.scr', '.vbs'];
    const hasUnsafeExtension = dangerousExtensions.some(ext => 
      req.file.originalname.toLowerCase().endsWith(ext)
    );
    
    if (!isValidPDF || hasUnsafeExtension) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid file type'
      });
    }

    // Check file size (set limit to 5MB)
    const maxFileSize = 5 * 1024 * 1024; // 5MB in bytes
    if (req.file.size > maxFileSize) {
      return res.status(413).json({ 
        success: false,
        message: 'File size exceeds limit'
      });
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
        message: 'Failed to read invoice', 
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

    // Generate temp ID and store data in invoice_staging table
    const tempId = generateTempId();
    
    try {
      console.log('💾 Storing invoice data in invoice_staging table...');
      console.log('🔍 Debug info:', {
        tempId,
        userId,
        shopId,
        invoiceNumber: parseResult.data.invoiceNumber,
        date: parseResult.data.date,
        invoiceValue: parseResult.data.invoiceValue,
        totalAmount: parseResult.data.totalAmount,
        confidence: parseResult.confidence,
        method: parseResult.method,
        itemsCount: parseResult.data.items?.length || 0
      });
      
      // Log all the values that will be inserted
      const insertValues = [
        tempId,
        userId,
        shopId,
        parseResult.data.invoiceNumber,
        parseResult.data.date,
        parseResult.data.invoiceValue || parseResult.data.totalAmount || 0,
        parseResult.data.netInvoiceValue || 0,
        parseResult.data.mrpRoundingOff || 0,
        parseResult.data.retailShopExciseTax || 0,
        parseResult.data.retailExciseTurnoverTax || 0,
        parseResult.data.specialExciseCess || 0,
        parseResult.data.tcs || 0,
        parseResult.data.totalAmount || 0,
        parseResult.confidence,
        parseResult.method,
        JSON.stringify(parseResult.data.items),
        JSON.stringify(parseResult.data.summary),
        JSON.stringify(parseResult.warnings || []),
        JSON.stringify(parseResult.data.skippedItems || [])
      ];
      
      // Store in database instead of memory
      await pool.query(`
        INSERT INTO invoice_staging (
          temp_id, user_id, shop_id, invoice_number, invoice_date, 
          invoice_value, net_invoice_value, mrp_rounding_off, 
          retail_shop_excise_tax, retail_excise_turnover_tax, special_excise_cess, tcs, total_amount,
          confidence, parse_method, items_data, summary_data, 
          warnings, skipped_items
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      `, [
        tempId,
        userId,
        shopId,
        parseResult.data.invoiceNumber,
        parseResult.data.date,
        parseResult.data.invoiceValue || parseResult.data.totalAmount || 0,
        parseResult.data.netInvoiceValue || 0,
        parseResult.data.mrpRoundingOff || 0,
        parseResult.data.retailShopExciseTax || 0,
        parseResult.data.retailExciseTurnoverTax || 0,
        parseResult.data.specialExciseCess || 0,
        parseResult.data.tcs || 0,
        parseResult.data.totalAmount || 0,
        parseResult.confidence,
        parseResult.method,
        JSON.stringify(parseResult.data.items),
        JSON.stringify(parseResult.data.summary),
        JSON.stringify(parseResult.warnings || []),
        JSON.stringify(parseResult.data.skippedItems || [])
      ]);

      console.log(`✅ Invoice data stored with tempId: ${tempId}`);

      // Return the parsed and validated data WITH tempId for frontend display
      res.json({
        success: true,
        message: 'File uploaded successfully',
        tempId: tempId,
        confidence: parseResult.confidence,
        method: parseResult.method,
        invoiceNumber: parseResult.data.invoiceNumber,
        date: parseResult.data.date,
        invoiceValue: parseResult.data.invoiceValue,
        totalAmount: parseResult.data.totalAmount,
        netInvoiceValue: parseResult.data.netInvoiceValue,
        mrpRoundingOff: parseResult.data.mrpRoundingOff,
        retailShopExciseTax: parseResult.data.retailShopExciseTax,
        retailExciseTurnoverTax: parseResult.data.retailExciseTurnoverTax,
        specialExciseCess: parseResult.data.specialExciseCess,
        tcs: parseResult.data.tcs,
        items: parseResult.data.items, // Only validated items for display
        summary: parseResult.data.summary,
        warnings: parseResult.warnings || [],
        skippedItems: parseResult.data.skippedItems || []
      });

    } catch (storeError) {
      console.error('❌ Failed to store invoice data:', storeError);
      console.error('❌ Error details:', {
        message: storeError.message,
        code: storeError.code,
        detail: storeError.detail,
        constraint: storeError.constraint,
        stack: storeError.stack
      });
      return res.status(500).json({
        success: false,
        message: 'Invoice parsed successfully but failed to store temporarily',
        error: storeError.message,
        errorCode: storeError.code,
        errorDetail: storeError.detail
      });
    }

  } catch (error) {
    console.error('❌ Invoice upload error:', error);
    
    // Provide more specific error messages based on error type
    if (error.message && error.message.includes('PDF')) {
      return res.status(400).json({ 
        message: 'Invalid PDF file. Please ensure the file is a valid PDF document.',
        error: 'PDF_PARSE_ERROR'
      });
    }
    
    if (error.message && error.message.includes('ENOENT')) {
      return res.status(400).json({ 
        message: 'File not found or corrupted. Please try uploading again.',
        error: 'FILE_NOT_FOUND'
      });
    }
    
    // Generic server error for unexpected issues
    res.status(500).json({ 
      message: 'Server error during invoice processing. Please try again later.',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// Confirm and add parsed invoice data to stock
app.post('/api/invoice/confirm', authenticateToken, async (req, res) => {
  try {
    console.log('\n🔄 Invoice confirmation started...');
    console.log('📦 Request body:', req.body);
    
    const { tempId, businessDate } = req.body;
    const userId = parseInt(req.user.userId);
    const shopId = parseInt(req.user.shopId);
    
    console.log('📅 Received businessDate:', businessDate);
    console.log('🆔 TempId:', tempId);
    
    if (!tempId) {
      return res.status(400).json({ message: 'Temporary ID is required' });
    }

    console.log(`🔍 Looking for tempId: ${tempId}`);
    
    // Retrieve stored invoice data from database
    const result = await pool.query(`
      SELECT * FROM invoice_staging 
      WHERE temp_id = $1 AND user_id = $2 AND shop_id = $3 
      AND expires_at > CURRENT_TIMESTAMP
    `, [tempId, userId, shopId]);
    
    if (result.rows.length === 0) {
      console.error(`❌ Invoice data not found for tempId: ${tempId}`);
      return res.status(404).json({
        message: 'Invoice data expired or not found. Please upload again.',
        code: 'INVOICE_EXPIRED'
      });
    }
    
    const invoiceRecord = result.rows[0];
    console.log(`✅ Found pending invoice for tempId: ${tempId}`);

    // Parse the JSON data
    const invoiceData = {
      invoiceNumber: invoiceRecord.invoice_number,
      date: invoiceRecord.invoice_date,
      invoiceValue: invoiceRecord.invoice_value,
      netInvoiceValue: invoiceRecord.net_invoice_value,
      mrpRoundingOff: invoiceRecord.mrp_rounding_off,
      retailShopExciseTax: invoiceRecord.retail_shop_excise_tax,
      retailExciseTurnoverTax: invoiceRecord.retail_excise_turnover_tax,
      specialExciseCess: invoiceRecord.special_excise_cess,
      tcs: invoiceRecord.tcs,
      totalAmount: invoiceRecord.total_amount,
      items: typeof invoiceRecord.items_data === 'string' ? JSON.parse(invoiceRecord.items_data) : invoiceRecord.items_data,
      summary: typeof invoiceRecord.summary_data === 'string' ? JSON.parse(invoiceRecord.summary_data) : invoiceRecord.summary_data
    };

    const today = new Date().toISOString().split('T')[0];
    const finalBusinessDate = businessDate || today; // Use provided business date or fallback to today
    
    console.log('📅 Final business date being used:', finalBusinessDate);
    console.log('📅 Today fallback date:', today);


    // Save invoice using the database service
    const savedInvoice = await dbService.saveInvoiceWithItems({
      userId,
      invoiceNumber: invoiceData.invoiceNumber,
      date: finalBusinessDate, // Use business date for received_stock_records
      originalInvoiceDate: invoiceRecord.invoice_date, // Original invoice date for invoices table
      uploadDate: today,
      totalValue: invoiceData.invoiceValue || 0,
      netInvoiceValue: invoiceData.netInvoiceValue || 0,
      mrpRoundingOff: invoiceData.mrpRoundingOff || 0,
      retailShopExciseTax: invoiceData.retailShopExciseTax || 0,
      retailExciseTurnoverTax: invoiceData.retailExciseTurnoverTax || 0,
      specialExciseCess: invoiceData.specialExciseCess || 0,
      tcs: invoiceData.tcs || 0,
      itemsCount: invoiceData.items.length,
      processedItemsCount: invoiceData.items.filter(item => item.masterBrandId).length
    }, invoiceData.items);

    console.log(`✅ Invoice saved successfully with ID: ${savedInvoice.id}`);

    // Clean up the temporary data from invoice_staging table
    await pool.query('DELETE FROM invoice_staging WHERE temp_id = $1', [tempId]);
    console.log(`🗑️ Cleaned up tempId: ${tempId}`);

    res.json({
      success: true,
      message: 'Invoice confirmed and saved successfully',
      invoiceId: savedInvoice.id,
      invoiceNumber: savedInvoice.invoice_number,
      totalValue: savedInvoice.total_value,
      date: savedInvoice.date,
      itemsCount: savedInvoice.itemsCount,
      matchedItemsCount: savedInvoice.matchedItemsCount
    });

  } catch (error) {
    console.error('❌ Invoice confirmation error:', error);
    res.status(500).json({ 
      message: 'Failed to confirm invoice',
      error: error.message 
    });
  }
});
// Cancel pending invoice (manual cleanup)
app.post('/api/invoice/cancel', authenticateToken, async (req, res) => {
  try {
    const { tempId } = req.body;
    const userId = parseInt(req.user.userId);
    const shopId = parseInt(req.user.shopId);

    if (!tempId) {
      return res.status(400).json({ message: 'No tempId provided' });
    }

    // Delete from invoice_staging table
    const result = await pool.query(`
      DELETE FROM invoice_staging 
      WHERE temp_id = $1 AND user_id = $2 AND shop_id = $3
    `, [tempId, userId, shopId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Invoice data not found or already expired' });
    }

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
    const userId = parseInt(req.user.userId);
    const shopId = parseInt(req.user.shopId);
    
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
  app.get('/api/debug/pending-invoices', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT temp_id, user_id, shop_id, invoice_number, 
               created_at, expires_at, confidence, parse_method,
               jsonb_array_length(items_data) as item_count
        FROM invoice_brands 
        WHERE expires_at > CURRENT_TIMESTAMP
        ORDER BY created_at DESC
      `);
      
      res.json({
        totalPending: result.rows.length,
        invoices: result.rows.map(row => ({
          tempId: row.temp_id,
          userId: row.user_id,
          shopId: row.shop_id,
          invoiceNumber: row.invoice_number,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
          confidence: row.confidence,
          parseMethod: row.parse_method,
          itemCount: row.item_count || 0
        }))
      });
    } catch (error) {
      console.error('❌ Debug pending invoices error:', error);
      res.status(500).json({ 
        message: 'Failed to fetch pending invoices',
        error: error.message 
      });
    }
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
    const shopId = parseInt(req.user.shopId);
    const today = getBusinessDate();
    
    const recordCount = await dbService.initializeTodayStock(shopId, today);
    res.json({ 
      success: true,
      message: `Successfully initialized stock for ${recordCount} products`,
      recordCount: recordCount,
      date: today
    });
    
  } catch (error) {
    console.error('Error initializing today stock:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Master brands endpoint - always get fresh data from database
app.get('/api/master-brands', authenticateToken, async (req, res) => {
  try {
    // Check if filtering by pack types for stock onboarding
    const { packTypes, stockOnboarding } = req.query;
    
    if (packTypes) {
      const allowedPackTypes = packTypes.split(',').map(p => p.trim());
      
      // Apply special stock onboarding logic if requested
      const applyStockOnboardingLogic = stockOnboarding === 'true';
      
      const freshMasterBrands = await loadMasterBrandsFromDB(allowedPackTypes, applyStockOnboardingLogic);
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
   const shopId = parseInt(req.user.shopId);
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
   const mrpPrice = parseFloat(masterBrand.standard_mrp);
   const finalPrice = mrpPrice + markupPrice;
   const receivedQuantity = parseInt(quantity);
   

   console.log('💰 Price calculation:', {
     mrpOriginal: masterBrand.standard_mrp,
     mrpParsed: mrpPrice,
     markup: markupPrice,
     finalPrice: finalPrice,
     shopMarkup: shopMarkup
   });
   
   // Add or update product using UPSERT (handles both new and existing products)
   const productResult = await dbService.addShopProduct({
     masterBrandId: parseInt(masterBrandId),
     shopId: shopId,
     markupPrice: markupPrice,
     finalPrice: finalPrice,
     currentQuantity: receivedQuantity
   });
   
   console.log('📦 Product result:', productResult);
   
   const shopInventoryId = productResult.id;
   const wasUpdated = productResult.action === 'updated';
   
   if (wasUpdated) {
     console.log(`✅ Updated existing product: ${masterBrand.brand_name} (${masterBrand.size_ml}ml)`);
     console.log(`   Added quantity: ${receivedQuantity}, New total: ${productResult.current_quantity}`);
   } else {
     console.log(`✅ Added new product: ${masterBrand.brand_name} (${masterBrand.size_ml}ml) - Quantity: ${receivedQuantity}`);
   }
  
  // ADD TO RECEIVED STOCK RECORDS - Manual quantity (this will auto-update daily_stock_records via trigger)
  await dbService.addReceivedStock({
    shopId: shopId,
    masterBrandId: parseInt(masterBrandId),
    recordDate: today,
    invoiceQuantity: 0,
    manualQuantity: receivedQuantity, // Add to manual column
    transferQuantity: 0,
    invoiceId: null,
    transferReference: null,
    notes: `Manual stock addition - ${wasUpdated ? 'Updated existing' : 'New product'}`,
    createdBy: parseInt(req.user.userId)
  });

  // Initialize daily stock record if it doesn't exist (opening stock and price only)
  await dbService.createOrUpdateDailyStockRecord({
    shopInventoryId: shopInventoryId,
    stockDate: today,
    openingStock: 0,
    receivedStock: 0, // Will be auto-calculated from received_stock_records by trigger
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
    const shopId = parseInt(req.user.shopId);
    
    const result = await dbService.updateSortOrder(shopId, sortedBrandGroups);
    res.json(result);
  } catch (error) {
    console.error('Error updating sort order:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/shop/products', authenticateToken, async (req, res) => {
  try {
    const shopId = parseInt(req.user.shopId);
    const { date } = req.query;
    const targetDate = date || getBusinessDate();
    
    console.log(`📊 Fetching products for shop ${shopId} on date ${targetDate}`);
    
    // Initialize today's stock records if they don't exist
    const initializedCount = await dbService.initializeTodayStock(shopId, targetDate);
    console.log(`📦 Initialized ${initializedCount} stock records for today`);
    
    const rawProducts = await dbService.getShopProducts(shopId, targetDate);
    console.log(`📋 Found ${rawProducts.length} raw products in shop inventory`);
    
    // Debug: Log first raw product to see its structure
    if (rawProducts.length > 0) {
      console.log('📋 Sample raw product:', JSON.stringify(rawProducts[0], null, 2));
    }
    
    // Get received stock data for the date
    const receivedStockData = await dbService.getReceivedStock(shopId, targetDate);
    console.log(`📦 Found ${receivedStockData.length} received stock records`);
    
    // Create a map of received quantities by master_brand_id
    const receivedQuantitiesMap = new Map();
    receivedStockData.forEach(record => {
      const key = record.master_brand_id;
      if (!receivedQuantitiesMap.has(key)) {
        receivedQuantitiesMap.set(key, {
          totalReceived: 0,
          invoiceQuantity: 0,
          manualQuantity: 0,
          transferQuantity: 0
        });
      }
      const existing = receivedQuantitiesMap.get(key);
      existing.totalReceived += record.total_received || 0;
      existing.invoiceQuantity += record.invoice_quantity || 0;
      existing.manualQuantity += record.manual_quantity || 0;
      existing.transferQuantity += record.transfer_quantity || 0;
    });
    
    // Add received quantities to products
    const productsWithReceived = rawProducts.map(product => ({
      ...product,
      // Add received quantities (rec column for ViewCurrentStock)
      totalReceivedToday: receivedQuantitiesMap.get(product.master_brand_id)?.totalReceived || 0,
      invoiceReceivedToday: receivedQuantitiesMap.get(product.master_brand_id)?.invoiceQuantity || 0,
      manualReceivedToday: receivedQuantitiesMap.get(product.master_brand_id)?.manualQuantity || 0,
      transferReceivedToday: receivedQuantitiesMap.get(product.master_brand_id)?.transferQuantity || 0
    }));
    
    // Aggregate products by brandNumber + sizeCode (combine pack types)
    const aggregatedProducts = aggregateProductsByBrandAndSize(productsWithReceived);
    console.log(`📊 Aggregated to ${aggregatedProducts.length} display products with received quantities`);
    
    // Debug: Log first few products to see their structure
    if (aggregatedProducts.length > 0) {
      console.log('📋 Sample aggregated product:', JSON.stringify(aggregatedProducts[0], null, 2));
      console.log('📋 Total sales value:', aggregatedProducts.reduce((sum, p) => sum + ((p.totalStock || 0) - (p.closingStock || p.totalStock || 0)) * (p.finalPrice || 0), 0));
    }
    
    // Check if closing stock is already saved
    const closingStockStatus = await dbService.isClosingStockSaved(shopId, targetDate);
    
    res.json({
      products: aggregatedProducts,
      closingStockStatus: closingStockStatus,
      businessDate: targetDate,
      receivedStockSummary: {
        totalRecords: receivedStockData.length,
        totalQuantityReceived: Array.from(receivedQuantitiesMap.values()).reduce((sum, item) => sum + item.totalReceived, 0)
      }
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
   const shopId = parseInt(req.user.shopId);
   
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
    const shopId = parseInt(req.user.shopId);
    
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
    const shopId = parseInt(req.user.shopId);
    
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
    const shopId = parseInt(req.user.shopId);
    
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
    const shopId = parseInt(req.user.shopId);
    const { date } = req.query;
    const targetDate = date || getBusinessDate();
    
    if (!shopId) {
      return res.status(400).json({ message: 'Shop ID not found in token' });
    }
    
    console.log(`📊 Getting summary for shop ${shopId} on date ${targetDate}`);
    const summary = await dbService.getSummary(shopId, targetDate);
    res.json(summary);
  } catch (error) {
    console.error('Error getting summary:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Income and Expenses endpoints
app.get('/api/income-expenses/income', authenticateToken, async (req, res) => {
  try {
    const shopId = parseInt(req.user.shopId);
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
    const shopId = parseInt(req.user.shopId);
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
    const shopId = parseInt(req.user.shopId);
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
    const shopId = parseInt(req.user.shopId);
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

// ===== PAYMENTS ENDPOINTS =====

// Get payment record for a specific date
app.get('/api/payments', authenticateToken, async (req, res) => {
  try {
    const shopId = parseInt(req.user.shopId);
    const { date } = req.query;

    if (!shopId) {
      return res.status(400).json({ message: 'Shop ID not found in token' });
    }

    if (!date) {
      return res.status(400).json({ message: 'Date parameter is required' });
    }

    console.log(`💰 Getting payment record for shop ${shopId} on ${date}`);

    const payment = await dbService.getPaymentRecord(shopId, date);
    const recentPayments = await dbService.getRecentPayments(shopId, 7); // Last 7 days

    res.json({
      payment,
      recentPayments
    });

  } catch (error) {
    console.error('❌ Error getting payment record:', error);
    res.status(500).json({ 
      message: 'Server error getting payment record',
      error: error.message 
    });
  }
});

// Save or update payment record
app.post('/api/payments', authenticateToken, async (req, res) => {
  try {
    const shopId = parseInt(req.user.shopId);
    const { payment_date, cash_amount, upi_amount, card_amount } = req.body;

    if (!shopId) {
      return res.status(400).json({ message: 'Shop ID not found in token' });
    }

    if (!payment_date) {
      return res.status(400).json({ message: 'Payment date is required' });
    }

    // Validate amounts are non-negative numbers
    const cash = parseFloat(cash_amount) || 0;
    const upi = parseFloat(upi_amount) || 0;
    const card = parseFloat(card_amount) || 0;

    if (cash < 0 || upi < 0 || card < 0) {
      return res.status(400).json({ message: 'Payment amounts must be non-negative' });
    }

    console.log(`💰 Saving payment record for shop ${shopId} on ${payment_date}`);
    console.log(`💵 Cash: ${cash}, 📱 UPI: ${upi}, 💳 Card: ${card}`);

    const result = await dbService.savePaymentRecord(shopId, payment_date, cash, upi, card);

    res.json({
      message: 'Payment record saved successfully',
      payment: result
    });

  } catch (error) {
    console.error('❌ Error saving payment record:', error);
    res.status(500).json({ 
      message: 'Server error saving payment record',
      error: error.message 
    });
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

// ===============================================
// NEW STOCK TABLES API ENDPOINTS
// ===============================================

// Received Stock Management Endpoints
app.post('/api/received-stock', authenticateToken, async (req, res) => {
  try {
    const shopId = parseInt(req.user.shopId);
    const userId = parseInt(req.user.userId);
    const {
      masterBrandId, recordDate, invoiceQuantity, manualQuantity, 
      transferQuantity, invoiceId, transferReference, notes
    } = req.body;
    
    if (!masterBrandId) {
      return res.status(400).json({ message: 'Master brand ID is required' });
    }
    
    const targetDate = recordDate || getBusinessDate();
    
    console.log(`📦 Adding received stock for shop ${shopId} on ${targetDate}`);
    
    const result = await dbService.addReceivedStock({
      shopId,
      masterBrandId,
      recordDate: targetDate,
      invoiceQuantity: invoiceQuantity || 0,
      manualQuantity: manualQuantity || 0,
      transferQuantity: transferQuantity || 0,
      invoiceId,
      transferReference,
      notes,
      createdBy: userId
    });
    
    res.status(201).json({
      message: 'Received stock added successfully',
      receivedStock: result
    });
    
  } catch (error) {
    console.error('Error adding received stock:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/received-stock', authenticateToken, async (req, res) => {
  try {
    const shopId = parseInt(req.user.shopId);
    const { date, masterBrandId } = req.query;
    
    console.log(`📋 Getting received stock for shop ${shopId}`);
    
    const result = await dbService.getReceivedStock(shopId, date, masterBrandId);
    
    res.json({
      receivedStock: result,
      totalRecords: result.length
    });
    
  } catch (error) {
    console.error('Error getting received stock:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.put('/api/received-stock/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { invoiceQuantity, manualQuantity, transferQuantity, transferReference, notes } = req.body;
    
    console.log(`📝 Updating received stock record ${id}`);
    
    const result = await dbService.updateReceivedStock(id, {
      invoiceQuantity,
      manualQuantity,
      transferQuantity,
      transferReference,
      notes
    });
    
    if (!result) {
      return res.status(404).json({ message: 'Received stock record not found' });
    }
    
    res.json({
      message: 'Received stock updated successfully',
      receivedStock: result
    });
    
  } catch (error) {
    console.error('Error updating received stock:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.delete('/api/received-stock/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const shopId = parseInt(req.user.shopId);
    
    console.log(`🗑️ Deleting received stock record ${id}`);
    
    const result = await dbService.deleteReceivedStock(id, shopId);
    
    if (!result) {
      return res.status(404).json({ message: 'Received stock record not found or not authorized' });
    }
    
    res.json({
      message: 'Received stock deleted successfully',
      deletedRecord: result
    });
    
  } catch (error) {
    console.error('Error deleting received stock:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Stock Transfer Endpoints
app.post('/api/stock-transfers', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.user.userId);
    const {
      fromShopId, toShopId, masterBrandId, quantity,
      transferReference, notes, recordDate
    } = req.body;
    
    if (!fromShopId || !toShopId || !masterBrandId || !quantity) {
      return res.status(400).json({ 
        message: 'From shop, to shop, master brand ID, and quantity are required' 
      });
    }
    
    if (quantity <= 0) {
      return res.status(400).json({ message: 'Quantity must be positive' });
    }
    
    const targetDate = recordDate || getBusinessDate();
    
    console.log(`🔄 Creating stock transfer: ${quantity} units from shop ${fromShopId} to shop ${toShopId}`);
    
    const result = await dbService.createStockTransfer({
      fromShopId,
      toShopId,
      masterBrandId,
      quantity,
      transferReference,
      notes,
      createdBy: userId,
      recordDate: targetDate
    });
    
    res.status(201).json({
      message: 'Stock transfer created successfully',
      transfer: result
    });
    
  } catch (error) {
    console.error('Error creating stock transfer:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/stock-transfers', authenticateToken, async (req, res) => {
  try {
    const shopId = parseInt(req.user.shopId);
    const { date } = req.query;
    
    console.log(`📋 Getting stock transfers for shop ${shopId}`);
    
    const result = await dbService.getStockTransfers(shopId, date);
    
    res.json({
      transfers: result,
      totalRecords: result.length
    });
    
  } catch (error) {
    console.error('Error getting stock transfers:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Closing Stock Management Endpoints
app.post('/api/closing-stock', authenticateToken, async (req, res) => {
  try {
    const shopId = parseInt(req.user.shopId);
    const userId = parseInt(req.user.userId);
    const {
      masterBrandId, recordDate, openingStock, closingStock,
      unitPrice, isFinalized, varianceNotes
    } = req.body;
    
    if (!masterBrandId) {
      return res.status(400).json({ message: 'Master brand ID is required' });
    }
    
    const targetDate = recordDate || getBusinessDate();
    
    console.log(`📊 Creating/updating closing stock for shop ${shopId} on ${targetDate}`);
    
    const result = await dbService.createOrUpdateClosingStock({
      shopId,
      masterBrandId,
      recordDate: targetDate,
      openingStock,
      closingStock,
      unitPrice,
      isFinalized: isFinalized || false,
      varianceNotes,
      createdBy: userId,
      finalizedBy: isFinalized ? userId : null
    });
    
    res.json({
      message: 'Closing stock record created/updated successfully',
      closingStock: result
    });
    
  } catch (error) {
    console.error('Error creating/updating closing stock:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/closing-stock', authenticateToken, async (req, res) => {
  try {
    const shopId = parseInt(req.user.shopId);
    const { date, masterBrandId } = req.query;
    
    console.log(`📋 Getting closing stock for shop ${shopId}`);
    
    const result = await dbService.getClosingStock(shopId, date, masterBrandId);
    
    res.json({
      closingStock: result,
      totalRecords: result.length
    });
    
  } catch (error) {
    console.error('Error getting closing stock:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/closing-stock/finalize', authenticateToken, async (req, res) => {
  try {
    const shopId = parseInt(req.user.shopId);
    const userId = parseInt(req.user.userId);
    const { date, closingStockUpdates } = req.body;
    
    if (!date || !closingStockUpdates || !Array.isArray(closingStockUpdates)) {
      return res.status(400).json({ 
        message: 'Date and closing stock updates array are required' 
      });
    }
    
    console.log(`🔒 Finalizing closing stock for shop ${shopId} on ${date}`);
    
    const result = await dbService.finalizeClosingStock(shopId, date, closingStockUpdates, userId);
    
    res.json(result);
    
  } catch (error) {
    console.error('Error finalizing closing stock:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Enhanced Daily Stock Summary Endpoint
app.get('/api/enhanced-daily-summary', authenticateToken, async (req, res) => {
  try {
    const shopId = parseInt(req.user.shopId);
    const { date } = req.query;
    const targetDate = date || getBusinessDate();
    
    console.log(`📊 Getting enhanced daily summary for shop ${shopId} on ${targetDate}`);
    
    // Initialize closing stock records if they don't exist
    const initializedCount = await dbService.initializeClosingStockRecords(shopId, targetDate);
    console.log(`📦 Initialized ${initializedCount} closing stock records`);
    
    const result = await dbService.getEnhancedDailyStockSummary(shopId, targetDate);
    
    res.json({
      summary: result,
      date: targetDate,
      totalProducts: result.length,
      initializedRecords: initializedCount
    });
    
  } catch (error) {
    console.error('Error getting enhanced daily summary:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Initialize closing stock records for a date
app.post('/api/closing-stock/initialize', authenticateToken, async (req, res) => {
  try {
    const shopId = parseInt(req.user.shopId);
    const { date } = req.body;
    const targetDate = date || getBusinessDate();
    
    console.log(`🔄 Initializing closing stock records for shop ${shopId} on ${targetDate}`);
    
    const recordCount = await dbService.initializeClosingStockRecords(shopId, targetDate);
    
    res.json({
      message: 'Closing stock records initialized successfully',
      recordCount: recordCount,
      date: targetDate
    });
    
  } catch (error) {
    console.error('Error initializing closing stock records:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
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
  if (addr) {
    console.log(`Server is running on ${addr.address}:${addr.port}`);
  } else {
    console.log(`Server is running on port ${PORT}`);
  }
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
