/**
 * run_adversarial.js
 * 
 * Master runner for Peek Wave Adversarial Challenger Test Suites:
 * - Milestone M1: background_adversarial.test.js
 * - Milestone M1: icons_binary_adversarial.test.js
 * - Milestone M2: teardown_memory_adversarial.test.js
 * - Milestone M2: m2_remediation_adversarial.test.js
 * - Milestone M3: m3_storage_popup_adversarial.test.js
 */

'use strict';

const { runAdversarialBackgroundTests } = require('./background_adversarial.test');
const { runAdversarialIconTests } = require('./icons_binary_adversarial.test');
const { runTeardownMemoryAdversarialTests } = require('./teardown_memory_adversarial.test');
const { runM2RemediationAdversarialTests } = require('./m2_remediation_adversarial.test');
const { runM3StoragePopupAdversarialTests } = require('./m3_storage_popup_adversarial.test');
const { runTwitterUnforwardingAdversarialTests } = require('./twitter_unforwarding_adversarial.test');

async function main() {
  console.log('\n===============================================================');
  console.log('    PEEK WAVE — ADVERSARIAL VERIFICATION SUITES (M1, M2 & M3)  ');
  console.log('===============================================================\n');

  let bgResult = { passed: 0, failed: 0 };
  let iconResult = { totalPass: 0, totalFail: 0 };
  let teardownResult = { passed: 0, failed: 0 };
  let m2RemResult = { passed: 0, failed: 0 };
  let m3Result = { passed: 0, failed: 0 };
  let twitterResult = { passed: 0, failed: 0 };

  try {
    bgResult = await runAdversarialBackgroundTests();
  } catch (err) {
    console.error('Fatal error during background adversarial suite:', err);
    bgResult.failed++;
  }

  try {
    iconResult = runAdversarialIconTests();
  } catch (err) {
    console.error('Fatal error during icon binary adversarial suite:', err);
    iconResult.totalFail++;
  }

  try {
    teardownResult = await runTeardownMemoryAdversarialTests();
  } catch (err) {
    console.error('Fatal error during teardown/memory adversarial suite:', err);
    teardownResult.failed++;
  }

  try {
    m2RemResult = await runM2RemediationAdversarialTests();
  } catch (err) {
    console.error('Fatal error during M2 remediation adversarial suite:', err);
    m2RemResult.failed++;
  }

  try {
    m3Result = await runM3StoragePopupAdversarialTests();
  } catch (err) {
    console.error('Fatal error during M3 storage/popup adversarial suite:', err);
    m3Result.failed++;
  }

  try {
    twitterResult = await runTwitterUnforwardingAdversarialTests();
  } catch (err) {
    console.error('Fatal error during Twitter unforwarding adversarial suite:', err);
    twitterResult.failed++;
  }

  const totalPassed = bgResult.passed + iconResult.totalPass + teardownResult.passed + m2RemResult.passed + m3Result.passed + twitterResult.passed;
  const totalFailed = bgResult.failed + iconResult.totalFail + teardownResult.failed + m2RemResult.failed + m3Result.failed + twitterResult.failed;

  console.log('\n===============================================================');
  console.log('              ADVERSARIAL VERIFICATION SUMMARY                 ');
  console.log('===============================================================');
  console.log(`- background.js Adversarial Tests:       ${bgResult.passed} Passed, ${bgResult.failed} Failed`);
  console.log(`- icons/ Binary Verification Tests:      ${iconResult.totalPass} Passed, ${iconResult.totalFail} Failed`);
  console.log(`- Teardown & Memory Adversarial Tests:  ${teardownResult.passed} Passed, ${teardownResult.failed} Failed`);
  console.log(`- M2 Remediation Stress Tests:          ${m2RemResult.passed} Passed, ${m2RemResult.failed} Failed`);
  console.log(`- M3 Storage & Popup Stress Tests:      ${m3Result.passed} Passed, ${m3Result.failed} Failed`);
  console.log(`- Twitter/X Unforwarding Tests:         ${twitterResult.passed} Passed, ${twitterResult.failed} Failed`);
  console.log(`- TOTAL PASSED:                         ${totalPassed}`);
  console.log(`- TOTAL FAILED:                         ${totalFailed}`);
  console.log(`- OVERALL STATUS:                       ${totalFailed === 0 ? 'ALL CHECKS PASSED (APPROVE)' : 'FAILURES DETECTED (REQUEST_CHANGES)'}`);
  console.log('===============================================================\n');

  process.exit(totalFailed > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { main };
