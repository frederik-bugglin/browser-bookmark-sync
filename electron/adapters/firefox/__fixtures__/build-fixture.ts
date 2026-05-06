// Builds a minimal places.sqlite file matching Firefox's schema closely enough
// for the adapter under test. We don't need the full Firefox schema (visits,
// frecency, annotations, bookmark tags) — only the columns that read.ts and
// write.ts actually touch.

import { DatabaseSync } from 'node:sqlite';

export type FixtureBookmark =
  | { kind: 'folder'; guid: string; title: string; root: 'toolbar' | 'unfiled' | 'mobile' | 'menu'; parentPath: string; children: FixtureBookmark[] }
  | { kind: 'url'; guid: string; title: string; url: string; root: 'toolbar' | 'unfiled' | 'mobile' | 'menu'; parentPath: string };

const ROOT_GUIDS = {
  root____: 'root________',
  toolbar: 'toolbar_____',
  unfiled: 'unfiled_____',
  mobile: 'mobile______',
  menu: 'menu________',
  tags: 'tags________',
} as const;

const SCHEMA_SQL = `
CREATE TABLE moz_places (
  id INTEGER PRIMARY KEY,
  url LONGVARCHAR,
  url_hash INTEGER NOT NULL DEFAULT 0,
  title LONGVARCHAR,
  rev_host LONGVARCHAR,
  visit_count INTEGER DEFAULT 0,
  hidden INTEGER DEFAULT 0 NOT NULL,
  typed INTEGER DEFAULT 0 NOT NULL,
  frecency INTEGER DEFAULT -1 NOT NULL,
  last_visit_date INTEGER,
  guid TEXT,
  foreign_count INTEGER DEFAULT 0 NOT NULL
);

CREATE TABLE moz_bookmarks (
  id INTEGER PRIMARY KEY,
  type INTEGER,
  fk INTEGER DEFAULT NULL,
  parent INTEGER,
  position INTEGER,
  title LONGVARCHAR,
  keyword_id INTEGER,
  folder_type TEXT,
  dateAdded INTEGER,
  lastModified INTEGER,
  guid TEXT,
  syncStatus INTEGER NOT NULL DEFAULT 0,
  syncChangeCounter INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX moz_bookmarks_parentindex ON moz_bookmarks(parent, position);
CREATE INDEX moz_places_url_hashindex ON moz_places(url_hash);
`;

export function buildFixtureDb(dbPath: string, tree: FixtureBookmark[]): void {
  const db = new DatabaseSync(dbPath);
  for (const stmt of SCHEMA_SQL.split(';').map((s) => s.trim()).filter(Boolean)) {
    db.prepare(stmt).run();
  }

  // Insert the synthetic root row + four logical roots, mirroring Firefox.
  const insertBmk = db.prepare(`
    INSERT INTO moz_bookmarks (id, type, parent, position, title, guid, dateAdded, lastModified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertBmk.run(1, 2, 0, 0, '', ROOT_GUIDS.root____, 0, 0);
  insertBmk.run(2, 2, 1, 0, 'menu', ROOT_GUIDS.menu, 0, 0);
  insertBmk.run(3, 2, 1, 1, 'toolbar', ROOT_GUIDS.toolbar, 0, 0);
  insertBmk.run(4, 2, 1, 2, 'tags', ROOT_GUIDS.tags, 0, 0);
  insertBmk.run(5, 2, 1, 3, 'unfiled', ROOT_GUIDS.unfiled, 0, 0);
  insertBmk.run(6, 2, 1, 4, 'mobile', ROOT_GUIDS.mobile, 0, 0);

  const rootIdByName: Record<string, number> = {
    toolbar: 3,
    unfiled: 5,
    mobile: 6,
    menu: 2,
  };

  let nextId = 100;
  let nextPlaceId = 1;
  const placeIdByUrl = new Map<string, number>();

  const insertPlace = db.prepare(`
    INSERT INTO moz_places (id, url, url_hash, rev_host, frecency, guid)
    VALUES (?, ?, 0, '', -1, ?)
  `);

  function getOrInsertPlace(url: string): number {
    const existing = placeIdByUrl.get(url);
    if (existing !== undefined) return existing;
    const id = nextPlaceId++;
    placeIdByUrl.set(url, id);
    insertPlace.run(id, url, `g${id.toString().padStart(11, '0')}`);
    return id;
  }

  function insertNode(node: FixtureBookmark, parentId: number, position: number): void {
    const id = nextId++;
    if (node.kind === 'folder') {
      insertBmk.run(id, 2, parentId, position, node.title, node.guid, 1700000000000000, 1700000000000000);
      let i = 0;
      for (const child of node.children) {
        insertNode(child, id, i++);
      }
    } else {
      const placeId = getOrInsertPlace(node.url);
      const insertUrl = db.prepare(`
        INSERT INTO moz_bookmarks (id, type, fk, parent, position, title, guid, dateAdded, lastModified)
        VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertUrl.run(id, placeId, parentId, position, node.title, node.guid, 1700000000000000, 1700000000000000);
    }
  }

  // Group fixture entries by root and insert.
  const byRoot: Record<string, FixtureBookmark[]> = { toolbar: [], unfiled: [], mobile: [], menu: [] };
  for (const node of tree) {
    if (node.parentPath === '/') {
      byRoot[node.root].push(node);
    }
  }
  for (const [rootName, items] of Object.entries(byRoot)) {
    const parentId = rootIdByName[rootName];
    let pos = 0;
    for (const item of items) {
      insertNode(item, parentId, pos++);
    }
  }

  db.close();
}
