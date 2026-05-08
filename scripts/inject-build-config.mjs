#!/usr/bin/env node
// Bakes Supabase config into electron/build-config.ts before a production
// electron build. Reads from process.env first, then from .env.local.
//
// The corresponding restore step (`git restore electron/build-config.ts`)
// runs at the end of `npm run electron:build` so real values never enter
// a git commit.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'electron', 'build-config.ts');
const ENV_FILE = path.join(ROOT, '.env.local');

function parseEnvFile(content) {
  const out = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

const fromFile = existsSync(ENV_FILE) ? parseEnvFile(readFileSync(ENV_FILE, 'utf8')) : {};

const SUPABASE_URL = process.env.SUPABASE_URL || fromFile.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || fromFile.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    '[inject-build-config] Missing SUPABASE_URL or SUPABASE_ANON_KEY (checked process.env and .env.local).',
  );
  process.exit(1);
}

function escapeSingleQuotes(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const banner = '// AUTO-GENERATED at build time. Do not commit values from this file.';
const body = `export const BUILD_CONFIG = {
  SUPABASE_URL: '${escapeSingleQuotes(SUPABASE_URL)}',
  SUPABASE_ANON_KEY: '${escapeSingleQuotes(SUPABASE_ANON_KEY)}',
};
`;

writeFileSync(TARGET, `${banner}\n${body}`, 'utf8');
console.log(`[inject-build-config] Wrote ${path.relative(ROOT, TARGET)} with values from ${fromFile.SUPABASE_URL ? '.env.local' : 'process.env'}.`);
