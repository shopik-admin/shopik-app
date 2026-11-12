#!/usr/bin/env node
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function usage() {
  console.log(`
Usage: npm run release <patch|minor|major|X.Y.Z>

Examples:
  npm run release patch   # 1.0.5 -> 1.0.6
  npm run release minor   # 1.0.5 -> 1.1.0
  npm run release major   # 1.0.5 -> 2.0.0
  npm run release 2.0.0   # explicit version
`);
}

const requested = process.argv[2];

if (!requested || requested === '--help' || requested === '-h') {
  usage();
  process.exit(requested ? 0 : 1);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const current = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version);
if (!current) fail(`Unsupported current version "${pkg.version}" (expected X.Y.Z).`);

const [, major, minor, patch] = current.map(Number);

let next;
if (requested === 'patch') next = `${major}.${minor}.${patch + 1}`;
else if (requested === 'minor') next = `${major}.${minor + 1}.0`;
else if (requested === 'major') next = `${major + 1}.0.0`;
else if (/^\d+\.\d+\.\d+$/.test(requested)) next = requested;
else fail(`Unknown release type "${requested}". Use patch, minor, major, or an explicit X.Y.Z version.`);

if (git('status', '--porcelain')) {
  fail('Working tree is not clean. Commit or stash your changes before releasing.');
}

const branch = git('branch', '--show-current');
if (branch !== 'main') {
  fail(`Releases must start from main (currently on "${branch}").`);
}

const releaseBranch = `release/${next}`;
if (git('branch', '--list', releaseBranch)) {
  fail(`Branch "${releaseBranch}" already exists.`);
}

console.log(`\nPreparing release ${pkg.version} → ${next} on ${releaseBranch}`);
git('switch', '--no-track', '-c', releaseBranch);

try {
  execSync(`npm version ${next} --no-git-tag-version`, { cwd: root, stdio: 'inherit' });
} catch {
  fail(`Failed to bump the version. You are still on "${releaseBranch}" with no commit made.`);
}

const files = ['package.json'];
if (existsSync(lockPath)) files.push('package-lock.json');
git('add', ...files);
git('commit', '-m', `chore(release): v${next}`);

console.log(`
✔ Released v${next} on branch ${releaseBranch}

Next steps:
  git push -u origin ${releaseBranch}
  open a pull request from ${releaseBranch} into main
`);
