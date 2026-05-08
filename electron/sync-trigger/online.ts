import { lookup } from 'node:dns/promises';
import type { OnlineProbe } from './types';

// DNS-based reachability check. We resolve the configured Supabase host —
// if DNS works, we have at least functional internet to the right backend.
// Cheap (<50 ms typical), no HTTP roundtrip, no third-party probe target.
export function createDnsProbe(supabaseUrl: string, timeoutMs = 1500): OnlineProbe {
  let hostname: string;
  try {
    hostname = new URL(supabaseUrl).hostname;
  } catch {
    // If the URL is unparseable, treat as always-offline so syncs never run.
    return async () => false;
  }

  return async () => {
    try {
      await Promise.race([
        lookup(hostname),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('dns-timeout')), timeoutMs),
        ),
      ]);
      return true;
    } catch {
      return false;
    }
  };
}
