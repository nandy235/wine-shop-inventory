#!/usr/bin/env node

const HybridInvoiceParser = require('./invoiceParser');
const fs = require('fs');
const path = require('path');

// Load real master brands from database
async function loadMasterBrandsFromDB() {
  const { pool } = require('./database');
  
  const query = `
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
    WHERE is_active = true
    ORDER BY brand_number, size_ml, pack_type`;
  
  const result = await pool.query(query);
  return result.rows;
}

async function testIntegratedParserWithRealDB() {
  console.log('🧪 TESTING INTEGRATED PARSER WITH REAL DATABASE');
  console.log('='.repeat(60));
  
  try {
    // Load real master brands
    console.log('📚 Loading real master brands from database...');
    const masterBrands = await loadMasterBrandsFromDB();
    console.log(`✅ Loaded ${masterBrands.length} master brands from database`);
    
    // Test with ICDC 3
    const parser = new HybridInvoiceParser();
    const icdcPath = path.join(__dirname, '..', 'Icdc', 'ICDC 3.pdf');
    const pdfBuffer = fs.readFileSync(icdcPath);
    
    console.log('\n🚀 Parsing ICDC 3 with real database...');
    const startTime = Date.now();
    const result = await parser.parseInvoiceWithValidation(pdfBuffer, masterBrands);
    const parseTime = Date.now() - startTime;
    
    if (result.success) {
      console.log('\n' + '='.repeat(60));
      console.log('✅ INTEGRATION SUCCESS WITH REAL DATABASE!');
      console.log('='.repeat(60));
      
      console.log(`⏱️  Parse time: ${parseTime}ms`);
      console.log(`📄 Invoice: ${result.data.invoiceNumber}`);
      console.log(`📅 Date: ${result.data.date}`);
      console.log(`🎯 Confidence: ${result.confidence}`);
      console.log(`🔧 Method: ${result.method}`);
      
      console.log('\n📊 PARSING RESULTS:');
      console.log(`   Items found: ${result.data.summary.totalItemsParsed}`);
      console.log(`   Items validated: ${result.data.summary.validatedItems}`);
      console.log(`   Items skipped: ${result.data.summary.skippedItems}`);
      console.log(`   Match rate: ${(result.data.summary.matchRate * 100).toFixed(1)}%`);
      console.log(`   Total cases: ${result.data.summary.totalCases || 'N/A'}`);
      console.log(`   Total bottles: ${result.data.summary.totalBottles || 'N/A'}`);
      console.log(`   Total quantity: ${result.data.summary.totalQuantity}`);
      
      console.log('\n📦 VALIDATED ITEMS:');
      result.data.items.forEach((item, index) => {
        console.log(`   ${index + 1}. ${item.brandNumber} - ${item.description}`);
        console.log(`      Size: ${item.formattedSize}, Cases: ${item.cases}, Bottles: ${item.bottles}`);
        console.log(`      Total Qty: ${item.totalQuantity}, MRP: ₹${item.mrp}`);
        if (item.parsingConfidence) {
          console.log(`      Smart Parsing: ${item.parsingConfidence.toFixed(2)} confidence - ${item.parsingReasoning}`);
        }
        console.log('');
      });
      
      if (result.data.skippedItems && result.data.skippedItems.length > 0) {
        console.log('⭐️ SKIPPED ITEMS:');
        result.data.skippedItems.slice(0, 5).forEach((item, index) => {
          console.log(`   ${index + 1}. ${item.brandNumber} - ${item.reason}`);
        });
        if (result.data.skippedItems.length > 5) {
          console.log(`   ... and ${result.data.skippedItems.length - 5} more skipped items`);
        }
      }
      
      console.log('\n💰 FINANCIAL SUMMARY:');
      console.log(`   Invoice Value: ₹${result.data.invoiceValue?.toLocaleString() || 0}`);
      console.log(`   MRP Rounding Off: ₹${result.data.mrpRoundingOff?.toLocaleString() || 0}`);
      console.log(`   Net Invoice Value: ₹${result.data.netInvoiceValue?.toLocaleString() || 0}`);
      console.log(`   Retail Excise Turnover Tax: ₹${result.data.retailExciseTurnoverTax?.toLocaleString() || 0}`);
      console.log(`   Special Excise Cess: ₹${result.data.specialExciseCess?.toLocaleString() || 0}`);
      console.log(`   TCS: ₹${result.data.tcs?.toLocaleString() || 0}`);
      console.log(`   Total Amount: ₹${result.data.totalAmount?.toLocaleString() || 0}`);
      
    } else {
      console.log('\n❌ INTEGRATION FAILED!');
      console.log('Error:', result.error);
      console.log('Confidence:', result.confidence);
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n💥 UNEXPECTED ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  testIntegratedParserWithRealDB();
}
