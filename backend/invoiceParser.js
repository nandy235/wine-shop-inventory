// Comprehensive Invoice Parser - Handles All Formats

const pdfParse = require('pdf-parse');

class HybridInvoiceParser {
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
      ]
    };
  }

  async parseInvoiceWithValidation(pdfBuffer, masterBrands = []) {
    console.log('\n🚀 COMPREHENSIVE PARSER STARTED');
    console.log('📚 Master brands loaded:', masterBrands.length);
    
    try {
      // Extract text
      const pdfData = await pdfParse(pdfBuffer);
      const text = pdfData.text;
      
      console.log('✅ Text extracted:', text.length, 'characters');
      
      // Extract basic info
      const invoiceNumber = this.extractInvoiceNumber(text);
      const date = this.extractDate(text);
      const financialData = this.extractFinancialValues(text);
      
      console.log('📄 Invoice:', invoiceNumber, ', Date:', date);
      
      // Extract products using comprehensive method
      const products = this.extractProductsComprehensive(text);
      
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
        
        const matchingBrand = masterBrands.find(brand => 
          brand.brandNumber === product.brandNumber && 
          brand.size === normalizedSize
        );
        
        if (matchingBrand) {
          const enrichedItem = {
            ...product,
            sizeCode: matchingBrand.sizeCode,
            mrp: matchingBrand.mrp,
            category: matchingBrand.category,
            masterBrandId: matchingBrand.id,
            formattedSize: this.formatSize(matchingBrand.sizeCode, matchingBrand.size),
            matched: true,
            confidence: 'high'
          };
          
          validatedItems.push(enrichedItem);
          console.log('✅ Matched:', product.brandNumber, normalizedSize, '→', matchingBrand.name);
        } else {
          const skippedItem = {
            ...product,
            reason: 'No master brand found for ' + product.brandNumber + ' ' + normalizedSize,
            suggestion: 'Add ' + product.brandNumber + ' ' + normalizedSize + ' to master brands first'
          };
          
          skippedItems.push(skippedItem);
          warnings.push('Skipped: ' + product.brandNumber + ' ' + normalizedSize + ' - not in master brands');
          console.log('⭐️ Skipped:', product.brandNumber, normalizedSize, '- not in master brands');
        }
      });
      
      console.log('\n📊 Validation Results:');
      console.log('   ✅ Validated:', validatedItems.length);
      console.log('   ⭐️ Skipped:', skippedItems.length);
      console.log('   📈 Match Rate:', (validatedItems.length / Math.max(products.length, 1) * 100).toFixed(1) + '%');
      
      return {
        success: true,
        confidence: 0.95,
        method: 'comprehensive_parser',
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
            matchRate: validatedItems.length / Math.max(products.length, 1)
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

  extractProductsComprehensive(text) {
    console.log('\n📦 === COMPREHENSIVE PRODUCT EXTRACTION ===');
    
    const products = [];
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const processedBrands = new Set();
    
    // Format 1: Table-based extraction (cleanest format)
    console.log('🔍 Format 1: Table-based extraction...');
    this.extractTableFormat(lines, products, processedBrands);
    
    // Format 2: Compact single-line format 
    console.log('🔍 Format 2: Compact single-line format...');
    this.extractCompactFormat(lines, products, processedBrands);
    
    // Format 3: Vertical multi-line format (with parentheses)
    console.log('🔍 Format 3: Vertical multi-line format...');
    this.extractVerticalFormat(lines, products, processedBrands);
    
    // Format 4: Standalone brand format (no parentheses)
    console.log('🔍 Format 4: Standalone brand format...');
    this.extractStandaloneFormat(lines, products, processedBrands);
    
    // Format 5: Flexible pattern recovery
    console.log('🔍 Format 5: Flexible pattern recovery...');
    this.extractFlexiblePatterns(lines, products, processedBrands);
    
    console.log('📦 Total products extracted:', products.length);
    return products;
  }

  extractTableFormat(lines, products, processedBrands) {
    lines.forEach((line, index) => {
      // Enhanced table row pattern supporting all product types and pack types
      const tablePatterns = [
        // Standard table format: 1  5016 (12)  KING FISHER PREMIUM LAGER BEER  Beer  G  12 / 650 ml  100  0
        /^(\d{1,2})\s+(\d{4})\s*\((\d+)\)\s+(.+?)\s+(Beer|IML|Duty\s*Paid)\s+([GCP])\s+(\d+)\s*\/\s*(\d+)\s*ml\s+(\d+)\s+(\d+)/,
        // Compact table format without parentheses: 1  5016  KING FISHER PREMIUM LAGER BEER  Beer  G  12 / 650 ml  100  0
        /^(\d{1,2})\s+(\d{4})\s+(.+?)\s+(Beer|IML|Duty\s*Paid)\s+([GCP])\s+(\d+)\s*\/\s*(\d+)\s*ml\s+(\d+)\s+(\d+)/
      ];
      
      for (const pattern of tablePatterns) {
        const match = line.match(pattern);
        if (match) {
          const serial = match[1];
          const brandNumber = match[2];
          const packQty = match[3] || match[7]; // Pack qty might be in parentheses or later
          const productName = match[4] || match[3]; // Adjust based on pattern
          const productType = match[5] || match[4];
          const packType = match[6] || match[5];
          const packSize = match[7] || match[6];
          const sizeML = match[8] || match[7];
          const cases = match[9] || match[8];
          const bottles = match[10] || match[9] || '0';
          
          const brandKey = brandNumber + '_' + sizeML + 'ml';
          
          if (!processedBrands.has(brandKey) && cases && parseInt(cases) > 0) {
            const product = {
              brandNumber: brandNumber,
              description: productName.trim(),
              size: sizeML + 'ml',
              sizeCode: this.mapSizeToCode(sizeML + 'ml'),
              cases: parseInt(cases) || 0,
              bottles: parseInt(bottles) || 0,
              totalQuantity: parseInt(cases) + (parseInt(bottles) || 0),
              packQty: parseInt(packQty) || parseInt(packSize) || 12,
              productType: productType,
              packType: packType,
              serial: parseInt(serial)
            };
            
            products.push(product);
            processedBrands.add(brandKey);
            console.log('✅ Table: ' + serial + ' - ' + brandNumber + ' ' + sizeML + 'ml - Qty: ' + product.totalQuantity);
            break;
          }
        }
      }
    });
  }

  extractCompactFormat(lines, products, processedBrands) {
    lines.forEach((line, index) => {
      // Enhanced compact patterns - FIXED to handle concatenated cases+bottles
      const compactPatterns = [
        // Pattern: 15016KING FISHER PREMIUM LAGER BEERBeerG12 / 650 ml1000
        // Groups:  (1)(2)(3                            )(4 )(5)(6) (7) (8  )
        /^(\d{1,2})(\d{4})(.+?)(Beer|IML|Duty\s*Paid)([GCP])(\d+)\s*\/\s*(\d+)\s*ml(\d+)$/
      ];
      
      for (const pattern of compactPatterns) {
        const match = line.match(pattern);
        if (match) {
          const serial = match[1];           // 1
          const brandNumber = match[2];      // 5016
          const productName = match[3];      // KING FISHER PREMIUM LAGER BEER
          const productType = match[4];      // Beer
          const packType = match[5];         // G
          const packQty = match[6];          // 12
          const sizeML = match[7];           // 650 (ACTUAL SIZE)
          const casesBottles = match[8];     // 1000 (concatenated cases+bottles)
          
          // Parse concatenated cases and bottles
          // Examples: "1000" = 100 cases + 0 bottles, "2911" = 29 cases + 11 bottles
          let cases = 0;
          let bottles = 0;
          
          if (casesBottles.length >= 3) {
            // Extract last 1-2 digits as bottles, rest as cases
            if (casesBottles.length === 3) {
              // "100" = 10 cases, 0 bottles
              cases = parseInt(casesBottles.substring(0, 2));
              bottles = parseInt(casesBottles.substring(2));
            } else if (casesBottles.length === 4) {
              // "1000" = 100 cases, 0 bottles OR "2911" = 29 cases, 11 bottles
              const lastTwo = casesBottles.substring(casesBottles.length - 2);
              if (lastTwo === '00') {
                // Likely all cases: "1000" = 100 cases, 0 bottles
                cases = parseInt(casesBottles.substring(0, casesBottles.length - 1));
                bottles = 0;
              } else {
                // Mixed: "2911" = 29 cases, 11 bottles
                cases = parseInt(casesBottles.substring(0, casesBottles.length - 2));
                bottles = parseInt(lastTwo);
              }
            } else {
              // Longer numbers, assume last 2 digits are bottles
              cases = parseInt(casesBottles.substring(0, casesBottles.length - 2));
              bottles = parseInt(casesBottles.substring(casesBottles.length - 2));
            }
          } else {
            // Short numbers, all cases
            cases = parseInt(casesBottles);
            bottles = 0;
          }
          
          const brandKey = brandNumber + '_' + sizeML + 'ml';
          
          if (!processedBrands.has(brandKey) && cases > 0) {
            const product = {
              brandNumber: brandNumber,
              description: productName.trim(),
              size: sizeML + 'ml',
              sizeCode: this.mapSizeToCode(sizeML + 'ml'),
              cases: cases,
              bottles: bottles,
              totalQuantity: cases + bottles,
              packQty: parseInt(packQty) || 12,
              productType: productType,
              packType: packType,
              serial: parseInt(serial)
            };
            
            products.push(product);
            processedBrands.add(brandKey);
            console.log('✅ Compact: ' + serial + ' - ' + brandNumber + ' ' + sizeML + 'ml - Cases: ' + cases + ', Bottles: ' + bottles + ', Total: ' + product.totalQuantity);
            break;
          }
        }
      }
    });
  }

  extractVerticalFormat(lines, products, processedBrands) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for vertical format header with parentheses: "15016 (12)"
      const headerMatch = line.match(/^(\d{1,2})(\d{4})\s*\((\d+)\)$/);
      
      if (headerMatch) {
        const serial = headerMatch[1];
        const brandNumber = headerMatch[2];
        const packQty = headerMatch[3];
        
        let productName = '';
        let productType = '';
        let packType = '';
        let sizeML = '';
        let cases = '';
        let bottles = '';
        
        // Look ahead for product details
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const nextLine = lines[j].trim();
          
          // Stop if we hit another product or end of section
          if (/^\d{1,2}\d{4}/.test(nextLine) || /TIN\s*NO:|Particulars|Invoice\s*Qty/i.test(nextLine)) {
            break;
          }
          
          // Collect product name from text lines
          if (/^[A-Z\s`'&.-]+$/.test(nextLine) && 
              nextLine.length > 2 && 
              !/^(Beer|IML|Duty)/i.test(nextLine) &&
              !/^\d/.test(nextLine) &&
              !/(Rs\.|Rate|Case|Total)/i.test(nextLine)) {
            productName += (productName ? ' ' : '') + nextLine;
          }
          
          // Look for product details line
          const detailPatterns = [
            /(Beer|IML|Duty\s*Paid)([GCP])(\d+)\s*\/\s*(\d+)\s*ml(\d+)(\d+)?/,
            /(Beer|IML|Duty\s*Paid)\s*([GCP])\s*(\d+)\s*\/\s*(\d+)\s*ml\s*(\d+)\s*(\d+)?/
          ];
          
          for (const detailPattern of detailPatterns) {
            const detailMatch = nextLine.match(detailPattern);
            if (detailMatch) {
              productType = detailMatch[1];
              packType = detailMatch[2];
              sizeML = detailMatch[4];
              cases = detailMatch[5];
              bottles = detailMatch[6] || '0';
              break;
            }
          }
          
          if (productType && cases) break;
        }
        
        if (productType && cases) {
          const brandKey = brandNumber + '_' + sizeML + 'ml';
          
          if (!processedBrands.has(brandKey) && parseInt(cases) > 0) {
            const product = {
              brandNumber: brandNumber,
              description: productName.trim() || 'Product ' + brandNumber,
              size: sizeML + 'ml',
              sizeCode: this.mapSizeToCode(sizeML + 'ml'),
              cases: parseInt(cases) || 0,
              bottles: parseInt(bottles) || 0,
              totalQuantity: parseInt(cases) + (parseInt(bottles) || 0),
              packQty: parseInt(packQty) || 12,
              productType: productType,
              packType: packType,
              serial: parseInt(serial)
            };
            
            products.push(product);
            processedBrands.add(brandKey);
            console.log('✅ Vertical: ' + serial + ' - ' + brandNumber + ' ' + sizeML + 'ml - "' + productName.trim() + '" - Qty: ' + product.totalQuantity);
          }
        }
      }
    }
  }

  extractStandaloneFormat(lines, products, processedBrands) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for standalone brand header (no parentheses): "170258"
      const headerMatch = line.match(/^(\d{1,2})(\d{4})$/);
      
      if (headerMatch) {
        const serial = headerMatch[1];
        const brandNumber = headerMatch[2];
        
        let productName = '';
        let productType = '';
        let packType = '';
        let packQty = '';
        let sizeML = '';
        let cases = '';
        let bottles = '';
        
        // Look ahead for product details
        for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
          const nextLine = lines[j].trim();
          
          // Stop if we hit another product
          if (/^\d{1,2}\d{4}/.test(nextLine) || /TIN\s*NO:|Particulars/i.test(nextLine)) {
            break;
          }
          
          // Collect product name
          if (/^[A-Z\s`'&.-]+$/.test(nextLine) && 
              nextLine.length > 2 && 
              !/^(Beer|IML|Duty)/i.test(nextLine) &&
              !/^\d/.test(nextLine)) {
            productName += (productName ? ' ' : '') + nextLine;
          }
          
          // Look for details with pack info
          const detailMatch = nextLine.match(/(Beer|IML|Duty\s*Paid)([GCP])(\d+)\s*\/\s*(\d+)\s*ml(\d+)(\d+)?/);
          if (detailMatch) {
            productType = detailMatch[1];
            packType = detailMatch[2];
            packQty = detailMatch[3];
            sizeML = detailMatch[4];
            cases = detailMatch[5];
            bottles = detailMatch[6] || '0';
            break;
          }
        }
        
        if (productType && cases) {
          const brandKey = brandNumber + '_' + sizeML + 'ml';
          
          if (!processedBrands.has(brandKey) && parseInt(cases) > 0) {
            const product = {
              brandNumber: brandNumber,
              description: productName.trim() || 'Product ' + brandNumber,
              size: sizeML + 'ml',
              sizeCode: this.mapSizeToCode(sizeML + 'ml'),
              cases: parseInt(cases) || 0,
              bottles: parseInt(bottles) || 0,
              totalQuantity: parseInt(cases) + (parseInt(bottles) || 0),
              packQty: parseInt(packQty) || 12,
              productType: productType,
              packType: packType,
              serial: parseInt(serial)
            };
            
            products.push(product);
            processedBrands.add(brandKey);
            console.log('✅ Standalone: ' + serial + ' - ' + brandNumber + ' ' + sizeML + 'ml - "' + productName.trim() + '" - Qty: ' + product.totalQuantity);
          }
        }
      }
    }
  }

  extractFlexiblePatterns(lines, products, processedBrands) {
    // Target specific brands that commonly get missed
    const knownBrands = ['5019', '5031', '8031', '9099', '0258', '0475', '0797', '1079', '1713', '7154', '7355'];
    
    knownBrands.forEach(brandNumber => {
      // Check if already processed
      const alreadyProcessed = Array.from(processedBrands).some(key => key.startsWith(brandNumber + '_'));
      
      if (!alreadyProcessed) {
        console.log('🔍 Looking for missed brand: ' + brandNumber);
        
        // Find all lines containing this brand
        const brandLines = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes(brandNumber)) {
            let combinedText = line;
            
            // Combine with next few lines
            for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
              const nextLine = lines[j].trim();
              if (/^\d{1,2}\d{4}/.test(nextLine) || /TIN\s*NO:/i.test(nextLine)) break;
              combinedText += ' ' + nextLine;
            }
            
            brandLines.push(combinedText);
          }
        }
        
        // Try to extract from combined text
        brandLines.forEach(combinedText => {
          const flexiblePatterns = [
            new RegExp('(\\d{1,2})?' + brandNumber + '.*?(Beer|IML|Duty\\s*Paid)([GCP])(\\d+)\\s*\\/\\s*(\\d+)\\s*ml(\\d+)(\\d*)'),
            new RegExp(brandNumber + '.*?(\\d+)\\s*\\/\\s*(\\d+)\\s*ml.*?(\\d+)'),
            new RegExp('(\\d{1,2})' + brandNumber + '.*?(\\d+)ml.*?(\\d+)')
          ];
          
          for (const pattern of flexiblePatterns) {
            const match = combinedText.match(pattern);
            if (match) {
              let serial = '0';
              let productType = 'IML';
              let packType = 'G';
              let packQty = '12';
              let sizeML = '';
              let cases = '';
              let bottles = '0';
              
              if (match.length >= 7) {
                // Full match
                serial = match[1] || '0';
                productType = match[2];
                packType = match[3];
                packQty = match[4];
                sizeML = match[5];
                cases = match[6];
                bottles = match[7] || '0';
              } else if (match.length >= 4) {
                // Partial match
                packQty = match[1] || '12';
                sizeML = match[2];
                cases = match[3];
              }
              
              if (sizeML && cases && parseInt(cases) > 0) {
                const brandKey = brandNumber + '_' + sizeML + 'ml';
                
                if (!processedBrands.has(brandKey)) {
                  // Extract product name
                  let productName = combinedText
                    .replace(new RegExp('\\d{1,2}' + brandNumber), '')
                    .replace(/(Beer|IML|Duty\s*Paid)[GCP]\d+\/\d+ml\d+.*/, '')
                    .replace(/\d+\.\d+.*/, '')
                    .trim();
                  
                  const product = {
                    brandNumber: brandNumber,
                    description: productName || 'Product ' + brandNumber,
                    size: sizeML + 'ml',
                    sizeCode: this.mapSizeToCode(sizeML + 'ml'),
                    cases: parseInt(cases) || 0,
                    bottles: parseInt(bottles) || 0,
                    totalQuantity: parseInt(cases) + (parseInt(bottles) || 0),
                    packQty: parseInt(packQty) || 12,
                    productType: productType,
                    packType: packType,
                    serial: parseInt(serial) || 0
                  };
                  
                  products.push(product);
                  processedBrands.add(brandKey);
                  console.log('✅ Flexible: ' + (serial || '?') + ' - ' + brandNumber + ' ' + sizeML + 'ml - "' + (productName || 'Unknown') + '" - Qty: ' + product.totalQuantity);
                  break;
                }
              }
            }
          }
        });
      }
    });
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
    const result = { 
      invoiceValue: 0, 
      netInvoiceValue: 0, 
      retailExciseTax: 0, 
      specialExciseCess: 0, 
      tcs: 0 
    };
    
    const invoiceValueMatch = text.match(/Invoice\s*Value[:\s]*([\d,]+\.?\d*)/i);
    if (invoiceValueMatch) result.invoiceValue = this.parseAmount(invoiceValueMatch[1]);

    const netValueMatch = text.match(/Net\s*Invoice\s*Value[:\s]*([\d,]+\.?\d*)/i);
    if (netValueMatch) result.netInvoiceValue = this.parseAmount(netValueMatch[1]);

    const retailTaxMatch = text.match(/Retail\s*Shop\s*Excise.*?Tax[:\s]*([\d,]+\.?\d*)/i);
    if (retailTaxMatch) result.retailExciseTax = this.parseAmount(retailTaxMatch[1]);

    const specialCessMatch = text.match(/Special\s*Excise\s*Cess[:\s]*([\d,]+\.?\d*)/i);
    if (specialCessMatch) result.specialExciseCess = this.parseAmount(specialCessMatch[1]);

    const tcsMatch = text.match(/TCS[:\s]*([\d,]+\.?\d*)/i);
    if (tcsMatch) result.tcs = this.parseAmount(tcsMatch[1]);

    result.totalAmount = result.netInvoiceValue || result.invoiceValue;
    
    return result;
  }

  parseAmount(amountStr) {
    if (!amountStr) return 0;
    return parseFloat(amountStr.replace(/,/g, ''));
  }

  convertDateFormat(dateStr) {
    if (!dateStr) return null;
    
    try {
      const months = {
        'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
        'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
        'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
      };
      
      const match = dateStr.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
      if (match) {
        const day = match[1].padStart(2, '0');
        const month = months[match[2]];
        const year = match[3];
        if (month) return year + '-' + month + '-' + day;
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

module.exports = HybridInvoiceParser;