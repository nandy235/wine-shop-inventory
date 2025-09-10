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

// Helper: reliable business date in IST (day rolls at 11:30 AM IST)
function getBusinessDate() {
  const now = new Date();
  // Current date and time in IST, independent of server timezone
  const istDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
  const istTimeStr = now.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });
  const [hoursStr, minutesStr] = istTimeStr.split(':');
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);

  if (hours < 11 || (hours === 11 && minutes < 30)) {
    // Before 11:30 AM IST → business date is yesterday (IST)
    const midnightIst = new Date(`${istDateStr}T00:00:00+05:30`);
    midnightIst.setDate(midnightIst.getDate() - 1);
    return midnightIst.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }

  return istDateStr;
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


// ===== STOCK SHIFT ENDPOINT =====
app.post('/api/stock-shift', authenticateToken, async (req, res) => {
  const requestId = Date.now() + Math.random();
  try {
    console.log(`\n🔄 [${requestId}] ===== STOCK SHIFT OPERATION STARTED =====`);
    console.log(`📅 [${requestId}] Timestamp: ${new Date().toISOString()}`);

    const {
      masterBrandId, shopInventoryId, quantity,
      supplierName, isFromTGBCL, supplierCode, supplierShopId,
      shiftType
    } = req.body;

    const userId = parseInt(req.user.userId);
    const shopId = parseInt(req.user.shopId);

    console.log(`🔍 [${requestId}] Request Body:`, JSON.stringify(req.body, null, 2));
    console.log(`👤 [${requestId}] User Details:`, {
      userId: userId,
      shopId: shopId,
      retailerCode: req.user.retailerCode,
      shopName: req.user.shopName
    });
    console.log(`📊 [${requestId}] Operation Type: ${shiftType.toUpperCase()}`);
    console.log(`🏪 [${requestId}] Shop Context: Shop ID ${shopId} (${req.user.shopName || 'Unknown'})`);

    let actualMasterBrandId;
    let actualSourceShopId = null;

    // SHIFT OUT → convert shopInventoryId → master_brand_id
    if (shiftType === 'out') {
      console.log(`\n🔍 [${requestId}] ===== SHIFT OUT OPERATION =====`);
      console.log(`📤 [${requestId}] Direction: FROM current shop TO destination`);
      
      if (!shopInventoryId) {
        console.log(`❌ [${requestId}] Validation failed: No shopInventoryId provided for shift out`);
        return res.status(400).json({ message: 'Product identifier required for shift out' });
      }
      
      console.log(`🔍 [${requestId}] Looking up master_brand_id for shopInventoryId: ${shopInventoryId} in shop: ${shopId}`);
      const convertResult = await pool.query(
        'SELECT master_brand_id FROM shop_inventory WHERE id = $1 AND shop_id = $2',
        [shopInventoryId, shopId]
      );
      
      if (!convertResult.rows.length) {
        console.log(`❌ [${requestId}] Product not found in shop inventory:`, {
          shopInventoryId: shopInventoryId,
          shopId: shopId
        });
        return res.status(400).json({ message: 'Product not found in shop inventory' });
      }
      
      actualMasterBrandId = convertResult.rows[0].master_brand_id;
      console.log(`✅ [${requestId}] Successfully converted shop_inventory_id → master_brand_id:`, {
        shopInventoryId: shopInventoryId,
        masterBrandId: actualMasterBrandId,
        shopId: shopId
      });
    }
    // SHIFT IN
    else if (shiftType === 'in') {
      console.log(`\n🔍 [${requestId}] ===== SHIFT IN OPERATION =====`);
      console.log(`📥 [${requestId}] Direction: FROM source TO current shop`);
      
      if (!masterBrandId && !shopInventoryId) {
        console.log(`❌ [${requestId}] Validation failed: No product identifier provided for shift in`);
        return res.status(400).json({ message: 'Product identifier required for shift in' });
      }

      const internalTransfer = supplierShopId !== null;
      console.log(`🔍 [${requestId}] Transfer Analysis:`, {
        internalTransfer: internalTransfer,
        supplierShopId: supplierShopId,
        masterBrandId: masterBrandId,
        shopInventoryId: shopInventoryId,
        isFromTGBCL: isFromTGBCL
      });

      if (internalTransfer && shopInventoryId) {
        console.log(`🏪 [${requestId}] Processing INTERNAL transfer from supplier shop: ${supplierShopId}`);
        
        // Resolve supplier retailer_code → actual source shop id
        console.log(`🔍 [${requestId}] Looking up supplier info for supplierShopId: ${supplierShopId}`);
        const supplierInfo = await pool.query(
          'SELECT retailer_code FROM supplier_shops WHERE id = $1',
          [supplierShopId]
        );
        if (!supplierInfo.rows.length) {
          console.log(`❌ [${requestId}] Invalid supplier shop ID: ${supplierShopId}`);
          return res.status(400).json({ message: 'Invalid supplier shop ID' });
        }

        const retailerCode = supplierInfo.rows[0].retailer_code;
        console.log(`🔍 [${requestId}] Found supplier retailer_code: ${retailerCode}, looking up source shop`);
        
        const shopRes = await pool.query('SELECT id FROM shops WHERE retailer_code = $1', [retailerCode]);
        if (!shopRes.rows.length) {
          console.log(`❌ [${requestId}] No shop found for retailer_code: ${retailerCode}`);
          return res.status(400).json({ message: 'No shop found for supplier retailer code' });
        }

        actualSourceShopId = shopRes.rows[0].id;
        console.log(`✅ [${requestId}] Found source shop ID: ${actualSourceShopId} for retailer_code: ${retailerCode}`);

        console.log(`🔍 [${requestId}] Looking up master_brand_id for shopInventoryId: ${shopInventoryId} in source shop: ${actualSourceShopId}`);
        const convertRes = await pool.query(
          'SELECT master_brand_id FROM shop_inventory WHERE id = $1 AND shop_id = $2',
          [shopInventoryId, actualSourceShopId]
        );
        if (!convertRes.rows.length) {
          console.log(`❌ [${requestId}] Product not found in source shop inventory:`, {
            shopInventoryId: shopInventoryId,
            sourceShopId: actualSourceShopId
          });
          return res.status(400).json({ message: 'Product not found in source internal shop inventory' });
        }
        actualMasterBrandId = convertRes.rows[0].master_brand_id;
        console.log(`✅ [${requestId}] Internal IN: converted source shop_inventory_id → master_brand_id:`, {
          shopInventoryId: shopInventoryId,
          masterBrandId: actualMasterBrandId,
          sourceShopId: actualSourceShopId
        });
      } else if (!internalTransfer && masterBrandId) {
        console.log(`🏭 [${requestId}] Processing EXTERNAL transfer (TGBCL) with masterBrandId: ${masterBrandId}`);
        
        // External (TGBCL) IN
        console.log(`🔍 [${requestId}] Verifying master brand exists: ${masterBrandId}`);
        const verify = await pool.query('SELECT id FROM master_brands WHERE id = $1', [masterBrandId]);
        if (!verify.rows.length) {
          console.log(`❌ [${requestId}] Master brand not found: ${masterBrandId}`);
          return res.status(400).json({ message: 'Product not found in master brands' });
        }
        actualMasterBrandId = masterBrandId;
        console.log(`✅ [${requestId}] External IN: using masterBrandId: ${actualMasterBrandId}`);
      } else {
        console.log(`❌ [${requestId}] Invalid request configuration:`, {
          internalTransfer: internalTransfer,
          masterBrandId: masterBrandId,
          shopInventoryId: shopInventoryId
        });
        return res.status(400).json({ message: 'Invalid request: missing product identifier for shift in operation' });
      }
    } else {
      console.log(`❌ [${requestId}] Invalid shift type: ${shiftType}`);
      return res.status(400).json({ message: 'Invalid request: missing shift type' });
    }

    console.log(`\n🔍 [${requestId}] ===== VALIDATION PHASE =====`);
    
    if (!actualMasterBrandId || !quantity || quantity === 0) {
      console.log(`❌ [${requestId}] Validation failed: Missing required fields`, {
        actualMasterBrandId: actualMasterBrandId,
        quantity: quantity
      });
      return res.status(400).json({ message: 'Product and quantity are required' });
    }
    console.log(`✅ [${requestId}] Basic validation passed:`, {
      actualMasterBrandId: actualMasterBrandId,
      quantity: quantity
    });

    // Enforce supplier selection
    if (!isFromTGBCL && (!supplierName || supplierName === 'Unknown')) {
      console.log(`❌ [${requestId}] Supplier validation failed:`, {
        isFromTGBCL: isFromTGBCL,
        supplierName: supplierName
      });
      return res.status(400).json({ message: 'Supplier is required for stock shift' });
    }
    console.log(`✅ [${requestId}] Supplier validation passed:`, {
      supplierName: supplierName,
      isFromTGBCL: isFromTGBCL,
      supplierCode: supplierCode
    });

    const targetDate = getBusinessDate();
    console.log(`📅 [${requestId}] Business date: ${targetDate}`);

    // ===== SOURCE SHOP VALIDATION =====
    console.log(`\n🔍 [${requestId}] ===== SOURCE SHOP VALIDATION =====`);
    console.log(`🔍 [${requestId}] Checking if shop_inventory exists for shop: ${shopId}, masterBrand: ${actualMasterBrandId}`);
    const existingInv = await dbService.findShopProduct(shopId, actualMasterBrandId);
    if (!existingInv) {
      console.log(`❌ [${requestId}] Shop inventory not found - cannot shift out non-existent inventory`);
      return res.status(400).json({ message: 'Product not found in shop inventory' });
    }
    console.log(`✅ [${requestId}] Shop inventory exists:`, {
      id: existingInv.id,
      currentQuantity: existingInv.current_quantity,
      finalPrice: existingInv.final_price
    });

    // ===== STOCK AVAILABILITY CHECK =====
    const quantityInt = parseInt(quantity);
    console.log(`📊 [${requestId}] Processing quantity:`, {
      quantity: quantityInt,
      isNegative: quantityInt < 0,
      isPositive: quantityInt > 0
    });
    
    if (quantityInt < 0) {
      console.log(`🔍 [${requestId}] Negative quantity detected, checking stock availability`);
      const available = await dbService.getAvailableStock(shopId, actualMasterBrandId, targetDate);
      const requestedQty = Math.abs(quantityInt);
      console.log(`📊 [${requestId}] Stock availability check:`, {
        available: available,
        requested: requestedQty,
        sufficient: available >= requestedQty
      });
      
      if (available < requestedQty) {
        console.log(`❌ [${requestId}] Insufficient stock:`, {
          available: available,
          requested: requestedQty,
          shortfall: requestedQty - available
        });
        return res.status(400).json({ message: `Insufficient stock. Available: ${available}, Requested: ${requestedQty}` });
      }
      console.log(`✅ [${requestId}] Stock availability check passed`);
    }

    // Get or create received stock record (supplier_code for TGBCL, supplier_shop_id for internal)
    const internalTransferFlag = supplierShopId !== null;
    let receivedStockRecord = await dbService.getReceivedStockRecord(
      shopId,
      actualMasterBrandId,
      targetDate,
      supplierCode || (isFromTGBCL ? 'TGBCL' : null),
      supplierShopId || null
    );

    if (!receivedStockRecord) {
      const isTgbclInvoiceIn = isFromTGBCL && shiftType === 'in';
      const initialInvoiceQty = isTgbclInvoiceIn ? Math.abs(parseInt(quantity)) : 0;
      const initialTransferQty = 0;

      receivedStockRecord = await dbService.createReceivedStockRecord({
        shopId,
        masterBrandId: actualMasterBrandId,
        recordDate: targetDate,
        invoiceQuantity: initialInvoiceQty,
        manualQuantity: 0,
        shiftTransferQuantity: initialTransferQty,
        createdBy: userId,
        supplierCode: supplierCode || (isFromTGBCL ? 'TGBCL' : null),
        supplierShopId: supplierShopId || null
      });
    }

    const currentShiftQuantity = receivedStockRecord.transfer_quantity || 0;
    const currentInvoiceQuantity = receivedStockRecord.invoice_quantity || 0;
    const isTgbclInvoiceIn = isFromTGBCL && shiftType === 'in';

    const updates = {};
    if (isTgbclInvoiceIn) {
      updates.invoiceQuantity = currentInvoiceQuantity + Math.abs(parseInt(quantity));
    } else {
      updates.shiftTransferQuantity = currentShiftQuantity + parseInt(quantity);
    }

    // ===== DESTINATION SHOP UPDATE (FIRST) =====
    if (shiftType === 'out') {
      console.log(`\n🔍 [${requestId}] ===== DESTINATION SHOP UPDATE =====`);
      try {
        let destShopId = null;
        console.log(`🔍 [${requestId}] Checking if destination is internal shop:`, {
          supplierShopId: supplierShopId,
          supplierName: supplierName
        });
        
        if (supplierShopId) {
          console.log(`🔍 [${requestId}] Looking up destination shop for supplierShopId: ${supplierShopId}`);
          const supplierResult = await pool.query(
            'SELECT shop_name, retailer_code FROM supplier_shops WHERE id = $1',
            [parseInt(supplierShopId)]
          );
          if (supplierResult.rows.length > 0) {
            const { shop_name, retailer_code } = supplierResult.rows[0];
            console.log(`🔍 [${requestId}] Found supplier info:`, {
              shop_name: shop_name,
              retailer_code: retailer_code
            });
            
            const shopResult = await pool.query(
              'SELECT id FROM shops WHERE shop_name = $1 AND retailer_code = $2',
              [shop_name, retailer_code]
            );
            if (shopResult.rows.length > 0) {
              destShopId = shopResult.rows[0].id;
              console.log(`✅ [${requestId}] Found destination shop ID: ${destShopId}`);
            } else {
              console.log(`❌ [${requestId}] No shop found for supplier: ${shop_name} (${retailer_code})`);
            }
          } else {
            console.log(`❌ [${requestId}] No supplier found for ID: ${supplierShopId}`);
          }
        }

        const isInternal = !!destShopId;
        console.log(`🔍 [${requestId}] Transfer type determination:`, {
          isInternal: isInternal,
          destShopId: destShopId,
          transferType: isInternal ? 'INTERNAL' : 'EXTERNAL'
        });
        
        if (isInternal) {
          console.log(`🏪 [${requestId}] Processing INTERNAL transfer to shop: ${destShopId}`);
          const absQty = Math.abs(parseInt(quantity));
          console.log(`📊 [${requestId}] Transfer quantity: ${absQty} (absolute value of ${quantity})`);

          // Ensure destination inventory exists
          try {
            const existingInvDest = await dbService.findShopProduct(destShopId, actualMasterBrandId);
            if (!existingInvDest) {
              let defaultFinalPrice = 0;
              try {
                const mrpRes2 = await pool.query('SELECT standard_mrp FROM master_brands WHERE id = $1', [actualMasterBrandId]);
                defaultFinalPrice = parseFloat(mrpRes2.rows[0]?.standard_mrp || 0) || 0;
              } catch (_) {}
              await dbService.addShopProduct({
                masterBrandId: actualMasterBrandId,
                shopId: destShopId,
                markupPrice: 0,
                finalPrice: defaultFinalPrice,
                currentQuantity: 0
              });
            }
          } catch (e) {
            console.warn('⚠️ Could not ensure destination shop_inventory for shift item:', e.message);
          }

          // Destination received_stock_records (transfer IN)
          let destRecord = await dbService.getReceivedStockRecord(
            destShopId,
            actualMasterBrandId,
            targetDate,
            null,
            shopId // source shop id as supplier_shop_id
          );

          if (!destRecord) {
            destRecord = await dbService.createReceivedStockRecord({
              shopId: destShopId,
              masterBrandId: actualMasterBrandId,
              recordDate: targetDate,
              invoiceQuantity: 0,
              manualQuantity: 0,
              shiftTransferQuantity: absQty,
              createdBy: userId,
              supplierCode: req.user.retailerCode,
              supplierShopId: shopId
            });
          } else {
            await dbService.updateReceivedStockQuantities(destRecord.id, { shiftTransferQuantity: absQty }, true);
          }

          // Update destination inventory
          try {
            await dbService.updateShopProductQuantity(destShopId, actualMasterBrandId, absQty);
          } catch (e) {
            console.error('❌ Could not update destination shop_inventory current_quantity:', e.message);
          }
        }
      } catch (e) {
        console.warn('⚠️ Shift Out internal transfer processing failed:', e.message);
      }
    }

    // ===== SOURCE SHOP UPDATE (LAST) =====
    console.log(`\n🔍 [${requestId}] ===== SOURCE SHOP UPDATE =====`);
    try {
      console.log(`🔄 [${requestId}] Updating source shop product quantity: ${quantityInt}`);
      await dbService.updateShopProductQuantity(shopId, actualMasterBrandId, quantityInt);
      console.log(`✅ [${requestId}] Source shop product quantity updated successfully`);
    } catch (e) {
      console.error(`❌ [${requestId}] Failed to update source shop_inventory current_quantity:`, {
        error: e.message,
        stack: e.stack,
        shopId: shopId,
        masterBrandId: actualMasterBrandId,
        quantity: quantity
      });
      return res.status(400).json({ message: 'Failed to update inventory. This may be due to insufficient stock or database constraint violation.' });
    }

    // Update source shop received_stock_records
    await dbService.updateReceivedStockQuantities(receivedStockRecord.id, updates, false);


    // ===== SHIFT IN → deduct from source if internal =====
    if (shiftType === 'in') {
      console.log(`\n🔍 [${requestId}] ===== SHIFT IN PROCESSING =====`);
      const internalTransfer = supplierShopId !== null;
      console.log(`🔍 [${requestId}] Shift IN analysis:`, {
        internalTransfer: internalTransfer,
        supplierShopId: supplierShopId,
        actualSourceShopId: actualSourceShopId,
        quantity: quantity
      });
      
      if (internalTransfer) {
        console.log(`🏪 [${requestId}] Processing INTERNAL transfer from source shop: ${actualSourceShopId}`);
        try {
          // Ensure source shop has the product
          console.log(`🔍 [${requestId}] Checking if source shop has the product`);
          const sourceInv = await dbService.findShopProduct(actualSourceShopId, actualMasterBrandId);
          if (!sourceInv) {
            console.log(`❌ [${requestId}] Source shop does not have this product:`, {
              sourceShopId: actualSourceShopId,
              masterBrandId: actualMasterBrandId
            });
            return res.status(400).json({ message: 'Source shop does not have this product' });
          }
          console.log(`✅ [${requestId}] Source shop has the product:`, {
            sourceInventoryId: sourceInv.id,
            currentQuantity: sourceInv.current_quantity
          });

          // Check available stock in source shop
          console.log(`🔍 [${requestId}] Checking available stock in source shop`);
          const sourceAvailable = await dbService.getAvailableStock(actualSourceShopId, actualMasterBrandId, targetDate);
          const requestedQty = Math.abs(quantity);
          console.log(`📊 [${requestId}] Source shop stock check:`, {
            sourceAvailable: sourceAvailable,
            requested: requestedQty,
            sufficient: sourceAvailable >= requestedQty
          });
          
          if (sourceAvailable < requestedQty) {
            console.log(`❌ [${requestId}] Insufficient stock in source shop:`, {
              available: sourceAvailable,
              requested: requestedQty,
              shortfall: requestedQty - sourceAvailable
            });
            return res.status(400).json({ message: `Insufficient stock in source shop. Available: ${sourceAvailable}, Requested: ${requestedQty}` });
          }
          console.log(`✅ [${requestId}] Source shop has sufficient stock`);

          // Deduct from source shop inventory
          console.log(`🔄 [${requestId}] Deducting ${requestedQty} from source shop inventory`);
          await dbService.updateShopProductQuantity(actualSourceShopId, actualMasterBrandId, -requestedQty);
          console.log(`✅ [${requestId}] Successfully deducted from source shop inventory`);

          // Create/Update transfer OUT record for source shop
          let sourceRecord = await dbService.getReceivedStockRecord(
            actualSourceShopId,
            actualMasterBrandId,
            targetDate,
            null,
            shopId // destination shop id
          );

          if (!sourceRecord) {
            await dbService.createReceivedStockRecord({
              shopId: actualSourceShopId,
              masterBrandId: actualMasterBrandId,
              recordDate: targetDate,
              supplierCode: req.user.retailerCode,
              supplierShopId: shopId,
              invoiceQuantity: 0,
              manualQuantity: 0,
              shiftTransferQuantity: -requestedQty,
              createdBy: userId
            });
          } else {
            const newQty = (sourceRecord.transfer_quantity || 0) - requestedQty;
            await dbService.updateReceivedStockQuantities(sourceRecord.id, { shiftTransferQuantity: newQty }, false);
          }
        } catch (e) {
          console.error('❌ Failed to process Shift IN from internal supplier:', e.message);
          return res.status(500).json({ message: 'Failed to process internal transfer' });
        }
      }
    }

    // Update today’s DSR price_per_unit from shop_inventory.final_price
    try {
      const inv = await pool.query(
        `SELECT id, final_price FROM shop_inventory WHERE shop_id = $1 AND master_brand_id = $2`,
        [shopId, actualMasterBrandId]
      );
      if (inv.rows.length > 0) {
        const shopInventoryId = inv.rows[0].id;
        const unitPrice = parseFloat(inv.rows[0].final_price || 0) || 0;
        await pool.query(
          `INSERT INTO daily_stock_records (shop_inventory_id, stock_date, opening_stock, received_stock, closing_stock, price_per_unit)
           VALUES ($1, $2, 0, 0, NULL, $3)
           ON CONFLICT (shop_inventory_id, stock_date)
           DO UPDATE SET price_per_unit = COALESCE(EXCLUDED.price_per_unit, daily_stock_records.price_per_unit)`,
          [shopInventoryId, targetDate, unitPrice]
        );
      }
    } catch (e) {
      console.warn('⚠️ Could not update price_per_unit for DSR:', e.message);
    }

    console.log(`\n🎉 [${requestId}] ===== SHIFT OPERATION COMPLETED SUCCESSFULLY =====`);
    console.log(`✅ [${requestId}] Final result:`, {
      shiftType: shiftType,
      quantity: parseInt(quantity),
      supplierName: supplierName,
      supplierCode: supplierCode || (isFromTGBCL ? 'TGBCL' : null),
      actualMasterBrandId: actualMasterBrandId
    });
    
    res.json({
      message: 'Stock shift completed successfully',
      shiftType,
      quantity: parseInt(quantity),
      supplierName,
      supplierCode: supplierCode || (isFromTGBCL ? 'TGBCL' : null)
    });
  } catch (error) {
    console.log(`\n❌ [${requestId}] ===== SHIFT OPERATION FAILED =====`);
    console.error(`💥 [${requestId}] Stock shift error:`, {
      error: error,
      message: error.message,
      stack: error.stack,
      requestId: requestId,
      shiftType: shiftType,
      quantity: quantity,
      supplierName: supplierName
    });
    res.status(500).json({ message: 'Server error during stock shift', error: error.message });
  }
});

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
        0,
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
        retailShopExciseTax: 0,
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
      retailShopExciseTax: 0,
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
      retailShopExciseTax: 0,
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
    
    // Check if this is a duplicate invoice error
    if (error.message && error.message.includes('has already been processed for this shop')) {
      return res.status(409).json({ 
        success: false,
        message: 'This invoice has already been processed.',
        code: 'INVOICE_ALREADY_PROCESSED',
        details: 'Each invoice can only be confirmed once per shop. If you need to reprocess this invoice, please contact support.'
      });
    }
    
    // Generic error handling for other issues
    res.status(500).json({ 
      success: false,
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

// Search brands endpoint for indent estimate
app.get('/api/search-brands', authenticateToken, async (req, res) => {
  try {
    const { q } = req.query;
    const query = (q || '').trim();
    
    if (!query || query.length < 1) {
      return res.json({ brands: [] });
    }
    
    const searchTerm = query;
    const databaseService = require('./databaseService');
    
    // Use DatabaseService method for searching
    const brands = await databaseService.searchMasterBrands(searchTerm, 20);
    
    res.json({ brands });
  } catch (error) {
    console.error('Error searching brands:', error);
    res.status(500).json({ error: 'Failed to search brands' });
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
    const { date, search, shopId: queryShopId } = req.query;
    const targetDate = date || getBusinessDate();
    const targetShopId = queryShopId ? parseInt(queryShopId) : shopId;
    
    console.log(`📊 Fetching products for shop ${targetShopId} on date ${targetDate}${search ? ` with search: "${search}"` : ''}`);
    
    // Initialize today's stock records if they don't exist (only for current user's shop)
    const initializedCount = await dbService.initializeTodayStock(shopId, targetDate);
    console.log(`📦 Initialized ${initializedCount} stock records for today`);
    
    const rawProducts = await dbService.getShopProducts(targetShopId, targetDate);
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
    
    // Apply search filter if provided
    let filteredProducts = aggregatedProducts;
    if (search && search.trim().length > 0) {
      const searchTerm = search.trim().toLowerCase();
      filteredProducts = aggregatedProducts.filter(product => {
        const brandName = (product.brand_name || product.name || '').toLowerCase();
        const brandNumber = (product.brand_number || product.brandNumber || '').toString();
        return brandName.includes(searchTerm) || brandNumber.includes(searchTerm);
      });
      console.log(`🔍 Search "${search}" filtered to ${filteredProducts.length} products`);
    }
    
    // Debug: Log first few products to see their structure
    if (filteredProducts.length > 0) {
      console.log('📋 Sample filtered product:', JSON.stringify(filteredProducts[0], null, 2));
      console.log('📋 Total sales value:', filteredProducts.reduce((sum, p) => sum + ((p.totalStock || 0) - (p.closingStock || p.totalStock || 0)) * (p.finalPrice || 0), 0));
    }
    
    // Check if closing stock is already saved
    const closingStockStatus = await dbService.isClosingStockSaved(shopId, targetDate);
    
    res.json({
      products: filteredProducts,
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
// Income Categories
app.get('/api/income-expenses/income-categories', authenticateToken, async (req, res) => {
  try {
    const shopId = parseInt(req.user.shopId);
    if (!shopId) return res.status(400).json({ message: 'Shop ID not found in token' });
    const categories = await dbService.getIncomeCategories(shopId);
    res.json(categories);
  } catch (error) {
    console.error('Error fetching income categories:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/income-expenses/income-categories', authenticateToken, async (req, res) => {
  try {
    const shopId = parseInt(req.user.shopId);
    const { name } = req.body;
    if (!shopId) return res.status(400).json({ message: 'Shop ID not found in token' });
    if (!name || !name.trim()) return res.status(400).json({ message: 'Category name is required' });

    const categories = await dbService.addIncomeCategory(shopId, name);
    res.status(201).json({ message: 'Category added', categories });
  } catch (error) {
    console.error('Error adding income category:', error);
    res.status(400).json({ message: error.message });
  }
});

app.delete('/api/income-expenses/income-categories', authenticateToken, async (req, res) => {
  try {
    const shopId = parseInt(req.user.shopId);
    const { name } = req.body;
    if (!shopId) return res.status(400).json({ message: 'Shop ID not found in token' });
    if (!name || !name.trim()) return res.status(400).json({ message: 'Category name is required' });

    const categories = await dbService.deleteIncomeCategory(shopId, name);
    res.json({ message: 'Category deleted', categories });
  } catch (error) {
    console.error('Error deleting income category:', error);
    res.status(400).json({ message: error.message });
  }
});
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

// Sales Report (aggregated using dsr.sales)
app.get('/api/reports/sales', authenticateToken, async (req, res) => {
  try {
    const shopId = parseInt(req.user.shopId);
    const { startDate, endDate } = req.query;
    const s = startDate || getBusinessDate();
    const e = endDate || s;

    const rows = await dbService.getAggregatedSalesByBrand(shopId, s, e);
    res.json({ rows, startDate: s, endDate: e });
  } catch (error) {
    console.error('Error getting sales report:', error);
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

// (duplicate /api/search-brands route removed; the canonical one above returns { brands: [...] })

// ===============================================
// USER SHOPS ENDPOINT (for multi-shop suppliers)
// ===============================================

// Get all shops belonging to the current user
app.get('/api/user-shops', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.user.userId);
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID not found in token' });
    }
    
    console.log(`📋 Getting all shops for user ${userId}`);
    
    const result = await pool.query(`
      SELECT 
        id,
        shop_name,
        retailer_code,
        address,
        license_number,
        created_at
      FROM shops 
      WHERE user_id = $1 
      ORDER BY shop_name ASC
    `, [userId]);
    
    console.log(`📊 Found ${result.rows.length} shops for user ${userId}:`, result.rows.map(shop => ({
      id: shop.id,
      shop_name: shop.shop_name,
      retailer_code: shop.retailer_code
    })));
    
    res.json({
      shops: result.rows,
      totalCount: result.rows.length
    });
    
  } catch (error) {
    console.error('Error getting user shops:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Debug endpoint to check user shops data
app.get('/api/debug/user-shops', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.user.userId);
    const shopId = parseInt(req.user.shopId);
    
    console.log(`🔍 Debug - User ID: ${userId}, Current Shop ID: ${shopId}`);
    
    const result = await pool.query(`
      SELECT 
        id,
        user_id,
        shop_name,
        retailer_code,
        address,
        license_number,
        created_at
      FROM shops 
      WHERE user_id = $1 
      ORDER BY shop_name ASC
    `, [userId]);
    
    res.json({
      userId: userId,
      currentShopId: shopId,
      allUserShops: result.rows,
      otherShops: result.rows.filter(shop => shop.id !== shopId)
    });
    
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ===============================================
// SUPPLIER SHOPS MANAGEMENT ENDPOINTS
// ===============================================

// Get all supplier shops for a shop
app.get('/api/supplier-shops', authenticateToken, async (req, res) => {
  try {
    const shopId = parseInt(req.user.shopId);
    
    if (!shopId) {
      return res.status(400).json({ message: 'Shop ID not found in token' });
    }
    
    console.log(`📋 Getting supplier shops for shop ${shopId}`);
    
    const result = await pool.query(`
      SELECT 
        id,
        shop_name,
        retailer_code,
        contact,
        created_at
      FROM supplier_shops 
      WHERE shop_id = $1 
      ORDER BY shop_name ASC
    `, [shopId]);
    
    res.json({
      shops: result.rows,
      totalCount: result.rows.length
    });
    
  } catch (error) {
    console.error('Error getting supplier shops:', error);
    // Return empty array if table doesn't exist yet
    res.json({
      shops: [],
      totalCount: 0
    });
  }
});

// Add new supplier shop
app.post('/api/supplier-shops', authenticateToken, async (req, res) => {
  try {
    const shopId = parseInt(req.user.shopId);
    const { shopName, retailerCode, contact } = req.body;
    
    if (!shopId) {
      return res.status(400).json({ message: 'Shop ID not found in token' });
    }
    
    if (!shopName || !retailerCode || !contact) {
      return res.status(400).json({ 
        message: 'Shop name, retailer code, and contact are required' 
      });
    }
    
    if (retailerCode.length !== 7 || !/^\d{7}$/.test(retailerCode)) {
      return res.status(400).json({ 
        message: 'Retailer code must be exactly 7 digits' 
      });
    }
    
    if (contact.length !== 10 || !/^\d{10}$/.test(contact)) {
      return res.status(400).json({ 
        message: 'Contact must be exactly 10 digits' 
      });
    }
    
    console.log(`➕ Adding supplier shop for shop ${shopId}: ${shopName}`);
    
    // Create supplier_shops table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS supplier_shops (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
        shop_name VARCHAR(255) NOT NULL,
        retailer_code VARCHAR(7) NOT NULL CHECK (retailer_code ~ '^\\d{7}$'),
        contact VARCHAR(10) NOT NULL CHECK (contact ~ '^\\d{10}$'),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(shop_id, shop_name),
        UNIQUE(shop_id, retailer_code)
      )
    `);
    
    // Check if supplier shop name already exists for this shop
    const existingShop = await pool.query(
      'SELECT id FROM supplier_shops WHERE shop_id = $1 AND (shop_name = $2 OR retailer_code = $3)',
      [shopId, shopName.trim(), retailerCode]
    );
    
    if (existingShop.rows.length > 0) {
      return res.status(400).json({ 
        message: 'A supplier shop with this name or retailer code already exists' 
      });
    }
    
    const result = await pool.query(`
      INSERT INTO supplier_shops (shop_id, shop_name, retailer_code, contact)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [shopId, shopName.trim(), retailerCode, contact]);
    
    console.log(`✅ Supplier shop added successfully: ${result.rows[0].shop_name}`);
    
    res.status(201).json({
      message: 'Supplier shop added successfully',
      shop: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error adding supplier shop:', error);
    
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ 
        message: 'A supplier shop with this name or retailer code already exists' 
      });
    }
    
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete supplier shop
app.delete('/api/supplier-shops/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const shopId = parseInt(req.user.shopId);
    
    if (!shopId) {
      return res.status(400).json({ message: 'Shop ID not found in token' });
    }
    
    console.log(`🗑️ Deleting supplier shop ${id} for shop ${shopId}`);
    
    const result = await pool.query(`
      DELETE FROM supplier_shops 
      WHERE id = $1 AND shop_id = $2
      RETURNING shop_name
    `, [id, shopId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        message: 'Supplier shop not found or not authorized' 
      });
    }
    
    console.log(`✅ Supplier shop deleted successfully: ${result.rows[0].shop_name}`);
    
    res.json({
      message: 'Supplier shop deleted successfully',
      deletedShop: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error deleting supplier shop:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get suppliers from suppliers table
app.get('/api/suppliers', authenticateToken, async (req, res) => {
  try {
    const shopId = parseInt(req.user.shopId);
    
    if (!shopId) {
      return res.status(400).json({ message: 'Shop ID not found in token' });
    }
    
    console.log(`📋 Getting suppliers for shop ${shopId}`);
    
    const result = await pool.query(`
      SELECT 
        id,
        name,
        contact_person,
        phone,
        email,
        address,
        license_number,
        gst_number,
        supplier_type,
        is_active,
        notes,
        created_at,
        updated_at
      FROM suppliers 
      WHERE shop_id = $1 AND is_active = true
      ORDER BY name ASC
    `, [shopId]);
    
    res.json({
      suppliers: result.rows,
      totalCount: result.rows.length
    });
    
  } catch (error) {
    console.error('Error getting suppliers:', error);
    // Return empty array if table doesn't exist yet
    res.json({
      suppliers: [],
      totalCount: 0
    });
  }
});

// Check if a supplier is internal or external
app.get('/api/check-supplier-type', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.user.userId);
    const { supplierId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID not found in token' });
    }
    
    if (!supplierId) {
      return res.status(400).json({ message: 'Supplier ID is required' });
    }
    
    console.log(`🔍 Checking supplier type for supplier ID: ${supplierId}, user ID: ${userId}`);
    
    // Get supplier details from supplier_shops table
    const supplierResult = await pool.query(`
      SELECT 
        id,
        shop_name,
        retailer_code,
        shop_id
      FROM supplier_shops 
      WHERE id = $1
    `, [supplierId]);
    
    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ message: 'Supplier not found' });
    }
    
    const supplier = supplierResult.rows[0];
    
    // Check if this supplier's retailer_code exists in shops table for the same user
    const shopResult = await pool.query(`
      SELECT 
        id,
        shop_name,
        retailer_code,
        user_id
      FROM shops 
      WHERE retailer_code = $1 AND user_id = $2
    `, [supplier.retailer_code, userId]);
    
    const isInternal = shopResult.rows.length > 0;
    const shopInfo = isInternal ? shopResult.rows[0] : null;
    
    console.log(`🔍 Supplier ${supplierId} (${supplier.shop_name}) is ${isInternal ? 'internal' : 'external'}`);
    
    res.json({
      supplierId: parseInt(supplierId),
      supplierName: supplier.shop_name,
      retailerCode: supplier.retailer_code,
      isInternal: isInternal,
      shopInfo: shopInfo
    });
    
  } catch (error) {
    console.error('Error checking supplier type:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ===== STOCK TRANSFER HISTORY ENDPOINTS =====

// Get stock shifted in (received from other shops)
app.get('/api/stock-transfers/shifted-in', authenticateToken, async (req, res) => {
  try {
    const { date } = req.query;
    const shopId = parseInt(req.user.shopId);
    
    if (!shopId) {
      return res.status(400).json({ message: 'Shop ID not found in token' });
    }

    console.log(`📥 Fetching stock shifted in for shop ${shopId}, date: ${date || 'all'}`);

    let query = `
      SELECT 
        rsr.id,
        rsr.created_at,
        rsr.record_date,
        rsr.transfer_quantity as quantity,
        rsr.supplier_code,
        rsr.supplier_shop_id,
        mb.brand_name,
        mb.brand_number,
        mb.size_code,
        mb.size_ml,
        mb.pack_quantity,
        mb.standard_mrp as final_price,
        ss.shop_name as supplier_name,
        ss.retailer_code as supplier_retailer_code
      FROM received_stock_records rsr
      JOIN master_brands mb ON rsr.master_brand_id = mb.id
      LEFT JOIN supplier_shops ss ON rsr.supplier_shop_id = ss.id
      WHERE rsr.shop_id = $1 AND rsr.transfer_quantity > 0
    `;
    
    const params = [shopId];
    
    if (date) {
      query += ` AND (DATE(rsr.record_date) = $2 OR DATE(rsr.created_at) = $2)`;
      params.push(date);
    }
    
    query += ` ORDER BY rsr.created_at DESC`;

    console.log(`🔍 Query: ${query}`);
    console.log(`🔍 Params:`, params);

    const result = await pool.query(query, params);
    
    console.log(`📊 Found ${result.rows.length} transfer records`);
    
    const transfers = result.rows.map((row, index) => ({
      serialNo: index + 1,
      brandName: row.brand_name,
      brandNumber: row.brand_number,
      sizeCode: row.size_code,
      sizeMl: row.size_ml,
      packQuantity: row.pack_quantity,
      quantity: row.quantity,
      price: row.final_price,
      supplierName: row.supplier_name || 'Unknown',
      supplierCode: row.supplier_retailer_code || 'N/A',
      transferDate: row.record_date || row.created_at
    }));

    res.json({ transfers });
  } catch (error) {
    console.error('Error fetching stock shifted in:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get stock shifted out (sent to other shops)
app.get('/api/stock-transfers/shifted-out', authenticateToken, async (req, res) => {
  try {
    const { date } = req.query;
    const shopId = parseInt(req.user.shopId);
    
    if (!shopId) {
      return res.status(400).json({ message: 'Shop ID not found in token' });
    }

    console.log(`📤 Fetching stock shifted out for shop ${shopId}, date: ${date || 'all'}`);

    let query = `
      SELECT 
        rsr.id,
        rsr.created_at,
        rsr.record_date,
        rsr.transfer_quantity as quantity,
        rsr.supplier_code,
        rsr.supplier_shop_id,
        mb.brand_name,
        mb.brand_number,
        mb.size_code,
        mb.size_ml,
        mb.pack_quantity,
        mb.standard_mrp as final_price,
        ss.shop_name as supplier_name,
        ss.retailer_code as supplier_retailer_code
      FROM received_stock_records rsr
      JOIN master_brands mb ON rsr.master_brand_id = mb.id
      LEFT JOIN supplier_shops ss ON rsr.supplier_shop_id = ss.id
      WHERE rsr.shop_id = $1 AND rsr.transfer_quantity < 0
    `;
    
    const params = [shopId];
    
    if (date) {
      query += ` AND (DATE(rsr.record_date) = $2 OR DATE(rsr.created_at) = $2)`;
      params.push(date);
    }
    
    query += ` ORDER BY rsr.created_at DESC`;

    console.log(`🔍 Query: ${query}`);
    console.log(`🔍 Params:`, params);

    const result = await pool.query(query, params);
    
    console.log(`📊 Found ${result.rows.length} transfer records`);
    
    const transfers = result.rows.map((row, index) => ({
      serialNo: index + 1,
      brandName: row.brand_name,
      brandNumber: row.brand_number,
      sizeCode: row.size_code,
      sizeMl: row.size_ml,
      packQuantity: row.pack_quantity,
      quantity: Math.abs(row.quantity), // Make positive for display
      price: row.final_price,
      supplierName: row.supplier_name || 'Unknown',
      supplierCode: row.supplier_retailer_code || 'N/A',
      transferDate: row.record_date || row.created_at
    }));

    res.json({ transfers });
  } catch (error) {
    console.error('Error fetching stock shifted out:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
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
