#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

/**
 * PDF Text Analysis Tool
 * Extracts and analyzes text from ICDC PDFs to understand their structure
 */

class PDFAnalyzer {
  constructor() {
    this.patterns = {
      invoiceNumber: [
        /ICDC\s*Number[:\s]*([A-Z0-9]+)/i,
        /ICDC([0-9]{15})/i,
        /ICDC([0-9]{12,18})/i
      ],
      date: [
        /Invoice\s*Date[:\s]*(\d{1,2}[-/][A-Za-z]{3}[-/]\d{4})/i,
        /(\d{1,2}[-/][A-Za-z]{3}[-/]\d{4})/
      ],
      brandNumber: /^(\d{1,2})(\d{4})/,
      amount: /[\d,]+\.?\d{0,2}/g
    };
  }

  async analyzePDF(pdfPath) {
    console.log(`\n🔍 ANALYZING PDF: ${path.basename(pdfPath)}`);
    console.log('='.repeat(80));
    
    try {
      // Read PDF file
      const pdfBuffer = fs.readFileSync(pdfPath);
      console.log(`📄 File size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
      
      // Extract text
      const pdfData = await pdfParse(pdfBuffer);
      const text = pdfData.text;
      
      console.log(`📝 Text extracted: ${text.length} characters`);
      console.log(`📑 Pages: ${pdfData.numpages}`);
      
      // Split into lines for analysis
      const lines = text.split('\n').map((line, index) => ({
        number: index + 1,
        content: line.trim(),
        length: line.trim().length
      })).filter(line => line.length > 0);
      
      console.log(`📋 Non-empty lines: ${lines.length}`);
      
      // Perform detailed analysis
      this.analyzeStructure(lines);
      this.analyzeInvoiceInfo(text);
      this.analyzeProducts(lines);
      this.analyzeFinancials(lines);
      this.showRawText(text);
      this.exportAnalysis(pdfPath, text, lines);
      
    } catch (error) {
      console.error('❌ Error analyzing PDF:', error.message);
      console.error(error.stack);
    }
  }

  analyzeStructure(lines) {
    console.log(`\n📊 DOCUMENT STRUCTURE ANALYSIS`);
    console.log('-'.repeat(50));
    
    // Show first 20 lines
    console.log(`\n🔝 FIRST 20 LINES:`);
    lines.slice(0, 20).forEach(line => {
      console.log(`${String(line.number).padStart(3, ' ')}: "${line.content}"`);
    });
    
    // Show last 20 lines
    console.log(`\n🔚 LAST 20 LINES:`);
    lines.slice(-20).forEach(line => {
      console.log(`${String(line.number).padStart(3, ' ')}: "${line.content}"`);
    });
    
    // Analyze line patterns
    console.log(`\n📏 LINE LENGTH DISTRIBUTION:`);
    const lengthGroups = {
      'Very Short (1-10)': 0,
      'Short (11-30)': 0,
      'Medium (31-60)': 0,
      'Long (61-100)': 0,
      'Very Long (100+)': 0
    };
    
    lines.forEach(line => {
      if (line.length <= 10) lengthGroups['Very Short (1-10)']++;
      else if (line.length <= 30) lengthGroups['Short (11-30)']++;
      else if (line.length <= 60) lengthGroups['Medium (31-60)']++;
      else if (line.length <= 100) lengthGroups['Long (61-100)']++;
      else lengthGroups['Very Long (100+)']++;
    });
    
    Object.entries(lengthGroups).forEach(([range, count]) => {
      const percentage = ((count / lines.length) * 100).toFixed(1);
      console.log(`  ${range.padEnd(18)}: ${String(count).padStart(3)} lines (${percentage}%)`);
    });
  }

  analyzeInvoiceInfo(text) {
    console.log(`\n📄 INVOICE INFORMATION ANALYSIS`);
    console.log('-'.repeat(50));
    
    // Extract invoice number
    let invoiceNumber = '';
    for (const pattern of this.patterns.invoiceNumber) {
      const match = text.match(pattern);
      if (match) {
        invoiceNumber = match[1];
        console.log(`📋 Invoice Number: ${invoiceNumber} (Pattern: ${pattern})`);
        break;
      }
    }
    if (!invoiceNumber) {
      console.log('❌ Invoice Number: Not found');
    }
    
    // Extract date
    let date = '';
    for (const pattern of this.patterns.date) {
      const match = text.match(pattern);
      if (match) {
        date = match[1];
        console.log(`📅 Date: ${date} (Pattern: ${pattern})`);
        break;
      }
    }
    if (!date) {
      console.log('❌ Date: Not found');
    }
  }

  analyzeProducts(lines) {
    console.log(`\n📦 PRODUCT ANALYSIS`);
    console.log('-'.repeat(50));
    
    const potentialProducts = [];
    const brandNumbers = new Set();
    
    lines.forEach(line => {
      // Look for brand number patterns
      const brandMatch = line.content.match(this.patterns.brandNumber);
      if (brandMatch) {
        const serial = brandMatch[1];
        const brandNumber = brandMatch[2];
        potentialProducts.push({
          line: line.number,
          content: line.content,
          serial: serial,
          brandNumber: brandNumber
        });
        brandNumbers.add(brandNumber);
      }
      
      // Look for lines with numbers that might be quantities
      if (/\d+/.test(line.content) && line.content.length < 50) {
        // Check if it might be a product line
        if (/beer|iml|duty|paid|ml|case|bottle/i.test(line.content)) {
          console.log(`🍺 Potential product line ${line.number}: "${line.content}"`);
        }
      }
    });
    
    console.log(`\n📊 PRODUCT DETECTION SUMMARY:`);
    console.log(`  Brand numbers found: ${brandNumbers.size}`);
    console.log(`  Potential product lines: ${potentialProducts.length}`);
    
    if (potentialProducts.length > 0) {
      console.log(`\n🔍 DETECTED PRODUCTS:`);
      potentialProducts.forEach((product, index) => {
        console.log(`  ${index + 1}. Line ${product.line}: Serial ${product.serial}, Brand ${product.brandNumber}`);
        console.log(`     Content: "${product.content}"`);
        
        // Look for related lines (product details)
        const relatedLines = lines.filter(l => 
          l.number > product.line && 
          l.number <= product.line + 5 && 
          l.content.length > 0
        );
        
        relatedLines.forEach(related => {
          console.log(`     +${related.number - product.line}: "${related.content}"`);
        });
        console.log('');
      });
    }
  }

  analyzeFinancials(lines) {
    console.log(`\n💰 FINANCIAL ANALYSIS`);
    console.log('-'.repeat(50));
    
    const financialKeywords = [
      'invoice value', 'mrp rounding', 'net invoice', 'retail excise', 
      'turnover tax', 'special excise cess', 'tcs', 'total'
    ];
    
    const amounts = [];
    const financialLines = [];
    
    lines.forEach(line => {
      // Find lines with financial keywords
      const hasFinancialKeyword = financialKeywords.some(keyword => 
        line.content.toLowerCase().includes(keyword)
      );
      
      if (hasFinancialKeyword) {
        financialLines.push(line);
      }
      
      // Find lines with amounts
      const amountMatches = [...line.content.matchAll(this.patterns.amount)];
      amountMatches.forEach(match => {
        const amount = parseFloat(match[0].replace(/,/g, ''));
        if (amount > 100) { // Filter out small numbers that aren't amounts
          amounts.push({
            line: line.number,
            content: line.content,
            amount: amount,
            formatted: match[0]
          });
        }
      });
    });
    
    console.log(`\n📋 FINANCIAL KEYWORD LINES:`);
    financialLines.forEach(line => {
      console.log(`  Line ${line.number}: "${line.content}"`);
    });
    
    console.log(`\n💵 DETECTED AMOUNTS (>100):`);
    amounts.sort((a, b) => b.amount - a.amount);
    amounts.slice(0, 20).forEach((item, index) => {
      console.log(`  ${index + 1}. Line ${item.line}: ${item.formatted} (${item.amount})`);
      console.log(`     Context: "${item.content}"`);
    });
    
    // Analyze amount patterns
    console.log(`\n📊 AMOUNT STATISTICS:`);
    if (amounts.length > 0) {
      const values = amounts.map(a => a.amount);
      const max = Math.max(...values);
      const min = Math.min(...values);
      const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
      
      console.log(`  Total amounts found: ${amounts.length}`);
      console.log(`  Largest amount: ${max.toLocaleString()}`);
      console.log(`  Smallest amount: ${min.toLocaleString()}`);
      console.log(`  Average amount: ${avg.toLocaleString()}`);
      
      // Group by size
      const sizeGroups = {
        'Small (100-10K)': values.filter(v => v >= 100 && v < 10000).length,
        'Medium (10K-100K)': values.filter(v => v >= 10000 && v < 100000).length,
        'Large (100K-1M)': values.filter(v => v >= 100000 && v < 1000000).length,
        'Very Large (1M+)': values.filter(v => v >= 1000000).length
      };
      
      Object.entries(sizeGroups).forEach(([range, count]) => {
        console.log(`  ${range}: ${count} amounts`);
      });
    }
  }

  showRawText(text) {
    console.log(`\n📝 RAW TEXT SAMPLE (First 1000 characters)`);
    console.log('-'.repeat(50));
    console.log(text.substring(0, 1000));
    console.log('\n...[truncated]...\n');
    
    console.log(`📝 RAW TEXT SAMPLE (Last 500 characters)`);
    console.log('-'.repeat(50));
    console.log(text.substring(text.length - 500));
  }

  exportAnalysis(pdfPath, text, lines) {
    const analysisDir = path.join(path.dirname(pdfPath), 'pdf-analysis');
    if (!fs.existsSync(analysisDir)) {
      fs.mkdirSync(analysisDir, { recursive: true });
    }
    
    const baseName = path.basename(pdfPath, '.pdf');
    
    // Export raw text
    const textFile = path.join(analysisDir, `${baseName}_raw_text.txt`);
    fs.writeFileSync(textFile, text, 'utf8');
    
    // Export structured lines
    const linesFile = path.join(analysisDir, `${baseName}_structured_lines.json`);
    fs.writeFileSync(linesFile, JSON.stringify(lines, null, 2), 'utf8');
    
    // Export analysis report
    const reportFile = path.join(analysisDir, `${baseName}_analysis_report.txt`);
    const report = `PDF Analysis Report for ${baseName}
Generated: ${new Date().toISOString()}

File: ${pdfPath}
Text Length: ${text.length} characters
Lines: ${lines.length} non-empty lines

This analysis was generated by the PDF Analyzer tool.
Check the accompanying files for detailed text extraction:
- ${baseName}_raw_text.txt: Complete extracted text
- ${baseName}_structured_lines.json: Line-by-line breakdown with numbers
`;
    
    fs.writeFileSync(reportFile, report, 'utf8');
    
    console.log(`\n📁 ANALYSIS EXPORTED:`);
    console.log(`  Directory: ${analysisDir}`);
    console.log(`  Files created:`);
    console.log(`    - ${baseName}_raw_text.txt`);
    console.log(`    - ${baseName}_structured_lines.json`);
    console.log(`    - ${baseName}_analysis_report.txt`);
  }
}

// Main execution
async function main() {
  const analyzer = new PDFAnalyzer();
  
  // Get PDF path from command line argument
  const pdfPath = process.argv[2];
  
  if (!pdfPath) {
    console.log('Usage: node analyzePDF.js <path-to-pdf>');
    console.log('Example: node analyzePDF.js ../Icdc/ICDC\\ 3.pdf');
    process.exit(1);
  }
  
  if (!fs.existsSync(pdfPath)) {
    console.error(`❌ File not found: ${pdfPath}`);
    process.exit(1);
  }
  
  await analyzer.analyzePDF(pdfPath);
  
  console.log('\n✅ Analysis complete!');
  console.log('📋 Use the exported files to understand the PDF structure.');
  console.log('🔧 This information can help improve the invoice parser.');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = PDFAnalyzer;
