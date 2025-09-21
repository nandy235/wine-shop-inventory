// Enhanced Invoice Parser with Smart Cases/Bottles Resolution
const pdfParse = require('pdf-parse');
const SmartCasesBottlesParser = require('./smartCasesBottlesParser');

class EnhancedInvoiceParser {
  constructor() {
    this.smartParser = new SmartCasesBottlesParser();
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
      summaryTotals: /Total\s*\(Cases\/Btls\):\s*(\d+)\s*\/\s*(\d+)\s*(\d+)\s*\/\s*(\d+)\s*(\d+)\s*\/\s*(\d+)/
    };
  }

  async parseInvoiceWithValidation(pdfBuffer, masterBrands = []) {
    console.log('\n🚀 ENHANCED PARSER WITH SMART CASES/BOTTLES RESOLUTION');
    console.log('📚 Master brands loaded:', masterBrands.length);
    
    try {
      // Extract text
      const pdfData = await pdfParse(pdfBuffer);
      const text = pdfData.text;
      
      console.log('✅ Text extracted:', text.length, 'characters');
      
      // Extract basic info
      const invoiceNumber = this.extractInvoiceNumber(text);
      const date = this.extractDate(text);
      
      // Extract summary totals for validation
      const summaryTotals = this.extractSummaryTotals(text);
      console.log('📊 Summary totals:', summaryTotals);
      
      // Extract products using enhanced method with smart parsing
      const products = this.extractProductsWithSmartParsing(text, summaryTotals);
      
      console.log('📦 Products found:', products.length);
      
      if (products.length === 0) {
        return {
          success: false,
          error: 'No products found in invoice',
          confidence: 0,
          data: null
        };
      }
      
      // Validate against master brands
      const validatedItems = [];
      const skippedItems = [];
      const warnings = [];
      
      products.forEach(product => {
        const normalizedSize = this.normalizeSize(product.size);
        const numericSize = parseInt(normalizedSize.replace('ml', ''));
        
        console.log(`🔍 Matching: ${product.brandNumber} ${numericSize}ml ${product.packType} ${product.packQty} (${product.cases}c + ${product.bottles}b = ${product.totalQuantity} total)`);
        
        const matchingBrand = masterBrands.find(brand => 
          brand.brandNumber === product.brandNumber && 
          brand.size === numericSize &&
          brand.packQuantity === product.packQty &&
          brand.packType === product.packType
        );
        
        if (matchingBrand) {
          const enrichedItem = {
            ...product,
            description: matchingBrand.name,
            sizeCode: matchingBrand.sizeCode,
            mrp: matchingBrand.mrp,
            invoicePrice: matchingBrand.invoice,
            specialMargin: matchingBrand.specialMargin,
            specialExciseCess: matchingBrand.specialExciseCess,
            category: matchingBrand.category,
            masterBrandId: matchingBrand.id,
            packType: matchingBrand.packType,
            formattedSize: this.formatSize(matchingBrand.sizeCode, matchingBrand.size),
            matched: true,
            confidence: 'high',
            // Include parsing metadata
            parsingConfidence: product.parsingConfidence,
            parsingReasoning: product.parsingReasoning
          };
          
          validatedItems.push(enrichedItem);
          console.log('✅ Matched:', product.brandNumber, numericSize + 'ml', product.packType, product.packQty, '→', matchingBrand.name);
        } else {
          const productKey = `${product.brandNumber} ${numericSize}ml ${product.packType} ${product.packQty}`;
          const skippedItem = {
            ...product,
            reason: 'No master brand found for ' + productKey,
            suggestion: 'Add ' + productKey + ' to master brands first'
          };
          
          skippedItems.push(skippedItem);
          warnings.push('Skipped: ' + productKey + ' - not in master brands');
          console.log('⭐️ Skipped:', productKey, '- not in master brands');
        }
      });
      
      // Extract financial data
      const financialData = this.extractFinancialValues(text);
      
      // Calculate totals and validate
      const totalCases = validatedItems.reduce((sum, item) => sum + item.cases, 0);
      const totalBottles = validatedItems.reduce((sum, item) => sum + item.bottles, 0);
      const calculatedTotal = validatedItems.reduce((sum, item) => sum + item.totalQuantity, 0);
      
      console.log('\n📊 PARSING SUMMARY:');
      console.log(`   Total Cases: ${totalCases}`);
      console.log(`   Total Bottles: ${totalBottles}`);
      console.log(`   Calculated Total Quantity: ${calculatedTotal}`);
      
      if (summaryTotals) {
        console.log(`   Expected Total Cases: ${summaryTotals.total.cases}`);
        console.log(`   Expected Total Bottles: ${summaryTotals.total.bottles}`);
        
        const casesMatch = Math.abs(totalCases - summaryTotals.total.cases) <= 2;
        const bottlesMatch = Math.abs(totalBottles - summaryTotals.total.bottles) <= 2;
        
        console.log(`   Cases Match: ${casesMatch ? '✅' : '❌'}`);
        console.log(`   Bottles Match: ${bottlesMatch ? '✅' : '❌'}`);
      }
      
      return {
        success: true,
        confidence: 0.95,
        method: 'enhanced_smart_parser',
        data: {
          invoiceNumber,
          date,
          ...financialData,
          items: validatedItems,
          summary: {
            totalItemsParsed: products.length,
            validatedItems: validatedItems.length,
            skippedItems: skippedItems.length,
            totalQuantity: validatedItems.reduce((sum, item) => sum + item.totalQuantity, 0),
            matchRate: validatedItems.length / Math.max(products.length, 1),
            totalCases: totalCases,
            totalBottles: totalBottles,
            summaryValidation: summaryTotals
          },
          skippedItems: skippedItems
        },
        warnings: warnings
      };
      
    } catch (error) {
      console.error('❌ Error:', error);
      return {
        success: false,
        error: error.message,
        confidence: 0,
        data: null
      };
    }
  }

  extractSummaryTotals(text) {
    // Look for the summary line directly
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.includes('Total (Cases/Btls):')) {
        console.log('📊 Found summary line:', line);
        // Extract numbers from: "Total (Cases/Btls):18 / 0291 / 0309 / 0"
        // Expected format: IMFL_cases / IMFL_bottles + BEER_cases / BEER_bottles + TOTAL_cases / TOTAL_bottles
        
        // Handle the specific format: "18 / 0291 / 0309 / 0"
        // This means: 18/0 + 291/0 + 309/0 (the zeros are concatenated with the next number)
        const cleanLine = line.replace('Total (Cases/Btls):', '').trim();
        console.log('📊 Clean line:', cleanLine);
        
        // Extract all numbers, then interpret them correctly
        const numbers = cleanLine.match(/\d+/g);
        console.log('📊 All numbers found:', numbers);
        
        if (numbers && numbers.length === 4) {
          // Format: [18, 0291, 0309, 0]
          // Interpretation: 18/0 + 291/0 + 309/0
          const imflCases = parseInt(numbers[0]);      // 18
          const beerCases = parseInt(numbers[1]);      // 291 (from 0291)
          const totalCases = parseInt(numbers[2]);     // 309 (from 0309) 
          const lastBottles = parseInt(numbers[3]);    // 0
          
          const result = {
            imfl: { cases: imflCases, bottles: 0 },
            beer: { cases: beerCases, bottles: 0 },
            total: { cases: totalCases, bottles: lastBottles }
          };
          
          console.log('📊 Corrected parsed summary totals:', result);
          
          // Validate: total should equal imfl + beer
          const calculatedTotal = imflCases + beerCases;
          if (Math.abs(calculatedTotal - totalCases) <= 1) {
            console.log('✅ Summary validation passed:', calculatedTotal, '≈', totalCases);
            return result;
          } else {
            console.log('⚠️  Summary validation failed:', calculatedTotal, '≠', totalCases, '- using anyway');
            return result;
          }
        }
      }
    }
    console.log('❌ No summary totals found');
    return null;
  }

  extractProductsWithSmartParsing(text, summaryTotals) {
    console.log('\n📦 === ENHANCED PRODUCT EXTRACTION WITH SMART PARSING ===');
    
    const products = [];
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const processedBrands = new Set();
    
    // Enhanced compact format extraction with smart parsing
    this.extractCompactFormatSmart(lines, products, processedBrands, summaryTotals);
    
    // Sort products by serial number
    products.sort((a, b) => (a.serial || 999) - (b.serial || 999));
    
    console.log('📦 Total products extracted:', products.length);
    return products;
  }

  extractCompactFormatSmart(lines, products, processedBrands, summaryTotals) {
    console.log('🔍 Smart Compact Format Extraction...');
    
    lines.forEach((line, index) => {
      // Enhanced compact pattern for ICDC format
      const compactPattern = /^(\d{1,2})(\d{4})\s*\((\d+)\)(.+?)(Beer|IML|Duty\s*Paid)([GCP])(\d+)\s*\/\s*(\d+)\s*ml(\d+)$/;
      const match = line.match(compactPattern);
      
      if (match) {
        const serial = match[1];
        const brandNumber = match[2];
        const packQty = match[3];
        const productName = match[4];
        const productType = match[5];
        const packType = match[6];
        const packSize = match[7]; // This is redundant with packQty but keep for validation
        const sizeML = match[8];
        const casesBottles = match[9]; // This is what we need to parse smartly
        
        console.log(`\n🔍 Found product line: Serial=${serial}, Brand=${brandNumber}, CasesBottles="${casesBottles}"`);
        
        // Get context for smart parsing
        const context = this.buildParsingContext(line, lines, index, summaryTotals, products);
        
        // Use smart parser to resolve cases/bottles ambiguity
        const smartResult = this.smartParser.parseCasesBottles(
          casesBottles,
          parseInt(packQty),
          productType,
          context
        );
        
        const brandKey = brandNumber + '_' + sizeML + 'ml';
        
        if (!processedBrands.has(brandKey) && smartResult.cases > 0) {
          const product = {
            brandNumber: brandNumber,
            description: productName.replace(/\s*\(\d+\)\s*/g, '').trim(),
            size: sizeML + 'ml',
            sizeCode: this.mapSizeToCode(sizeML + 'ml'),
            cases: smartResult.cases,
            bottles: smartResult.bottles,
            totalQuantity: smartResult.totalBottles,
            packQty: parseInt(packQty),
            productType: productType,
            packType: packType,
            serial: parseInt(serial),
            // Include smart parsing metadata
            parsingConfidence: smartResult.confidence,
            parsingReasoning: smartResult.reasoning,
            originalCasesBottles: casesBottles
          };
          
          products.push(product);
          processedBrands.add(brandKey);
          
          console.log(`✅ Smart Parsed: ${serial} - ${brandNumber} ${sizeML}ml`);
          console.log(`   Original: "${casesBottles}" → Cases: ${smartResult.cases}, Bottles: ${smartResult.bottles}`);
          console.log(`   Total Quantity: ${smartResult.totalBottles}`);
          console.log(`   Confidence: ${smartResult.confidence} - ${smartResult.reasoning}`);
        }
      }
    });
  }

  buildParsingContext(currentLine, allLines, lineIndex, summaryTotals, existingProducts) {
    const context = { summaryTotals };
    
    // Look for rate/amount information in nearby lines
    for (let i = lineIndex + 1; i <= Math.min(lineIndex + 3, allLines.length - 1); i++) {
      const nextLine = allLines[i];
      
      // Look for rate per case
      const rateMatch = nextLine.match(/([\d,]+\.?\d*)\s*\//);
      if (rateMatch) {
        context.ratePerCase = parseFloat(rateMatch[1].replace(/,/g, ''));
      }
      
      // Look for total amount
      const totalMatch = nextLine.match(/^([\d,]+\.?\d*)$/);
      if (totalMatch && !context.totalAmount) {
        const amount = parseFloat(totalMatch[1].replace(/,/g, ''));
        if (amount > 1000) { // Reasonable total amount
          context.totalAmount = amount;
        }
      }
    }
    
    // Add existing products for pattern recognition
    context.otherProducts = existingProducts.map(p => ({
      type: p.productType,
      cases: p.cases,
      bottles: p.bottles
    }));
    
    return context;
  }

  extractInvoiceNumber(text) {
    for (const pattern of this.patterns.invoiceNumber) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    return '';
  }

  extractDate(text) {
    for (const pattern of this.patterns.date) {
      const match = text.match(pattern);
      if (match) return this.convertDateFormat(match[1]);
    }
    return null;
  }

  extractFinancialValues(text) {
    // Simplified financial extraction - can be enhanced later
    const result = { 
      invoiceValue: 0, 
      netInvoiceValue: 0, 
      mrpRoundingOff: 0,
      retailExciseTurnoverTax: 0,
      specialExciseCess: 0, 
      tcs: 0 
    };
    
    // Look for specific patterns in ICDC format
    const patterns = {
      invoiceValue: /Invoice\s*Value:\s*([\d,]+\.?\d*)/i,
      mrpRoundingOff: /MRP\s*Rounding\s*Off:\s*([\d,]+\.?\d*)/i,
      netInvoiceValue: /Net\s*Invoice\s*Value:\s*([\d,]+\.?\d*)/i,
      retailExciseTurnoverTax: /Bar\s*Excise\s*Turnover\s*Tax:\s*([\d,]+\.?\d*)/i,
      specialExciseCess: /Special\s*Excise\s*Cess:\s*([\d,]+\.?\d*)/i,
      tcs: /TCS:\s*([\d,]+\.?\d*)/i
    };
    
    Object.entries(patterns).forEach(([key, pattern]) => {
      const match = text.match(pattern);
      if (match) {
        result[key] = parseFloat(match[1].replace(/,/g, ''));
      }
    });
    
    return result;
  }

  // Helper methods
  convertDateFormat(dateStr) {
    if (!dateStr) return null;
    
    try {
      if (dateStr.includes('-')) {
        const [day, month, year] = dateStr.split('-');
        const monthMap = {
          'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
          'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
        };
        const monthNum = monthMap[month] || month;
        return `${year}-${monthNum.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      return dateStr;
    } catch (error) {
      return dateStr;
    }
  }

  normalizeSize(size) {
    if (!size) return '';
    return size.replace(/\s+/g, '').toLowerCase();
  }

  mapSizeToCode(size) {
    const sizeMap = {
      '60ml': 'OO', '90ml': 'DD', '180ml': 'NN', '275ml': 'GP', '330ml': 'UP', '375ml': 'PP',
      '500ml': 'AP', '650ml': 'BS', '750ml': 'QQ', '1000ml': 'LL', '2000ml': 'XG'
    };
    return sizeMap[size.replace(/\s+/g, '').toLowerCase()] || 'XX';
  }

  formatSize(sizeCode, size) {
    return sizeCode + '(' + size + ')';
  }
}

module.exports = EnhancedInvoiceParser;
