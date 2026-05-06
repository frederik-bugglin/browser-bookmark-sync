// Firefox stores `url_hash` in moz_places — a 48-bit hash used for fast lookup.
// Algorithm is documented in toolkit/components/places/Helpers.cpp as
// "computeHashFromString" using FNV-1a over the URL's prefix bytes plus
// the full URL. We don't load Firefox's SQLite extension, so we replicate
// the result in JS.
//
// The hash is split into two halves: a 16-bit prefix bucket plus a 32-bit
// fingerprint. The prefix bucket comes from the URL scheme + ':' and the
// rest is FNV-1a over the full URL. Together they form a 48-bit integer
// stored as INTEGER in SQLite.
//
// Reference: https://searchfox.org/mozilla-central/source/toolkit/components/places/Helpers.cpp

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;
const MASK_32 = 0xffffffffn;

function fnv1a64(input: string): bigint {
  let hash = FNV_OFFSET;
  const bytes = Buffer.from(input, 'utf8');
  for (const b of bytes) {
    hash ^= BigInt(b);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash;
}

export function computeUrlHash(url: string): bigint {
  // Firefox: prefix = scheme + ":", rest = full URL. Top 16 bits = prefix hash,
  // bottom 32 bits = full URL hash.
  const colonIdx = url.indexOf(':');
  const prefix = colonIdx >= 0 ? url.slice(0, colonIdx + 1) : '';
  const prefixHash = fnv1a64(prefix) & 0xffffn;
  const fullHash = fnv1a64(url) & MASK_32;
  return (prefixHash << 32n) | fullHash;
}

export function reverseHost(url: string): string {
  // moz_places.rev_host stores the hostname reversed, ending in '.'. Used for
  // domain-rooted queries. Empty string is acceptable — Firefox tolerates it.
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (!host) return '';
    return host.split('').reverse().join('') + '.';
  } catch {
    return '';
  }
}
