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
        // Extract numeric size from "650ml" -> 650
        const numericSize = parseInt(normalizedSize.replace('ml', ''));
        
        console.log(`🔍 Attempting to match: ${product.brandNumber} ${numericSize}ml ${product.packType} ${product.packQty}`);
        
        const matchingBrand = masterBrands.find(brand => 
          brand.brandNumber === product.brandNumber && 
          brand.size === numericSize &&
          brand.packQuantity === product.packQty &&
          brand.packType === product.packType
        );
        
        if (matchingBrand) {
          const enrichedItem = {
            ...product,
            description: matchingBrand.name, // Use the database brand name instead of parsed description
            sizeCode: matchingBrand.sizeCode,
            mrp: matchingBrand.mrp,
            category: matchingBrand.category,
            masterBrandId: matchingBrand.id,
            formattedSize: this.formatSize(matchingBrand.sizeCode, matchingBrand.size),
            matched: true,
            confidence: 'high'
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
          console.log('⭐️ Skipped:', product.brandNumber, numericSize + 'ml', product.packType, product.packQty, '- not in master brands');
          
          // Debug: Show what master brands exist for this brand number
          const availableVariants = masterBrands.filter(brand => brand.brandNumber === product.brandNumber);
          if (availableVariants.length > 0) {
            console.log(`   Available variants for ${product.brandNumber}:`);
            availableVariants.slice(0, 3).forEach(variant => {
              console.log(`   - ${variant.size}ml ${variant.packType} ${variant.packQuantity} (${variant.name})`);
            });
            if (availableVariants.length > 3) {
              console.log(`   ... and ${availableVariants.length - 3} more variants`);
            }
          } else {
            console.log(`   No variants found for brand ${product.brandNumber} in master brands`);
          }
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
    

    // Sort products by serial number to maintain invoice order
    products.sort((a, b) => (a.serial || 999) - (b.serial || 999));
    
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
              description: productName.replace(/\s*\(\d+\)\s*/g, '').trim(),
              size: sizeML + 'ml',
              sizeCode: this.mapSizeToCode(sizeML + 'ml'),
              cases: parseInt(cases) || 0,
              bottles: parseInt(bottles) || 0,
              totalQuantity: (parseInt(cases) * (parseInt(packQty) || parseInt(packSize) || 12)) + (parseInt(bottles) || 0),
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
          // Examples: "3300" = 330 cases + 0 bottles, "500" = 50 cases + 0 bottles, "50" = 5 cases + 0 bottles
          let cases = 0;
          let bottles = 0;
          
          console.log(`🔍 Debug brand ${brandNumber}: raw="${casesBottles}" length=${casesBottles.length}`);
          
          if (casesBottles.length >= 2) {
            // For most cases, the last digit is bottles (usually 0), rest are cases
            if (casesBottles.length === 2) {
              // "50" = 5 cases, 0 bottles
              cases = parseInt(casesBottles.substring(0, 1));
              bottles = parseInt(casesBottles.substring(1));
            } else if (casesBottles.length === 3) {
              // "500" = 50 cases, 0 bottles OR "423" = 4 cases, 23 bottles OR "423" = 42 cases, 3 bottles
              const lastDigit = casesBottles.substring(2);
              
              if (lastDigit === '0') {
                // Numbers ending in 0: "740" = 74 cases, 0 bottles, "500" = 50 cases, 0 bottles
                cases = parseInt(casesBottles.substring(0, 2));
                bottles = 0;
                console.log(`🎯 3-digit validation (ending in 0): "${casesBottles}" → ${cases}c, ${bottles}b`);
              } else {
                // Numbers NOT ending in 0: Apply complex validation logic
                // Need to determine: "423" = 4 cases, 23 bottles OR 42 cases, 3 bottles?
                const lastTwoDigits = casesBottles.substring(1);
                const option1_cases = parseInt(casesBottles.substring(0, 1)); // 4
                const option1_bottles = parseInt(lastTwoDigits); // 23
                const option2_cases = parseInt(casesBottles.substring(0, 2)); // 42
                const option2_bottles = parseInt(casesBottles.substring(2)); // 3
                
                const packQtyNum = parseInt(packQty);
                
                // If option1 bottles > pack quantity, it's definitely wrong
                if (option1_bottles > packQtyNum) {
                  // Use option2: 42 cases, 3 bottles
                  cases = option2_cases;
                  bottles = option2_bottles;
                  console.log(`🎯 3-digit validation: "${casesBottles}" → ${option2_cases}c, ${option2_bottles}b (${option1_bottles} > ${packQtyNum})`);
                } else if (option2_bottles > packQtyNum) {
                  // Use option1: 4 cases, 23 bottles
                  cases = option1_cases;
                  bottles = option1_bottles;
                  console.log(`🎯 3-digit validation: "${casesBottles}" → ${option1_cases}c, ${option1_bottles}b (${option2_bottles} > ${packQtyNum})`);
                } else {
                  // Both are valid, choose the one closer to pack quantity
                  const option1_diff = Math.abs(packQtyNum - option1_bottles);
                  const option2_diff = Math.abs(packQtyNum - option2_bottles);
                  
                  if (option1_diff <= option2_diff) {
                    // Option1 is closer to pack quantity
                    cases = option1_cases;
                    bottles = option1_bottles;
                    console.log(`🎯 3-digit validation: "${casesBottles}" → ${option1_cases}c, ${option1_bottles}b (${option1_bottles} closer to ${packQtyNum} than ${option2_bottles})`);
                  } else {
                    // Option2 is closer to pack quantity
                    cases = option2_cases;
                    bottles = option2_bottles;
                    console.log(`🎯 3-digit validation: "${casesBottles}" → ${option2_cases}c, ${option2_bottles}b (${option2_bottles} closer to ${packQtyNum} than ${option1_bottles})`);
                  }
                }
              }
            } else if (casesBottles.length === 4) {
              // "3300" = 330 cases, 0 bottles OR "2911" = 29 cases, 11 bottles OR "2911" = 291 cases, 1 bottle
              const lastTwo = casesBottles.substring(2);
              if (lastTwo === '00') {
                // "3300" = 330 cases, 0 bottles
                cases = parseInt(casesBottles.substring(0, 3));
                bottles = 0;
              } else {
                // Need to determine: "2911" = 29 cases, 11 bottles OR 291 cases, 1 bottle?
                const option1_cases = parseInt(casesBottles.substring(0, 2)); // 29
                const option1_bottles = parseInt(lastTwo); // 11
                const option2_cases = parseInt(casesBottles.substring(0, 3)); // 291
                const option2_bottles = parseInt(casesBottles.substring(3)); // 1
                
                const packQtyNum = parseInt(packQty);
                
                // If option1 bottles > pack quantity, it's definitely wrong
                if (option1_bottles > packQtyNum) {
                  // Use option2: 291 cases, 1 bottle
                  cases = option2_cases;
                  bottles = option2_bottles;
                  console.log(`🎯 4-digit validation: "${casesBottles}" → ${option2_cases}c, ${option2_bottles}b (${option1_bottles} > ${packQtyNum})`);
                } else if (option2_bottles > packQtyNum) {
                  // Use option1: 29 cases, 11 bottles
                  cases = option1_cases;
                  bottles = option1_bottles;
                  console.log(`🎯 4-digit validation: "${casesBottles}" → ${option1_cases}c, ${option1_bottles}b (${option2_bottles} > ${packQtyNum})`);
                } else {
                  // Both are valid, choose the one closer to pack quantity
                  const option1_diff = Math.abs(packQtyNum - option1_bottles);
                  const option2_diff = Math.abs(packQtyNum - option2_bottles);
                  
                  if (option1_diff <= option2_diff) {
                    // Option1 is closer to pack quantity
                    cases = option1_cases;
                    bottles = option1_bottles;
                    console.log(`🎯 4-digit validation: "${casesBottles}" → ${option1_cases}c, ${option1_bottles}b (${option1_bottles} closer to ${packQtyNum} than ${option2_bottles})`);
                  } else {
                    // Option2 is closer to pack quantity
                    cases = option2_cases;
                    bottles = option2_bottles;
                    console.log(`🎯 4-digit validation: "${casesBottles}" → ${option2_cases}c, ${option2_bottles}b (${option2_bottles} closer to ${packQtyNum} than ${option1_bottles})`);
                  }
                }
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
          
          console.log(`✅ Parsed ${brandNumber}: "${casesBottles}" → Cases: ${cases}, Bottles: ${bottles}`);
          
          const brandKey = brandNumber + '_' + sizeML + 'ml';
          
          if (!processedBrands.has(brandKey) && cases > 0) {
                      // Clean product name - remove numbers in brackets like "(48)"
          const cleanProductName = productName.replace(/\s*\(\d+\)\s*/g, '').trim();
          
          const product = {
            brandNumber: brandNumber,
            description: cleanProductName,
            size: sizeML + 'ml',
            sizeCode: this.mapSizeToCode(sizeML + 'ml'),
            cases: cases,
              bottles: bottles,
              totalQuantity: (cases * (parseInt(packQty) || 12)) + bottles,
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
            // Pattern 1: Concatenated cases+bottles (e.g., BeerG12/650ml6800 -> 680 cases, 0 bottles)
            /(Beer|IML|Duty\s*Paid)([GCP])(\d+)\s*\/\s*(\d+)\s*ml(\d+)$/,
            // Pattern 2: Spaced cases and bottles (e.g., BeerG12/650ml 680 0)
            /(Beer|IML|Duty\s*Paid)\s*([GCP])\s*(\d+)\s*\/\s*(\d+)\s*ml\s*(\d+)\s*(\d+)?/
          ];
          
          for (let patternIndex = 0; patternIndex < detailPatterns.length; patternIndex++) {
            const detailPattern = detailPatterns[patternIndex];
            const detailMatch = nextLine.match(detailPattern);
            if (detailMatch) {
              productType = detailMatch[1];
              packType = detailMatch[2];
              sizeML = detailMatch[4];
              
              if (patternIndex === 0) {
                // Pattern 1: Concatenated cases+bottles (e.g., 6800 -> 680 cases, 0 bottles)
                const concatenated = detailMatch[5];
                if (concatenated && concatenated.length > 1) {
                  // Split concatenated number: last digit is bottles, rest is cases
                  cases = concatenated.slice(0, -1);
                  bottles = concatenated.slice(-1);
                  
                  // Special case: if bottles digit is not 0, it might be part of cases
                  // For beer, bottles are usually 0, so if last digit > 0, it's likely part of cases
                  if (parseInt(bottles) > 0 && concatenated.endsWith('0')) {
                    cases = concatenated;
                    bottles = '0';
                  }
                } else {
                  cases = concatenated;
                  bottles = '0';
                }
              } else {
                // Pattern 2: Normal spaced format
                cases = detailMatch[5];
                bottles = detailMatch[6] || '0';
              }
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
              description: productName.replace(/\s*\(\d+\)\s*/g, '').trim() || 'Product ' + brandNumber,
              size: sizeML + 'ml',
              sizeCode: this.mapSizeToCode(sizeML + 'ml'),
              cases: parseInt(cases) || 0,
              bottles: parseInt(bottles) || 0,
              totalQuantity: (parseInt(cases) * (parseInt(packQty) || 12)) + (parseInt(bottles) || 0),
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
          
          // Look for details with pack info - capture concatenated cases+bottles
          const detailMatch = nextLine.match(/(Beer|IML|Duty\s*Paid)([GCP])(\d+)\s*\/\s*(\d+)\s*ml(\d+)$/);
          if (detailMatch) {
            productType = detailMatch[1];
            packType = detailMatch[2];
            packQty = detailMatch[3];
            sizeML = detailMatch[4];
            const casesBottles = detailMatch[5]; // Concatenated cases+bottles
            
            console.log(`🔍 Debug standalone ${brandNumber}: raw="${casesBottles}" length=${casesBottles.length}`);
            
            // Apply the same smart parsing logic as Compact format
            let parsedCases = 0;
            let parsedBottles = 0;
            
            if (casesBottles.length >= 2) {
              // For most cases, the last digit is bottles (usually 0), rest are cases
              if (casesBottles.length === 2) {
                // "50" = 5 cases, 0 bottles
                parsedCases = parseInt(casesBottles.substring(0, 1));
                parsedBottles = parseInt(casesBottles.substring(1));
              } else if (casesBottles.length === 3) {
                // "500" = 50 cases, 0 bottles OR "423" = 4 cases, 23 bottles
                const lastDigit = casesBottles.substring(2);
                
                if (lastDigit === '0') {
                  // Numbers ending in 0: "740" = 74 cases, 0 bottles, "500" = 50 cases, 0 bottles
                  parsedCases = parseInt(casesBottles.substring(0, 2));
                  parsedBottles = 0;
                  console.log(`🎯 3-digit standalone validation (ending in 0): "${casesBottles}" → ${parsedCases}c, ${parsedBottles}b`);
                } else {
                  // Numbers NOT ending in 0: Apply complex validation logic
                  // Need to determine: "423" = 4 cases, 23 bottles OR 42 cases, 3 bottles?
                  const lastTwoDigits = casesBottles.substring(1);
                  const option1_cases = parseInt(casesBottles.substring(0, 1)); // 4
                  const option1_bottles = parseInt(lastTwoDigits); // 23
                  const option2_cases = parseInt(casesBottles.substring(0, 2)); // 42
                  const option2_bottles = parseInt(casesBottles.substring(2)); // 3
                  
                  const packQtyNum = parseInt(packQty);
                  
                  // If option1 bottles > pack quantity, it's definitely wrong
                  if (option1_bottles > packQtyNum) {
                    // Use option2: 42 cases, 3 bottles
                    parsedCases = option2_cases;
                    parsedBottles = option2_bottles;
                    console.log(`🎯 3-digit standalone validation: "${casesBottles}" → ${option2_cases}c, ${option2_bottles}b (${option1_bottles} > ${packQtyNum})`);
                  } else if (option2_bottles > packQtyNum) {
                    // Use option1: 4 cases, 23 bottles
                    parsedCases = option1_cases;
                    parsedBottles = option1_bottles;
                    console.log(`🎯 3-digit standalone validation: "${casesBottles}" → ${option1_cases}c, ${option1_bottles}b (${option2_bottles} > ${packQtyNum})`);
                  } else {
                    // Both are valid, choose the one closer to pack quantity
                    const option1_diff = Math.abs(packQtyNum - option1_bottles);
                    const option2_diff = Math.abs(packQtyNum - option2_bottles);
                    
                    if (option1_diff <= option2_diff) {
                      // Option1 is closer to pack quantity
                      parsedCases = option1_cases;
                      parsedBottles = option1_bottles;
                      console.log(`🎯 3-digit standalone validation: "${casesBottles}" → ${option1_cases}c, ${option1_bottles}b (${option1_bottles} closer to ${packQtyNum} than ${option2_bottles})`);
                    } else {
                      // Option2 is closer to pack quantity
                      parsedCases = option2_cases;
                      parsedBottles = option2_bottles;
                      console.log(`🎯 3-digit standalone validation: "${casesBottles}" → ${option2_cases}c, ${option2_bottles}b (${option2_bottles} closer to ${packQtyNum} than ${option1_bottles})`);
                    }
                  }
                }
              } else if (casesBottles.length === 4) {
                // "3300" = 330 cases, 0 bottles OR "2911" = 29 cases, 11 bottles OR "2911" = 291 cases, 1 bottle
                const lastTwo = casesBottles.substring(2);
                if (lastTwo === '00') {
                  // "3300" = 330 cases, 0 bottles
                  parsedCases = parseInt(casesBottles.substring(0, 3));
                  parsedBottles = 0;
                } else {
                  // Need to determine: "2911" = 29 cases, 11 bottles OR 291 cases, 1 bottle?
                  const option1_cases = parseInt(casesBottles.substring(0, 2)); // 29
                  const option1_bottles = parseInt(lastTwo); // 11
                  const option2_cases = parseInt(casesBottles.substring(0, 3)); // 291
                  const option2_bottles = parseInt(casesBottles.substring(3)); // 1
                  
                  const packQtyNum = parseInt(packQty);
                  
                  // If option1 bottles > pack quantity, it's definitely wrong
                  if (option1_bottles > packQtyNum) {
                    // Use option2: 291 cases, 1 bottle
                    parsedCases = option2_cases;
                    parsedBottles = option2_bottles;
                    console.log(`🎯 4-digit standalone validation: "${casesBottles}" → ${option2_cases}c, ${option2_bottles}b (${option1_bottles} > ${packQtyNum})`);
                  } else if (option2_bottles > packQtyNum) {
                    // Use option1: 29 cases, 11 bottles
                    parsedCases = option1_cases;
                    parsedBottles = option1_bottles;
                    console.log(`🎯 4-digit standalone validation: "${casesBottles}" → ${option1_cases}c, ${option1_bottles}b (${option2_bottles} > ${packQtyNum})`);
                  } else {
                    // Both are valid, choose the one closer to pack quantity
                    const option1_diff = Math.abs(packQtyNum - option1_bottles);
                    const option2_diff = Math.abs(packQtyNum - option2_bottles);
                    
                    if (option1_diff <= option2_diff) {
                      // Option1 is closer to pack quantity
                      parsedCases = option1_cases;
                      parsedBottles = option1_bottles;
                      console.log(`🎯 4-digit standalone validation: "${casesBottles}" → ${option1_cases}c, ${option1_bottles}b (${option1_bottles} closer to ${packQtyNum} than ${option2_bottles})`);
                    } else {
                      // Option2 is closer to pack quantity
                      parsedCases = option2_cases;
                      parsedBottles = option2_bottles;
                      console.log(`🎯 4-digit standalone validation: "${casesBottles}" → ${option2_cases}c, ${option2_bottles}b (${option2_bottles} closer to ${packQtyNum} than ${option1_bottles})`);
                    }
                  }
                }
              } else {
                // Longer numbers, assume last 2 digits are bottles
                parsedCases = parseInt(casesBottles.substring(0, casesBottles.length - 2));
                parsedBottles = parseInt(casesBottles.substring(casesBottles.length - 2));
              }
            } else {
              // Short numbers, all cases
              parsedCases = parseInt(casesBottles);
              parsedBottles = 0;
            }
            
            console.log(`✅ Parsed standalone ${brandNumber}: "${casesBottles}" → Cases: ${parsedCases}, Bottles: ${parsedBottles}`);
            
            cases = parsedCases.toString();
            bottles = parsedBottles.toString();
            break;
          }
        }
        
        if (productType && cases) {
          const brandKey = brandNumber + '_' + sizeML + 'ml';
          
          if (!processedBrands.has(brandKey) && parseInt(cases) > 0) {
            const product = {
              brandNumber: brandNumber,
              description: productName.replace(/\s*\(\d+\)\s*/g, '').trim() || 'Product ' + brandNumber,
              size: sizeML + 'ml',
              sizeCode: this.mapSizeToCode(sizeML + 'ml'),
              cases: parseInt(cases) || 0,
              bottles: parseInt(bottles) || 0,
              totalQuantity: (parseInt(cases) * (parseInt(packQty) || 12)) + (parseInt(bottles) || 0),
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
      mrpRoundingOff: 0,
      retailExciseTax: 0, 
      specialExciseCess: 0, 
      tcs: 0 
    };
    
    const invoiceValueMatch = text.match(/Invoice\s*Value[:\s]*([\d,]+\.?\d*)/i);
    if (invoiceValueMatch) result.invoiceValue = this.parseAmount(invoiceValueMatch[1]);

    const netValueMatch = text.match(/Net\s*Invoice\s*Value[:\s]*([\d,]+\.?\d*)/i);
    if (netValueMatch) result.netInvoiceValue = this.parseAmount(netValueMatch[1]);

    // MRP Rounding Off is on separate lines, use positional approach
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const mrpLineIndex = lines.findIndex(line => 
      line.toLowerCase().includes('mrp') && line.toLowerCase().includes('rounding')
    );
    
    if (mrpLineIndex !== -1) {
      // Look for the second financial value after the MRP Rounding Off label
      let financialValuesFound = 0;
      for (let i = mrpLineIndex + 1; i < Math.min(mrpLineIndex + 10, lines.length); i++) {
        const valueMatch = lines[i].match(/^([\d,]+\.\d{2})$/);
        if (valueMatch) {
          financialValuesFound++;
          if (financialValuesFound === 2) { // Second value is MRP Rounding Off
            result.mrpRoundingOff = this.parseAmount(valueMatch[1]);
            console.log(`✅ MRP Rounding Off found: ${result.mrpRoundingOff}`);
            break;
          }
        }
      }
      
      // If not found with strict pattern, try alternative approaches
      if (result.mrpRoundingOff === 0) {
        // Method 1: Look for exact pattern "MRP Rounding Off: amount"
        const directMatch = text.match(/MRP\s*Rounding\s*Off[:\s]*([\d,]+\.?\d*)/i);
        if (directMatch) {
          result.mrpRoundingOff = this.parseAmount(directMatch[1]);
          console.log(`✅ MRP Rounding Off found via direct pattern: ${result.mrpRoundingOff}`);
        } else {
          // Method 2: Look for the first financial value after MRP line
          for (let i = mrpLineIndex + 1; i < Math.min(mrpLineIndex + 10, lines.length); i++) {
            const valueMatch = lines[i].match(/([\d,]+\.\d{2})/);
            if (valueMatch) {
              result.mrpRoundingOff = this.parseAmount(valueMatch[1]);
              console.log(`✅ MRP Rounding Off found via first value method: ${result.mrpRoundingOff}`);
              break;
            }
          }
        }
      }
    }

    const retailTaxMatch = text.match(/Retail\s*Shop\s*Excise\s*Turnover\s*Tax[:\s]*([\d,]+\.?\d*)/i);
    if (retailTaxMatch) result.retailExciseTax = this.parseAmount(retailTaxMatch[1]);

    const specialCessMatch = text.match(/Special\s*Excise\s*Cess[:\s]*([\d,]+\.?\d*)/i);
    if (specialCessMatch) result.specialExciseCess = this.parseAmount(specialCessMatch[1]);

    const tcsMatch = text.match(/TCS[:\s]*([\d,]+\.?\d*)/i);
    if (tcsMatch) result.tcs = this.parseAmount(tcsMatch[1]);

    // Total Purchase Value = Invoice Value + MRP Rounding Off + TCS + Retail Excise Turnover Tax + Special Excise Cess
    result.totalAmount = result.invoiceValue + result.mrpRoundingOff + result.tcs + result.retailExciseTax + result.specialExciseCess;
    
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