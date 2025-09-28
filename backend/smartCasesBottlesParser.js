/**
 * Smart Cases/Bottles Parser
 * Resolves ambiguity in concatenated numbers like "1710" by using context and validation
 */

class SmartCasesBottlesParser {
  constructor() {
    this.debugMode = true;
  }

  /**
   * Parse concatenated cases/bottles number using multiple strategies
   * @param {string} concatenated - The concatenated number (e.g., "1710")
   * @param {number} packQty - Pack quantity per case (e.g., 12)
   * @param {string} productType - Product type (Beer, IML, etc.)
   * @param {object} context - Additional context for validation
   * @returns {object} - { cases, bottles, confidence, reasoning }
   */
  parseCasesBottles(concatenated, packQty, productType, context = {}) {
    if (this.debugMode) {
    }

    const strategies = [
      this.strategyBusinessLogic.bind(this),
      this.strategyPackQuantityValidation.bind(this),
      this.strategySummaryValidation.bind(this),
      this.strategyAmountValidation.bind(this),
      this.strategyPatternRecognition.bind(this)
    ];

    const results = [];

    // Try all strategies
    for (const strategy of strategies) {
      const result = strategy(concatenated, packQty, productType, context);
      if (result) {
        results.push(result);
        if (this.debugMode) {
        }
      }
    }

    // Choose the best result based on confidence
    if (results.length === 0) {
      return this.fallbackParsing(concatenated, packQty);
    }

    const bestResult = results.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );

    if (this.debugMode) {
    }

    return {
      cases: bestResult.cases,
      bottles: bestResult.bottles,
      confidence: bestResult.confidence,
      reasoning: bestResult.reasoning,
      totalBottles: (bestResult.cases * packQty) + bestResult.bottles
    };
  }

  /**
   * Strategy 1: Business Logic - bottles rarely exceed pack quantity
   */
  strategyBusinessLogic(concatenated, packQty, productType, context) {
    if (concatenated.length < 2) return null;

    const options = this.generateOptions(concatenated);
    const validOptions = options.filter(opt => opt.bottles <= packQty);

    if (validOptions.length === 1) {
      return {
        ...validOptions[0],
        confidence: 0.9,
        strategy: 'Business Logic',
        reasoning: `Bottles (${validOptions[0].bottles}) ≤ pack quantity (${packQty})`
      };
    }

    if (validOptions.length > 1) {
      // Prefer reasonable bottle remainders and logical case/bottle combinations
      const scored = validOptions.map(opt => {
        let score = 0;
        
        // Prefer bottles that are either 0 or close to pack quantity (typical remainders)
        if (opt.bottles === 0) {
          score += 15; // Full cases are common
        } else if (opt.bottles >= packQty * 0.8) {
          score += 10; // Near-full remainder is realistic (like 47/48)
        } else if (opt.bottles <= packQty * 0.2) {
          score += 5; // Small remainder is also realistic
        }
        
        // Slightly prefer smaller case counts when bottles are reasonable (but don't penalize large counts)
        if (opt.cases <= 50 && opt.bottles < packQty) {
          score += Math.max(0, 10 - Math.floor(opt.cases / 10));
        }
        
        return { ...opt, score };
      });
      
      const best = scored.reduce((a, b) => a.score > b.score ? a : b);
      
      if (this.debugMode) {
        scored.forEach(opt => {
        });
      }
      
      return {
        ...best,
        confidence: 0.8,
        strategy: 'Business Logic',
        reasoning: `Best business logic fit: ${best.cases} cases + ${best.bottles} bottles (score: ${best.score})`
      };
    }

    return null;
  }

  /**
   * Strategy 2: Pack Quantity Validation - bottles must be < pack quantity
   */
  strategyPackQuantityValidation(concatenated, packQty, productType, context) {
    const options = this.generateOptions(concatenated);
    const validOptions = options.filter(opt => opt.bottles < packQty);

    if (validOptions.length === 0) return null;

    // If only one valid option, high confidence
    if (validOptions.length === 1) {
      return {
        ...validOptions[0],
        confidence: 0.85,
        strategy: 'Pack Validation',
        reasoning: `Only valid option: bottles (${validOptions[0].bottles}) < pack (${packQty})`
      };
    }

    // Multiple valid options - prefer round numbers (ending in 0)
    const roundOptions = validOptions.filter(opt => opt.bottles % 5 === 0 || opt.bottles === 0);
    if (roundOptions.length === 1) {
      return {
        ...roundOptions[0],
        confidence: 0.75,
        strategy: 'Pack Validation',
        reasoning: `Round number preference: ${roundOptions[0].bottles} bottles`
      };
    }

    return null;
  }

  /**
   * Strategy 3: Summary Validation - use document totals to validate
   */
  strategySummaryValidation(concatenated, packQty, productType, context) {
    if (!context.summaryTotals) return null;

    const options = this.generateOptions(concatenated);
    const summary = context.summaryTotals;

    // Check which option would fit better with the summary totals
    for (const option of options) {
      const productCategory = this.getProductCategory(productType);
      const expectedCases = summary[productCategory]?.cases;
      
      if (expectedCases && context.otherProducts) {
        const otherCasesSum = context.otherProducts
          .filter(p => this.getProductCategory(p.type) === productCategory)
          .reduce((sum, p) => sum + p.cases, 0);
        
        const remainingCases = expectedCases - otherCasesSum;
        
        if (Math.abs(option.cases - remainingCases) <= 2) { // Allow small tolerance
          return {
            ...option,
            confidence: 0.95,
            strategy: 'Summary Validation',
            reasoning: `Matches summary: need ${remainingCases} cases, option gives ${option.cases}`
          };
        }
      }
    }

    return null;
  }

  /**
   * Strategy 4: Amount Validation - check if total amount makes sense
   */
  strategyAmountValidation(concatenated, packQty, productType, context) {
    if (!context.totalAmount || !context.ratePerCase) return null;

    const options = this.generateOptions(concatenated);
    
    // FIXED: Only test options that pass basic business logic (bottles <= packQty)
    const validOptions = options.filter(opt => opt.bottles <= packQty);
    
    let bestMatch = null;
    let smallestDifference = Infinity;
    
    for (const option of validOptions) {
      const calculatedAmount = (option.cases * context.ratePerCase) + 
                              (option.bottles * (context.ratePerCase / packQty));
      
      const difference = Math.abs(calculatedAmount - context.totalAmount);
      const tolerance = context.totalAmount * 0.05; // 5% tolerance
      
      // Find the closest match within tolerance
      if (difference <= tolerance && difference < smallestDifference) {
        smallestDifference = difference;
        bestMatch = {
          ...option,
          confidence: 0.88,
          strategy: 'Amount Validation',
          reasoning: `Amount matches: calculated=${calculatedAmount.toFixed(2)}, expected=${context.totalAmount}`
        };
      }
    }

    return bestMatch;
  }

  /**
   * Strategy 5: Pattern Recognition - learn from similar products
   */
  strategyPatternRecognition(concatenated, packQty, productType, context) {
    if (!context.similarProducts) return null;

    // Look for patterns in similar products
    const patterns = context.similarProducts.map(p => ({
      length: p.concatenated.length,
      endsWithZero: p.concatenated.endsWith('0'),
      bottles: p.bottles,
      cases: p.cases
    }));

    const currentEndsWithZero = concatenated.endsWith('0');
    const currentLength = concatenated.length;

    // Find similar patterns
    const similarPatterns = patterns.filter(p => 
      p.length === currentLength && p.endsWithZero === currentEndsWithZero
    );

    if (similarPatterns.length > 0) {
      const options = this.generateOptions(concatenated);
      
      // Prefer options that match the pattern
      for (const option of options) {
        const matchesPattern = similarPatterns.some(p => 
          (p.bottles === 0 && option.bottles === 0) ||
          (p.bottles > 0 && option.bottles > 0)
        );
        
        if (matchesPattern) {
          return {
            ...option,
            confidence: 0.7,
            strategy: 'Pattern Recognition',
            reasoning: `Matches pattern from ${similarPatterns.length} similar products`
          };
        }
      }
    }

    return null;
  }

  /**
   * Generate all possible cases/bottles combinations from concatenated number
   */
  generateOptions(concatenated) {
    const options = [];
    const len = concatenated.length;

    if (len < 2) {
      return [{ cases: parseInt(concatenated), bottles: 0 }];
    }

    // Try different split positions
    for (let i = 1; i < len; i++) {
      const casesStr = concatenated.substring(0, i);
      const bottlesStr = concatenated.substring(i);
      
      const cases = parseInt(casesStr);
      const bottles = parseInt(bottlesStr);
      
      if (!isNaN(cases) && !isNaN(bottles) && cases > 0) {
        options.push({ cases, bottles });
      }
    }

    return options;
  }

  /**
   * Get product category for summary validation
   */
  getProductCategory(productType) {
    if (productType.toLowerCase().includes('beer')) return 'beer';
    if (productType.toLowerCase().includes('iml')) return 'imfl';
    if (productType.toLowerCase().includes('duty')) return 'imfl';
    return 'other';
  }

  /**
   * Fallback parsing when all strategies fail
   */
  fallbackParsing(concatenated, packQty) {
    
    if (concatenated.length <= 2) {
      return {
        cases: parseInt(concatenated),
        bottles: 0,
        confidence: 0.5,
        reasoning: 'Fallback: short number treated as cases only'
      };
    }

    // Default: last digit is bottles, rest is cases
    const cases = parseInt(concatenated.substring(0, concatenated.length - 1));
    const bottles = parseInt(concatenated.substring(concatenated.length - 1));

    return {
      cases: cases,
      bottles: bottles,
      confidence: 0.3,
      reasoning: 'Fallback: last digit as bottles, rest as cases'
    };
  }
}

// Test with ICDC 3 data
async function testICDC3Parsing() {

  const parser = new SmartCasesBottlesParser();

  // Summary from ICDC 3: Beer=291 cases, IMFL=18 cases
  const summaryTotals = {
    beer: { cases: 291, bottles: 0 },
    imfl: { cases: 18, bottles: 0 },
    total: { cases: 309, bottles: 0 }
  };

  const testCases = [
    {
      concatenated: '1710',
      packQty: 12,
      productType: 'Beer',
      context: {
        summaryTotals,
        totalAmount: 256671.00,
        ratePerCase: 1501.00
      }
    },
    {
      concatenated: '300',
      packQty: 12,
      productType: 'Beer',
      context: { summaryTotals }
    },
    {
      concatenated: '10',
      packQty: 48,
      productType: 'IML',
      context: { summaryTotals }
    },
    {
      concatenated: '50',
      packQty: 48,
      productType: 'IML',
      context: { summaryTotals }
    }
  ];

  for (const test of testCases) {
    const result = parser.parseCasesBottles(
      test.concatenated,
      test.packQty,
      test.productType,
      test.context
    );

  }
}

if (require.main === module) {
  testICDC3Parsing();
}

module.exports = SmartCasesBottlesParser;
