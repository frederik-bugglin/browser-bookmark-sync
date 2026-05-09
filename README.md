# Junction

> Bookmark-Sync zwischen Desktop-Browsern auf macOS.

Junction ist eine Menüleisten-App für macOS, die Bookmarks zwischen verschiedenen Desktop-Browsern (Chrome, Brave, Edge, Arc, Dia, Firefox, Zen, Safari) synchronisiert. Die iOS-Pendants ziehen über die nativen Sync-Mechanismen der jeweiligen Hersteller (iCloud, Google Sync, Firefox Sync) automatisch nach.

## Was es macht

- Liest Bookmarks aus den lokalen Profil-Dateien jedes Browsers (kein Login, keine Browser-Extension).
- Spiegelt sie in eine Supabase-Cloud-Tabelle (Single User, Row Level Security).
- Schreibt Änderungen aus der Cloud zurück in die Browser-Profile.
- Last-Write-Wins bei Konflikten, jede Auflösung landet im Konflikt-Log mit Restore-Option.
- Läuft im Tray, mit manuellem Trigger und automatischem Polling.

## Unterstützte Browser

| Familie    | Browser                              | Profil-Quelle                  |
| ---------- | ------------------------------------ | ------------------------------ |
| Chromium   | Chrome, Brave, Edge, Arc, Dia        | `Bookmarks` (JSON)             |
| Firefox    | Firefox, Zen                         | `places.sqlite`                |
| Safari     | Safari                               | `Bookmarks.plist`              |

Erkennung läuft über Bundle-Name in `/Applications` plus Existenz des Default-Profils.

## Architektur

```
+---------------------------+      +-----------------------+
|   Electron Main           |      |  Supabase             |
|                           |      |                       |
|  +-------------------+    |      |  +----------------+   |
|  | Adapters          |    |      |  | bookmarks_     |   |
|  |  - chromium       |<---+----->|  | cloud (RLS)    |   |
|  |  - firefox        |    |      |  +----------------+   |
|  |  - safari         |    |      |  | conflicts      |   |
|  +-------------------+    |      |  +----------------+   |
|         |                 |      |                       |
|  +------v------------+    |      +-----------------------+
|  | Sync-Engine       |
|  |  diff -> resolve  |
|  |  -> route -> apply|
|  +-------------------+
|         |
|  +------v------------+        +-----------------------+
|  | Sync-Trigger      |<------>|  Renderer (Next.js)   |
|  |  manual / auto    |   IPC  |  Tray-Popover, Settings|
|  +-------------------+        |  Onboarding, Conflicts |
|                               +-----------------------+
+---------------------------+
```

- **Adapter** (`electron/adapters/<vendor>/`) kapseln Detect, Read, Write, Lock-Check und Mapping pro Browser-Familie.
- **Sync-Engine** (`electron/sync-engine/`) macht Diff, Konflikt-Resolution, Routing und ist Driver-agnostisch.
- **Sync-Trigger** (`electron/sync-trigger/`) fährt Sync manuell, im Intervall oder bei Online-Wechsel.
- **Renderer** (`src/app/`) ist eine Next.js-App, die im Electron-Fenster läuft (Settings, Onboarding, Tray-Popover, Konflikt-Log).
- **Konflikt-Log** (`electron/conflicts/`) speichert verlorene Versionen und erlaubt Restore.

## Stack

- Electron 42, Next.js 16 (App Router), React 19, TypeScript 5
- Supabase (PostgreSQL + Auth, Single User, RLS)
- Tailwind CSS 3.4 + shadcn/ui (Radix Primitives)
- Vitest (Unit), Playwright (E2E)
- electron-builder für Release-Artefakte

## Setup

### Voraussetzungen

- macOS (Apple Silicon oder Intel)
- Node.js 20+ und npm
- Ein Supabase-Projekt (kostenloser Plan reicht)

### Installation

```bash
git clone <repo-url> junction
cd junction
npm install
npx playwright install chromium   # einmalig fuer E2E-Tests
```

### Supabase

1. Projekt auf [supabase.com](https://supabase.com) anlegen.
2. SQL-Migrationen aus `supabase/migrations/` in der Reihenfolge anwenden (`0001_initial_schema.sql`, `0002_sync_engine.sql`).
3. `.env.example` zu `.env.local` kopieren und Werte aus _Project Settings → API_ eintragen:

   ```bash
   cp .env.example .env.local
   ```

   ```env
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_ANON_KEY=eyJhbGc...
   ```

   Der Anon-Key darf in den Desktop-Build, RLS schützt die Tabellen serverseitig.

### Dev-Mode starten

```bash
npm run electron:dev
```

Startet drei Prozesse parallel: Next.js Dev-Server, TypeScript-Watcher für den Electron-Main-Prozess und `electronmon` (auto-reload).

## Permissions

Junction liest und schreibt Profil-Dateien direkt im Dateisystem. macOS verlangt dafür je nach Browser unterschiedliche Permissions.

### Safari (Pflicht)

- **Full Disk Access** in _Systemeinstellungen → Datenschutz & Sicherheit → Festplattenvollzugriff_.
- Ohne diese Permission ist `~/Library/Safari/Bookmarks.plist` nicht lesbar. Junction zeigt das im Onboarding-Schritt mit Direkt-Link in die Systemeinstellungen.
- Es gibt keinen Workaround, das ist eine TCC-Beschränkung von Apple.

### Firefox und Zen

- `places.sqlite` ist gelockt, solange der Browser läuft. Junction kopiert die Datei vor dem Lesen und prüft den Lock-Status pro Sync.
- Beim Schreiben: Browser muss geschlossen sein, sonst überspringt Junction den Write und loggt einen Konflikt.

### Chromium-Familie

- Chromium-Browser nutzen `SingletonLock` im User-Data-Verzeichnis. Junction toleriert paralleles Lesen, Writes nur bei geschlossenem Browser.

## Roadmap

Status pro Feature in [`features/INDEX.md`](features/INDEX.md). Spec pro Feature unter `features/PROJ-X-*.md`.

| ID     | Feature                              | Status   |
| ------ | ------------------------------------ | -------- |
| PROJ-1 | Electron-Shell und Menüleisten-App   | Approved |
| PROJ-2 | Supabase Backend und Auth            | Approved |
| PROJ-3 | Bookmark-Adapter Chromium-Familie    | Approved |
| PROJ-4 | Bookmark-Adapter Firefox und Zen     | Approved |
| PROJ-5 | Bookmark-Adapter Safari              | Approved |
| PROJ-6 | Sync-Engine                          | Approved |
| PROJ-7 | Sync-Trigger (manuell und auto)      | Approved |
| PROJ-8 | Settings-UI                          | Approved |
| PROJ-9 | Konflikt-Log                         | Approved |

## Build und Release

```bash
npm run electron:build
```

Pipeline:

1. `scripts/inject-build-config.mjs` schreibt `SUPABASE_URL` und `SUPABASE_ANON_KEY` aus `.env.local` in `electron/build-config.ts`.
2. `next build` erstellt den statischen Renderer nach `out/`.
3. `tsc -p electron/tsconfig.json` kompiliert den Main-Prozess nach `dist-electron/`.
4. `electron-builder` packt das `.app` und `.dmg` nach `dist/`.
5. `git restore electron/build-config.ts` setzt den injizierten Config-Stub zurück, damit keine Secrets im Working-Tree landen.

Konfiguration für Builder steht in `electron-builder.yml`.

## Tests

```bash
npm test               # Vitest, alle Unit-Tests (Main + Renderer)
npm run test:watch     # Watch-Modus
npm run test:e2e       # Playwright (Renderer-Flows)
npm run test:all       # beide Suites sequenziell
```

Adapter-Tests nutzen Fixtures unter `electron/adapters/<vendor>/__fixtures__/` mit anonymisierten Profil-Dateien.

## Projektstruktur

```
electron/
  main.ts                Electron-Entry, Tray, BrowserWindow
  ipc.ts                 IPC-Bridge zum Renderer
  adapters/
    chromium/            Chrome, Brave, Edge, Arc, Dia
    firefox/             Firefox, Zen (places.sqlite)
    safari/              Safari (Bookmarks.plist + TCC)
  sync-engine/           Diff, Resolve, Route, Cloud
  sync-trigger/          Manual, Interval, Online-Detection
  conflicts/             Log, Query, Restore
  state.ts, store.ts     Persistente Settings
  permissions.ts         TCC-Checks
src/
  app/
    layout.tsx, page.tsx
    onboarding/          First-run Wizard
    settings/            Browser-Auswahl, Auth, Sync-Optionen
    popover/             Tray-Popover
    conflicts/           Konflikt-Log UI
  components/ui/         shadcn/ui (Radix)
  hooks/, lib/
supabase/migrations/     SQL-Migrationen
docs/PRD.md              Vision, Targets, Constraints
features/                Feature-Specs (PROJ-1..9)
scripts/                 Build-Helper
```

## Troubleshooting

- **Safari-Bookmarks fehlen nach Sync.** Full Disk Access in den Systemeinstellungen prüfen, danach Junction beenden und neu starten (TCC wird nur beim Process-Start geprüft).
- **Firefox-Sync zeigt "skipped".** Der Browser läuft. Junction überspringt Writes, solange ein Lock auf `places.sqlite` liegt. Browser schliessen oder auf den nächsten Auto-Sync warten.
- **`electron:dev` startet, aber das Fenster bleibt leer.** Next.js läuft noch nicht auf Port 3000. `wait-on` löst das normalerweise selbst, sonst Console des Renderers (Cmd+Option+I) und Logs des Main-Prozess (Terminal) prüfen.
- **Nach `electron:build` fehlen Supabase-Werte im Bundle.** `.env.local` muss vor dem Build gefüllt sein, sonst lässt `inject-build-config.mjs` Platzhalter stehen.
- **Konflikt-Log wächst.** `electron/conflicts/prune.ts` läuft periodisch und kappt alte Einträge. Manuelles Prune-Trigger in der Settings-UI.

## Lizenz

Privates Projekt von Frederik Bugglin. Lizenz noch nicht festgelegt.
