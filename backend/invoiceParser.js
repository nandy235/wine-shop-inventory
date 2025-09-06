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
            packType: matchingBrand.packType, // Add pack type for matching
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
          
          // Parse cases/bottles
          
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
    console.log('\n💰 === COMPREHENSIVE FINANCIAL VALUES EXTRACTION ===');
    
    const result = { 
      invoiceValue: 0, 
      netInvoiceValue: 0, 
      mrpRoundingOff: 0,
      retailShopExciseTax: 0,  // From top of document
      retailExciseTurnoverTax: 0,  // From financial section
      specialExciseCess: 0, 
      tcs: 0 
    };
    
    const lines = text.split('\n').map(line => line.trim());
    
    // Extract Retail Shop Excise Tax from top section first
    for (let i = 0; i < Math.min(50, lines.length); i++) {
      const line = lines[i];
      if (line.includes('Retail Shop Excise Tax:')) {
        const match = line.match(/Retail Shop Excise Tax:(\d+)/);
        if (match) {
          result.retailShopExciseTax = this.parseAmount(match[1]);
          console.log(`✅ Retail Shop Excise Tax: ${result.retailShopExciseTax}`);
        }
        break;
      }
    }
    
    // COMPREHENSIVE EXTRACTION - Handle all PDF formats
    console.log('🔍 Starting multi-format extraction...');
    console.log('📋 Will try 5 different pattern detection methods:');
    console.log('   1️⃣ Same-line patterns (e.g., "Retail Excise Turnover Tax:1,30,944.00")');
    console.log('   2️⃣ Block format patterns (labels first, then amounts in block)');
    console.log('   3️⃣ Split-line patterns (label on one line, value on next)');
    console.log('   4️⃣ Interleaved patterns (labels and amounts mixed together)');
    console.log('   5️⃣ ICDC-0 Print format (positional extraction of standalone amounts)');
    console.log('');
    
    // Method 1: Same-line patterns
    this.extractSameLineValues(lines, result);
    
    // Method 2: Block format patterns  
    this.extractBlockFormatValues(lines, result);
    
    // Method 3: Split-line patterns
    this.extractSplitLineValues(lines, result);
    
    // Method 4: Interleaved patterns
    this.extractInterleavedValues(lines, result);
    
    // Method 5: ICDC-0 Print format (regex-based extraction for standalone amounts)
    this.extractICDC0PrintFormatRegex(lines, result);
    
    // Calculate total amount
    result.totalAmount = result.invoiceValue + result.mrpRoundingOff + 
                        result.retailExciseTurnoverTax + result.specialExciseCess + result.tcs;
    
    console.log('\n💰 Final Financial Summary:');
    console.log(`  Invoice Value: ${result.invoiceValue}`);
    console.log(`  MRP Rounding Off: ${result.mrpRoundingOff}`);
    console.log(`  Net Invoice Value: ${result.netInvoiceValue}`);
    console.log(`  Retail Shop Excise Tax: ${result.retailShopExciseTax}`);
    console.log(`  Retail Excise Turnover Tax: ${result.retailExciseTurnoverTax}`);
    console.log(`  Special Excise Cess: ${result.specialExciseCess}`);
    console.log(`  TCS: ${result.tcs}`);
    console.log(`  Total Amount: ${result.totalAmount}`);
    
    return result;
  }


  // Method 1: Extract values on same line as labels
  extractSameLineValues(lines, result) {
    console.log('1️⃣ METHOD 1: SAME-LINE PATTERN DETECTION');
    console.log('   Looking for: "Label: Amount" on same line');
    console.log('   Examples: "Special Excise Cess:1,91,760.00", "TCS:15,162.00"');
    
    let patternsFound = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Pattern: "Retail Shop Excise Turnover Tax:1,30,944.00"
      if (line.includes('Retail') && line.includes('Excise') && line.includes('Turnover') && line.includes('Tax:') && result.retailExciseTurnoverTax === 0) {
        console.log(`🔍 PATTERN DETECTED: Retail Excise Turnover Tax (same-line)`);
        console.log(`   Line ${i + 1}: "${line}"`);
        console.log(`   Regex: /Retail.*?Excise.*?Turnover.*?Tax:\\s*([\\d,]+\\.?\\d*)/i`);
        
        const match = line.match(/Retail.*?Excise.*?Turnover.*?Tax:\s*([\d,]+\.?\d*)/i);
        if (match) {
          result.retailExciseTurnoverTax = this.parseAmount(match[1]);
          console.log(`   ✅ EXTRACTED: "${match[1]}" → ${result.retailExciseTurnoverTax}`);
          patternsFound.push('Retail Excise Turnover Tax');
        } else {
          console.log(`   ❌ REGEX FAILED: No match found`);
        }
      }
      
      // Pattern: "Special Excise Cess:1,91,760.00"
      if (line.includes('Special Excise Cess:') && result.specialExciseCess === 0) {
        console.log(`🔍 PATTERN DETECTED: Special Excise Cess (same-line)`);
        console.log(`   Line ${i + 1}: "${line}"`);
        console.log(`   Regex: /Special\\s+Excise\\s+Cess:\\s*([\\d,]+\\.?\\d*)/i`);
        
        const match = line.match(/Special\s+Excise\s+Cess:\s*([\d,]+\.?\d*)/i);
        if (match) {
          result.specialExciseCess = this.parseAmount(match[1]);
          console.log(`   ✅ EXTRACTED: "${match[1]}" → ${result.specialExciseCess}`);
          patternsFound.push('Special Excise Cess');
        } else {
          console.log(`   ❌ REGEX FAILED: No match found`);
        }
      }
      
      // Pattern: "TCS:15,162.00"
      if (line.includes('TCS:') && result.tcs === 0) {
        console.log(`🔍 PATTERN DETECTED: TCS (same-line)`);
        console.log(`   Line ${i + 1}: "${line}"`);
        console.log(`   Regex: /TCS:\\s*([\\d,]+\\.?\\d*)/i`);
        
        const match = line.match(/TCS:\s*([\d,]+\.?\d*)/i);
        if (match) {
          result.tcs = this.parseAmount(match[1]);
          console.log(`   ✅ EXTRACTED: "${match[1]}" → ${result.tcs}`);
          patternsFound.push('TCS');
        } else {
          console.log(`   ❌ REGEX FAILED: No match found`);
        }
      }
    }
    
    console.log(`📊 METHOD 1 SUMMARY: Found ${patternsFound.length} same-line patterns: [${patternsFound.join(', ')}]`);
    console.log('');
  }

  // Method 2: Extract from block format (labels first, amounts in separate block)
  extractBlockFormatValues(lines, result) {
    console.log('2️⃣ METHOD 2: BLOCK FORMAT PATTERN DETECTION');
    console.log('   Looking for: Fragmented labels followed by amounts in separate block');
    console.log('   Example: "Invoice" "Value:" "MRP" "Rounding" "Off:" then "13,09,438.00" "75,794.40" "13,85,232.40"');
    
    // Look for fragmented financial labels pattern
    let financialBlockStart = -1;
    
    // Find where fragmented labels start (look for "Invoice" followed by "Value:" pattern)
    for (let i = 0; i < lines.length - 5; i++) {
      const line1 = lines[i];
      const line2 = lines[i + 1];
      const line3 = lines[i + 2];
      const line4 = lines[i + 3];
      const line5 = lines[i + 4];
      
      // Pattern: "Invoice" "Value:" "MRP" "Rounding" "Off:" or similar fragmented pattern
      if ((line1.includes('Invoice') || line1.endsWith('Invoice')) && 
          line2.includes('Value:') &&
          (line3.includes('MRP') || line3.includes('Rounding'))) {
        
        console.log(`🔍 PATTERN DETECTED: Fragmented financial labels (block format)`);
        console.log(`   Starting at line ${i + 1}`);
        console.log(`   Label sequence:`);
        console.log(`     Line ${i + 1}: "${line1}"`);
        console.log(`     Line ${i + 2}: "${line2}"`);
        console.log(`     Line ${i + 3}: "${line3}"`);
        console.log(`     Line ${i + 4}: "${line4}"`);
        console.log(`     Line ${i + 5}: "${line5}"`);
        console.log(`   Detection logic: line1.includes('Invoice') && line2.includes('Value:') && line3.includes('MRP')`);
        
        financialBlockStart = i;
        break;
      }
    }
    
    if (financialBlockStart !== -1) {
      console.log(`   ✅ FRAGMENTED LABELS FOUND! Now looking for amounts...`);
      
      // Look for 3 consecutive amounts after the fragmented labels
      const amountPattern = /^[\d,]+\.?\d{0,2}$/;
      console.log(`   Amount regex pattern: /^[\\d,]+\\.?\\d{0,2}$/`);
      
      const amounts = [];
      
      // Start looking for amounts after the label block (usually 6-8 lines after start)
      console.log(`   Searching for amounts from line ${financialBlockStart + 7} to ${financialBlockStart + 15}...`);
      
      for (let i = financialBlockStart + 6; i < Math.min(financialBlockStart + 15, lines.length); i++) {
        const line = lines[i];
        console.log(`     Line ${i + 1}: "${line}" → Regex match: ${!!line.match(amountPattern)}`);
        
        if (line.match(amountPattern)) {
          amounts.push({ line: line, value: this.parseAmount(line), index: i });
          console.log(`     💰 AMOUNT FOUND: "${line}" → ${this.parseAmount(line)}`);
          
          // Stop after finding 3 consecutive amounts
          if (amounts.length >= 3) {
            console.log(`     ✅ Found 3 amounts, stopping search`);
            break;
          }
        } else if (amounts.length > 0) {
          console.log(`     ⏹️  Hit non-amount line after finding ${amounts.length} amounts, stopping`);
          break;
        }
      }
      
      // Map the first 3 amounts to Invoice Value, MRP Rounding Off, Net Invoice Value
      if (amounts.length >= 3) {
        console.log(`   📊 MAPPING ${amounts.length} AMOUNTS TO FIELDS:`);
        
        if (result.invoiceValue === 0) {
          result.invoiceValue = amounts[0].value;
          console.log(`     ✅ Invoice Value = amounts[0] = ${result.invoiceValue}`);
        }
        
        if (result.mrpRoundingOff === 0) {
          result.mrpRoundingOff = amounts[1].value;
          console.log(`     ✅ MRP Rounding Off = amounts[1] = ${result.mrpRoundingOff}`);
        }
        
        if (result.netInvoiceValue === 0) {
          result.netInvoiceValue = amounts[2].value;
          console.log(`     ✅ Net Invoice Value = amounts[2] = ${result.netInvoiceValue}`);
        }
      } else {
        console.log(`   ❌ INSUFFICIENT AMOUNTS: Found only ${amounts.length} amounts, need 3`);
      }
    } else {
      console.log(`   ❌ NO FRAGMENTED LABELS FOUND, trying fallback...`);
      // Fallback to original logic for other PDF formats
      this.extractBlockFormatFallback(lines, result);
    }
    
    console.log(`📊 METHOD 2 SUMMARY: Block format processing complete`);
    console.log('');
  }

  // Fallback method for other PDF formats
  extractBlockFormatFallback(lines, result) {
    console.log('📋 Method 2b: Trying fallback block format detection...');
    
    let invoiceValueIndex = -1;
    let mrpRoundingOffIndex = -1;
    let netInvoiceValueIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.includes('Invoice Value:') && !line.match(/[\d,]+/) && invoiceValueIndex === -1) {
        invoiceValueIndex = i;
      }
      if (line.includes('MRP Rounding Off:') && !line.match(/[\d,]+/) && mrpRoundingOffIndex === -1) {
        mrpRoundingOffIndex = i;
      }
      if (line.includes('Net Invoice Value:') && !line.match(/[\d,]+/) && netInvoiceValueIndex === -1) {
        netInvoiceValueIndex = i;
      }
    }
    
    if (invoiceValueIndex !== -1 || mrpRoundingOffIndex !== -1 || netInvoiceValueIndex !== -1) {
      console.log(`📍 Fallback block format labels found - Invoice: ${invoiceValueIndex}, MRP: ${mrpRoundingOffIndex}, Net: ${netInvoiceValueIndex}`);
      
      const lastLabelIndex = Math.max(invoiceValueIndex, mrpRoundingOffIndex, netInvoiceValueIndex);
      const amountPattern = /^[\d,]+\.?\d{0,2}$/;
      
      const amounts = [];
      for (let i = lastLabelIndex + 1; i < Math.min(lastLabelIndex + 10, lines.length); i++) {
        const line = lines[i];
        if (line.match(amountPattern)) {
          amounts.push(this.parseAmount(line));
          console.log(`💰 Fallback block amount found: ${line} → ${this.parseAmount(line)}`);
        } else if (amounts.length > 0) {
          break;
        }
      }
      
      let amountIndex = 0;
      
      if (invoiceValueIndex !== -1 && result.invoiceValue === 0 && amountIndex < amounts.length) {
        result.invoiceValue = amounts[amountIndex++];
        console.log(`✅ Invoice Value (fallback): ${result.invoiceValue}`);
      }
      
      if (mrpRoundingOffIndex !== -1 && result.mrpRoundingOff === 0 && amountIndex < amounts.length) {
        result.mrpRoundingOff = amounts[amountIndex++];
        console.log(`✅ MRP Rounding Off (fallback): ${result.mrpRoundingOff}`);
      }
      
      if (netInvoiceValueIndex !== -1 && result.netInvoiceValue === 0 && amountIndex < amounts.length) {
        result.netInvoiceValue = amounts[amountIndex++];
        console.log(`✅ Net Invoice Value (fallback): ${result.netInvoiceValue}`);
      }
    }
  }

  // Method 3: Extract from split-line format (label on one line, value on next)
  extractSplitLineValues(lines, result) {
    console.log('3️⃣ METHOD 3: SPLIT-LINE PATTERN DETECTION');
    console.log('   Looking for: Label on one line, amount on next line');
    console.log('   Example: "Retail Shop Excise Turnover Tax:" followed by "1,30,944.00"');
    
    let patternsFound = [];
    
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1].trim();
      
      // Pattern: "Retail Shop Excise Turnover Tax:" followed by "1,30,944.00" on next line
      if (line.includes('Retail') && line.includes('Excise') && line.includes('Turnover') && line.includes('Tax:') && 
          !line.match(/[\d,]+/) && result.retailExciseTurnoverTax === 0) {
        
        console.log(`🔍 PATTERN DETECTED: Retail Excise Turnover Tax (split-line)`);
        console.log(`   Line ${i + 1}: "${line}"`);
        console.log(`   Line ${i + 2}: "${nextLine}"`);
        console.log(`   Detection logic: line.includes('Retail') && line.includes('Excise') && line.includes('Turnover') && !line.match(/[\\d,]+/)`);
        console.log(`   Next line regex: /^([\\d,]+\\.?\\d*)$/`);
        
        const nextLineMatch = nextLine.match(/^([\d,]+\.?\d*)$/);
        if (nextLineMatch) {
          result.retailExciseTurnoverTax = this.parseAmount(nextLineMatch[1]);
          console.log(`   ✅ EXTRACTED: "${nextLineMatch[1]}" → ${result.retailExciseTurnoverTax}`);
          patternsFound.push('Retail Excise Turnover Tax');
        } else {
          console.log(`   ❌ REGEX FAILED: Next line "${nextLine}" doesn't match amount pattern`);
        }
      }
    }
    
    console.log(`📊 METHOD 3 SUMMARY: Found ${patternsFound.length} split-line patterns: [${patternsFound.join(', ')}]`);
    console.log('');
  }

  // Method 4: Extract from interleaved format (labels and amounts mixed together)
  extractInterleavedValues(lines, result) {
    console.log('4️⃣ METHOD 4: INTERLEAVED PATTERN DETECTION');
    console.log('   Looking for: Labels and amounts mixed together in sequence');
    console.log('   Example: "Invoice" "Value:" "24,13,858.92" "MRP" "Rounding" "Off:" "1,52,598.60" "Net" "Invoice" "Value:" "25,66,457.52"');
    
    let patternsFound = [];
    
    // Look for Invoice Value pattern: "Invoice" followed by "Value:" followed by amount
    for (let i = 0; i < lines.length - 2; i++) {
      const line1 = lines[i];
      const line2 = lines[i + 1];
      const line3 = lines[i + 2];
      
      // Pattern: "Invoice" "Value:" "amount"
      if ((line1.includes('Invoice') || line1.endsWith('Invoice')) && 
          line2.includes('Value:') && 
          line3.match(/^[\d,]+\.?\d{0,2}$/) &&
          result.invoiceValue === 0) {
        
        console.log(`🔍 PATTERN DETECTED: Invoice Value (interleaved)`);
        console.log(`   Line ${i + 1}: "${line1}"`);
        console.log(`   Line ${i + 2}: "${line2}"`);
        console.log(`   Line ${i + 3}: "${line3}"`);
        console.log(`   Detection logic: line1.includes('Invoice') && line2.includes('Value:') && line3.match(/^[\\d,]+\\.?\\d{0,2}$/)`);
        
        result.invoiceValue = this.parseAmount(line3);
        console.log(`   ✅ EXTRACTED: "${line3}" → ${result.invoiceValue}`);
        patternsFound.push('Invoice Value');
      }
    }
    
    // Look for MRP Rounding Off pattern: "MRP" "Rounding" "Off:" followed by amount or "Net"
    for (let i = 0; i < lines.length - 3; i++) {
      const line1 = lines[i];
      const line2 = lines[i + 1];
      const line3 = lines[i + 2];
      const line4 = lines[i + 3];
      
      // Pattern 1: "MRP" "Rounding" "Off:" "amount"
      if (line1.includes('MRP') && 
          line2.includes('Rounding') && 
          line3.includes('Off:') &&
          line4.match(/^[\d,]+\.?\d{0,2}$/) &&
          result.mrpRoundingOff === 0) {
        
        console.log(`🔍 PATTERN DETECTED: MRP Rounding Off (interleaved - direct)`);
        console.log(`   Line ${i + 1}: "${line1}"`);
        console.log(`   Line ${i + 2}: "${line2}"`);
        console.log(`   Line ${i + 3}: "${line3}"`);
        console.log(`   Line ${i + 4}: "${line4}"`);
        
        result.mrpRoundingOff = this.parseAmount(line4);
        console.log(`   ✅ EXTRACTED: "${line4}" → ${result.mrpRoundingOff}`);
        patternsFound.push('MRP Rounding Off');
      }
      
      // Pattern 2: "MRP" "Rounding" "Off:" "Net" (amount comes after Net Invoice Value)
      else if (line1.includes('MRP') && 
               line2.includes('Rounding') && 
               line3.includes('Off:') &&
               line4.includes('Net') &&
               result.mrpRoundingOff === 0) {
        
        // Look for the amount after "Net Invoice Value:"
        for (let j = i + 4; j < Math.min(i + 8, lines.length); j++) {
          const nextLine = lines[j];
          if (nextLine.includes('Value:')) {
            // Check if the next line after "Value:" is an amount
            if (j + 1 < lines.length && lines[j + 1].match(/^[\d,]+\.?\d{0,2}$/)) {
              const mrpAmount = lines[j + 1];
              
              console.log(`🔍 PATTERN DETECTED: MRP Rounding Off (interleaved - before Net)`);
              console.log(`   MRP sequence: "${line1}" "${line2}" "${line3}" "${line4}"`);
              console.log(`   Amount found at line ${j + 2}: "${mrpAmount}"`);
              
              result.mrpRoundingOff = this.parseAmount(mrpAmount);
              console.log(`   ✅ EXTRACTED: "${mrpAmount}" → ${result.mrpRoundingOff}`);
              patternsFound.push('MRP Rounding Off');
              break;
            }
          }
        }
      }
    }
    
    // Look for Net Invoice Value pattern: "Net" "Invoice" "Value:" followed by amount
    // Need to find the SECOND amount after "Net Invoice Value:" sequence
    for (let i = 0; i < lines.length - 3; i++) {
      const line1 = lines[i];
      const line2 = lines[i + 1];
      const line3 = lines[i + 2];
      
      // Pattern: "Net" "Invoice" "Value:" then look for amounts after
      if (line1.includes('Net') && 
          line2.includes('Invoice') && 
          line3.includes('Value:') &&
          result.netInvoiceValue === 0) {
        
        // Look for amounts after "Net Invoice Value:" - we want the SECOND amount
        let amountsFound = 0;
        for (let j = i + 3; j < Math.min(i + 8, lines.length); j++) {
          const amountLine = lines[j];
          if (amountLine.match(/^[\d,]+\.?\d{0,2}$/)) {
            amountsFound++;
            if (amountsFound === 2) { // Take the second amount (Net Invoice Value)
              console.log(`🔍 PATTERN DETECTED: Net Invoice Value (interleaved - second amount)`);
              console.log(`   Net sequence: "${line1}" "${line2}" "${line3}"`);
              console.log(`   Second amount found at line ${j + 1}: "${amountLine}"`);
              console.log(`   Detection logic: Found 2nd amount after Net Invoice Value sequence`);
              
              result.netInvoiceValue = this.parseAmount(amountLine);
              console.log(`   ✅ EXTRACTED: "${amountLine}" → ${result.netInvoiceValue}`);
              patternsFound.push('Net Invoice Value');
              break;
            }
          }
        }
      }
    }
    
    // Alternative pattern for MRP Rounding Off: Look for amount between "Off:" and "Net"
    if (result.mrpRoundingOff === 0) {
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        const nextLine = lines[i + 1];
        
        // If we find "Off:" followed by an amount, and the line after that contains "Net"
        if (line.includes('Off:') && 
            nextLine.match(/^[\d,]+\.?\d{0,2}$/) &&
            i + 2 < lines.length && 
            lines[i + 2].includes('Net')) {
          
          console.log(`🔍 PATTERN DETECTED: MRP Rounding Off (alternative interleaved)`);
          console.log(`   Line ${i + 1}: "${line}"`);
          console.log(`   Line ${i + 2}: "${nextLine}"`);
          console.log(`   Line ${i + 3}: "${lines[i + 2]}"`);
          console.log(`   Detection logic: line.includes('Off:') && nextLine.match(/^[\\d,]+\\.?\\d{0,2}$/) && lines[i+2].includes('Net')`);
          
          result.mrpRoundingOff = this.parseAmount(nextLine);
          console.log(`   ✅ EXTRACTED: "${nextLine}" → ${result.mrpRoundingOff}`);
          patternsFound.push('MRP Rounding Off');
          break;
        }
      }
    }
    
    console.log(`📊 METHOD 4 SUMMARY: Found ${patternsFound.length} interleaved patterns: [${patternsFound.join(', ')}]`);
    console.log('');
  }

  // Method 5: Extract from ICDC-0 Print format using regex patterns for standalone amounts
  extractICDC0PrintFormatRegex(lines, result) {
    console.log('5️⃣ METHOD 5: ICDC-0 PRINT FORMAT REGEX PATTERN DETECTION');
    console.log('   Looking for: Specific regex patterns for standalone financial amounts');
    console.log('   Target amounts: Invoice Value, MRP Rounding Off, Net Invoice Value, Retail Excise Turnover Tax, Special Excise Cess, TCS');
    
    let patternsFound = [];
    
    // Define flexible regex patterns for ICDC-0 Print format financial values
    const icdc0Patterns = {
      // Large amounts (lakhs range) with decimals - for Invoice Value, MRP Rounding, Net Invoice Value
      // Updated to handle concatenated amounts by finding proper currency patterns
      largeAmountWithDecimals: /((?:\d{1,2},)*\d{2,3},\d{3}\.\d{2})/g,
      
      // Medium amounts (lakhs range) ending in .00 - for taxes and cess
      mediumAmountRound: /((?:\d{1,2},)*\d{2,3},\d{3}\.00)/g,
      
      // Small amounts (thousands range) - for TCS and smaller fees
      smallAmount: /(\d{1,2},\d{3}\.\d{2})/g
    };
    
    console.log('   🔍 Collecting all potential financial amounts...');
    
    // Collect all potential amounts with their characteristics
    const potentialAmounts = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check for large amounts with decimals (using global regex to find all matches)
      let matches = [...line.matchAll(icdc0Patterns.largeAmountWithDecimals)];
      for (const match of matches) {
        const amount = this.parseAmount(match[1]);
        // Only include reasonable amounts (not too large to cause overflow)
        if (amount < 100000000) { // Less than 100 million to avoid DB overflow
          potentialAmounts.push({
            line: match[1],
            amount: amount,
            index: i,
            type: 'largeWithDecimals',
            hasDecimals: true
          });
          console.log(`   💰 Large amount with decimals at line ${i + 1}: "${match[1]}" → ${amount}`);
        } else {
          console.log(`   ⚠️  Skipping oversized amount at line ${i + 1}: "${match[1]}" → ${amount} (too large for DB)`);
        }
      }
      
      // Check for medium amounts ending in .00
      matches = [...line.matchAll(icdc0Patterns.mediumAmountRound)];
      for (const match of matches) {
        const amount = this.parseAmount(match[1]);
        if (amount < 100000000) {
          potentialAmounts.push({
            line: match[1],
            amount: amount,
            index: i,
            type: 'mediumRound',
            hasDecimals: false
          });
          console.log(`   💰 Medium round amount at line ${i + 1}: "${match[1]}" → ${amount}`);
        }
      }
      
      // Check for small amounts
      matches = [...line.matchAll(icdc0Patterns.smallAmount)];
      for (const match of matches) {
        const amount = this.parseAmount(match[1]);
        if (amount < 100000000) {
          potentialAmounts.push({
            line: match[1],
            amount: amount,
            index: i,
            type: 'small',
            hasDecimals: true
          });
          console.log(`   💰 Small amount at line ${i + 1}: "${match[1]}" → ${amount}`);
        }
      }
    }
    
    console.log(`   📊 Found ${potentialAmounts.length} potential financial amounts`);
    
    if (potentialAmounts.length >= 6) {
      console.log('   🎯 Sufficient amounts found, applying intelligent mapping...');
      
      // Sort amounts by value (descending) to identify the largest amounts first
      const sortedAmounts = [...potentialAmounts].sort((a, b) => b.amount - a.amount);
      
      // Filter amounts that appear in the last 40% of the document (financial summary section)
      const documentLength = lines.length;
      const summaryStart = Math.floor(documentLength * 0.6);
      const summaryAmounts = sortedAmounts.filter(item => item.index >= summaryStart);
      
      console.log(`   📍 Found ${summaryAmounts.length} amounts in financial summary section (after line ${summaryStart})`);
      
      if (summaryAmounts.length >= 6) {
        // Apply intelligent mapping based on amount characteristics
        this.mapAmountsIntelligently(summaryAmounts, result, patternsFound);
      } else {
        console.log('   ⚠️  Using all amounts for mapping due to insufficient summary amounts');
        this.mapAmountsIntelligently(sortedAmounts, result, patternsFound);
      }
    } else {
      console.log('   ❌ Insufficient amounts found for ICDC-0 Print format mapping');
    }
    
    console.log(`📊 METHOD 5 SUMMARY: Found ${patternsFound.length} ICDC-0 Print regex patterns: [${patternsFound.join(', ')}]`);
    console.log('');
  }

  // Helper method for intelligent amount mapping using mathematical relationships
  mapAmountsIntelligently(amounts, result, patternsFound) {
    console.log('   🧠 Applying relationship-based mapping logic...');
    console.log('   📐 Using relationships: Net = Invoice + MRP, Turnover Tax = 10% of Invoice, TCS = ~1.175% of Invoice');
    console.log('   📋 Expected sequence: Invoice → MRP → Net → Turnover Tax → Special Excise Cess → TCS');
    
    // Get all amounts sorted by value (descending)
    const allAmounts = [...amounts].sort((a, b) => b.amount - a.amount);
    console.log(`   📊 Total amounts to analyze: ${allAmounts.length}`);
    
    // Try different combinations to find the best fit based on mathematical relationships
    let bestMatch = null;
    let bestScore = 0;
    
    console.log('   🔍 Testing different combinations for mathematical relationships...');
    
    // Test each potential invoice value (try largest amounts first)
    for (let i = 0; i < Math.min(allAmounts.length, 5); i++) {
      const potentialInvoice = allAmounts[i];
      console.log(`   🧪 Testing Invoice Value candidate: ${potentialInvoice.amount} (line ${potentialInvoice.index + 1})`);
      
      const testResult = this.testAmountCombination(potentialInvoice, allAmounts);
      
      if (testResult.score > bestScore) {
        bestMatch = testResult;
        bestScore = testResult.score;
        console.log(`   ⭐ New best match found with score: ${bestScore}`);
      }
    }
    
    if (bestMatch && bestScore >= 3) { // Require at least 3 relationships to match
      console.log(`   🎯 Best combination found with score ${bestScore}:`);
      
      if (bestMatch.invoiceValue && result.invoiceValue === 0) {
        result.invoiceValue = bestMatch.invoiceValue.amount;
        console.log(`   ✅ Invoice Value: ${result.invoiceValue} (line ${bestMatch.invoiceValue.index + 1})`);
        patternsFound.push('Invoice Value');
      }
      
      if (bestMatch.mrpRounding && result.mrpRoundingOff === 0) {
        result.mrpRoundingOff = bestMatch.mrpRounding.amount;
        console.log(`   ✅ MRP Rounding Off: ${result.mrpRoundingOff} (line ${bestMatch.mrpRounding.index + 1})`);
        patternsFound.push('MRP Rounding Off');
      }
      
      if (bestMatch.netInvoice && result.netInvoiceValue === 0) {
        result.netInvoiceValue = bestMatch.netInvoice.amount;
        console.log(`   ✅ Net Invoice Value: ${result.netInvoiceValue} (line ${bestMatch.netInvoice.index + 1})`);
        patternsFound.push('Net Invoice Value');
      }
      
      if (bestMatch.turnoverTax && result.retailExciseTurnoverTax === 0) {
        result.retailExciseTurnoverTax = bestMatch.turnoverTax.amount;
        console.log(`   ✅ Retail Excise Turnover Tax: ${result.retailExciseTurnoverTax} (line ${bestMatch.turnoverTax.index + 1})`);
        patternsFound.push('Retail Excise Turnover Tax');
      }
      
      if (bestMatch.tcs && result.tcs === 0) {
        result.tcs = bestMatch.tcs.amount;
        console.log(`   ✅ TCS: ${result.tcs} (line ${bestMatch.tcs.index + 1})`);
        patternsFound.push('TCS');
      }
      
      if (bestMatch.specialCess && result.specialExciseCess === 0) {
        result.specialExciseCess = bestMatch.specialCess.amount;
        console.log(`   ✅ Special Excise Cess: ${result.specialExciseCess} (line ${bestMatch.specialCess.index + 1})`);
        patternsFound.push('Special Excise Cess');
      }
      
    } else {
      console.log(`   ❌ No valid combination found (best score: ${bestScore})`);
      // Fallback to simple largest amount mapping
      this.fallbackMapping(allAmounts, result, patternsFound);
    }
    
    console.log('   🎯 Relationship-based mapping completed');
  }

  // Test a specific amount combination for mathematical relationships
  testAmountCombination(potentialInvoice, allAmounts) {
    const invoiceAmount = potentialInvoice.amount;
    let score = 0;
    const result = { invoiceValue: potentialInvoice };
    
    console.log(`     📐 Testing relationships for invoice: ${invoiceAmount}`);
    
    // Look for MRP Rounding Off and Net Invoice Value that satisfy: Net = Invoice + MRP
    for (let j = 0; j < allAmounts.length; j++) {
      const potentialMRP = allAmounts[j];
      if (potentialMRP.amount === invoiceAmount) continue; // Skip same amount
      
      for (let k = 0; k < allAmounts.length; k++) {
        const potentialNet = allAmounts[k];
        if (potentialNet.amount === invoiceAmount || potentialNet.amount === potentialMRP.amount) continue;
        
        // Test: Net = Invoice + MRP (with 1% tolerance)
        const expectedNet = invoiceAmount + potentialMRP.amount;
        const netTolerance = expectedNet * 0.01; // 1% tolerance
        
        if (Math.abs(potentialNet.amount - expectedNet) <= netTolerance) {
          result.mrpRounding = potentialMRP;
          result.netInvoice = potentialNet;
          score += 2; // High score for this critical relationship
          console.log(`     ✅ Net = Invoice + MRP relationship found: ${potentialNet.amount} ≈ ${invoiceAmount} + ${potentialMRP.amount}`);
          break;
        }
      }
      if (result.netInvoice) break; // Found the relationship, stop searching
    }
    
    // Look for Retail Excise Turnover Tax (10% of invoice)
    const expectedTurnover = invoiceAmount * 0.10;
    const turnoverTolerance = expectedTurnover * 0.15; // 15% tolerance
    
    const turnoverCandidate = allAmounts.find(a => 
      a.amount !== invoiceAmount && 
      (!result.mrpRounding || a.amount !== result.mrpRounding.amount) &&
      (!result.netInvoice || a.amount !== result.netInvoice.amount) &&
      Math.abs(a.amount - expectedTurnover) <= turnoverTolerance
    );
    
    if (turnoverCandidate) {
      result.turnoverTax = turnoverCandidate;
      score += 1;
      console.log(`     ✅ Turnover Tax (10% of invoice) found: ${turnoverCandidate.amount} ≈ ${expectedTurnover}`);
    }
    
    // TCS will be handled later based on position after Special Excise Cess
    
    // Look for Special Excise Cess and TCS based on position after turnover tax
    const usedAmounts = new Set([
      invoiceAmount,
      result.mrpRounding?.amount,
      result.netInvoice?.amount,
      result.turnoverTax?.amount
    ].filter(Boolean));
    
    // Find amounts that come after the turnover tax in the document
    let turnoverTaxIndex = result.turnoverTax ? result.turnoverTax.index : -1;
    const remainingAmounts = allAmounts.filter(a => 
      !usedAmounts.has(a.amount) && 
      a.amount > 1000 && // Reasonable minimum
      a.amount < 10000000 && // Not the huge total purchase values
      (turnoverTaxIndex === -1 || a.index > turnoverTaxIndex) // Must come after turnover tax
    ).sort((a, b) => a.index - b.index); // Sort by position in document
    
    console.log(`     🔍 Found ${remainingAmounts.length} candidates after turnover tax:`);
    remainingAmounts.forEach(a => {
      console.log(`       Line ${a.index + 1}: ${a.amount}`);
    });
    
    // Special Excise Cess should be the first large amount after turnover tax
    const cessCandidate = remainingAmounts.find(a => a.amount > 100000);
    if (cessCandidate) {
      result.specialCess = cessCandidate;
      score += 1;
      console.log(`     ✅ Special Excise Cess (first large amount after turnover tax) found: ${cessCandidate.amount}`);
      usedAmounts.add(cessCandidate.amount);
    }
    
    // TCS should be a smaller amount that comes after Special Excise Cess
    const tcsCandidate = remainingAmounts.find(a => 
      !usedAmounts.has(a.amount) && 
      a.amount < 100000 && // TCS is typically smaller
      (!cessCandidate || a.index > cessCandidate.index) // Must come after cess
    );
    
    if (tcsCandidate) {
      result.tcs = tcsCandidate;
      score += 1;
      console.log(`     ✅ TCS (smaller amount after Special Excise Cess) found: ${tcsCandidate.amount}`);
    }
    
    console.log(`     📊 Combination score: ${score}`);
    result.score = score;
    return result;
  }

  // Fallback mapping when relationships don't work
  fallbackMapping(allAmounts, result, patternsFound) {
    console.log('   🔄 Applying fallback mapping...');
    
    const largeAmountsWithDecimals = allAmounts.filter(a => a.type === 'largeWithDecimals');
    const mediumRoundAmounts = allAmounts.filter(a => a.type === 'mediumRound');
    const smallAmounts = allAmounts.filter(a => a.type === 'small');
    
    if (largeAmountsWithDecimals.length > 0 && result.invoiceValue === 0) {
      result.invoiceValue = largeAmountsWithDecimals[0].amount;
      console.log(`   ✅ Fallback Invoice Value: ${result.invoiceValue}`);
      patternsFound.push('Invoice Value');
    }
    
    if (mediumRoundAmounts.length > 0 && result.specialExciseCess === 0) {
      result.specialExciseCess = mediumRoundAmounts[0].amount;
      console.log(`   ✅ Fallback Special Excise Cess: ${result.specialExciseCess}`);
      patternsFound.push('Special Excise Cess');
    }
  }

  parseAmount(amountStr) {
    if (!amountStr) return 0;
    return parseFloat(amountStr.replace(/,/g, ''));
  }

  convertDateFormat(dateStr) {
    if (!dateStr) return null;
    
    try {
      // Handle DD-MMM-YYYY format (e.g., "06-Jun-2025")
      if (dateStr.includes('-')) {
        const [day, month, year] = dateStr.split('-');
        const monthMap = {
          'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
          'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
        };
        const monthNum = monthMap[month] || month;
        return `${year}-${monthNum.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      
      // Handle DD/MM/YYYY format
      if (dateStr.includes('/')) {
        const [day, month, year] = dateStr.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
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
