// SQL statements for places.sqlite. Kept as named constants so they're testable
// in isolation and easy to grep when Firefox bumps its schema version.

// Read all bookmark rows in a single query, joined against moz_places for URLs.
// We pull the four roots and everything beneath them; tags (parent of root_tags)
// are excluded by the recursive walk in read.ts. Smart bookmarks (place:-URLs)
// are filtered there too; we still pull them here to keep this query simple.
export const SELECT_ALL_NODES = `
  SELECT
    b.id          AS id,
    b.parent      AS parent,
    b.position    AS position,
    b.type        AS type,
    b.title       AS title,
    b.guid        AS guid,
    b.dateAdded   AS dateAdded,
    b.lastModified AS lastModified,
    b.fk          AS fk,
    p.url         AS url
  FROM moz_bookmarks b
  LEFT JOIN moz_places p ON p.id = b.fk
  WHERE b.type IN (1, 2)
  ORDER BY b.parent, b.position
`;

// Look up the four root rows by guid so we know their numeric IDs without
// hardcoding values that could shift between profiles created on old Firefox
// versions.
export const SELECT_ROOTS_BY_GUID = `
  SELECT id, guid FROM moz_bookmarks WHERE guid IN ('toolbar_____', 'unfiled_____', 'mobile______', 'menu________')
`;

export const SELECT_PLACE_ID_BY_URL = `
  SELECT id FROM moz_places WHERE url = ?
`;

// We use a deterministic insert with placeholders for url, url_hash, guid, frecency.
// hash() is a Firefox-specific SQL function exposed by places' SQLite extension.
// Since we open the DB without that extension loaded, we precompute a 64-bit
// FNV-style hash in JS instead and pass it explicitly.
export const INSERT_PLACE = `
  INSERT INTO moz_places (url, url_hash, title, rev_host, hidden, typed, frecency, guid)
  VALUES (?, ?, NULL, ?, 0, 0, ?, ?)
`;

export const INSERT_BOOKMARK = `
  INSERT INTO moz_bookmarks (type, fk, parent, position, title, guid, dateAdded, lastModified)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

// Recursive deletion of all rows under a root, but not the root itself.
// SQLite supports recursive CTEs; we collect the descendants then delete in a
// single statement so foreign-key constraints don't fight us.
export const DELETE_DESCENDANTS_OF_ROOT = `
  WITH RECURSIVE descendants(id) AS (
    SELECT id FROM moz_bookmarks WHERE parent = ?
    UNION ALL
    SELECT b.id FROM moz_bookmarks b INNER JOIN descendants d ON b.parent = d.id
  )
  DELETE FROM moz_bookmarks WHERE id IN (SELECT id FROM descendants)
`;

// Used by read.ts when walking children of a parent in deterministic order.
export const SELECT_CHILDREN = `
  SELECT id FROM moz_bookmarks WHERE parent = ? ORDER BY position
`;
