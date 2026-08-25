#!/usr/bin/env node
/**
 * Write public/version.json with the current git short SHA and ISO timestamp.
 * Runs as a prebuild/predev hook so the deployed bundle always carries a
 * fresh build identifier that the client can compare against to detect a
 * new deploy.
 *
 * Falls back to a timestamp-only identifier when git is unavailable (e.g.
 * shallow CI clones, sandboxed dev containers without .git). The timestamp
 * alone is still monotonic per build, so version detection keeps working.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = resolve(root, 'public', 'version.json');

let sha = '';
try {
  sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
} catch {
  sha = '';
}

const payload = {
  sha: sha || `dev-${Date.now().toString(36)}`,
  builtAt: new Date().toISOString(),
};

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(payload)}\n`, 'utf8');

console.log(`[write-version] wrote ${outFile} sha=${payload.sha}`);
