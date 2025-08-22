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
// Import database service
const dbService = require('./databaseService');

// Helper function for formatting size
const formatSize = (sizeCode, size) => {
  if (sizeCode && size) {
    return `${size}${sizeCode}`;
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
        let shopProduct = await dbService.getShopProducts(userId);
        shopProduct = shopProduct.find(product => 
          product.brand_number === item.brandNumber &&
          formatSize(product.size_code, product.size) === item.formattedSize
        );

        // If not in inventory, add it (using masterBrand data)
        if (!shopProduct) {
          console.log(`➕ Adding new product to inventory: ${item.brandNumber}`);
          
          const newShopProduct = await dbService.addShopProduct({
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
            userId
          });
          
          shopProduct = newShopProduct;
          addedToInventory++;
        }

        // Create or update daily stock record for received quantity
        const stockRecord = await dbService.createOrUpdateDailyStockRecord({
          userId,
          date: today,
          brandNumber: item.brandNumber,
          brandName: item.description,
          size: item.formattedSize,
          price: shopProduct.final_price,
          received: item.totalQuantity, // received quantity
          closingStock: null // let closing stock auto-calculate
        });

        updatedCount++;
        processedItems.push({
          brandNumber: item.brandNumber,
          description: item.description,
          size: item.formattedSize,
          receivedQuantity: item.totalQuantity,
          newTotal: stockRecord.total,
          newClosing: stockRecord.closing_stock
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
    const invoiceRecord = await dbService.saveInvoice({
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
      processedItemsCount: updatedCount
    });

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
    res.status(500).json({ 
      message: 'Server error during invoice confirmation', 
      error: error.message 
    });
  }
});

// Optional: Get invoice history
app.get('/api/invoices', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const userInvoices = await dbService.getInvoices(userId);

    res.json({
      invoices: userInvoices,
      totalCount: userInvoices.length,
      totalValue: userInvoices.reduce((sum, inv) => sum + (inv.total_value || 0), 0)
    });
  } catch (error) {
    console.error('Error getting invoices:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Auth endpoints
app.post('/api/login', async (req, res) => {
 try {
   const { email, password } = req.body;
   
   const user = await dbService.findUserByEmail(email);
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
       shopName: user.shop_name 
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
    const { name, email, password, shopName } = req.body;
    
    // Validation
    if (!name || !email || !password || !shopName) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    // Check if user already exists
    const existingUser = await dbService.findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    
    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Create new user in database
    const newUser = await dbService.createUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      shopName: shopName.trim()
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
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];
    
    const result = await dbService.initializeTodayStock(userId, today);
    res.json(result);
    
  } catch (error) {
    console.error('Error initializing today stock:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Master brands endpoint
app.get('/api/master-brands', authenticateToken, (req, res) => {
 res.json(masterBrandsData);
});

// Shop product management
app.post('/api/shop/add-product', authenticateToken, async (req, res) => {
 try {
   const { masterBrandId, quantity, shopMarkup = 0 } = req.body;
   const userId = req.user.userId;
   const today = new Date().toISOString().split('T')[0];
   
   const masterBrand = masterBrandsData.find(brand => brand.id === parseInt(masterBrandId));
   if (!masterBrand) {
     return res.status(404).json({ message: 'Brand not found in master database' });
   }
   
   const finalPrice = masterBrand.mrp + parseFloat(shopMarkup);
   const formattedSize = formatSize(masterBrand.sizeCode, masterBrand.size);
   
   const existingProduct = await dbService.getShopProducts(userId);
   const productExists = existingProduct.find(item => item.master_brand_id === parseInt(masterBrandId));
   
   if (!productExists) {
     await dbService.addShopProduct({
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
       userId
     });
   }
   
   await dbService.createOrUpdateDailyStockRecord({
     userId,
     date: today,
     brandNumber: masterBrand.brandNumber,
     brandName: masterBrand.name,
     size: formattedSize,
     price: finalPrice,
     received: parseInt(quantity),
     closingStock: null
   });
   
   res.status(201).json({ 
     message: 'received quantity updated',
     brandNumber: masterBrand.brandNumber,
     receivedQuantity: parseInt(quantity)
   });
 } catch (error) {
   console.error('Error adding shop product:', error);
   res.status(500).json({ message: 'Server error', error: error.message });
 }
});

app.put('/api/shop/update-sort-order', authenticateToken, async (req, res) => {
  try {
    const { sortedBrandGroups } = req.body;
    const userId = req.user.userId;
    
    const result = await dbService.updateSortOrder(userId, sortedBrandGroups);
    res.json(result);
  } catch (error) {
    console.error('Error updating sort order:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/shop/products', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const products = await dbService.getShopProducts(userId, targetDate);
    res.json(products);
  } catch (error) {
    console.error('Error getting shop products:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.put('/api/shop/update-product/:id', authenticateToken, async (req, res) => {
 try {
   const { id } = req.params;
   const { quantity, finalPrice } = req.body;
   const userId = req.user.userId;
   
   const shopMarkup = finalPrice ? parseFloat(finalPrice) - 0 : undefined; // You'll need to get MRP from database
   
   const result = await dbService.updateShopProduct(id, userId, {
     quantity,
     finalPrice: finalPrice ? parseFloat(finalPrice) : undefined,
     shopMarkup
   });
   
   res.json({ 
     message: 'Product updated - received quantity modified',
     result
   });
 } catch (error) {
   console.error('Error updating shop product:', error);
   res.status(500).json({ message: 'Server error', error: error.message });
 }
});

app.delete('/api/shop/delete-product/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    const deletedProduct = await dbService.deleteShopProduct(id, userId);
    
    res.json({ 
      message: 'Product deleted successfully',
      deletedProduct
    });
  } catch (error) {
    console.error('Error deleting shop product:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Enhanced closing stock update with validation
app.post('/api/stock/update-closing', authenticateToken, async (req, res) => {
  try {
    const { date, stockUpdates } = req.body;
    const userId = req.user.userId;
    
    const result = await dbService.updateClosingStock(userId, date, stockUpdates);
    
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
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];
    
    const summary = await dbService.getSummary(userId, today);
    res.json(summary);
  } catch (error) {
    console.error('Error getting summary:', error);
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
