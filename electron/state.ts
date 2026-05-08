import { z } from 'zod';

export const SyncStatusSchema = z.enum([
  'idle',
  'running',
  'success',
  'error',
  'skipped-offline',
]);
export type SyncStatus = z.infer<typeof SyncStatusSchema>;

export const AppStateSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  firstLaunchDone: z.boolean().default(false),
  lastSyncAt: z.string().nullable().default(null),
  lastSyncStatus: SyncStatusSchema.default('idle'),
  nextScheduledSyncAt: z.string().nullable().default(null),
  mainWindowBounds: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .nullable()
    .default(null),
});
export type AppState = z.infer<typeof AppStateSchema>;

export const AutoSyncIntervalMinSchema = z.union([
  z.literal(5),
  z.literal(15),
  z.literal(30),
  z.literal(60),
]);
export type AutoSyncIntervalMin = z.infer<typeof AutoSyncIntervalMinSchema>;

export const BrowserIdSchema = z.enum([
  'chrome',
  'safari',
  'firefox',
  'arc',
  'brave',
  'edge',
  'zen',
  'dia',
]);
export type BrowserId = z.infer<typeof BrowserIdSchema>;

// schemaVersion bumped from 1 to 2 with enabledBrowsers + acknowledgedBrowsers.
// Stored v1 files miss those fields; main.ts runs a one-shot migration that
// pre-fills both lists with currently-detected browsers so existing users see
// no behavior change.
export const SettingsSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]).default(2),
  autoLaunch: z.boolean().default(true),
  autoSyncEnabled: z.boolean().default(true),
  autoSyncIntervalMin: AutoSyncIntervalMinSchema.default(15),
  notifyOnSyncError: z.boolean().default(false),
  enabledBrowsers: z.array(BrowserIdSchema).default([]),
  acknowledgedBrowsers: z.array(BrowserIdSchema).default([]),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const defaultAppState: AppState = AppStateSchema.parse({});
export const defaultSettings: Settings = SettingsSchema.parse({});
