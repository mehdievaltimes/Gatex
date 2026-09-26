#!/usr/bin/env node
'use strict';

// Package locally with the official VS Code tool. No publish or install step.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const extensionDirectory = path.join(root, 'vscode-extension');
const manifest = JSON.parse(fs.readFileSync(path.join(extensionDirectory, 'package.json'), 'utf8'));
const vsce = path.join(extensionDirectory, 'node_modules', '@vscode', 'vsce', 'vsce');

function fail(message) {
  console.error(`Gatex packaging: ${message}`);
  process.exit(1);
}

if (Number(process.versions.node.split('.')[0]) < 22) {
  fail('Node.js 22 or newer is required to run the packaging tool.');
}
if (!fs.existsSync(vsce)) {
  fail('Install the packaging dependency first: npm ci --prefix vscode-extension');
}
if (!fs.existsSync(path.resolve(extensionDirectory, manifest.main))) {
  fail('The extension runtime is missing. Package a complete framework checkout.');
}

// Ship the canonical plain-text templates and creator so the installed extension
// can create projects without a framework checkout. Rebuild this generated copy
// on every package operation to avoid stale or hand-edited template assets.
const assets = path.join(extensionDirectory, 'assets');
fs.rmSync(assets, { recursive: true, force: true });
fs.mkdirSync(path.join(assets, 'scripts'), { recursive: true });
fs.cpSync(path.join(root, 'templates'), path.join(assets, 'templates'), { recursive: true });
fs.copyFileSync(path.join(root, 'scripts', 'lwf.py'), path.join(assets, 'scripts', 'lwf.py'));
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(assets, 'LICENSE'));

const outputDirectory = path.join(root, 'dist');
fs.mkdirSync(outputDirectory, { recursive: true });
const output = path.join(outputDirectory, `${manifest.name}-${manifest.version}.vsix`);
const result = spawnSync(process.execPath, [
  vsce, 'package', '--no-dependencies', '--allow-missing-repository', '--out', output,
], {
  cwd: extensionDirectory,
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  fail(result.error.message);
}
if (result.status !== 0) {
  process.exit(result.status || 1);
}
console.log(`Gatex extension: ${output}`);
