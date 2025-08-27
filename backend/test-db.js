const dbService = require('./databaseService');

async function testDatabase() {
  try {
    console.log('🧪 Testing database connection and operations...\n');
    
    // Test basic connection first
    console.log('0. Testing basic database connection...');
    const { pool } = require('./database');
    await pool.query('SELECT NOW()');
    console.log('✅ Basic connection successful\n');
    
    // Test user creation
    console.log('1. Testing user creation...');
    const testUser = await dbService.createUser({
      name: 'Test User',
      email: 'test@example.com',
      password: 'hashedpassword123',
      shopName: 'Test Shop'
    });
    console.log('✅ User created:', testUser);
    
    // Test user lookup
    console.log('\n2. Testing user lookup...');
    const foundUser = await dbService.findUserByEmail('test@example.com');
    console.log('✅ User found:', foundUser);
    
    // Test shop product addition
    console.log('\n3. Testing shop product addition...');
    const testProduct = await dbService.addShopProduct({
      masterBrandId: 1,
      name: 'Test Whisky',
      brandNumber: '9999',
      category: 'Whisky',
      packQuantity: 12,
      size: '750ml',
      sizeCode: 'QQ',
      mrp: 1000,
      shopMarkup: 100,
      finalPrice: 1100,
      userId: testUser.id
    });
    console.log('✅ Product added:', testProduct);
    
    // Test getting shop products
    console.log('\n4. Testing shop products retrieval...');
    const products = await dbService.getShopProducts(testUser.id);
    console.log('✅ Products retrieved:', products.length);
    
    // Test daily stock record creation
    console.log('\n5. Testing daily stock record creation...');
    const today = new Date().toISOString().split('T')[0];
    const stockRecord = await dbService.createOrUpdateDailyStockRecord({
      userId: testUser.id,
      date: today,
      brandNumber: '9999',
      brandName: 'Test Whisky',
      size: '750ml',
      price: 1100,
      received: 10,
      closingStock: null
    });
    console.log('✅ Stock record created:', stockRecord);
    
    // Test summary
    console.log('\n6. Testing summary generation...');
    const summary = await dbService.getSummary(testShop.id, today);
    console.log('✅ Summary generated:', summary);
    
    console.log('\n🎉 All database tests passed successfully!');
    
  } catch (error) {
    console.error('❌ Database test failed:', error);
    console.error('Full error details:', error.stack);
  }
}

// Run the test
testDatabase();
