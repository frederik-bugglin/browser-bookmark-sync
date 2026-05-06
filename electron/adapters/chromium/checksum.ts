import crypto, { type Hash } from 'node:crypto';
import type { ChromiumNode, ChromiumRoots } from './types';

function updateForNode(hash: Hash, node: ChromiumNode): void {
  hash.update(node.id, 'utf8');
  hash.update(Buffer.from(node.name, 'utf16le'));
  if (node.type === 'url') {
    hash.update('url', 'utf8');
    hash.update(node.url, 'utf8');
  } else {
    hash.update('folder', 'utf8');
    for (const child of node.children) {
      updateForNode(hash, child);
    }
  }
}

export function computeChecksum(roots: ChromiumRoots): string {
  const hash = crypto.createHash('md5');
  // Chromium hashes each root folder itself (id + name + "folder") AND recurses into its children.
  // Order: bookmark_bar, other, synced.
  updateForNode(hash, roots.bookmark_bar);
  updateForNode(hash, roots.other);
  updateForNode(hash, roots.synced);
  return hash.digest('hex');
}
