#!/usr/bin/env node
/**
 * Summarises a Jest JSON report (jest --json --outputFile=<file>) for GitHub Actions.
 *
 *  - Appends a pass/fail table and the failing tests to the job summary page.
 *  - Sets the step output `summary` to one line, e.g. "PASSED - 7 of 7 tests";
 *    ui-dev-qa.yml shows it in the QA approval issue.
 *
 * Never fails the step itself: the caller decides from Jest's exit code.
 * Usage: node scripts/write-summary.js <report.json>
 */
const fs = require('fs');

const reportPath = process.argv[2];
const append = (file, text) => { if (file) fs.appendFileSync(file, text + '\n', 'utf8'); };

let line;
let md;

if (!reportPath || !fs.existsSync(reportPath)) {
  line = 'FAILED - the tests did not run (no report file)';
  md = `### UI unit tests\n\n**${line}**. See the step log.`;
} else {
  const r = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const failed = r.numFailedTests + (r.numRuntimeErrorTestSuites || 0);
  line = failed > 0
    ? `FAILED - ${r.numFailedTests} of ${r.numTotalTests} tests failed` +
      (r.numRuntimeErrorTestSuites ? `, ${r.numRuntimeErrorTestSuites} suite(s) did not compile` : '')
    : `PASSED - ${r.numPassedTests} of ${r.numTotalTests} tests`;

  md = [
    '### UI unit tests',
    '',
    '| Result | Suites | Tests | Passed | Failed |',
    '|---|---|---|---|---|',
    `| ${failed > 0 ? 'FAILED' : 'PASSED'} | ${r.numTotalTestSuites} | ${r.numTotalTests} | ${r.numPassedTests} | ${r.numFailedTests} |`,
  ].join('\n');

  const failures = [];
  for (const suite of r.testResults || []) {
    const file = (suite.name || '').replace(/^.*Diagnocare-Test[\\/]/, '');
    if (suite.status === 'failed' && (!suite.assertionResults || suite.assertionResults.length === 0)) {
      failures.push(`- \`${file}\` - suite failed to run: ${(suite.message || '').split('\n').find(l => l.trim()) || ''}`.slice(0, 400));
    }
    for (const t of suite.assertionResults || []) {
      if (t.status === 'failed') {
        const msg = (t.failureMessages || []).join(' ').split('\n').find(l => l.trim()) || '';
        failures.push(`- \`${file}\` › ${t.fullName} - ${msg}`.slice(0, 400));
      }
    }
  }
  if (failures.length) {
    md += '\n\n**Failing tests** (deployment stopped):\n\n' + failures.slice(0, 30).join('\n');
    if (failures.length > 30) md += `\n- ... and ${failures.length - 30} more (see the step log)`;
  }
  md += '\n\nQuarantined (not run) suites are listed in `Diagnocare-Test/jest.ci.config.js`.';
}

append(process.env.GITHUB_STEP_SUMMARY, md);
append(process.env.GITHUB_OUTPUT, `summary=${line}`);
console.log(line);
