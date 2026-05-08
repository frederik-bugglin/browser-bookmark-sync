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

export const SettingsSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  autoLaunch: z.boolean().default(true),
  autoSyncEnabled: z.boolean().default(true),
  autoSyncIntervalMin: AutoSyncIntervalMinSchema.default(15),
  notifyOnSyncError: z.boolean().default(false),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const defaultAppState: AppState = AppStateSchema.parse({});
export const defaultSettings: Settings = SettingsSchema.parse({});
