#!/usr/bin/env node

/**
 * Database Sequence Health Monitor
 * 
 * This script checks if database sequences are in sync with table data
 * and can automatically fix any issues found.
 * 
 * Usage:
 *   node monitor_sequences.js           # Check only (no fixes)
 *   node monitor_sequences.js --fix     # Check and fix issues
 *   node monitor_sequences.js --watch   # Continuous monitoring
 */

require('dotenv').config();
const DatabaseService = require('./databaseService');

const databaseService = new DatabaseService();

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

async function checkSequenceHealth() {
  try {
    console.log(colorize('\n🔍 Checking database sequence health...', 'blue'));
    
    const issues = await databaseService.checkSequenceHealth();
    
    if (issues.length === 0) {
      console.log(colorize('✅ All sequences are healthy!', 'green'));
      return { healthy: true, issues: [] };
    }
    
    console.log(colorize(`⚠️  Found ${issues.length} sequence issue(s):`, 'yellow'));
    console.log('');
    
    issues.forEach((issue, index) => {
      console.log(colorize(`${index + 1}. Table: ${issue.table}`, 'bold'));
      console.log(`   Max ID in table: ${issue.maxId}`);
      console.log(`   Sequence value:  ${issue.sequenceValue}`);
      console.log(`   Gap:             ${issue.gap}`);
      console.log(`   Sequence name:   ${issue.sequenceName}`);
      console.log('');
    });
    
    return { healthy: false, issues };
    
  } catch (error) {
    console.error(colorize('❌ Error checking sequence health:', 'red'), error.message);
    return { healthy: false, issues: [], error: error.message };
  }
}

async function fixSequences() {
  try {
    console.log(colorize('\n🔧 Fixing sequence issues...', 'blue'));
    
    const result = await databaseService.fixAllSequences();
    
    if (result.fixed === 0) {
      console.log(colorize('✅ No fixes needed - all sequences are healthy!', 'green'));
    } else {
      console.log(colorize(`✅ Fixed ${result.fixed} sequence issue(s)`, 'green'));
      result.fixedTables.forEach(table => {
        console.log(`   - ${table}`);
      });
    }
    
    return result;
    
  } catch (error) {
    console.error(colorize('❌ Error fixing sequences:', 'red'), error.message);
    return { fixed: 0, error: error.message };
  }
}

async function watchMode() {
  console.log(colorize('\n👁️  Starting continuous monitoring mode...', 'blue'));
  console.log(colorize('Press Ctrl+C to stop', 'yellow'));
  
  const checkInterval = 5 * 60 * 1000; // 5 minutes
  
  const check = async () => {
    const timestamp = new Date().toISOString();
    console.log(colorize(`\n[${timestamp}] Running health check...`, 'blue'));
    
    const result = await checkSequenceHealth();
    
    if (!result.healthy && result.issues && result.issues.length > 0) {
      console.log(colorize('🚨 Issues detected! Consider running with --fix', 'red'));
    }
  };
  
  // Initial check
  await check();
  
  // Set up interval
  const interval = setInterval(check, checkInterval);
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(colorize('\n👋 Stopping monitor...', 'yellow'));
    clearInterval(interval);
    process.exit(0);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes('--fix');
  const shouldWatch = args.includes('--watch');
  
  console.log(colorize('🏥 Database Sequence Health Monitor', 'bold'));
  console.log(colorize('=====================================', 'bold'));
  
  if (shouldWatch) {
    await watchMode();
    return;
  }
  
  const healthResult = await checkSequenceHealth();
  
  if (shouldFix && !healthResult.healthy && healthResult.issues && healthResult.issues.length > 0) {
    await fixSequences();
    
    // Verify fix worked
    console.log(colorize('\n🔍 Verifying fixes...', 'blue'));
    const verifyResult = await checkSequenceHealth();
    
    if (verifyResult.healthy) {
      console.log(colorize('✅ All issues resolved!', 'green'));
    } else {
      console.log(colorize('⚠️  Some issues may still exist', 'yellow'));
    }
  } else if (!shouldFix && !healthResult.healthy && healthResult.issues && healthResult.issues.length > 0) {
    console.log(colorize('\n💡 To fix these issues, run:', 'blue'));
    console.log(colorize('   node monitor_sequences.js --fix', 'bold'));
  }
  
  console.log('');
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error(colorize('❌ Unhandled error:', 'red'), error);
  process.exit(1);
});

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error(colorize('❌ Script failed:', 'red'), error);
    process.exit(1);
  });
}

module.exports = { checkSequenceHealth, fixSequences };
