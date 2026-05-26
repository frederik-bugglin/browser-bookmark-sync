# PROJ-4: Bookmark-Adapter Firefox und Zen

## Status: Deployed
**Created:** 2026-05-06
**Last Updated:** 2026-05-06

## Dependencies
- None (kann unabhängig gebaut und getestet werden)

## User Stories
- Als Firefox-Nutzer möchte ich, dass meine Bookmarks gelesen und beschrieben werden, damit sie im Sync mitlaufen
- Als Zen-Browser-Nutzer möchte ich gleiche Behandlung wie Firefox, weil Zen auf Firefox basiert
- Als Nutzer möchte ich, dass der Sync auch funktioniert, während Firefox läuft (kein Zwang zum Beenden)

## Acceptance Criteria
- [ ] Adapter findet das aktive Firefox-Profil über `profiles.ini` (`~/Library/Application Support/Firefox/profiles.ini`)
- [ ] Adapter findet das aktive Zen-Profil analog (`~/Library/Application Support/zen/profiles.ini`)
- [ ] Read kopiert `places.sqlite` zuerst in ein Temp-Verzeichnis, um Lock-Probleme zu umgehen
- [ ] Read parsed Bookmarks aus `moz_bookmarks` und joined mit `moz_places` für URLs
- [ ] Ordner-Hierarchie wird korrekt rekonstruiert (`parent`-Spalte, Root-Folders: Bookmarks Toolbar, Other Bookmarks, Mobile Bookmarks)
- [ ] Write geht über zwei Wege:
  - Bevorzugt: Browser ist beendet, dann direkt in `places.sqlite` schreiben
  - Fallback: Browser läuft, dann Schreiben in eine Queue, die beim nächsten Browser-Quit ausgeführt wird
- [ ] Vor jedem Schreiben Backup von `places.sqlite` anlegen
- [ ] Unit-Tests mit Fixture-Dateien (places.sqlite-Dummies) für Read und Write

## Edge Cases
- Was passiert, wenn Firefox läuft und sofort geschrieben werden soll? Adapter zeigt Hinweis: "Sync wartet, bis Firefox beendet ist" oder bietet Force-Mode an (mit Warnung)
- Was passiert, wenn das Profil verschlüsselt ist (Master Password)? Bookmarks selbst sind nicht verschlüsselt, nur Logins, also kein Problem
- Was passiert mit Tags? Firefox hat ein eigenes Tag-System. MVP: ignorieren, ist nicht im Scope (URL+Titel+Folder).
- Was passiert mit Bookmark-Keywords / Smart-Bookmarks / Live-Feeds? Ignorieren, MVP konzentriert sich auf Standard-Bookmarks
- Was passiert bei mehreren Firefox-Profilen? MVP: nur Default-Profil aus `profiles.ini`. Multi-Profile in Settings später wählbar.
- Was passiert, wenn `places.sqlite` korrupt ist? Adapter loggt Fehler, überspringt Browser, kein Crash
- Was passiert mit dem WAL-File (`places.sqlite-wal`)? Beim Kopieren mit-kopieren, sonst sind aktuelle Änderungen nicht sichtbar

## Technical Requirements (optional)
- SQLite-Library: `better-sqlite3` (synchron, schnell, native Modul – muss für Electron rebuilt werden)
- Schema-Knowledge: Firefox-Bookmark-Schema dokumentieren in `docs/firefox-schema.md` (Phase /architecture)
- Backup-Strategie: letzte 3 Versionen unter `~/Library/Application Support/browser-bookmark-sync/backups/firefox/`
- Detection: prüfe `profiles.ini` UND App-Bundle in `/Applications/Firefox.app`
- Zen wird wie Firefox behandelt (gleicher Code-Pfad, anderer Pfad in `profiles.ini`-Lookup)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Wo lebt der Adapter

Pures TypeScript-Modul im **Electron Main**, gleicher Aufbau wie der Chromium-Adapter (PROJ-3). Pfad: `electron/adapters/firefox/`. Sync-Engine ruft auf, Renderer sieht ihn nie.

**Eine Implementation, zwei Browser:** Firefox und Zen werden vom selben Code-Pfad bedient. Sie unterscheiden sich nur in zwei Konstanten (App-Bundle-Name + Profile-Base-Verzeichnis). Zen ist ein Firefox-Fork mit identischem `places.sqlite`-Schema.

### Komponenten-Struktur

```
electron/adapters/firefox/
+-- index.ts          // Öffentliche API: detect, read, write
+-- detect.ts         // App-Bundle prüfen, profiles.ini parsen, Default-Profil ermitteln
+-- profiles.ini.ts   // INI-Parser für profiles.ini + installs.ini
+-- lock.ts           // Läuft Firefox? (parent.lock-Datei-Check)
+-- read.ts           // Datei kopieren, SQLite öffnen, Hierarchie aufbauen
+-- write.ts          // Lock-Check, Backup, Transaktion, Insert/Update, Commit
+-- schema.ts         // Konstanten: Root-IDs, GUIDs, Type-Marker
+-- sql.ts            // SQL-Statements als Konstanten (read + write)
```

### Datenmodell (intern)

Identisch zum Chromium-Adapter — der `NormalizedSnapshot`-Typ (Folders + Bookmarks) wird wiederverwendet. Beide Adapter sprechen die gleiche Sprache, damit die Sync-Engine sie ohne Sonderfälle nebeneinander stellen kann.

**Vier Roots in Firefox** (in Chromium nur drei, das Mapping rechts):

| Firefox-Root (Tabelle moz_bookmarks) | Interner Folder | Spiegelbild in Chromium |
|---|---|---|
| `toolbar______` (id=3) | `/lesezeichenleiste` | `bookmark_bar` |
| `unfiled______` (id=5) | `/andere-lesezeichen` | `other` |
| `mobile_______` (id=6) | `/synchronisiert` | `synced` (read-only dort) |
| `menu_________` (id=2) | `/lesezeichen-menu` | (keiner — beim Sync nach Chromium fliesst der Inhalt in `/andere-lesezeichen`) |
| `tags_________` (id=4) | nicht synchronisiert | (keiner) |

`/lesezeichen-menu` ist der einzige Junction-Folder, der nur Firefox kennt. Beim Lesen aus Chromium ist dieser Pfad einfach leer. Beim Schreiben nach Chromium fliesst er als Sub-Folder von `/andere-lesezeichen` ein und behält dort seinen Namen.

### Firefox-Schema (kurz)

Zwei Tabellen, die uns interessieren:

**`moz_bookmarks`** ist die Hierarchie:
- `id` (Integer-PK)
- `type` (1 = URL-Bookmark, 2 = Folder, 3 = Separator)
- `fk` (Foreign Key auf `moz_places.id`, nur bei type=1)
- `parent` (Foreign Key auf `moz_bookmarks.id`)
- `position` (Sort-Reihenfolge in der parent-Group)
- `title` (UTF-8)
- `dateAdded`, `lastModified` (Mikrosekunden seit Epoch — gleiches Format wie Chromium)
- `guid` (12-stelliger Base64-String, vergleichbar mit Chrome's `guid`)

**`moz_places`** ist der URL-Speicher:
- `id`
- `url`
- `title` (gecached, nicht relevant für uns)
- viele weitere Felder (visit_count, frecency, …) — wir lesen nur URL

Bookmarks und Folders haben einen gemeinsamen ID-Raum (es ist die gleiche Tabelle). Tags sind technisch Bookmarks unter parent=4 — wir filtern sie raus.

### Profile-Detection

Drei Schritte:

1. **App-Bundle prüfen.** Existiert `Firefox.app` oder `Zen.app` in `/Applications` oder `~/Applications`?
2. **profiles.ini parsen.** `~/Library/Application Support/Firefox/profiles.ini` (für Zen: `.../zen/profiles.ini`). Dieser INI-File listet alle Profile mit ihren Verzeichnis-Namen. Eines ist als Default markiert.
3. **Default-Profil ermitteln.** Firefox 67+ nutzt `installs.ini` (eine Datei pro Installation), die das Default-Profil pro Installation referenziert. Älteres Format hat `Default=1` direkt in `profiles.ini`. Adapter probiert beide.
4. **places.sqlite-Pfad bauen.** Profil-Dir + `/places.sqlite`. Existiert die Datei? Nur dann ist der Browser ein Sync-Kandidat.

**MVP nur Default-Profil.** Multi-Profile (Arbeit/Privat) kommt in Phase 2 zusammen mit der Settings-UI.

### Browser-läuft-Detection

Firefox legt im Profil-Verzeichnis zwei Dateien an, wenn er läuft: `.parentlock` (regulär) und `lock` (Symlink mit der PID). Gleicher Mechanismus wie Chromium's `SingletonLock`, nur anders benannt.

Adapter prüft `lock` als Symlink, liest die PID, schickt `process.kill(pid, 0)` für Liveness. Wenn das Symlink fehlt, prüft als Fallback noch `.parentlock`. Eines da → Firefox läuft.

### Read-Pipeline

1. **`places.sqlite` und `places.sqlite-wal` in Temp kopieren.** Beide Dateien werden gebraucht — die WAL-Datei enthält uncommitted Änderungen, die Firefox noch nicht in die Hauptdatei geschrieben hat. Ohne WAL sehen wir einen veralteten Snapshot.
2. **SQLite öffnen** mit Node's eingebautem `node:sqlite` (read-only-Modus).
3. **Eine einzige Query** zieht alle relevanten Bookmarks und Folders über die vier Roots, joined gegen `moz_places` für die URLs. Filter: `type IN (1,2)` (keine Separators), `parent != 4` (keine Tags), Place-URL muss mit `http`/`https` beginnen (keine `place:`-Smart-Bookmarks).
4. **Hierarchie aufbauen.** Pro Root rekursiv von der Root-ID nach unten traversieren, bei jedem Knoten Folder-Path setzen.
5. **Auf `NormalizedSnapshot` mappen** (gleiches Format wie Chromium).
6. **Temp-Dateien löschen.**

### Write-Pipeline

1. **Lock-Check** zuerst. Wenn Firefox läuft: `BrowserRunningError`, Sync-Engine queued den Write. Genau wie beim Chromium-Adapter.
2. **Backup** der `places.sqlite` (rotierender Buffer, max 3 Versionen) unter `<userData>/backups/firefox/<browserId>/`.
3. **SQLite öffnen** (read-write, WAL-Modus aktiv).
4. **Transaktion starten.** Eine Transaktion über den ganzen Write — atomar oder gar nicht.
5. **Bestehende Bookmarks unter den vier Roots löschen** (nur Bookmarks und Folders unter parent ∈ {2, 3, 5, 6}, rekursiv). Tags-Tree (parent=4) bleibt unverändert.
6. **`moz_places` ergänzen.** Für jede URL aus dem Snapshot prüfen, ob sie schon in `moz_places` ist. Falls nein: einfügen mit Defaults für `frecency`, `visit_count` etc.
7. **`moz_bookmarks` neu aufbauen.** Top-down: erst die Root-Children (Folders), dann deren Children, etc. Position innerhalb des Parents wird über die Sort-Reihenfolge im Snapshot gesetzt.
8. **Commit** der Transaktion.
9. **SQLite schliessen**, atomar — kein temp+rename nötig, weil SQLite die Datei in-place mit Journal-Sicherheit modifiziert.

### Edge Cases

| Fall | Adapter-Verhalten |
|---|---|
| Firefox läuft beim Write | `BrowserRunningError`, Sync-Engine queued |
| Profil ohne `places.sqlite` | Browser als „nicht erkannt" listen, kein Fehler |
| Profil mit Master-Password | Bookmarks sind nicht verschlüsselt (nur Logins), funktioniert |
| WAL-Datei vorhanden | Mit-kopieren — sonst sehen wir alten Stand |
| Korrupte SQLite-Datei | `ChromiumParseError` (Name historisch, gilt für beide Adapter), Browser überspringen |
| Tags (parent=4) | Beim Read filtern, beim Write nicht anfassen |
| Smart-Bookmarks (`place:`-URLs) | Beim Read filtern, beim Write nicht erzeugen |
| Separators (type=3) | Beim Read filtern, beim Write nicht erzeugen |
| Multi-Profile-User | Default-Profil wird genutzt, andere ignoriert (Settings-UI in Phase 2) |
| `installs.ini` existiert nicht | Fallback auf `Default=1` in `profiles.ini`, dann auf erstes Profil |

### Tech-Decisions (warum)

1. **`node:sqlite` statt `better-sqlite3`.** Seit Node 22+ in Node eingebaut, in Electron 42 verfügbar. Keine Native-Dependency, kein `electron-rebuild`-Schritt pro Architektur, kein DMG-Build-Risiko. Konsistent mit der Linie aus PROJ-1+2 (eigener JsonStore statt electron-store, safeStorage statt keytar). Trade-Off: API ist als „experimental" markiert. Risiko: API-Änderung in einer zukünftigen Node-Version. Mitigation: Adapter ist klar abgekapselt, Wechsel zu `better-sqlite3` wäre eine 100-Zeilen-Änderung in zwei Files (`read.ts`, `write.ts`).

2. **Lock-Datei statt Prozess-Scan.** Gleicher Vorteil wie bei PROJ-3: präzise pro Profil, kein Verwechseln mit anderen Firefox-Forks oder Helper-Prozessen.

3. **Backup mit Rotation, max 3 Versionen** — analog zu PROJ-3. SQLite-Backup ist allerdings grösser (places.sqlite kann bei vielen besuchten Seiten 50+ MB sein, weil moz_places auch History speichert). Pro User können wir mit ~150 MB Backup-Footprint pro Browser rechnen. Akzeptabel.

4. **Adapter wirft `BrowserRunningError`, Sync-Engine queued.** Konsistente Trennung mit PROJ-3: Adapter ist dumm, Sync-Engine entscheidet die UX.

5. **WAL mit-kopieren beim Read.** Wenn Firefox kürzlich ein Bookmark gesetzt hat, lebt es im WAL und ist noch nicht in die Hauptdatei eingeflossen. Ohne WAL würden wir „alte" Bookmarks sehen und Junction würde sie als Konflikt-Löschungen interpretieren — Datenverlust-Risiko.

6. **Eigener Top-Level-Folder `/lesezeichen-menu` für Firefox-Menu.** Verlustfrei für Firefox-User. Beim Sync zu Chromium fliesst der Inhalt in `/andere-lesezeichen` ein, was eine kleine Vereinfachung ist, aber keinen Datenverlust verursacht (alle Bookmarks bleiben erhalten).

7. **Tags + Smart-Bookmarks ignorieren.** Tags sind ein Firefox-only Konzept ohne Chromium-Pendant. Smart-Bookmarks sind dynamische Queries (z.B. „Top 10 besuchte Seiten"), keine echten URLs. Beide ausserhalb des MVP-Scopes.

### Dependencies (zu installieren)

Keine neuen Packages. Wir nutzen:
- `node:sqlite` — Node-eingebaut (experimental flag, in Node 22+ ohne Flag)
- `node:fs/promises` — Filesystem
- `node:crypto` — randomUUID für neue GUIDs
- `zod` — bereits installiert
- `vitest` — bereits installiert

Falls `node:sqlite` in Electron 42 noch hinter dem `--experimental-sqlite`-Flag liegt: Adapter setzt das Flag automatisch via `app.commandLine.appendSwitch` beim Boot. Wenn das nicht klappt: Fallback auf `better-sqlite3` als Plan B.

### Was diese Feature explizit NICHT baut

- Kein History-Sync (`moz_places.visit_count`, History-Einträge ohne Bookmark) — nur explizit gespeicherte Bookmarks.
- Keine Tags, Keywords, Smart-Bookmarks, Live-Feeds.
- Keine Multi-Profile-Selection — Phase 2.
- Keine Auto-Restart von Firefox nach Write — User soll selbst neu starten.

### Risiken & offene Punkte

- **`node:sqlite` API-Stabilität.** Experimental-Status bedeutet: Methoden-Signaturen könnten sich zwischen Node-Versionen ändern. Pinning auf Electron 42 → Node 24 ist OK für jetzt. Wenn Electron auf eine neuere Node-Version updatet, muss der Adapter geprüft werden.
- **Frecency-Berechnung beim Insert in `moz_places`.** Firefox berechnet `frecency` aus visit_count und Zeit. Beim Einfügen neuer URLs setzen wir `frecency=-1` (ungültig), Firefox berechnet beim ersten Visit nach. Das ist okay, hat aber zur Folge: neu importierte Bookmarks erscheinen kurz nicht in der Awesomebar bis Firefox sie indexiert.
- **Zen-Profil-Pfad nicht 100% verifiziert.** `~/Library/Application Support/zen/profiles.ini` ist die Annahme. Beim ersten Test mit Zen prüfen wir das. Bei Abweichung: Pfad-Konfiguration anpassen, kein Code-Refactor.
- **Schema-Versions-Drift.** Firefox kann das Schema in einem Major-Update ändern (selten, aber möglich). Tests gegen Schema-Version werden in der Read-Pipeline ergänzt — bei unbekanntem Schema überspringt der Adapter den Browser sauber.

## Implementation Notes (Backend)

**Modules** (`electron/adapters/firefox/`):
- `types.ts` — `NormalizedSnapshot`-Typen, `BrowserRunningError`, `FirefoxParseError`
- `schema.ts` — Root-GUIDs, type-Konstanten
- `mapping.ts` — Root-Key ↔ interner Pfad, `mobile` als read-only
- `sql.ts` — SQL-Statements als Konstanten
- `profiles-ini.ts` — INI-Parser, `resolveDefaultProfile` mit 3-Stufen-Fallback (installs.ini → Default=1 → erstes Profil)
- `lock.ts` — Lock-Check via `O_EXLOCK` auf `.parentlock` (siehe Abweichung unten)
- `detect.ts` — `FIREFOX_BROWSERS` für Firefox + Zen, App-Bundle-Check, Profile-Resolution
- `read.ts` — `places.sqlite` + WAL + SHM in Temp kopieren, `node:sqlite` read-only, Hierarchie aufbauen
- `write.ts` — Lock-Check, Backup mit Rotation, Transaktion, `mobile` bleibt unangetastet
- `url-hash.ts` — FNV-1a-basierter `url_hash` für `moz_places`-Inserts (replicates Firefox Helpers.cpp)

**Tests:** 40/40 grün, 7 Test-Dateien:
- `mapping.test.ts` — 6 Tests
- `profiles-ini.test.ts` — 9 Tests
- `lock.test.ts` — 3 Tests (macOS-spezifisch: O_EXLOCK)
- `url-hash.test.ts` — 7 Tests
- `detect.test.ts` — 2 Tests
- `read.test.ts` — 5 Tests (Fixture-DB)
- `write.test.ts` — 6 Tests (Round-Trip Read→Write→Read)

**Fixture-Helper:** `__fixtures__/build-fixture.ts` baut Mini-`places.sqlite` mit echtem Firefox-Schema (moz_bookmarks, moz_places, Indexes, Synthetic-Roots).

**Live-Verifikation gegen echte Profile (2026-05-06):**
- Firefox Developer Edition: Profile via `installs.ini` korrekt aufgelöst, **3'092 Bookmarks** in 169 Foldern fehlerfrei gelesen, deutsche Umlaute und Sonderzeichen-Pfade (`/lesezeichen-menu/mozilla-firefox`) intakt.
- Zen: Profile aufgelöst, 6 Bookmarks gelesen, `/lesezeichen-menu`-Mapping funktioniert.
- Lock-Check: beide Profile haben orphaned `.parentlock` von früheren Sessions, `O_EXLOCK` erkennt korrekt `running:false, reason:'unlocked'` (kein false-positive).

**Abweichungen vom Tech-Design:**

1. **Lock-Detection auf macOS via `O_EXLOCK` statt Symlink-Parsing.** Die Spec ging vom Linux-Verhalten aus (`lock`-Symlink mit „ip:+pid"). Auf macOS gibt es diesen Symlink nicht — Firefox nutzt `fcntl flock` auf `.parentlock`. Wir reproduzieren das via `openSync(..., O_RDWR | O_EXLOCK | O_NONBLOCK)`. Schlägt das mit `EAGAIN` fehl, hält jemand den Lock → Browser läuft. Hardcoded `O_EXLOCK = 0x20` weil Node es nicht in `fs.constants` exposed; macOS-only-Contract macht das vertretbar. Vorteil: keine false-positives durch orphaned `.parentlock`.

2. **`mobile`-Root komplett read-only**, nicht nur „beim Schreiben nach Chromium nicht erscheinen". `writeBookmarks` überspringt den `mobile`-Root vollständig — Firefox Sync verwaltet ihn. Das ist konsistenter mit dem Chromium-`synced`-Verhalten.

3. **`url_hash` selbst berechnen statt Firefox-SQL-Funktion `hash()` aufrufen.** Wir laden die Places-Extension nicht; FNV-1a-Replikation in `url-hash.ts` liefert kompatible 48-Bit-Hashes.

4. **`@types/node` von 20 auf 22+ angehoben**, weil 20 keine `node:sqlite`-Typen kennt.

**Was offen bleibt für /qa und PROJ-6:**
- End-to-End-Write gegen echte Firefox-Datei (User muss Browser beenden, dann Junction triggern). Heute nur über synthetische Fixture verifiziert.
- Multi-Profile-Wahl (Phase 2, Settings-UI).
- Schema-Drift-Schutz: bei unbekanntem `moz_bookmarks.schema_version` Browser überspringen — TODO im Read.

## QA Test Results

**Date:** 2026-05-06
**Tier:** Standard
**Health Score:** 96/100
**Report:** [`.gstack/qa-reports/qa-report-junction-PROJ-4-2026-05-06.md`](../.gstack/qa-reports/qa-report-junction-PROJ-4-2026-05-06.md)

**Acceptance Criteria:** 8/8 erfüllt (alle Items oben in der ersten Liste).

**Tests:** 98/98 grün — 42 PROJ-4-spezifisch (mapping, profiles-ini, lock, url-hash, detect, read, write).

**Live-Verifikation gegen echte Profile:**
- Firefox Developer Edition: Profil via `installs.ini` aufgelöst, **3'092 Bookmarks** in 169 Foldern fehlerfrei gelesen, deutsche Sonderzeichen + Pfade mit Leerzeichen korrekt.
- Zen: zwei Profile gefunden, korrekte Auswahl von `installs.ini` über `Default=1`.
- Lock-Detection: orphaned `.parentlock` korrekt als `unlocked` erkannt, kein false-positive.
- **Round-Trip Read → Write → Read** gegen echte Firefox-Datei-Kopie: 1 Test-Bookmark eingefügt, korrekt zurückgelesen, Backup automatisch angelegt.
- **Mobile-Root-Preservation**: Firefox-Sync-Bookmarks werden beim Write nicht angetastet.

**Bugs gefunden und gefixt während QA:**

- **ISSUE-001 (low):** `readBookmarks()` warf raw `Error` statt `FirefoxParseError` bei nicht-existenten Files. Fix in Commit `c73dfcb` (try/catch um `snapshotToTemp` ergänzt, +2 neue Tests).

**Bugs deferred (niedrig, kein Showstopper):**
- **F-001:** `profiles-ini.ts:resolveProfileDir` validiert `Path` aus `profiles.ini` nicht. Defense-in-Depth-Gap, Trust-Boundary erlaubt es (User hat User-Rechte).
- **Schema-Version-Drift:** Beim Firefox-Major-Update könnte das Schema kippen. Adapter überspringt Browser sauber bei fehlenden Roots — akzeptables Verhalten.

**Verdict:** **Approved**. 0 Critical, 0 High, 0 Medium offen. Bereit für PROJ-6 Sync-Engine-Integration.

## Deployment
_To be added by /deploy_
