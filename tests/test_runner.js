#!/usr/bin/env node
/**
 * test_runner.js - Peek Wave Independent E2E Test Runner
 * Pure Node.js test runner with zero external dependencies.
 *
 * Usage:
 *   node tests/test_runner.js
 *   node tests/test_runner.js --tier=1
 *   node tests/test_runner.js --tier=2
 *   node tests/test_runner.js --tier=3
 *   node tests/test_runner.js --tier=4
 *   node tests/test_runner.js --verbose
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ANSI Color Helpers
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m'
};

const args = process.argv.slice(2);
const tierFilter = (() => {
  const arg = args.find(a => a.startsWith('--tier='));
  return arg ? parseInt(arg.split('=')[1], 10) : null;
})();
const isVerbose = args.includes('--verbose') || args.includes('-v');

// Test State
const suites = [];
let currentSuite = null;

function describe(name, fn) {
  const suite = {
    name,
    tests: [],
    beforeEachFns: [],
    afterEachFns: []
  };
  suites.push(suite);
  const prevSuite = currentSuite;
  currentSuite = suite;
  try {
    fn();
  } finally {
    currentSuite = prevSuite;
  }
}

function test(name, fn) {
  if (!currentSuite) {
    throw new Error(`Test "${name}" must be inside a describe() block.`);
  }
  currentSuite.tests.push({ name, fn, status: 'pending', error: null, duration: 0 });
}

const it = test;

function beforeEach(fn) {
  if (currentSuite) currentSuite.beforeEachFns.push(fn);
}

function afterEach(fn) {
  if (currentSuite) currentSuite.afterEachFns.push(fn);
}

// Global test DSL for suites
global.describe = describe;
global.test = test;
global.it = it;
global.beforeEach = beforeEach;
global.afterEach = afterEach;
global.assert = assert;

async function run() {
  console.log(`\n${colors.bright}${colors.cyan}====================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}       PEEK WAVE — E2E TEST SUITE RUNNER           ${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}====================================================${colors.reset}\n`);

  const testsDir = path.join(__dirname, 'e2e');
  if (!fs.existsSync(testsDir)) {
    console.error(`${colors.red}Error: tests/e2e directory not found at ${testsDir}${colors.reset}`);
    process.exit(1);
  }

  const allTestFiles = fs.readdirSync(testsDir)
    .filter(f => f.endsWith('.test.js'))
    .sort();

  // Filter test files by tier if requested
  const filesToRun = allTestFiles.filter(f => {
    if (!tierFilter) return true;
    if (tierFilter === 1 && f.includes('tier1')) return true;
    if (tierFilter === 2 && f.includes('tier2')) return true;
    if (tierFilter === 3 && f.includes('tier3')) return true;
    if (tierFilter === 4 && f.includes('tier4')) return true;
    return false;
  });

  if (filesToRun.length === 0) {
    console.log(`${colors.yellow}No test files matched tier filter: ${tierFilter}${colors.reset}`);
    return;
  }

  // Load test suites
  for (const file of filesToRun) {
    const fullPath = path.join(testsDir, file);
    require(fullPath);
  }

  let totalCount = 0;
  let passCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  const tierStats = {
    'Tier 1 (Feature Coverage)': { total: 0, passed: 0, failed: 0 },
    'Tier 2 (Boundary & Corner Cases)': { total: 0, passed: 0, failed: 0 },
    'Tier 3 (Cross-Feature Combinations)': { total: 0, passed: 0, failed: 0 },
    'Tier 4 (Real-World Application Scenarios)': { total: 0, passed: 0, failed: 0 }
  };

  for (const suite of suites) {
    console.log(`${colors.bright}${colors.blue}▶ Suite: ${suite.name}${colors.reset}`);

    // Determine tier bucket for statistics
    let tierKey = 'Tier 1 (Feature Coverage)';
    if (suite.name.includes('Tier 2') || suite.name.startsWith('B') || suite.tests.some(t => t.name.startsWith('T2.'))) {
      tierKey = 'Tier 2 (Boundary & Corner Cases)';
    } else if (suite.name.includes('Tier 3') || suite.name.startsWith('C') || suite.tests.some(t => t.name.startsWith('T3.'))) {
      tierKey = 'Tier 3 (Cross-Feature Combinations)';
    } else if (suite.name.includes('Tier 4') || suite.name.startsWith('S') || suite.tests.some(t => t.name.startsWith('T4.'))) {
      tierKey = 'Tier 4 (Real-World Application Scenarios)';
    }

    for (const t of suite.tests) {
      totalCount++;
      tierStats[tierKey].total++;
      const testStart = Date.now();

      try {
        for (const hook of suite.beforeEachFns) {
          await hook();
        }
        await t.fn();
        for (const hook of suite.afterEachFns) {
          await hook();
        }
        t.status = 'passed';
        t.duration = Date.now() - testStart;
        passCount++;
        tierStats[tierKey].passed++;

        if (isVerbose) {
          console.log(`  ${colors.green}✔${colors.reset} ${t.name} ${colors.dim}(${t.duration}ms)${colors.reset}`);
        } else {
          process.stdout.write(`${colors.green}·${colors.reset}`);
        }
      } catch (err) {
        t.status = 'failed';
        t.duration = Date.now() - testStart;
        t.error = err;
        failCount++;
        tierStats[tierKey].failed++;

        if (isVerbose) {
          console.log(`  ${colors.red}✖ ${t.name}${colors.reset}`);
          console.log(`    ${colors.red}${err.stack || err.message}${colors.reset}`);
        } else {
          process.stdout.write(`${colors.red}F${colors.reset}`);
        }
      }
    }
    if (!isVerbose) {
      console.log('');
    }
    console.log('');
  }

  const totalDuration = Date.now() - startTime;

  // Print Summary Table
  console.log(`\n${colors.bright}----------------------------------------------------${colors.reset}`);
  console.log(`${colors.bright}                 TEST EXECUTION SUMMARY             ${colors.reset}`);
  console.log(`${colors.bright}----------------------------------------------------${colors.reset}`);
  console.log(`  ${'Tier / Suite Category'.padEnd(42)} | Passed | Failed | Total`);
  console.log(`  ${'-'.repeat(42)} | ------ | ------ | -----`);
  for (const [tierName, stats] of Object.entries(tierStats)) {
    const pStr = String(stats.passed).padStart(6);
    const fStr = String(stats.failed).padStart(6);
    const tStr = String(stats.total).padStart(5);
    const lineCol = stats.failed > 0 ? colors.red : colors.green;
    console.log(`  ${lineCol}${tierName.padEnd(42)}${colors.reset} | ${pStr} | ${fStr} | ${tStr}`);
  }
  console.log(`  ${'-'.repeat(42)} | ------ | ------ | -----`);
  const totPassed = String(passCount).padStart(6);
  const totFailed = String(failCount).padStart(6);
  const totTotal = String(totalCount).padStart(5);
  console.log(`  ${colors.bright}${'TOTAL'.padEnd(42)}${colors.reset} | ${colors.green}${totPassed}${colors.reset} | ${failCount > 0 ? colors.red : colors.green}${totFailed}${colors.reset} | ${totTotal}`);
  console.log(`  ${colors.dim}Total Duration: ${totalDuration}ms${colors.reset}\n`);

  if (failCount > 0) {
    console.log(`${colors.bright}${colors.red}❌ FAILED: ${failCount} of ${totalCount} tests failed.${colors.reset}\n`);
    // Print failure details
    console.log(`${colors.bright}${colors.red}Failures Summary:${colors.reset}`);
    for (const suite of suites) {
      for (const t of suite.tests) {
        if (t.status === 'failed') {
          console.log(`\n  ${colors.red}✖ [${suite.name}] ${t.name}${colors.reset}`);
          console.log(`    ${colors.dim}${t.error.stack || t.error.message}${colors.reset}`);
        }
      }
    }
    console.log('');
    process.exit(1);
  } else {
    console.log(`${colors.bright}${colors.green}✔ ALL TESTS PASSED: ${passCount} of ${totalCount} tests passed successfully!${colors.reset}\n`);
    process.exit(0);
  }
}

if (require.main === module) {
  run().catch(err => {
    console.error('Fatal runner error:', err);
    process.exit(1);
  });
}

module.exports = {
  describe,
  test,
  it,
  beforeEach,
  afterEach,
  run
};
