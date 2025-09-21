#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const EnhancedInvoiceParser = require('./enhancedInvoiceParser');

async function testEnhancedParser() {
  console.log('🧪 TESTING ENHANCED INVOICE PARSER');
  console.log('='.repeat(60));
  
  const icdcPath = path.join(__dirname, '..', 'Icdc', 'ICDC 3.pdf');
  
  if (!fs.existsSync(icdcPath)) {
    console.error('❌ ICDC 3.pdf not found at:', icdcPath);
    process.exit(1);
  }
  
  console.log('📄 Reading ICDC 3 PDF...');
  const pdfBuffer = fs.readFileSync(icdcPath);
  
  // Mock master brands data for testing
  const mockMasterBrands = [
    {
      id: 1,
      brandNumber: '5016',
      name: 'KING FISHER PREMIUM LAGER BEER',
      size: 650,
      sizeCode: 'BS',
      packQuantity: 12,
      packType: 'G',
      mrp: 150.00,
      invoice: 125.08,
      specialMargin: 24.92,
      specialExciseCess: 0,
      category: 'Beer'
    },
    {
      id: 2,
      brandNumber: '5019',
      name: 'BUDWEISER KING OF BEERS',
      size: 650,
      sizeCode: 'BS',
      packQuantity: 12,
      packType: 'G',
      mrp: 220.00,
      invoice: 183.42,
      specialMargin: 36.58,
      specialExciseCess: 0,
      category: 'Beer'
    },
    {
      id: 3,
      brandNumber: '5025',
      name: 'ROYAL CHALLENGE PREMIUM LAGER BEER',
      size: 650,
      sizeCode: 'BS',
      packQuantity: 12,
      packType: 'G',
      mrp: 150.00,
      invoice: 125.08,
      specialMargin: 24.92,
      specialExciseCess: 0,
      category: 'Beer'
    },
    {
      id: 4,
      brandNumber: '5028',
      name: 'HAYWARDS 5000 SUPER STRONG BEER',
      size: 650,
      sizeCode: 'BS',
      packQuantity: 12,
      packType: 'G',
      mrp: 160.00,
      invoice: 133.42,
      specialMargin: 26.58,
      specialExciseCess: 0,
      category: 'Beer'
    },
    {
      id: 5,
      brandNumber: '5030',
      name: 'KNOCKOUT HIGH PUNCH STRONG BEER',
      size: 650,
      sizeCode: 'BS',
      packQuantity: 12,
      packType: 'G',
      mrp: 160.00,
      invoice: 133.42,
      specialMargin: 26.58,
      specialExciseCess: 0,
      category: 'Beer'
    },
    {
      id: 6,
      brandNumber: '3639',
      name: 'SULA CABERNET SHIRAJ RED WINE',
      size: 180,
      sizeCode: 'NN',
      packQuantity: 48,
      packType: 'G',
      mrp: 216.75,
      invoice: 216.75,
      specialMargin: 0,
      specialExciseCess: 0,
      category: 'IML'
    },
    {
      id: 7,
      brandNumber: '0110',
      name: 'OFFICER\'S CHOICE RESERVE WHISKY',
      size: 180,
      sizeCode: 'NN',
      packQuantity: 48,
      packType: 'P',
      mrp: 108.42,
      invoice: 108.42,
      specialMargin: 0,
      specialExciseCess: 0,
      category: 'IML'
    },
    {
      id: 8,
      brandNumber: '1079',
      name: 'ROYAL CHALLENGE AMERICAN PRIDE LUXE GOLD WHISKY',
      size: 180,
      sizeCode: 'NN',
      packQuantity: 48,
      packType: 'P',
      mrp: 250.08,
      invoice: 250.08,
      specialMargin: 0,
      specialExciseCess: 0,
      category: 'IML'
    },
    {
      id: 9,
      brandNumber: '8031',
      name: 'JAMESON IRISH WHISKY',
      size: 750,
      sizeCode: 'QQ',
      packQuantity: 12,
      packType: 'G',
      mrp: 2158.42,
      invoice: 2158.42,
      specialMargin: 0,
      specialExciseCess: 0,
      category: 'Duty Paid'
    },
    {
      id: 10,
      brandNumber: '1303',
      name: 'BREEZER GOLD TANGY CRANBERRY FLAVOUR',
      size: 275,
      sizeCode: 'GP',
      packQuantity: 24,
      packType: 'G',
      mrp: 83.42,
      invoice: 83.42,
      specialMargin: 0,
      specialExciseCess: 0,
      category: 'IML'
    }
  ];
  
  console.log('🚀 Starting enhanced parsing...\n');
  
  try {
    const parser = new EnhancedInvoiceParser();
    const result = await parser.parseInvoiceWithValidation(pdfBuffer, mockMasterBrands);
    
    if (result.success) {
      console.log('\n' + '='.repeat(60));
      console.log('✅ PARSING SUCCESSFUL!');
      console.log('='.repeat(60));
      
      console.log(`📄 Invoice: ${result.data.invoiceNumber}`);
      console.log(`📅 Date: ${result.data.date}`);
      console.log(`🎯 Confidence: ${result.confidence}`);
      console.log(`🔧 Method: ${result.method}`);
      
      console.log('\n📊 SUMMARY:');
      console.log(`   Items Parsed: ${result.data.summary.totalItemsParsed}`);
      console.log(`   Items Validated: ${result.data.summary.validatedItems}`);
      console.log(`   Items Skipped: ${result.data.summary.skippedItems}`);
      console.log(`   Match Rate: ${(result.data.summary.matchRate * 100).toFixed(1)}%`);
      console.log(`   Total Cases: ${result.data.summary.totalCases}`);
      console.log(`   Total Bottles: ${result.data.summary.totalBottles}`);
      console.log(`   Total Quantity: ${result.data.summary.totalQuantity}`);
      
      if (result.data.summary.summaryValidation) {
        const sv = result.data.summary.summaryValidation;
        console.log('\n📋 SUMMARY VALIDATION:');
        console.log(`   Expected Total: ${sv.total.cases} cases, ${sv.total.bottles} bottles`);
        console.log(`   Beer Expected: ${sv.beer.cases} cases, ${sv.beer.bottles} bottles`);
        console.log(`   IMFL Expected: ${sv.imfl.cases} cases, ${sv.imfl.bottles} bottles`);
        
        const casesMatch = Math.abs(result.data.summary.totalCases - sv.total.cases) <= 2;
        const bottlesMatch = Math.abs(result.data.summary.totalBottles - sv.total.bottles) <= 2;
        console.log(`   Validation: Cases ${casesMatch ? '✅' : '❌'}, Bottles ${bottlesMatch ? '✅' : '❌'}`);
      }
      
      console.log('\n📦 VALIDATED ITEMS:');
      result.data.items.forEach((item, index) => {
        console.log(`   ${index + 1}. ${item.brandNumber} - ${item.description}`);
        console.log(`      Size: ${item.formattedSize}, Cases: ${item.cases}, Bottles: ${item.bottles}`);
        console.log(`      Total Qty: ${item.totalQuantity}, Parsing: ${item.parsingConfidence.toFixed(2)} confidence`);
        console.log(`      Reasoning: ${item.parsingReasoning}`);
        console.log('');
      });
      
      if (result.data.skippedItems.length > 0) {
        console.log('⭐️ SKIPPED ITEMS:');
        result.data.skippedItems.forEach((item, index) => {
          console.log(`   ${index + 1}. ${item.brandNumber} - ${item.reason}`);
        });
      }
      
      console.log('\n💰 FINANCIAL DATA:');
      console.log(`   Invoice Value: ₹${result.data.invoiceValue?.toLocaleString() || 0}`);
      console.log(`   MRP Rounding Off: ₹${result.data.mrpRoundingOff?.toLocaleString() || 0}`);
      console.log(`   Net Invoice Value: ₹${result.data.netInvoiceValue?.toLocaleString() || 0}`);
      console.log(`   Retail Excise Turnover Tax: ₹${result.data.retailExciseTurnoverTax?.toLocaleString() || 0}`);
      console.log(`   Special Excise Cess: ₹${result.data.specialExciseCess?.toLocaleString() || 0}`);
      console.log(`   TCS: ₹${result.data.tcs?.toLocaleString() || 0}`);
      
    } else {
      console.log('\n❌ PARSING FAILED!');
      console.log('Error:', result.error);
      console.log('Confidence:', result.confidence);
    }
    
  } catch (error) {
    console.error('\n💥 UNEXPECTED ERROR:', error.message);
    console.error(error.stack);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🏁 Test completed!');
}

if (require.main === module) {
  testEnhancedParser();
}
