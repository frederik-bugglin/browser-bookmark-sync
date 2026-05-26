#!/usr/bin/env node
// Runs a SQL query against the project's Supabase Postgres instance.
//
// Reads DATABASE_URL from .env.local. The connection string must be the
// Supabase "Session Pooler" URI (port 5432) from Project Settings → Database
// → Connection string → URI. Using the pooler avoids IPv6-only restrictions
// on the direct connection.
//
// Usage:
//   node scripts/db-query.mjs "select count(*) from public.bookmarks_cloud"
//   echo "select 1" | node scripts/db-query.mjs
//
// Output: rows printed as a markdown-style ASCII table.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
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
const DATABASE_URL = process.env.DATABASE_URL || fromFile.DATABASE_URL;
const PASSWORD_OVERRIDE =
  process.env.SUPABASE_DB_PASSWORD || fromFile.SUPABASE_DB_PASSWORD;

if (!DATABASE_URL) {
  console.error(
    '[db-query] DATABASE_URL missing. Add it to .env.local. Get the URI from\n' +
      '  Supabase → Project Settings → Database → Connection string → URI\n' +
      '  (use the "Session pooler" variant on port 5432).',
  );
  process.exit(1);
}

// Parse the URL with WHATWG URL so we get URL-decoded fields and can
// substitute the password from SUPABASE_DB_PASSWORD if the URL itself
// doesn't contain a (correctly-encoded) one.
function buildConnectionConfig() {
  const u = new URL(DATABASE_URL);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username),
    password: PASSWORD_OVERRIDE || decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, '') || 'postgres',
    ssl: { rejectUnauthorized: false },
  };
}

const sql =
  process.argv[2] ||
  (await new Promise((resolve) => {
    let buf = '';
    process.stdin.on('data', (chunk) => (buf += chunk));
    process.stdin.on('end', () => resolve(buf.trim()));
  }));

if (!sql) {
  console.error('[db-query] No SQL provided. Pass as argv or pipe via stdin.');
  process.exit(1);
}

const client = new pg.Client(buildConnectionConfig());

try {
  await client.connect();
  const result = await client.query(sql);
  if (Array.isArray(result)) {
    for (const r of result) printResult(r);
  } else {
    printResult(result);
  }
} catch (err) {
  console.error(`[db-query] Error: ${err.message}`);
  process.exit(1);
} finally {
  await client.end();
}

function printResult(r) {
  if (!r.rows || r.rows.length === 0) {
    console.log(`(no rows; command: ${r.command ?? '?'}, rowCount: ${r.rowCount ?? 0})`);
    return;
  }
  const cols = Object.keys(r.rows[0]);
  const widths = cols.map((c) =>
    Math.max(c.length, ...r.rows.map((row) => fmt(row[c]).length)),
  );
  const sep = `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`;
  const header = `| ${cols.map((c, i) => c.padEnd(widths[i])).join(' | ')} |`;
  console.log(header);
  console.log(sep);
  for (const row of r.rows) {
    console.log(`| ${cols.map((c, i) => fmt(row[c]).padEnd(widths[i])).join(' | ')} |`);
  }
  console.log(`(${r.rows.length} rows)`);
}

function fmt(v) {
  if (v === null || v === undefined) return 'NULL';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
