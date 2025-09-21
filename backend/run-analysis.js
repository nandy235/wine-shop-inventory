#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const PDFAnalyzer = require('./analyzePDF');

async function runAnalysis() {
  console.log('🔍 ICDC 3 PDF Analysis Tool');
  console.log('='.repeat(50));
  
  // Path to ICDC 3 PDF
  const icdcPath = path.join(__dirname, '..', 'Icdc', 'ICDC 3.pdf');
  
  console.log(`📄 Looking for ICDC 3 PDF at: ${icdcPath}`);
  
  if (!fs.existsSync(icdcPath)) {
    console.error('❌ ICDC 3.pdf not found!');
    console.log('Please ensure the file exists at:', icdcPath);
    
    // List available files in Icdc directory
    const icdcDir = path.join(__dirname, '..', 'Icdc');
    if (fs.existsSync(icdcDir)) {
      console.log('\n📁 Available files in Icdc directory:');
      const files = fs.readdirSync(icdcDir);
      files.forEach(file => {
        console.log(`  - ${file}`);
      });
    }
    
    process.exit(1);
  }
  
  console.log('✅ ICDC 3 PDF found!');
  console.log('🚀 Starting analysis...\n');
  
  try {
    const analyzer = new PDFAnalyzer();
    await analyzer.analyzePDF(icdcPath);
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ Analysis completed successfully!');
    console.log('\n📋 What to do next:');
    console.log('1. Check the pdf-analysis folder for exported files');
    console.log('2. Review the raw text to understand the PDF structure');
    console.log('3. Look for patterns that the current parser might be missing');
    console.log('4. Use this information to enhance the invoice parser');
    
  } catch (error) {
    console.error('\n❌ Analysis failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  runAnalysis();
}
