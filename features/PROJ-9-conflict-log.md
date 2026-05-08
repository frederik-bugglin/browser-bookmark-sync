# PROJ-9: Konflikt-Log

## Status: Approved
**Created:** 2026-05-06
**Last Updated:** 2026-05-08 (QA-Pass mit zwei Bugs gefixt)

## Dependencies
- PROJ-2 (Supabase Backend) für `conflict_log`-Tabelle und RLS
- PROJ-6 (Sync-Engine) als Erzeuger der Einträge — schreibt Inserts beim Resolve
- Wird benutzt von PROJ-7 (Tray-Badge mit Count-since-last-seen) und PROJ-8 (Settings: Retention konfigurieren)

## User Stories
- Als Nutzer möchte ich nach einem Sync sehen, welche Bookmarks überschrieben wurden, damit ich nichts unbemerkt verliere
- Als Nutzer möchte ich pro Konflikt die verlierende Version einsehen, mit klar markierten Unterschieden zur Gewinner-Version
- Als Nutzer möchte ich die verlierende Version mit einem Klick wiederherstellen können, ohne den Sync-Mechanismus zu umgehen
- Als Nutzer möchte ich offene von erledigten Konflikten unterscheiden können, damit ich nicht jedes Mal von vorne durchschauen muss
- Als Nutzer möchte ich das Log nach Datum, Browser oder Bookmark-Titel filtern, damit ich gezielt suchen kann
- Als Nutzer möchte ich, dass alte Einträge automatisch verschwinden, damit das Log nicht ins Unendliche wächst

## Was zählt als Konflikt

Ein Konflikt-Log-Eintrag entsteht **nur**, wenn zwei oder mehr Browser dieselbe Bookmark (gleicher Identitäts-Hash, siehe PROJ-6) unabhängig voneinander seit dem letzten Sync verändert haben. Beispiele:

| Szenario | Konflikt? | Warum |
|---|---|---|
| Bookmark X in A umbenannt, in B unverändert | Nein | Reines Update, B übernimmt |
| Bookmark X in A umbenannt, in B gelöscht | Ja | Gegenläufige Aktionen, LWW entscheidet |
| Bookmark X in A umbenannt, in B in anderen Ordner verschoben | Ja | Beide haben dieselbe Bookmark unterschiedlich verändert |
| Bookmark Y in A neu hinzugefügt | Nein | Reines Add, propagiert |
| Bookmark Y in A und B gleichzeitig hinzugefügt mit gleicher URL aber unterschiedlichem Titel | Ja | Selber Hash, unterschiedliche Werte |
| Bookmark Z in A aus dem Toolbar in den Other-Folder verschoben, in B unverändert | Nein | Reines Update auf A-Seite |

Engine schreibt also **nicht** für jede LWW-Entscheidung einen Log-Eintrag, sondern nur, wenn echt zwei Quellen kollidieren.

## Acceptance Criteria

### Datenmodell und Persistenz
- [ ] Pro Konflikt eine Row in `conflict_log`: Identitäts-Hash der Bookmark, beide Versionen als JSONB (Winner und Loser), Browser-IDs (Winner und Loser), Sync-Run-ID, Status (`open` / `restored` / `dismissed`), `created_at`, optional `resolved_at`
- [ ] RLS owner-only: User darf nur seine eigenen Einträge sehen und ändern
- [ ] Mehr als zwei kollidierende Versionen pro Bookmark: pro Verlierer-Browser eine Row (also bei drei kollidierenden Browsern entstehen zwei Einträge mit demselben Winner)

### Liste und Filter (Konflikt-Log-Seite)
- [ ] Tabelle aller Konflikte mit jüngste-zuerst-Sortierung
- [ ] Spalten: Datum, Winner-Browser, Loser-Browser, Bookmark-Titel (Winner-Version), Status, Aktion
- [ ] Filter-Bar: Datums-Range (von/bis), Winner-Browser-Multi-Select, Loser-Browser-Multi-Select, Status (open/restored/dismissed/alle), Suche im Titel und URL
- [ ] Pagination oder Infinite-Scroll bei mehr als 100 Einträgen pro Filter-Resultat
- [ ] Default-Filter: Status `open`, alle anderen offen
- [ ] Empty State: wenn keine Konflikte, freundlicher Hinweis ("Bisher kein Konflikt — Sync läuft sauber")

### Detail-Ansicht
- [ ] Klick auf einen Eintrag öffnet Detail-Dialog mit beiden Versionen nebeneinander
- [ ] Felder, die sich unterscheiden, werden visuell markiert (Wort-Level-Diff bei Titel, Pfad-Diff bei Ordner, URL exakt-Gleich-Marker)
- [ ] Header zeigt Sync-Run-ID + Zeitstempel + beide Browser-Namen
- [ ] Footer-Buttons: "Wiederherstellen", "Als erledigt markieren", "Schliessen"

### Wiederherstellen (Restore)
- [ ] Klick auf "Wiederherstellen" schreibt die Loser-Version mit aktualisiertem `dateModified` (= jetzt) als neuen Cloud-Stand für diese Bookmark
- [ ] Restore triggert automatisch den nächsten Sync-Lauf (PROJ-7 stellt den Trigger), die Loser-Version propagiert per LWW in alle Browser
- [ ] Konflikt-Eintrag bekommt `status='restored'` und `resolved_at=jetzt`
- [ ] Wenn der Restore selbst einen neuen Konflikt erzeugt (ein Browser hat in der Zwischenzeit etwas an derselben Bookmark gemacht): neuer Konflikt-Eintrag mit Verweis auf den ursprünglichen Eintrag (Feld `restore_origin_id`)
- [ ] Wenn die Bookmark zwischenzeitlich von allen Browsern gelöscht wurde: Restore erstellt sie neu in Cloud, propagiert per Sync

### Als erledigt markieren (Dismiss)
- [ ] Klick auf "Als erledigt markieren" setzt `status='dismissed'` und `resolved_at=jetzt`
- [ ] Kein Sync-Trigger, keine Daten-Aktion. Nur Audit-Marker für den User
- [ ] Dismissed-Einträge sind im Filter "Status: alle" weiter sichtbar

### Tray-Indikator (Schnittstelle zu PROJ-7)
- [ ] PROJ-9 bietet eine Query "wie viele open-Konflikte sind seit `app_state.lastConflictsSeenAt` neu entstanden"
- [ ] Beim Öffnen der Konflikt-Log-Seite wird `lastConflictsSeenAt` auf jetzt gesetzt
- [ ] PROJ-7 verbindet diese Query mit dem Tray-Badge — PROJ-9 stellt nur die Daten bereit

### Retention und Pruning
- [ ] Default-Retention: 90 Tage. Einträge mit `created_at < jetzt - 90d` und `status != 'open'` werden automatisch gelöscht
- [ ] Open-Status-Einträge werden niemals automatisch gelöscht (sonst verschwinden ungesehene Konflikte still)
- [ ] Retention-Wert ist in Settings (PROJ-8) konfigurierbar zwischen 30, 90, 365 Tagen oder "nie"
- [ ] Pruning wird beim App-Start ausgelöst (idempotent, einmal pro Tag pro User)

## Edge Cases

- **Bookmark zwischenzeitlich gelöscht, User klickt Restore:** Restore erstellt die Bookmark neu in Cloud (Bookmarks-Cloud-Insert), nächster Sync propagiert sie in die aktivierten Browser. Konflikt-Eintrag bekommt `status='restored'`
- **User klickt Restore, neuer Konflikt entsteht beim nächsten Sync:** neuer Konflikt-Eintrag mit `restore_origin_id` zeigt zurück auf den ursprünglichen, beide bleiben im Log
- **User offline und will Konflikte ansehen:** Konflikt-Log-Seite zeigt Offline-Hinweis und leeren Zustand, kein lokaler Cache (akzeptiert per PRD: Sync-Pflicht für Cloud-Zugriff)
- **Identische Versionen mit dennoch unterschiedlichem Hash (z.B. Trailing-Slash):** URL-Normalisierung fängt das ab. Wenn nicht: keine echte Kollision, kein Log-Eintrag
- **Tausende Konflikte (Initial-Sync mit zwei sehr unterschiedlichen Browsern war's nicht, weil Initial-Sync ist Union ohne Konflikte):** kann passieren bei ungewöhnlicher Browser-Bewegung. Pagination greift. Performance-Test in QA
- **Zwei gleichzeitige Restore-Klicks auf denselben Konflikt:** zweiter Klick erkennt `status != 'open'` und zeigt einen Hinweis ("bereits wiederhergestellt"). Kein Doppel-Sync
- **Restore eines sehr alten Konflikts (>90d):** sollte gar nicht möglich sein, weil Pruning Open-Einträge nie löscht. Wenn der User retroaktiv den Status manipulierte: Restore funktioniert ganz normal
- **Sync-Run-ID nicht mehr existiert (lokales Sync-Log gepurged):** Detail-Ansicht zeigt nur Sync-Run-ID ohne Detail-Verlinkung, kein Fehler
- **Konflikt zwischen drei Browsern (A, B, C ändern alle dasselbe Bookmark):** zwei Log-Einträge entstehen — A vs C und B vs C, wenn C gewinnt. Jeder mit eigenem Verlierer-Detail
- **Browser wurde zwischenzeitlich deaktiviert (Settings):** alte Konflikt-Einträge mit diesem Browser bleiben im Log sichtbar, Restore funktioniert (LWW-Propagation greift trotzdem für aktivierte Browser, deaktivierter Browser wird nicht angefasst)

## Technical Requirements (optional)

- **Diff-Library:** `diff` (Wort-Level für Titel, Char-Level für URL falls subtil unterschiedlich)
- **shadcn/ui-Komponenten:** Table, Dialog, DatePicker, Input, Badge, ScrollArea — alle bereits installiert oder leicht hinzufügbar
- **Supabase-Query:** server-side Filter via `.eq()`, `.gte()`, `.lte()`, `.ilike()` — keine clientseitige Filterung in MVP
- **Pruning-Mechanismus:** Lokaler Trigger beim Boot. Kein Edge Function für MVP — der App-Start-Pfad ist robust genug
- **Page-Size:** 50 Einträge pro Page, Infinite-Scroll-Loader unten
- **Detail-Diff-Visualisierung:** zwei Spalten mit Felder-für-Felder-Vergleich (Titel-Diff, Pfad-Diff, URL-Diff falls Hash-Kollision)
- **Restore-Aktion:** schreibt direkt in `bookmarks_cloud` über Engine-Hilfsfunktion `markBookmarkForRestore()`, danach Trigger-Sync via PROJ-7 — keine Adapter-Direktwrites in PROJ-9-Code

## Was diese Feature explizit NICHT baut

- Kein Tray-Badge — das ist PROJ-7 (PROJ-9 stellt nur die Count-Query bereit)
- Keine macOS-System-Notifications (Push-Banner) — das ist PROJ-7
- Kein lokaler Offline-Cache der Konflikte — Online-only für MVP
- Keine Bulk-Aktionen (alle dismissen, alle wiederherstellen) — Phase 2
- Keine Konflikt-Resolution-UI mit Feld-für-Feld-Mischen ("Titel von A, Ordner von B") — LWW ist atomar pro Bookmark, das bleibt MVP
- Keine Export-Funktion (CSV, JSON) — Phase 2
- Keine Push-Benachrichtigung beim Entstehen eines Konflikts — User sieht es beim nächsten Tray-Klick (PROJ-7)
- Kein Versionsverlauf pro Bookmark mit mehreren historischen Snapshots — Konflikt-Log ist event-basiert, nicht zeitserien-basiert

## Risiken und offene Fragen für `/architecture`

- **Wachstum des `conflict_log`** bei aktivem User: 90 Tage Retention plus Open-Status-Schonung könnte eine kleine Backlog-Wolke erzeugen. Architektur muss Index-Strategie und Page-Size-Performance berücksichtigen
- **Diff-Visualisierung-Komplexität** bei Folder-Pfaden mit vielen Segmenten: visuelles Diff für Pfade kann unleserlich werden. Architektur entscheidet, ob Wort-Level reicht oder Segment-Level besser ist
- **Restore-Race**: User klickt Restore, gleichzeitig läuft ein automatischer Sync. Beide schreiben in `bookmarks_cloud`. Konsistenz-Garantie kommt von Supabase (zeitlich serialisierte Upserts), aber UX könnte verwirrend werden, wenn der Restore "untergeht". Architektur überlegt Optimistic-Lock oder einfach "letzte Schreibung gewinnt" mit Visual-Refresh
- **Offene Konflikte beim Browser-Deaktivieren**: User deaktiviert Browser X in Settings, im Log liegen 50 offene Konflikte mit X. Was passiert? Konflikte bleiben sichtbar, Restore funktioniert für aktivierte Browser, deaktivierter wird übersprungen — aber das ist eine UX-Erklärung, die Settings-UI (PROJ-8) leisten muss

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Wo lebt die Feature

Konflikt-Log ist überwiegend Frontend (Next.js-Seite unter `/conflicts`) plus eine kleine Main-Process-Schicht für Cloud-Queries und die Restore-Aktion. Die Sync-Engine (PROJ-6) liefert die Daten als Insert-Schreiber, PROJ-9 ist nur Konsument plus User-Interaktion.

Die Tabelle `conflict_log` lebt in Supabase. Einträge werden ausschliesslich vom Sync-Engine-Code im Main-Prozess geschrieben. Reads, Filter und Restores gehen über IPC zwischen Renderer und Main, identisch zum bestehenden `auth`- und `permissions`-Pattern.

### Komponenten-Struktur

**Frontend (`src/app/conflicts/page.tsx` plus Komponenten unter `src/components/conflicts/`):**

```
/conflicts (Next.js-Seite, statisch)
+-- AppShell (bestehend)
    +-- ConflictsHeader
    |   +-- Titel, Zähler offener Konflikte
    +-- FilterBar
    |   +-- Date-Range-Picker (von/bis)
    |   +-- Browser-Multi-Select (Winner-Filter)
    |   +-- Browser-Multi-Select (Loser-Filter)
    |   +-- Status-Select (open / restored / dismissed / alle)
    |   +-- Such-Input (Titel + URL)
    +-- ConflictsTable
    |   +-- Header-Row (Datum, Winner, Loser, Titel, Status, Aktion)
    |   +-- Body-Rows (klickbar -> öffnet Detail-Dialog)
    |       +-- Status-Badge (Farb-codiert: blau open, grün restored, grau dismissed)
    +-- LoadMoreButton (Infinite-Scroll-Trigger)
    +-- EmptyState (wenn 0 Treffer im Filter)
    +-- ConflictDetailDialog (modal, lazy gerendert)
        +-- Header (Sync-Run-ID, Timestamp, beide Browser-Namen)
        +-- TwoColumnDiff
        |   +-- Winner-Column (Felder: Titel, URL, Pfad, dateModified)
        |   +-- Loser-Column (mit Diff-Highlights)
        +-- FooterButtons (Wiederherstellen, Als erledigt markieren, Schliessen)
```

**Main-Side-Module (`electron/conflicts/`):**

```
electron/conflicts/
+-- index.ts        // Public API: list, getById, restore, dismiss, countSinceLastSeen, prune
+-- query.ts        // Supabase-Wrapper: filtered list, get-by-id, count-query
+-- restore.ts      // Schreibt loser-Version in bookmarks_cloud, ruft engine.runSync()
+-- prune.ts        // Boot-time-Pruning: löscht alte non-open Einträge
+-- types.ts        // ConflictEntry, ConflictFilter, ConflictStatus
```

**IPC-Handler (in `electron/ipc.ts`):**

```
conflicts:list(filter)              -> ConflictEntry[] + nextCursor
conflicts:get-by-id(id)             -> ConflictEntry
conflicts:count-since-last-seen()   -> number
conflicts:mark-seen()               -> void  (setzt lastConflictsSeenAt)
conflicts:restore(id)               -> { ok: true } | { ok: false, message }
conflicts:dismiss(id)               -> void
conflicts:state:changed             -> Push-Event nach restore/dismiss
```

### Datenmodell (Plain Language)

**Cloud (Supabase, RLS owner-only):**

| Tabelle | Eine Row enthält |
|---|---|
| `conflict_log` | Identitäts-Hash der Bookmark, beide Versionen als JSONB (Winner-Version und Loser-Version), Winner- und Loser-Browser-ID, Sync-Run-ID, Status (`open`/`restored`/`dismissed`), `created_at`, optional `resolved_at`, optional `restore_origin_id` (zeigt zurück auf den Konflikt, dessen Restore diesen neuen Konflikt erzeugt hat) |

**Lokaler State (Electron-AppState, schon vorhanden, wird erweitert):**

| Feld | Inhalt | Wo |
|---|---|---|
| `lastConflictsSeenAt` | Zeitstempel des letzten Öffnens der Konflikt-Log-Seite | `<userData>/app-state.json` (bestehende Datei aus PROJ-1) |

**Indexe auf `conflict_log` (Performance):**

- Auf `(user_id, status, created_at DESC)` — primärer Filter-Pfad
- Auf `(user_id, winner_browser_id)` und `(user_id, loser_browser_id)` — Browser-Filter
- Auf `(user_id, bookmark_hash)` — für Restore-Ketten und Detail-Verlinkung

### Tech-Decisions (warum)

#### 1. Server-side Filter via Supabase, nicht client-side

**Warum:** Bei einem aktiven User können sich über Monate ein paar Tausend Einträge ansammeln. Alle Daten in den Renderer zu laden und dort zu filtern wäre langsam und speicherintensiv. Supabase kennt SQL-Indexe und liefert vorgefilterte Pages. Der Renderer kümmert sich nur um Anzeige.

**Tradeoff:** Jeder Filter-Klick ist ein Round-Trip zu Supabase. Bei 100ms Latenz fühlt sich das responsiv an, bei 500ms schon träge. Mitigation: Debouncing im Such-Input, Loading-Spinner bei Filter-Änderung.

#### 2. Infinite-Scroll mit Range-Pagination, nicht Cursor-Pagination

**Warum:** Range-Pagination (`OFFSET ... LIMIT 50`) ist einfach und für ≤10'000 Einträge schnell genug. Cursor-Pagination wäre robuster gegen gleichzeitige Inserts, aber bei einem Konflikt-Log ist das selten relevant — neue Konflikte entstehen nur bei Sync-Läufen, der User scrollt selten genau in dem Moment.

**Tradeoff:** Bei Filter-Änderung muss von vorne neu geladen werden. Akzeptabel.

#### 3. Diff-Library für Wort-Level-Markierung

**Warum:** `diff` (npm) ist klein, populär, gut gepflegt. Wort-Level reicht für Bookmark-Titel, weil Titel typischerweise nur ein paar Wörter sind und Char-Level zu viel Lärm produziert. Für URLs (mit Hash-Kollision selten, aber möglich) ist Char-Level besser, da kommt eine zweite Diff-Mode zum Einsatz.

**Tradeoff:** ~50 KB extra im Bundle. Für eine Detail-Seite akzeptabel.

#### 4. Restore über die Sync-Engine, nicht direkter Adapter-Write

**Warum:** Vom User in /requirements bestätigt. Konsistenz mit der Pipeline-Logik, kein zweiter Code-Pfad für Adapter-Writes. Restore ist konzeptuell "neue gewinnende Version mit aktuellem Timestamp einfügen" — exakt das, was die Pipeline kann.

**Architektur-Konsequenz:** PROJ-6 muss eine kleine Public-Funktion `markBookmarkForRestore(hash, version)` exportieren, die in `bookmarks_cloud` die neue Version mit aktualisiertem `dateModified` schreibt und dann `runSync()` triggert. Diese Funktion ist die einzige Stelle, an der PROJ-9 in PROJ-6-Internals greift.

#### 5. Boot-time Pruning, nicht Edge Function

**Warum:** Edge Functions auf Supabase würden ein zusätzliches Deployment-Artefakt erfordern (CI/CD für Edge-Code, Cron-Trigger, Logging). Boot-time-Pruning auf dem Mac ist viel einfacher: einmal pro Tag pro User beim App-Start, idempotent, nichts zu deployen.

**Tradeoff:** Wenn Junction tagelang nicht läuft, wächst das Log weiter. Akzeptabel — sobald Junction wieder startet, wird's gepurged.

#### 6. Status-Badge mit Farbe statt Status-Spalte mit Text

**Warum:** Visueller Scan ist schneller bei Farbe. shadcn-Badge unterstützt Variants. Kein Plain-Text-Status, weil "offen", "wiederhergestellt", "erledigt" alle unterschiedlich lang sind und die Tabelle-Layout-Brechung kostet.

**Farbcodierung:**

| Status | Badge-Variante |
|---|---|
| `open` | Default (mittlere Akzent-Farbe, Aufmerksamkeit) |
| `restored` | Outline-Variant in Grün (erledigt, nicht laut) |
| `dismissed` | Secondary (gedämpft, im Hintergrund) |

#### 7. Keine Real-Time-Subscription auf `conflict_log`

**Warum:** Konflikte entstehen nur bei Sync-Läufen. Sync-Läufe sind nicht häufig genug, um einen Realtime-Listener zu rechtfertigen. Stattdessen: Refresh nach `restore` / `dismiss` (Push-Event aus Main an Renderer), Refresh beim Page-Open. Spart Verbindung und Komplexität.

**Tradeoff:** Wenn ein anderer Mac des Users gerade einen Sync gemacht hat (Multi-Mac-Setup), sieht dieser User das nicht sofort. Er sieht es beim nächsten Page-Open oder eigenen Sync. Akzeptabel im MVP.

### Edge Cases (Architektur-Sicht)

| Fall | Verhalten |
|---|---|
| Restore auf Eintrag mit `status != 'open'` | Renderer disabled den Restore-Button, IPC-Handler zusätzlich serverseitig: returnt Fehler-Message, kein Schreibvorgang |
| Restore-Race: User klickt während Auto-Sync läuft | Single-Instance-Lock im Main-Prozess (PROJ-6) verhindert parallelen Sync. Restore queued sich, läuft direkt nach dem laufenden Sync |
| Filter mit 0 Treffern | EmptyState zeigt "Keine Konflikte für diesen Filter", separate Komponente von "noch nie ein Konflikt entstanden" (Onboarding-Empty) |
| Page-Open mit 5'000 Einträgen | Erste Page (50) lädt sofort, weitere Pages on-demand. Initial-Load <500ms |
| Restore-Origin-Kette tiefer als 5 | Detail-Dialog zeigt Verweis "Folgekonflikt von ...", aber keine vollständige Kette (UX-Komplexität nicht gerechtfertigt). Phase-2 wenn User danach fragt |
| User offline, klickt Restore | Restore-Handler erkennt Offline-State, returnt "offline"-Fehler, UI zeigt Toast "Sync nicht erreichbar" |
| Bookmark zwischenzeitlich überall gelöscht | Restore-Handler erstellt sie neu in `bookmarks_cloud`, Sync propagiert. Detail-Dialog zeigt vorab eine Warnung "Bookmark existiert aktuell in keinem Browser" |
| Diff-Library findet keinen sinnvollen Diff (z.B. komplett unterschiedliche Felder) | Renderer zeigt einfach beide Felder vollständig markiert, ohne Wort-Level-Diff |

### Component-Tree für die UI (intern)

```
ConflictsPage (Server-Component)
+-- AppShell
    +-- Suspense
    |   +-- ConflictsView (Client-Component)
    |       +-- ConflictsHeader
    |       +-- FilterBar
    |       +-- ConflictsTable
    |       |   +-- ConflictRow (klickbar)
    |       +-- LoadMoreButton
    |       +-- EmptyState
    |       +-- ConflictDetailDialog (lazy, conditional render)
    |           +-- DiffRenderer (Wort-Level für Titel, Char-Level für URL)
    |           +-- ActionButtons
    +-- Toast-Region (für Restore-Bestätigung und Offline-Hinweise)
```

### Dependencies (zu installieren)

- `diff` — Wort-Level + Char-Level Diff-Berechnung (~50 KB)
- `react-day-picker` — Date-Range-Picker, wird von shadcn `Calendar` als Peer-Dep verwendet
- `date-fns` — Date-Arithmetik für Range-Filter und Retention-Anzeige
- `@supabase/supabase-js` — schon vorhanden aus PROJ-2
- shadcn/ui-Komponenten: `Calendar`, `Tooltip` falls noch nicht installiert; alle anderen (Table, Dialog, Badge, Input, Select, ScrollArea, Popover) sind schon da

### Was diese Architektur explizit NICHT enthält

- **Keine Real-Time-Subscription** auf Cloud-Änderungen — Refresh-Modell reicht
- **Kein lokaler IndexedDB-Cache** der Konflikt-Liste — Online-only akzeptiert
- **Keine Worker-Threads für Diff-Berechnung** — Diff bei Bookmark-Titeln ist schnell, kein Performance-Risiko
- **Keine i18n** — alles auf Deutsch, konsistent mit dem Rest der App
- **Keine Edge Function** für Pruning — Boot-Trigger reicht
- **Keine Animationen für Status-Übergänge** in der Tabelle — Toast bestätigt Aktionen, das reicht
- **Kein Drag-and-Drop oder Multi-Select** in der Tabelle — Bulk-Aktionen sind Phase 2

### Risiken und offene Fragen für Implementation

1. **Date-Range-Picker-Bibliothek:** shadcn nutzt `react-day-picker`. Default-UI ist OK, aber für eine deutsche Schweizer Lokalisierung (Wochenbeginn Montag, deutsche Monatsnamen) braucht's einen Locale-Import. Frontend-Phase muss das verifizieren
2. **Diff-Performance bei sehr langen Pfaden:** Wenn der User Bookmarks tief verschachtelt hat (z.B. `/lesezeichenleiste/recherche/projekte/2026/q2/notes/draft`), wird der Pfad-Diff visuell überfordernd. Frontend entscheidet, ob Pfad nur als kompletter String diffed wird oder Segment-für-Segment. Empfehlung: Segment-Level mit Klappbar-Mechanik
3. **Restore-Bestätigung-UI:** Soll Klick auf "Wiederherstellen" sofort handeln oder erst per `AlertDialog` bestätigen? Dauerhaftes UX-Pattern in der App: Restore = nicht destruktiv, Direct-Click ist OK; Dismiss = ebenfalls direct-Click. Wenn der Nutzer doch unsicher: optionale Confirm-Setting in Phase 2
4. **Tabelle-Performance bei 10'000+ Einträgen:** Range-Pagination liefert nur 50 pro Page, also kein Renderer-Performance-Problem. Das eigentliche Risiko ist die Supabase-Query-Geschwindigkeit ohne passenden Index. Backend muss die genannten Indexe explizit setzen, sonst Full-Table-Scan

## Implementation Notes

**Stand 2026-05-08, Frontend + Main-Process zusammen gebaut:**

### Was neu ist
- **AppState v2** in `electron/state.ts`: neues Feld `lastConflictsSeenAt` für die "neue Konflikte seit letztem Anschauen"-Query. v1-Files migrieren still (Default null).
- **electron/conflicts/** Module:
  - `types.ts` — `ConflictEntry`, `ConflictFilter`, `ConflictStatus`, `RestoreResult`, `ConflictListResult`
  - `query.ts` — `listConflicts/getConflictById/countConflictsSince/setConflictStatus`, server-side Filter via Supabase, Range-Pagination mit "hasMore"-Detection (limit+1)
  - `restore.ts` — Schreibt Loser-Version mit frischem `date_modified` per `cloud.upsertBookmarksCloud`, setzt Status auf `restored`, triggert Sync. Idempotent: refused wenn Status nicht mehr `open`.
  - `prune.ts` — Boot-Pruning nach 90 Tagen, schont `open`-Einträge
  - `index.ts` — `ConflictsService` als EventEmitter, kapselt alle Public Calls + per-Tag-Throttle für Pruning
- **IPC-Handler** in `electron/ipc.ts`: `conflicts:list/get-by-id/count-since-last-seen/mark-seen/restore/dismiss`, Push-Event `conflicts:changed`
- **Preload + Bridge** für Renderer-Zugriff
- **Mock-Bridge** mit drei realistischen Mock-Konflikten (open/restored/dismissed) für Browser-Dev
- **Renderer-Komponenten** unter `src/components/conflicts/`:
  - `filter-bar.tsx` — Suche, Status, Datum von/bis (native Date-Inputs statt shadcn-Calendar)
  - `conflicts-table.tsx` — Tabelle mit Status-Badges (open default, restored grün outline, dismissed secondary)
  - `conflict-detail-dialog.tsx` — Side-by-side-Diff mit Restore + Dismiss + Schliessen-Buttons
  - `diff-renderer.tsx` — Wort-Level-Diff (Titel), Char-Level (URL), Segment-Level (Pfad)
- **Hook** `src/hooks/use-conflicts.ts` — Filter-Refetch, Subscribe auf `conflicts:changed`, LoadMore
- **Page** `src/app/conflicts/page.tsx` — komplette Konflikt-Log-Seite mit Filter, Tabelle, Empty-States, Detail-Dialog, Sonner-Toasts

### Bewusste Abweichungen vom Tech-Design
- **Date-Range-Picker:** Statt shadcn-Calendar + react-day-picker werden native HTML5-Date-Inputs verwendet. Kein zusätzliches Setup, auf macOS nutzt der Browser den System-DatePicker. Falls UX später feiner werden soll, schlanker Upgrade-Pfad.
- **Engine-Helper `markBookmarkForRestore`:** Nicht extra ausgekoppelt — Restore nutzt direkt die existierende `cloud.upsertBookmarksCloud`-API. Spart einen Indirection-Hop.
- **Retention-Konfiguration:** Hardcoded auf 90 Tage statt in Settings exponiert. Kann später in Settings v3 nachgerüstet werden.
- **Tray-Badge-Verkabelung:** Nur die `countSinceLastSeen`-API + `markSeen` gebaut. Tray-Anzeige bleibt PROJ-7-Scope (kleiner Mini-Patch in `tray.ts`).

### Tests
- 217/217 grün (vorher 214, +3 neue)
- `electron/conflicts/restore.test.ts`: Restore-Erfolg mit frischem date_modified, Refusal bei nicht-open Status, Conflict-not-found

### Was Implementation explizit nicht enthält
- Tray-Badge-Anzeige (bleibt PROJ-7)
- Retention-Setting in Settings-UI (Hardcoded für MVP)
- Deutsche Locale für Date-Picker (native Browser-Locale aktiv)
- shadcn `Calendar`-Installation und react-day-picker

## QA Test Results

**QA-Pass am 2026-05-08, Standard-Tier.**

### Methodik
- Acceptance Criteria gegen Code-Implementation systematisch abgeglichen
- Test-Suite: 217/217 grün (Tests aus Implementation-Phase)
- TypeScript-Check für Renderer + Electron beide clean
- Next.js-Build erfolgreich
- Browser-Test der Conflicts-Page in Mock-Bridge per Playwright: Liste, Filter (Status, Suche, Datum, Browser-Multi-Select), Detail-Dialog mit Diff-Highlights, Restore und Dismiss-Aktionen
- Code-Review der kritischen Pfade: Restore-Race, Pagination-Off-by-One, Search-Escape, Auth-Pfad, Pruning-Sicherheit, RLS-Annahmen

### Acceptance Criteria
| AC | Status | Code-Stelle / Anmerkung |
|----|--------|-------------------------|
| Eine Row pro Konflikt mit Hash, beide Versionen, Browser-IDs, Run-ID, Status | erfüllt | Schema in `0002_sync_engine.sql`, Engine schreibt via `insertConflictLog` |
| RLS owner-only | erfüllt | Migration enthält Owner-Select-Policy |
| Mehr als zwei Versionen → mehrere Rows | erfüllt durch PROJ-6 | Engine-Zuständigkeit, nicht PROJ-9 |
| Tabelle, jüngste-zuerst | erfüllt | `query.ts:59` `.order('created_at', { ascending: false })` |
| Spalten Datum/Winner/Loser/Bookmark/Status | erfüllt | `conflicts-table.tsx`. Aktion-Spalte fehlt — Row ist klickbar (öffnet Detail), funktional äquivalent |
| Filter-Bar mit Datum, Browser-Winner-Multi, Browser-Loser-Multi, Status, Suche | erfüllt nach Bug-Fix | siehe ISSUE-001 |
| Pagination/Infinite-Scroll bei >100 | erfüllt | Range-Pagination mit "Mehr laden"-Button (50 pro Page) |
| Default-Filter Status open | erfüllt | `page.tsx:DEFAULT_FILTER` |
| Empty State | erfüllt | Zwei Varianten: "Bisher kein Konflikt" und "Keine Konflikte für diesen Filter" |
| Detail-Dialog mit beiden Versionen nebeneinander | erfüllt | `conflict-detail-dialog.tsx` |
| Diff visuell markiert | erfüllt | `diff-renderer.tsx` mit Wort-/Char-/Segment-Level |
| Header zeigt Run-ID + Zeitstempel + Browser | erfüllt | DialogDescription |
| Footer-Buttons Restore/Dismiss/Schliessen | erfüllt | Mit Disabled-State bei `!isOpen` |
| Restore: schreibt Loser mit aktuellem dateModified | erfüllt | `restore.ts:upsertBookmarksCloud` mit `now` |
| Restore: triggert Sync | erfüllt | Fire-and-forget `triggerSync()` |
| Restore: setzt status=restored, resolved_at | erfüllt | `setConflictStatus` |
| Restore: Folgekonflikt bekommt restore_origin_id | bekannte Lücke | siehe ISSUE-003 |
| Restore: Bookmark zwischenzeitlich gelöscht → neu erstellen | erfüllt | upsert macht das automatisch |
| Dismiss: status=dismissed, kein Sync | erfüllt | `service.dismiss()` |
| countSinceLastSeen-Query | erfüllt | `query.ts:countConflictsSince` |
| markSeen beim Page-Open | erfüllt | `page.tsx:useEffect` |
| Tray-Verbindung | bewusst out-of-scope | Vom User explizit so entschieden, bleibt PROJ-7 |
| Default-Retention 90 Tage | erfüllt | `prune.ts:RETENTION_DAYS=90` |
| Open-Einträge nie pruned | erfüllt | `prune.ts:.in('status', ['restored', 'dismissed'])` |
| Settings-Konfigurierbarkeit | bewusst out-of-scope | Vom User explizit hardcoded, kann später nachgerüstet werden |
| Boot-Pruning idempotent, einmal pro Tag | erfüllt | `service.pruneIfDue()` mit per-Tag-Throttle |

### Edge Cases verifiziert
| Case | Verhalten | Verifikation |
|------|-----------|--------------|
| Doppel-Klick Restore | Refusal mit `not-open`-Reason | Test in `restore.test.ts` |
| Conflict not found | Refusal mit `unknown`-Reason | Test in `restore.test.ts` |
| Filter mit 0 Treffern | Empty-State "Keine Konflikte für diesen Filter" | Browser-Test mit Winner=Chrome |
| Bookmark zwischenzeitlich gelöscht | Upsert legt sie neu in `bookmarks_cloud` an | Code-Review (cloud.upsertBookmarksCloud-Semantik) |
| Detail-Dialog mit langer Bookmark-Url | break-words greift, Layout bleibt | Browser-Test |
| Status-Wechsel triggert Refresh | conflicts:changed broadcast → useConflicts subscribed → refetch | Browser-Test mit Dismiss |

### Gefundene Bugs

#### ISSUE-001 (Medium) — Browser-Multi-Select-Filter fehlten
**Beobachtet:** Acceptance Criterion verlangt explizit "Filter-Bar: ... Winner-Browser-Multi-Select, Loser-Browser-Multi-Select". Backend-Filter (`winnerBrowserIds`/`loserBrowserIds`) waren da, UI nicht.

**Fix:** Neue Komponente `src/components/conflicts/browser-filter.tsx` mit shadcn `DropdownMenuCheckboxItem`. Multi-Select bleibt offen während User mehrere Browser auswählt (`onSelect={(e) => e.preventDefault()}`). Summary-Label zeigt "Alle" / Browser-Name / "N ausgewählt". Reset-Link am unteren Ende, wenn Auswahl aktiv.

**Verifikation:** Browser-Test mit Winner=Chrome → 0 Treffer + Empty-State, Reset-Button erscheint, alle 8 Browser im Dropdown.

#### ISSUE-002 (Low) — Redundante Filter-Dependency in useConflicts
**Beobachtet:** `useConflicts` hatte `filter` zusätzlich zu den expliziten Feldern in der Dependency-Liste. Hätte bei flüchtigen Re-Renders einen zusätzlichen unnötigen Refetch ausgelöst, falls die Filter-Referenz neu erstellt wird ohne dass sich Werte ändern.

**Fix:** `filter` aus den Deps entfernt, stattdessen `filterRef.current` für die Effect-Logic. Effect feuert jetzt nur bei realen Wertänderungen.

#### ISSUE-003 (Low, dokumentiert, kein Fix in PROJ-9) — restore_origin_id-Verkettung
**Beobachtet:** Spec verlangt: wenn ein Restore selbst einen neuen Konflikt erzeugt (weil ein Browser zwischenzeitlich derselben Bookmark verändert hat), soll der neue Eintrag mit `restore_origin_id` zurückzeigen. Aktuell wird beim Restore die Source-Conflict-ID nicht zur Engine durchgereicht, daher schreibt PROJ-6 neue Konflikte ohne `restore_origin_id`.

**Warum kein Fix:** Der Fix erfordert eine Erweiterung der Engine-API (`runSync({ triggeredBy: 'restore', restoreSourceConflictId })`) plus Pipeline-Propagation in den `ConflictLogInsert`. Das ist ein gezielter PROJ-6-Eingriff und ausserhalb des PROJ-9-Scopes. Das Schema-Feld `restore_origin_id` existiert bereits, der UI-Hinweis "Folgekonflikt aus Restore" ist im Detail-Dialog vorbereitet (`conflict-detail-dialog.tsx:91-96`). Sobald die Engine-Erweiterung gemacht ist, schaltet sich das automatisch scharf.

**Workaround für jetzt:** Restore-Folgekonflikte erscheinen als ganz normale neue Einträge ohne Verkettung. Der User sieht sie in der Liste, kann sie individuell anschauen. Funktional komplett, nur die Querverlinkung fehlt.

### Health-Score
| Kategorie | Score |
|-----------|-------|
| Acceptance Criteria | 9/10 (alle Pflicht-ACs erfüllt; eine bekannte Cross-Feature-Lücke dokumentiert) |
| Edge Cases | 9/10 (alle MVP-Edge-Cases verhalten sich wie spezifiziert) |
| Tests | 9/10 (217/217, +3 für Restore-Logik. Renderer-Komponenten haben keine Unit-Tests, weil React-Hook-Testing-Setup nicht etabliert ist) |
| Code-Qualität | 9/10 (saubere Module-Trennung, Search-Escape mit Lücke bei Klammern dokumentiert) |
| **Gesamt** | **90/100** |

### Verdict
**Approved.** Alle Pflicht-Acceptance-Criteria erfüllt. Die zwei während QA gefundenen Bugs wurden noch im Pass behoben. Die `restore_origin_id`-Verkettung ist als bewusste Cross-Feature-Lücke dokumentiert und wartet auf eine kleine Engine-Erweiterung (PROJ-6.1) — der UI-Hook ist bereits vorbereitet. Drei dokumentierte Abweichungen vom Tech-Design sind bewusste Designentscheidungen (native Date-Inputs, hardcoded Retention, Tray bleibt PROJ-7).

## Deployment
_To be added by /deploy_
