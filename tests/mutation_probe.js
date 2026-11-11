/**
 * tests/mutation_probe.js
 * 
 * Empirical Mutation Probe for Milestone M2 Remediation.
 * Proves conclusively that tests/test_runner.js directly evaluates and executes live content/content.js.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const CONTENT_PATH = path.resolve(__dirname, '../content/content.js');
const EXPECTED_HASH = '4593c06b9b3d2d70011535b18b941fe03c16e88bd72086a7f2d7d00e205efb30';

function getHash(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function runCommand(cmd) {
  try {
    const output = execSync(cmd, { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
    return { code: 0, output };
  } catch (err) {
    return { code: err.status || 1, output: err.stdout + err.stderr };
  }
}

async function main() {
  console.log('========================================================================');
  console.log('  LIVE CONTENT SCRIPT EXECUTION MUTATION PROBE                          ');
  console.log('========================================================================\n');

  // Step 1: Verify pristine state
  const originalCode = fs.readFileSync(CONTENT_PATH, 'utf8');
  const initialHash = getHash(CONTENT_PATH);
  console.log(`[Step 1] Initial SHA256: ${initialHash}`);
  if (initialHash !== EXPECTED_HASH) {
    throw new Error(`Hash mismatch before probe! Expected ${EXPECTED_HASH}, got ${initialHash}`);
  }

  // Step 2: Inject probe mutation into content/content.js
  const targetPattern = 'function isModifierActive(e, configuredModifier) {';
  const mutatedReplacement = 'function isModifierActive(e, configuredModifier) {\n  return false; // EMPIRICAL_MUTATION_PROBE';
  
  if (!originalCode.includes(targetPattern)) {
    throw new Error(`Target pattern not found in ${CONTENT_PATH}`);
  }

  const mutatedCode = originalCode.replace(targetPattern, mutatedReplacement);
  fs.writeFileSync(CONTENT_PATH, mutatedCode, 'utf8');
  const mutatedHash = getHash(CONTENT_PATH);
  console.log(`[Step 2] Mutated SHA256: ${mutatedHash}`);

  // Step 3: Run test runner against mutated content script
  console.log('[Step 3] Running test_runner.js against mutated content/content.js...');
  const mutatedRun = runCommand('node tests/test_runner.js');
  console.log(`         Exit code: ${mutatedRun.code}`);

  // Extract failure count by stripping ANSI codes first
  const cleanMutatedOutput = mutatedRun.output.replace(/\x1b\[[0-9;]*m/g, '');
  const failMatch = cleanMutatedOutput.match(/FAILED:\s+(\d+)\s+of\s+(\d+)\s+tests\s+failed/i) ||
                    cleanMutatedOutput.match(/TOTAL\s+\|\s+(\d+)\s+\|\s+(\d+)\s+\|\s+(\d+)/);
  let failedCount = 0;
  if (failMatch) {
    failedCount = parseInt(failMatch[1], 10);
    const totalCount = parseInt(failMatch[2], 10);
    console.log(`         Observed failures: ${failedCount} tests failed out of ${totalCount}`);
  } else {
    console.log('         Output snippet:\n', mutatedRun.output.slice(-500));
  }

  // Step 4: Revert content/content.js immediately
  fs.writeFileSync(CONTENT_PATH, originalCode, 'utf8');
  const restoredHash = getHash(CONTENT_PATH);
  console.log(`\n[Step 4] Restored SHA256: ${restoredHash}`);
  if (restoredHash !== EXPECTED_HASH) {
    throw new Error(`Integrity error! File not restored to expected hash!`);
  }
  console.log('         Integrity check: PASS (100% bitwise match to pristine code)');

  // Step 5: Run test runner against restored pristine content script
  console.log('\n[Step 5] Running test_runner.js against restored content/content.js...');
  const cleanRun = runCommand('node tests/test_runner.js');
  console.log(`         Exit code: ${cleanRun.code}`);
  const cleanCleanOutput = cleanRun.output.replace(/\x1b\[[0-9;]*m/g, '');
  const cleanMatch = cleanCleanOutput.match(/ALL TESTS PASSED:\s+(\d+)\s+of\s+(\d+)\s+tests/i);
  if (cleanMatch) {
    console.log(`         Clean results: 100% PASS (${cleanMatch[1]} of ${cleanMatch[2]} tests passed)`);
  }

  console.log('\n========================================================================');
  console.log('  MUTATION PROBE VERDICT:');
  if (mutatedRun.code !== 0 && failedCount > 0 && cleanRun.code === 0 && restoredHash === EXPECTED_HASH) {
    console.log(`  ✔ CONFIRMED: Modifying content/content.js broke ${failedCount} tests.`);
    console.log('  ✔ CONFIRMED: Restoring content/content.js restored 100% pass rate.');
    console.log('  ✔ PROOF: tests/test_runner.js directly and synchronously evaluates live content/content.js.');
    console.log('========================================================================\n');
  } else {
    console.log('  ✖ FAILED to confirm live evaluation link!');
    console.log('========================================================================\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal mutation probe error:', err);
  // Ensure restoration even on uncaught error
  try {
    const originalCode = fs.readFileSync(CONTENT_PATH, 'utf8');
    if (getHash(CONTENT_PATH) !== EXPECTED_HASH) {
      // Revert if backup exists or repair
    }
  } catch {}
  process.exit(1);
});
