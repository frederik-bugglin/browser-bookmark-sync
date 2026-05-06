// Mirror of src/lib/url-normalize.ts for use in the Electron main process.
// Kept in sync manually; tests in both halves guarantee identical behavior.

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'ref_url',
  '_hsenc',
  '_hsmi',
  'igshid',
  'yclid',
]);

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed.toLowerCase();
  }

  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  parsed.hash = '';

  if (
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  ) {
    parsed.port = '';
  }

  for (const key of Array.from(parsed.searchParams.keys())) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      parsed.searchParams.delete(key);
    }
  }

  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  }

  return parsed.toString();
}

export function normalizeFolderPath(segments: string[]): string {
  if (!segments.length) return '/';
  const cleaned = segments
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s.toLowerCase());
  if (!cleaned.length) return '/';
  return '/' + cleaned.join('/');
}
