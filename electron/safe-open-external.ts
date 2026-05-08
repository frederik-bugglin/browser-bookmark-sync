import { shell } from 'electron';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

export async function safeOpenExternal(url: string): Promise<void> {
  if (!isSafeExternalUrl(url)) {
    throw new Error(`Refused to open URL with disallowed protocol: ${url}`);
  }
  await shell.openExternal(url);
}
