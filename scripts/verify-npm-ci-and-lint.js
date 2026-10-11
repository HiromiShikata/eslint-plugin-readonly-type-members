#!/usr/bin/env node
'use strict';

/**
 * Standalone health-check script (Node.js built-ins only).
 *
 * Verifies that, starting from an export of every git-tracked file's
 * CURRENT ON-DISK CONTENT (i.e. the working tree, including any uncommitted
 * edits to tracked files -- not just the committed HEAD tree; untracked and
 * ignored files such as node_modules are excluded):
 *   1. `npm ci` (with no peer-dependency-bypassing flags) succeeds.
 *   2. `npm run lint` succeeds afterwards.
 *
 * Using `git archive HEAD` here would be wrong: it reads only the committed
 * tree object and is structurally blind to any uncommitted divergence
 * between the working tree and HEAD -- exactly the situation a mutation
 * test (patch applied, never committed) or a developer running this script
 * before committing can produce. So instead this script enumerates the
 * tracked files via `git ls-files` and copies each one's current on-disk
 * bytes into the export directory.
 *
 * This CANNOT be a Jest test: Jest itself cannot run until `node_modules`
 * has already been populated by a successful `npm ci`/`npm install`, and the
 * defect under test is precisely that `npm ci` fails. So this script uses
 * only Node's built-in modules and is invoked directly via `node <path>`,
 * which works whether or not `node_modules` exists in this worktree.
 */

const { execSync, execFileSync } = require('child_process');
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

// Copies the current on-disk content of every git-tracked file from
// `repoRoot` into `destDir`, preserving relative paths and the executable
// bit. Deliberately does NOT use `git archive <tree-ish>`: that reads only
// a committed tree object, never the working tree, so it would miss any
// uncommitted edit to a tracked file (see module docstring above).
const exportTrackedWorkingTreeFiles = (repoRoot, destDir) => {
  const lsFilesOutput = execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: COMMAND_TIMEOUT_MS,
  });
  const relativePaths = lsFilesOutput
    .split('\0')
    .filter((relativePath) => relativePath.length > 0);

  for (const relativePath of relativePaths) {
    const srcPath = path.join(repoRoot, relativePath);
    const destPath = path.join(destDir, relativePath);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    fs.chmodSync(destPath, fs.statSync(srcPath).mode);
  }

  return relativePaths.length;
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
    console.log(
      `Exporting tracked files (current working-tree content, including ` +
        `uncommitted edits) from ${repoRoot} into ${tempDir} ...`,
    );
    const exportedCount = exportTrackedWorkingTreeFiles(repoRoot, tempDir);
    console.log(`Exported ${exportedCount} tracked file(s).`);

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
      'SUCCESS: the current working-tree content of all tracked files ' +
        'passes both "npm ci" and "npm run lint".',
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

main();
