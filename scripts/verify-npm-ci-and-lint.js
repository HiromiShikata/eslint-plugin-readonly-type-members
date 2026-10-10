#!/usr/bin/env node
'use strict';

/**
 * Standalone health-check script (Node.js built-ins only).
 *
 * Verifies that, starting from a clean export of the committed HEAD tree:
 *   1. `npm ci` (with no peer-dependency-bypassing flags) succeeds.
 *   2. `npm run lint` succeeds afterwards.
 *
 * This CANNOT be a Jest test: Jest itself cannot run until `node_modules`
 * has already been populated by a successful `npm ci`/`npm install`, and the
 * defect under test is precisely that `npm ci` fails. So this script uses
 * only Node's built-in modules and is invoked directly via `node <path>`,
 * which works whether or not `node_modules` exists in this worktree.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const COMMAND_TIMEOUT_MS = 240000;

const getRepoRoot = () => {
  const output = execSync('git rev-parse --show-toplevel', {
    cwd: __dirname,
    encoding: 'utf8',
    timeout: COMMAND_TIMEOUT_MS,
  });
  return output.trim();
};

const runCapturing = (command, cwd) => {
  try {
    const output = execSync(command, {
      cwd,
      timeout: COMMAND_TIMEOUT_MS,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, output };
  } catch (error) {
    const stdout = error.stdout ? error.stdout.toString() : '';
    const stderr = error.stderr ? error.stderr.toString() : '';
    const status =
      typeof error.status === 'number' && error.status !== 0
        ? error.status
        : 1;
    return { status, output: `${stdout}\n${stderr}`, error };
  }
};

const main = () => {
  const repoRoot = getRepoRoot();
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'eslint-plugin-ci-check-'),
  );

  try {
    console.log(`Exporting HEAD from ${repoRoot} into ${tempDir} ...`);
    execSync(`git archive HEAD | tar -x -C "${tempDir}"`, {
      cwd: repoRoot,
      timeout: COMMAND_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    console.log('Running "npm ci" (no peer-dependency-bypassing flags) ...');
    const ciResult = runCapturing('npm ci', tempDir);
    if (ciResult.status !== 0) {
      console.error('FAIL: "npm ci" did not exit 0.');
      console.error('----- npm ci output (stdout+stderr) -----');
      console.error(ciResult.output);
      console.error('------------------------------------------');
      process.exitCode = 1;
      return;
    }
    console.log('OK: "npm ci" exited 0.');

    console.log('Running "npm run lint" ...');
    const lintResult = runCapturing('npm run lint', tempDir);
    if (lintResult.status !== 0) {
      console.error('FAIL: "npm run lint" did not exit 0.');
      console.error('----- npm run lint output (stdout+stderr) -----');
      console.error(lintResult.output);
      console.error('------------------------------------------------');
      process.exitCode = 1;
      return;
    }
    console.log('OK: "npm run lint" exited 0.');

    console.log(
      'SUCCESS: a clean checkout of HEAD passes both "npm ci" and "npm run lint".',
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

main();
