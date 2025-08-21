const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const masterBrandsData = require('./data/masterBrands.json');

// Import the enhanced invoice parser
const HybridInvoiceParser = require('./invoiceParser');
const invoiceParser = new HybridInvoiceParser();

// Add these helper functions
const formatSize = (sizeCode, size) => {
  if (sizeCode && size) {
    return `${size}${sizeCode}`;
  }
  return size || '';
};

const saveData = (data) => {
  console.log('Data updated in memory');
  // TODO: Implement database persistence
};

const app = express();
const PORT = process.env.PORT || 3001;

const JWT_SECRET = process.env.JWT_SECRET || 'your-wine-shop-secret-key-2024';

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://wine-shop-inventory.vercel.app',
    'https://wine-shop-inventory-gbaha94u9-nkstories0-5188s-projects.vercel.app'
  ],
  credentials: true
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
const { connectDB, initializeTables, pool } = require('./database');
// Declare appData
let appData = {};

const generateId = () => Date.now().toString();

// Enhanced function to get previous closing stock with better gap handling
const getPreviousDayClosingStock = (userId, currentDate, brandNumber, size) => {
  const currentDateObj = new Date(currentDate);
  
  // Find ALL records for this product before the current date
  const productRecords = appData.dailyStockRecords
    .filter(r => 
      r.userId === userId && 
      r.brandNumber === brandNumber && 
      r.size === size &&
      new Date(r.date) < currentDateObj
    )
    .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by date descending
  
  // Return the most recent closing stock, regardless of date gaps
  if (productRecords.length > 0) {
    return productRecords[0].closingStock;
  }
  
  return 0;
};

// Validate stock continuity to detect issues
const validateStockContinuity = (userId, date) => {
  const records = appData.dailyStockRecords.filter(r => 
    r.userId === userId && r.date === date
  );
  
  const warnings = [];
  
  records.forEach(record => {
    const expectedOpeningStock = getPreviousDayClosingStock(
      userId, 
      date, 
      record.brandNumber, 
      record.size
    );
    
    if (record.openingStock !== expectedOpeningStock && expectedOpeningStock > 0) {
      warnings.push({
        product: `${record.brandNumber} - ${record.size}`,
        expected: expectedOpeningStock,
        actual: record.openingStock,
        date: date
      });
    }
  });
  
  return warnings;
};

// Helper function to ensure dailyStockRecord exists for every shopInventory product
const ensureDailyStockRecord = (userId, date, product) => {
  const formattedSize = formatSize(product.sizeCode, product.size);
  
  let record = appData.dailyStockRecords.find(r => 
    r.userId === userId && 
    r.date === date && 
    r.brandNumber === product.brandNumber && 
    r.size === formattedSize
  );
  
  if (!record) {
    const openingStock = getPreviousDayClosingStock(userId, date, product.brandNumber, formattedSize);
    
    record = {
      id: generateId(),
      userId,
      date,
      brandNumber: product.brandNumber,
      brandName: product.name,
      size: formattedSize,
      openingStock: openingStock,
      received: 0,
      total: openingStock,
      closingStock: openingStock,
      sale: 0,
      price: product.finalPrice,
      saleAmount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    appData.dailyStockRecords.push(record);
  }
  
  return record;
};

// Helper function to create or update daily stock record
const createOrUpdateDailyStockRecord = (userId, date, brandNumber, brandName, size, price, received = 0, closingStock = null) => {
  
  let record = appData.dailyStockRecords.find(r => 
    r.userId === userId && 
    r.date === date && 
    r.brandNumber === brandNumber && 
    r.size === size
  );
  
  if (!record) {
    // Get previous day's closing stock as opening stock
    const openingStock = getPreviousDayClosingStock(userId, date, brandNumber, size);
    
    record = {
      id: generateId(),
      userId,
      date,
      brandNumber,
      brandName,
      size,
      openingStock: openingStock,
      received: 0,
      total: 0,
      closingStock: 0,
      sale: 0,
      price,
      saleAmount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    appData.dailyStockRecords.push(record);
  }
  
  // Update values
  if (received !== 0) record.received += received;
  if (closingStock !== null) {
    // Validate closing stock
    if (closingStock > record.total && record.total > 0) {
      record.closingStock = record.total; // Cap at total
    } else {
      record.closingStock = closingStock;
    }
  }
  if (price !== 0) record.price = price;
  
  // Recalculate derived fields
  record.total = record.openingStock + record.received;
  
  // If closing stock not manually set, it equals total (no sales)
  if (closingStock === null) {
    record.closingStock = record.total;
  }
  
  // Sales = Total - Closing Stock
  record.sale = record.total - record.closingStock;
  record.saleAmount = record.sale * record.price;
  record.updatedAt = new Date();
  
  return record;
};

// ===== INVOICE UPLOAD & PARSING ENDPOINTS =====

// Parse uploaded invoice PDF
app.post('/api/invoice/upload', authenticateToken, upload.single('invoice'), async (req, res) => {
  try {
    console.log('\n🚀 Invoice upload started...');
    
    if (!req.file) {
      return res.status(400).json({ message: 'No PDF file uploaded' });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ message: 'Only PDF files are allowed' });
    }
    

    console.log(`📄 Processing PDF: ${req.file.originalname} (${req.file.size} bytes)`);

    // Parse the PDF using your hybrid parser with masterBrands validation
    const parseResult = await invoiceParser.parseInvoiceWithValidation(
      req.file.buffer, 
      masterBrandsData // Your loaded masterBrands.json
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

    // Return the parsed and validated data
    res.json({
      message: 'Invoice parsed successfully',
      confidence: parseResult.confidence,
      method: parseResult.method,
      invoiceNumber: parseResult.data.invoiceNumber,
      date: parseResult.data.date,
      totalAmount: parseResult.data.totalAmount,
      netInvoiceValue: parseResult.data.netInvoiceValue,
      retailExciseTax: parseResult.data.retailExciseTax,
      specialExciseCess: parseResult.data.specialExciseCess,
      tcs: parseResult.data.tcs,
      items: parseResult.data.items, // Only validated items
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
    
    const { invoiceData } = req.body;
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];

    if (!invoiceData || !invoiceData.items || invoiceData.items.length === 0) {
      return res.status(400).json({ message: 'No invoice data or items provided' });
    }

    console.log(`👤 User: ${userId}`);
    console.log(`📅 Date: ${today}`);
    console.log(`📦 Items to process: ${invoiceData.items.length}`);

    let updatedCount = 0;
    let addedToInventory = 0;
    const processedItems = [];
    const errors = [];

    // Process each validated item
    for (const item of invoiceData.items) {
      try {
        console.log(`\n📄 Processing: ${item.brandNumber} ${item.size} (Qty: ${item.totalQuantity})`);

        // Check if product exists in shop inventory
        let shopProduct = appData.shopInventory.find(product => 
          product.userId === userId && 
          product.brandNumber === item.brandNumber &&
          formatSize(product.sizeCode, product.size) === item.formattedSize
        );

        // If not in inventory, add it (using masterBrand data)
        if (!shopProduct) {
          console.log(`➕ Adding new product to inventory: ${item.brandNumber}`);
          
          const newShopProduct = {
            id: generateId(),
            masterBrandId: item.masterBrandId,
            name: item.description,
            brandNumber: item.brandNumber,
            category: item.category,
            packQuantity: item.packQty || 1,
            size: item.size.replace('ml', ''),
            sizeCode: item.sizeCode,
            mrp: item.mrp,
            shopMarkup: 0, // Default markup
            finalPrice: item.mrp, // Can be updated later
            userId,
            createdAt: new Date()
          };
          
          appData.shopInventory.push(newShopProduct);
          shopProduct = newShopProduct;
          addedToInventory++;
        }

        // Create or update daily stock record for received quantity
        const stockRecord = createOrUpdateDailyStockRecord(
          userId,
          today,
          item.brandNumber,
          item.description,
          item.formattedSize,
          shopProduct.finalPrice,
          item.totalQuantity, // received quantity
          null // let closing stock auto-calculate
        );

        updatedCount++;
        processedItems.push({
          brandNumber: item.brandNumber,
          description: item.description,
          size: item.formattedSize,
          receivedQuantity: item.totalQuantity,
          newTotal: stockRecord.total,
          newClosing: stockRecord.closingStock
        });

        console.log(`✅ Updated: ${item.brandNumber} - Received: ${item.totalQuantity}, Total: ${stockRecord.total}`);

      } catch (itemError) {
        console.error(`❌ Error processing item ${item.brandNumber}:`, itemError);
        errors.push({
          brandNumber: item.brandNumber,
          error: itemError.message
        });
      }
    }

    // Save the invoice record for future reference
    const invoiceRecord = {
      id: generateId(),
      userId,
      invoiceNumber: invoiceData.invoiceNumber,
      date: invoiceData.date,
      uploadDate: today,
      totalValue: invoiceData.totalAmount,
      netInvoiceValue: invoiceData.netInvoiceValue,
      retailExciseTax: invoiceData.retailExciseTax,
      specialExciseCess: invoiceData.specialExciseCess,
      tcs: invoiceData.tcs,
      itemsCount: invoiceData.items.length,
      processedItemsCount: updatedCount,
      createdAt: new Date()
    };

    appData.invoice.push(invoiceRecord);

    // Save all changes
    saveData(appData);

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
        invoiceNumber: invoiceRecord.invoiceNumber,
        totalValue: invoiceRecord.totalValue,
        date: invoiceRecord.date
      }
    });

  } catch (error) {
    console.error('❌ Invoice confirmation error:', error);
    res.status(500).json({ 
      message: 'Server error during invoice confirmation', 
      error: error.message 
    });
  }
});

// Optional: Get invoice history
app.get('/api/invoices', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    
    const userInvoices = appData.invoice
      .filter(invoice => invoice.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      invoices: userInvoices,
      totalCount: userInvoices.length,
      totalValue: userInvoices.reduce((sum, inv) => sum + (inv.totalValue || 0), 0)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Auth endpoints
app.post('/api/login', async (req, res) => {
 try {
   const { email, password } = req.body;
   
   const user = appData.users.find(u => u.email === email);
   if (!user) {
     return res.status(400).json({ message: 'Invalid credentials' });
   }
   
   const isValidPassword = await bcrypt.compare(password, user.password);
   if (!isValidPassword) {
     return res.status(400).json({ message: 'Invalid credentials' });
   }
   
   const token = jwt.sign(
     { 
       userId: user.id, 
       email: user.email,
       shopName: user.shopName 
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
       shopName: user.shopName 
     }
   });
 } catch (error) {
   res.status(500).json({ message: 'Server error' });
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
    const { name, email, password, shopName } = req.body;
    
    // Validation
    if (!name || !email || !password || !shopName) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    // Check if user already exists
    const existingUser = appData.users.find(u => u.email === email);
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    
    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Create new user
    const newUser = {
      id: generateId(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      shopName: shopName.trim(),
      createdAt: new Date()
    };
    
    // Add to users array
    appData.users.push(newUser);
    
    // Save data
    saveData(appData);
    
    res.status(201).json({ 
      message: 'User registered successfully',
      user: { 
        id: newUser.id, 
        name: newUser.name, 
        email: newUser.email, 
        shopName: newUser.shopName 
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Enhanced stock initialization with auto-recovery
app.post('/api/stock/initialize-today', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];
    
    // Check if we already have records for today
    const todayRecords = appData.dailyStockRecords.filter(record => 
      record.userId === userId && record.date === today
    );
    
    if (todayRecords.length > 0) {
      // Check if existing records have issues and fix them
      let recordsFixed = 0;
      const fixedRecords = [];
      
      todayRecords.forEach(record => {
        const correctOpeningStock = getPreviousDayClosingStock(
          userId, 
          today, 
          record.brandNumber, 
          record.size
        );
        
        // Fix if opening stock is wrong or if everything is 0 when it shouldn't be
        if ((correctOpeningStock > 0 && record.openingStock === 0) || 
            (record.openingStock !== correctOpeningStock && correctOpeningStock > 0)) {
          
          record.openingStock = correctOpeningStock;
          record.total = correctOpeningStock + record.received;
          
          // Only update closing if it was 0 or less than opening
          if (record.closingStock === 0 && record.received === 0) {
            record.closingStock = record.total;
          }
          
          record.sale = record.total - record.closingStock;
          record.saleAmount = record.sale * record.price;
          record.updatedAt = new Date();
          
          recordsFixed++;
          fixedRecords.push({
            product: `${record.brandNumber} - ${record.size}`,
            oldOpening: 0,
            newOpening: correctOpeningStock,
            closingStock: record.closingStock
          });
        }
      });
      
      if (recordsFixed > 0) {
        saveData(appData);
        return res.json({ 
          message: 'Fixed existing records with continuity issues',
          recordsFixed,
          details: fixedRecords
        });
      }
      
      // Validate continuity
      const warnings = validateStockContinuity(userId, today);
      
      return res.json({ 
        message: 'Records already exist for today',
        recordsCount: todayRecords.length,
        continuityWarnings: warnings
      });
    }
    
    // Get all products in shop inventory
    const shopProducts = appData.shopInventory.filter(product => 
      product.userId === userId
    );
    
    if (shopProducts.length === 0) {
      return res.json({ 
        message: 'No products in inventory',
        recordsCount: 0 
      });
    }
    
    let recordsCreated = 0;
    const createdRecords = [];
    
    // For each product in inventory, create today's record with proper stock continuity
    shopProducts.forEach(product => {
      const formattedSize = formatSize(product.sizeCode, product.size);
      
      // Get the most recent closing stock (handles date gaps properly)
      const openingStock = getPreviousDayClosingStock(
        userId, 
        today, 
        product.brandNumber, 
        formattedSize
      );
      
      // Create today's record with carried forward opening stock
      const newRecord = {
        id: generateId(),
        userId,
        date: today,
        brandNumber: product.brandNumber,
        brandName: product.name,
        size: formattedSize,
        openingStock: openingStock,  // Properly carried forward
        received: 0,
        total: openingStock,
        closingStock: openingStock,  // Initially same as opening (no sales yet)
        sale: 0,
        price: product.finalPrice,
        saleAmount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      appData.dailyStockRecords.push(newRecord);
      recordsCreated++;
      
      createdRecords.push({
        product: `${product.brandNumber} - ${product.name}`,
        size: formattedSize,
        openingStock: openingStock,
        closingStock: openingStock
      });
    });
    
    // Save the updated data
    saveData(appData);
    
    // Validate the newly created records
    const warnings = validateStockContinuity(userId, today);
    
    res.json({
      message: 'Stock records initialized for today with proper continuity',
      date: today,
      recordsCreated: recordsCreated,
      recordsWithStock: createdRecords.filter(r => r.openingStock > 0).length,
      continuityWarnings: warnings,
      details: createdRecords
    });
    
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Master brands endpoint
app.get('/api/master-brands', authenticateToken, (req, res) => {
 res.json(appData.masterBrands);
});

// Shop product management
app.post('/api/shop/add-product', authenticateToken, (req, res) => {
 try {
   const { masterBrandId, quantity, shopMarkup = 0 } = req.body;
   const userId = req.user.userId;
   const today = new Date().toISOString().split('T')[0];
   
   const masterBrand = appData.masterBrands.find(brand => brand.id === parseInt(masterBrandId));
   if (!masterBrand) {
     return res.status(404).json({ message: 'Brand not found in master database' });
   }
   
   const finalPrice = masterBrand.mrp + parseFloat(shopMarkup);
   const formattedSize = formatSize(masterBrand.sizeCode, masterBrand.size);
   
   const existingProduct = appData.shopInventory.find(item => 
     item.userId === userId && item.masterBrandId === masterBrandId
   );
   
   if (!existingProduct) {
     const newShopProduct = {
       id: generateId(),
       masterBrandId: masterBrand.id,
       name: masterBrand.name,
       brandNumber: masterBrand.brandNumber,
       category: masterBrand.category,
       packQuantity: masterBrand.packQuantity,
       size: masterBrand.size,
       sizeCode: masterBrand.sizeCode,
       mrp: masterBrand.mrp,
       shopMarkup: parseFloat(shopMarkup),
       finalPrice: finalPrice,
       userId,
       createdAt: new Date()
     };
     
     appData.shopInventory.push(newShopProduct);
   }
   
   createOrUpdateDailyStockRecord(
     userId,
     today,
     masterBrand.brandNumber,
     masterBrand.name,
     formattedSize,
     finalPrice,
     parseInt(quantity),
     null
   );
   
   saveData(appData);
   
   res.status(201).json({ 
     message: 'received quantity updated',
     brandNumber: masterBrand.brandNumber,
     receivedQuantity: parseInt(quantity)
   });
 } catch (error) {
   res.status(500).json({ message: 'Server error' });
 }
});

app.put('/api/shop/update-sort-order', authenticateToken, (req, res) => {
  try {
    const { sortedBrandGroups } = req.body;
    const userId = req.user.userId;
    
    let sortOrder = 1;
    
    sortedBrandGroups.forEach(brandNumber => {
      const brandProducts = appData.shopInventory.filter(product => 
        product.userId === userId && product.brandNumber === brandNumber
      );
      
      brandProducts.forEach(product => {
        const productIndex = appData.shopInventory.findIndex(p => p.id === product.id);
        if (productIndex !== -1) {
          appData.shopInventory[productIndex].sortOrder = sortOrder;
          sortOrder++;
        }
      });
    });
    
    saveData(appData);
    
    res.json({ 
      message: 'Sort order updated successfully'
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/shop/products', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const baseProducts = appData.shopInventory.filter(product => product.userId === userId);
    
    baseProducts.forEach(product => {
      ensureDailyStockRecord(userId, targetDate, product);
    });
    
    const productsWithQuantities = baseProducts.map(product => {
      const formattedSize = formatSize(product.sizeCode, product.size);
      
      const stockRecord = appData.dailyStockRecords.find(record => 
        record.userId === userId &&
        record.date === targetDate &&
        record.brandNumber === product.brandNumber &&
        record.size === formattedSize
      );
      
      return {
        ...product,
        quantity: stockRecord ? stockRecord.closingStock : 0
      };
    });
    
    productsWithQuantities.sort((a, b) => {
      if (a.sortOrder && b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.brandNumber && b.brandNumber ? a.brandNumber.localeCompare(b.brandNumber) : 0;
    });
    
    res.json(productsWithQuantities);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/shop/update-product/:id', authenticateToken, (req, res) => {
 try {
   const { id } = req.params;
   const { quantity, finalPrice } = req.body;
   const userId = req.user.userId;
   const today = new Date().toISOString().split('T')[0];
   
   const productIndex = appData.shopInventory.findIndex(product => 
     product.id === id && product.userId === userId
   );
   
   if (productIndex === -1) {
     return res.status(404).json({ message: 'Product not found' });
   }
   
   const product = appData.shopInventory[productIndex];
   
   if (finalPrice) {
     product.finalPrice = parseFloat(finalPrice);
     product.shopMarkup = parseFloat(finalPrice) - product.mrp;
   }
   
   if (quantity !== undefined) {
     const formattedSize = formatSize(product.sizeCode, product.size);
     
     const record = appData.dailyStockRecords.find(r => 
       r.userId === userId && 
       r.date === today && 
       r.brandNumber === product.brandNumber && 
       r.size === formattedSize
     );
     
     if (record) {
       record.received = parseInt(quantity);
       record.total = record.openingStock + record.received;
       record.closingStock = record.total;
       record.sale = 0;
       record.saleAmount = 0;
       record.updatedAt = new Date();
     }
   }
   
   saveData(appData);
   
   res.json({ 
     message: 'Product updated - received quantity modified',
     product: product
   });
 } catch (error) {
   res.status(500).json({ message: 'Server error' });
 }
});

app.delete('/api/shop/delete-product/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    const productIndex = appData.shopInventory.findIndex(product => 
      product.id === id && product.userId === userId
    );
    
    if (productIndex === -1) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    const productToDelete = appData.shopInventory[productIndex];
    const formattedSize = formatSize(productToDelete.sizeCode, productToDelete.size);
    
    const deletedProduct = appData.shopInventory.splice(productIndex, 1)[0];
    
    const recordsToDelete = [];
    for (let i = appData.dailyStockRecords.length - 1; i >= 0; i--) {
      const record = appData.dailyStockRecords[i];
      if (record.userId === userId && 
          record.brandNumber === productToDelete.brandNumber && 
          record.size === formattedSize) {
        recordsToDelete.push(appData.dailyStockRecords.splice(i, 1)[0]);
      }
    }
    
    saveData(appData);
    
    res.json({ 
      message: 'Product and related stock records deleted successfully',
      deletedProduct,
      deletedRecordsCount: recordsToDelete.length,
      deletedRecords: recordsToDelete
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Enhanced closing stock update with validation
app.post('/api/stock/update-closing', authenticateToken, (req, res) => {
  try {
    const { date, stockUpdates } = req.body;
    const userId = req.user.userId;
    
    const updatedRecords = [];
    const warnings = [];
    
    stockUpdates.forEach(update => {
      const { brandNumber, size, closingStock } = update;
      
      const inventoryProduct = appData.shopInventory.find(product => {
        const formattedSize = formatSize(product.sizeCode, product.size);
        return product.userId === userId && 
               product.brandNumber === brandNumber && 
               formattedSize === size;
      });
      
      if (inventoryProduct) {
        // Find the existing record
        let record = appData.dailyStockRecords.find(r => 
          r.userId === userId && 
          r.date === date && 
          r.brandNumber === brandNumber && 
          r.size === size
        );
        
        if (record) {
          // Validate closing stock
          const closingStockNum = parseInt(closingStock);
          
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
          record.closingStock = Math.max(0, Math.min(closingStockNum, record.total));
          record.sale = record.total - record.closingStock;
          record.saleAmount = record.sale * record.price;
          record.updatedAt = new Date();
          
          updatedRecords.push(record);
        } else {
          // Create new record if doesn't exist
          record = createOrUpdateDailyStockRecord(
            userId, 
            date, 
            brandNumber, 
            inventoryProduct.name,
            size,
            inventoryProduct.finalPrice,
            0,
            parseInt(closingStock)
          );
          updatedRecords.push(record);
        }
      }
    });
    
    saveData(appData);
    
    res.json({
      message: 'Closing stock updated successfully',
      updatedRecords: updatedRecords.length,
      warnings: warnings,
      details: updatedRecords.map(r => ({
        product: `${r.brandNumber} - ${r.size}`,
        opening: r.openingStock,
        received: r.received,
        total: r.total,
        closing: r.closingStock,
        sales: r.sale
      }))
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Summary endpoint with improved stock value calculation
app.get('/api/summary', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];
    
    // Get today's stock records
    const todayStockRecords = appData.dailyStockRecords.filter(record => 
      record.userId === userId && record.date === today
    );
    
    // Calculate today's sales
    const totalSalesAmount = todayStockRecords.reduce((sum, record) => sum + record.saleAmount, 0);
    
    // Calculate Stock Value based on closing stock × MRP
    let stockValue = 0;
    let recordsUsed = 0;
    
    if (todayStockRecords.length > 0) {
      // Use today's closing stock
      stockValue = todayStockRecords.reduce((total, record) => {
        // Find MRP from shop inventory
        const shopProduct = appData.shopInventory.find(product => 
          product.userId === userId && 
          product.brandNumber === record.brandNumber &&
          formatSize(product.sizeCode, product.size) === record.size
        );
        
        if (shopProduct && record.closingStock > 0) {
          recordsUsed++;
          const value = record.closingStock * shopProduct.mrp;
          return total + value;
        }
        return total;
      }, 0);
    } else {
      // If no records for today, use the most recent closing stock
      const latestStockMap = {};
      
      const allUserRecords = appData.dailyStockRecords
        .filter(record => record.userId === userId)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      
      // Get the most recent record for each product
      allUserRecords.forEach(record => {
        const key = `${record.brandNumber}_${record.size}`;
        if (!latestStockMap[key]) {
          latestStockMap[key] = record;
        }
      });
      
      // Calculate stock value from latest records
      Object.values(latestStockMap).forEach(record => {
        const shopProduct = appData.shopInventory.find(product => 
          product.userId === userId && 
          product.brandNumber === record.brandNumber &&
          formatSize(product.sizeCode, product.size) === record.size
        );
        
        if (shopProduct && record.closingStock > 0) {
          recordsUsed++;
          const value = record.closingStock * shopProduct.mrp;
          stockValue += value;
        }
      });
    }
    
    // Calculate Stock Lifted (total purchase value including taxes)
    const userInvoices = appData.invoice.filter(invoice => invoice.userId === userId);
    const stockLifted = userInvoices.reduce((sum, invoice) => sum + (invoice.totalValue || 0), 0);
    
    // Calculate Counter Balance
    const todayExpenses = appData.expenses
      .filter(expense => expense.userId === userId && expense.date === today)
      .reduce((sum, expense) => sum + expense.amount, 0);
      
    const todayCashTransactions = appData.cashTransactions.find(transaction => 
      transaction.userId === userId && transaction.date === today
    );
    const actualCashCollected = todayCashTransactions ? 
      (todayCashTransactions.cash + todayCashTransactions.card + 
       todayCashTransactions.upi + todayCashTransactions.cheque) : 0;
    
    const counterBalance = totalSalesAmount - todayExpenses - actualCashCollected;
    
    res.json({
      date: today,
      stockValue: stockValue,
      stockLifted: stockLifted,
      totalSales: totalSalesAmount,
      counterBalance: counterBalance,
      todayStockRecords: todayStockRecords.length,
      recordsWithStock: todayStockRecords.filter(r => r.closingStock > 0).length,
      hasRecordsForToday: todayStockRecords.length > 0
    });
  } catch (error) {
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

// Basic route
app.get('/', (req, res) => {
 res.json({ message: 'Wine Shop Inventory API is running!' });
});

// Start the server
const startServer = async () => {
  try {
    const dbConnected = await connectDB();
    if (dbConnected) {
      await initializeTables();
      appData = { 
        users: [], 
        shopInventory: [], 
        dailyStockRecords: [], 
        invoice: [],
        expenses: [],
        cashTransactions: [],
        masterBrands: masterBrandsData || []
      };
      console.log('App initialized with PostgreSQL');
    }

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running on port ${PORT}`);
      console.log('Server connected to PostgreSQL database');
      console.log('Server is ready to accept requests');
    });

  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
};
// Start the server
startServer();
