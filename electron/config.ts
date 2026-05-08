import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { app } from 'electron';
import { BUILD_CONFIG } from './build-config';

const ConfigSchema = z.object({
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_ANON_KEY: z.string().min(20, 'SUPABASE_ANON_KEY looks too short'),
});

export type Config = z.infer<typeof ConfigSchema>;

export class MissingConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Junction config is incomplete:\n${issues.join('\n')}`);
    this.name = 'MissingConfigError';
  }
}

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function loadFromDotEnv(): Record<string, string> {
  // Search order: app path (dev: project root, prod: resources/app), then process cwd as fallback.
  const candidates = [
    path.join(app.getAppPath(), '.env.local'),
    path.join(process.cwd(), '.env.local'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        return parseEnvFile(readFileSync(candidate, 'utf8'));
      } catch {
        return {};
      }
    }
  }
  return {};
}

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;

  const fromFile = loadFromDotEnv();
  // Resolution order: explicit env vars (CI, dev override) > .env.local
  // (developer machines) > BUILD_CONFIG (baked in at production build time).
  const merged = {
    SUPABASE_URL: process.env.SUPABASE_URL || fromFile.SUPABASE_URL || BUILD_CONFIG.SUPABASE_URL,
    SUPABASE_ANON_KEY:
      process.env.SUPABASE_ANON_KEY || fromFile.SUPABASE_ANON_KEY || BUILD_CONFIG.SUPABASE_ANON_KEY,
  };

  const parsed = ConfigSchema.safeParse(merged);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`);
    issues.push('');
    issues.push('Set them in .env.local (copy from .env.example) or via process.env.');
    issues.push('See docs/supabase-setup.md for the full setup guide.');
    throw new MissingConfigError(issues);
  }

  cached = parsed.data;
  return cached;
}

export function tryLoadConfig(): { ok: true; config: Config } | { ok: false; message: string } {
  try {
    return { ok: true, config: loadConfig() };
  } catch (err) {
    if (err instanceof MissingConfigError) return { ok: false, message: err.message };
    return { ok: false, message: err instanceof Error ? err.message : 'Unknown config error' };
  }
}
