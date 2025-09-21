#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const EnhancedInvoiceParser = require('./enhancedInvoiceParser');

async function testMultiplePDFs() {
  console.log('🧪 TESTING ENHANCED PARSER ON MULTIPLE ICDC PDFs');
  console.log('='.repeat(80));
  
  const icdcDir = path.join(__dirname, '..', 'Icdc');
  
  // Get all PDF files
  const pdfFiles = fs.readdirSync(icdcDir)
    .filter(file => file.toLowerCase().endsWith('.pdf'))
    .sort();
  
  console.log(`📁 Found ${pdfFiles.length} PDF files:`);
  pdfFiles.forEach((file, index) => {
    console.log(`   ${index + 1}. ${file}`);
  });
  
  // Mock master brands (simplified for testing)
  const mockMasterBrands = [
    { id: 1, brandNumber: '5016', name: 'KING FISHER PREMIUM LAGER BEER', size: 650, sizeCode: 'BS', packQuantity: 12, packType: 'G', mrp: 150.00, invoice: 125.08, category: 'Beer' },
    { id: 2, brandNumber: '5019', name: 'BUDWEISER KING OF BEERS', size: 650, sizeCode: 'BS', packQuantity: 12, packType: 'G', mrp: 220.00, invoice: 183.42, category: 'Beer' },
    { id: 3, brandNumber: '5025', name: 'ROYAL CHALLENGE PREMIUM LAGER BEER', size: 650, sizeCode: 'BS', packQuantity: 12, packType: 'G', mrp: 150.00, invoice: 125.08, category: 'Beer' },
    { id: 4, brandNumber: '5028', name: 'HAYWARDS 5000 SUPER STRONG BEER', size: 650, sizeCode: 'BS', packQuantity: 12, packType: 'G', mrp: 160.00, invoice: 133.42, category: 'Beer' },
    { id: 5, brandNumber: '5030', name: 'KNOCKOUT HIGH PUNCH STRONG BEER', size: 650, sizeCode: 'BS', packQuantity: 12, packType: 'G', mrp: 160.00, invoice: 133.42, category: 'Beer' },
    { id: 6, brandNumber: '3639', name: 'SULA CABERNET SHIRAJ RED WINE', size: 180, sizeCode: 'NN', packQuantity: 48, packType: 'G', mrp: 216.75, invoice: 216.75, category: 'IML' },
    { id: 7, brandNumber: '0110', name: 'OFFICER\'S CHOICE RESERVE WHISKY', size: 180, sizeCode: 'NN', packQuantity: 48, packType: 'P', mrp: 108.42, invoice: 108.42, category: 'IML' },
    { id: 8, brandNumber: '1079', name: 'ROYAL CHALLENGE AMERICAN PRIDE LUXE GOLD WHISKY', size: 180, sizeCode: 'NN', packQuantity: 48, packType: 'P', mrp: 250.08, invoice: 250.08, category: 'IML' },
    { id: 9, brandNumber: '8031', name: 'JAMESON IRISH WHISKY', size: 750, sizeCode: 'QQ', packQuantity: 12, packType: 'G', mrp: 2158.42, invoice: 2158.42, category: 'Duty Paid' },
    { id: 10, brandNumber: '1303', name: 'BREEZER GOLD TANGY CRANBERRY FLAVOUR', size: 275, sizeCode: 'GP', packQuantity: 24, packType: 'G', mrp: 83.42, invoice: 83.42, category: 'IML' }
  ];
  
  const parser = new EnhancedInvoiceParser();
  const results = [];
  
  // Test a subset of PDFs to avoid overwhelming output
  const testFiles = pdfFiles.slice(0, 5); // Test first 5 PDFs
  
  for (let i = 0; i < testFiles.length; i++) {
    const fileName = testFiles[i];
    const filePath = path.join(icdcDir, fileName);
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📄 TESTING: ${fileName} (${i + 1}/${testFiles.length})`);
    console.log(`${'='.repeat(80)}`);
    
    try {
      const pdfBuffer = fs.readFileSync(filePath);
      console.log(`📊 File size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
      
      const startTime = Date.now();
      const result = await parser.parseInvoiceWithValidation(pdfBuffer, mockMasterBrands);
      const parseTime = Date.now() - startTime;
      
      const testResult = {
        fileName: fileName,
        fileSize: pdfBuffer.length,
        parseTime: parseTime,
        success: result.success,
        confidence: result.confidence,
        method: result.method,
        invoiceNumber: result.data?.invoiceNumber || 'N/A',
        date: result.data?.date || 'N/A',
        itemsFound: result.data?.summary?.totalItemsParsed || 0,
        itemsValidated: result.data?.summary?.validatedItems || 0,
        totalCases: result.data?.summary?.totalCases || 0,
        totalBottles: result.data?.summary?.totalBottles || 0,
        totalQuantity: result.data?.summary?.totalQuantity || 0,
        invoiceValue: result.data?.invoiceValue || 0,
        summaryValidation: result.data?.summary?.summaryValidation,
        error: result.error || null
      };
      
      results.push(testResult);
      
      if (result.success) {
        console.log(`✅ SUCCESS - ${result.method} (${parseTime}ms)`);
        console.log(`📄 Invoice: ${testResult.invoiceNumber}`);
        console.log(`📅 Date: ${testResult.date}`);
        console.log(`📦 Items: ${testResult.itemsFound} found, ${testResult.itemsValidated} validated`);
        console.log(`📊 Quantities: ${testResult.totalCases} cases, ${testResult.totalBottles} bottles`);
        console.log(`💰 Invoice Value: ₹${testResult.invoiceValue?.toLocaleString() || 0}`);
        
        if (testResult.summaryValidation) {
          const sv = testResult.summaryValidation;
          console.log(`📋 Summary: Expected ${sv.total.cases} cases, ${sv.total.bottles} bottles`);
          
          const casesMatch = Math.abs(testResult.totalCases - sv.total.cases) <= 2;
          const bottlesMatch = Math.abs(testResult.totalBottles - sv.total.bottles) <= 2;
          console.log(`✅ Validation: Cases ${casesMatch ? '✅' : '❌'}, Bottles ${bottlesMatch ? '✅' : '❌'}`);
        }
        
        // Show some sample items
        if (result.data.items && result.data.items.length > 0) {
          console.log(`\n📦 SAMPLE ITEMS (first 3):`);
          result.data.items.slice(0, 3).forEach((item, idx) => {
            console.log(`   ${idx + 1}. ${item.brandNumber} - ${item.description}`);
            console.log(`      ${item.cases}c + ${item.bottles}b = ${item.totalQuantity} total`);
            console.log(`      Confidence: ${item.parsingConfidence?.toFixed(2) || 'N/A'}`);
            console.log(`      Original: "${item.originalCasesBottles || 'N/A'}"`);
          });
        }
        
      } else {
        console.log(`❌ FAILED - ${result.error}`);
        console.log(`🎯 Confidence: ${result.confidence}`);
      }
      
    } catch (error) {
      console.log(`💥 ERROR: ${error.message}`);
      results.push({
        fileName: fileName,
        success: false,
        error: error.message,
        parseTime: 0
      });
    }
  }
  
  // Summary report
  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 SUMMARY REPORT');
  console.log(`${'='.repeat(80)}`);
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`📈 Success Rate: ${successful.length}/${results.length} (${(successful.length/results.length*100).toFixed(1)}%)`);
  console.log(`⏱️  Average Parse Time: ${(successful.reduce((sum, r) => sum + r.parseTime, 0) / Math.max(successful.length, 1)).toFixed(0)}ms`);
  
  if (successful.length > 0) {
    console.log(`\n✅ SUCCESSFUL PARSES:`);
    successful.forEach((result, idx) => {
      console.log(`   ${idx + 1}. ${result.fileName}`);
      console.log(`      Items: ${result.itemsValidated}/${result.itemsFound}, Quantities: ${result.totalCases}c+${result.totalBottles}b`);
      console.log(`      Invoice: ${result.invoiceNumber}, Value: ₹${result.invoiceValue?.toLocaleString() || 0}`);
    });
  }
  
  if (failed.length > 0) {
    console.log(`\n❌ FAILED PARSES:`);
    failed.forEach((result, idx) => {
      console.log(`   ${idx + 1}. ${result.fileName} - ${result.error}`);
    });
  }
  
  // Format analysis
  console.log(`\n📋 FORMAT ANALYSIS:`);
  const formats = {};
  successful.forEach(result => {
    if (!formats[result.method]) {
      formats[result.method] = [];
    }
    formats[result.method].push(result.fileName);
  });
  
  Object.entries(formats).forEach(([method, files]) => {
    console.log(`   ${method}: ${files.length} files`);
    files.forEach(file => console.log(`     - ${file}`));
  });
  
  console.log(`\n🏁 Testing completed!`);
  return results;
}

if (require.main === module) {
  testMultiplePDFs().catch(console.error);
}
