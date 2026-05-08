// This file is overwritten at build time by scripts/inject-build-config.mjs
// with values from .env.local (or process.env).
//
// In dev mode the empty strings here are ignored; electron/config.ts falls
// back to .env.local at runtime via JsonStore-style file lookup.
//
// In production builds the inject script writes the real values into this
// file before tsc compiles it, so the constants are baked into the ASAR.
// The npm script restores this file to empty strings after electron-builder
// finishes, so the values never end up in a git commit.
export const BUILD_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
};
