#!/usr/bin/env node
/**
 * Merge wrangler.toml [vars] into process.env, then run a command.
 * Ensures NEXT_PUBLIC_* are available to `next build` locally and in CI.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const toml = readFileSync(resolve(root, 'wrangler.toml'), 'utf8');
const env = { ...process.env };

const varsBlock = toml.match(/^\[vars\]\s*([\s\S]*?)(?=^\[|$)/m);
if (varsBlock) {
  for (const line of varsBlock[1].split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]*)"/);
    if (m) env[m[1]] = m[2];
  }
}

const args = process.argv.slice(2);
if (!args.length) {
  console.error('Usage: node scripts/with-wrangler-env.mjs <command> [args...]');
  process.exit(1);
}

const [cmd, ...rest] = args;
const result = spawnSync(cmd, rest, {
  stdio: 'inherit',
  env,
  cwd: root,
  shell: true,
});
process.exit(result.status ?? 1);
