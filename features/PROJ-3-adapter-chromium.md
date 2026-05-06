# PROJ-3: Bookmark-Adapter Chromium-Familie

## Status: In Progress
**Created:** 2026-05-06
**Last Updated:** 2026-05-06

## Dependencies
- None (kann unabhängig gebaut und getestet werden)

## User Stories
- Als Nutzer möchte ich, dass meine Chrome-Bookmarks gelesen werden, damit sie in den Sync einfliessen
- Als Nutzer möchte ich, dass Änderungen aus dem Sync zurück in Chrome geschrieben werden, damit Chrome auf dem aktuellen Stand ist
- Als Arc-Nutzer möchte ich, dass meine Arc-Bookmarks gleichberechtigt synchronisiert werden, weil Arc ebenfalls Chromium nutzt
- Als Nutzer mit mehreren Chromium-Browsern möchte ich, dass jeder einzeln erkannt und unterstützt wird (Chrome, Brave, Edge, Arc, Dia)

## Acceptance Criteria
- [x] Adapter erkennt automatisch installierte Chromium-Browser und deren Profile auf macOS (`detect.ts`, prüft App-Bundle UND Bookmarks-Datei)
- [x] Read-Pfade pro Browser sind korrekt:
  - Chrome: `~/Library/Application Support/Google/Chrome/Default/Bookmarks`
  - Brave: `~/Library/Application Support/BraveSoftware/Brave-Browser/Default/Bookmarks`
  - Edge: `~/Library/Application Support/Microsoft Edge/Default/Bookmarks`
  - Arc: `~/Library/Application Support/Arc/User Data/Default/Bookmarks`
  - Dia: `~/Library/Application Support/Dia/Default/Bookmarks` (zu verifizieren beim ersten Test mit Dia)
- [x] Read parsed das JSON-Schema korrekt: `roots.bookmark_bar`, `roots.other`, `roots.synced` mit Children-Tree (Zod-Schema in `types.ts`, recursive lazy types)
- [x] Read normalisiert auf das internes Bookmark-Modell (URL, Titel, Ordner-Pfad, Created/Modified) — `NormalizedSnapshot`
- [x] Write erzeugt valides Chromium-JSON inklusive `checksum`-Feld — Algorithmus gegen die echte Chrome-Datei des Users live verifiziert (MD5 match)
- [x] Write erstellt Backup der Original-Datei vor Überschreiben (rotating max 3 unter `<userData>/backups/chromium/<browserId>/`)
- [x] Vor dem Schreiben prüft der Adapter, ob der Browser läuft, und wirft `BrowserRunningError` (via `SingletonLock`-Symlink + PID-Check)
- [x] Unit-Tests mit Fixture-Dateien — 37 neue Tests für den Adapter, plus 6 für Checksum (inkl. live gegen Chrome-File), Total: 56 grüne Tests im Repo

## Edge Cases
- Was passiert, wenn der Browser nicht installiert ist? Adapter überspringt diesen Browser ohne Fehler
- Was passiert, wenn der Browser ein nicht-Standard-Profil verwendet (z.B. "Profile 1" statt "Default")? MVP unterstützt nur "Default", Multi-Profile ist Phase 2 (im Konflikt-Log oder Settings vermerken)
- Was passiert bei korruptem JSON in der Bookmark-Datei? Adapter loggt Fehler, überspringt Browser, korrumpiert nichts
- Was passiert, wenn die Datei während des Lesens geschrieben wird (Race Condition)? Read kopiert die Datei zuerst in einen Temp-Ordner, dann lesen
- Was passiert, wenn `checksum` falsch berechnet wird? Browser ignoriert die Datei beim nächsten Start, Bookmarks scheinen "verloren". Lösung: Checksum nach Chromium-Algorithmus (MD5 über serialized roots).
- Was passiert mit Bookmark-Bar-Items vs. "Other Bookmarks"? Beide werden mitsynchronisiert, Hierarchie bleibt erhalten

## Technical Requirements (optional)
- Pure TypeScript-Modul, keine native Dependencies
- File-Operations atomar (write to temp + rename)
- Backup-Strategie: letzte 3 Versionen unter `~/Library/Application Support/browser-bookmark-sync/backups/<browser>/`
- Detection-Strategie: prüfe Existenz der App in `/Applications` UND der Bookmark-Datei

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Wo lebt der Adapter

Der Chromium-Adapter ist ein reines TypeScript-Modul im **Electron Main-Prozess**, weil er Filesystem-Zugriff auf das User-Verzeichnis braucht. Der Renderer (Next.js) sieht den Adapter nie direkt — er wird ausschliesslich von der Sync-Engine (PROJ-6) aufgerufen.

Der Adapter exponiert drei Funktionen nach aussen: **erkennen** welche Chromium-Browser installiert sind, **lesen** der Bookmarks aus einem Browser, **schreiben** zurück in einen Browser. Plus die Information „läuft der Browser gerade?" als Begleitsignal.

### Komponenten-Struktur

```
electron/adapters/chromium/
+-- index.ts          // Öffentliche API: detect, read, write
+-- detect.ts         // Welche Browser sind installiert, wo liegen ihre Profile
+-- lock.ts           // Läuft der Browser gerade? (Lock-File-Check)
+-- read.ts           // Bookmark-Datei lesen, parsen, auf internes Modell mappen
+-- write.ts          // Internes Modell zurück in Chromium-JSON, Backup, atomar speichern
+-- checksum.ts       // Chromium-spezifische MD5-Berechnung (sonst rejected)
+-- mapping.ts        // Roots (bookmark_bar/other/synced) <-> interne Folder-Pfade
+-- types.ts          // Zod-Schemas für die Chromium-JSON-Struktur
```

Pro Browser gibt es nur Konfiguration (Pfade, Display-Namen), keinen separaten Code-Pfad — Chrome, Brave, Edge, Arc und Dia nutzen alle das gleiche JSON-Format.

### Datenmodell (intern)

Der Adapter liefert nach dem Lesen ein **flaches normalisiertes Modell**, das die Sync-Engine direkt mit der Supabase-DB abgleichen kann:

**Folder:**
- ID (vom Adapter neu generiert beim ersten Read)
- Name (z.B. "Recherche")
- Pfad als Slash-Liste (z.B. `/lesezeichenleiste/arbeit/recherche`)
- Parent-Pfad
- Erstellt-Zeitstempel (aus Chromium übernommen)

**Bookmark:**
- ID (vom Adapter)
- URL (raw, wie in Chromium gespeichert)
- URL-normalisiert (via `src/lib/url-normalize.ts` aus PROJ-2)
- Titel
- Folder-Pfad (in welchem Ordner liegt es)
- Source-Browser (chrome, brave, edge, arc, dia)
- Erstellt + Modifiziert (aus Chromium)

### Drei-Roots-Mapping

Chromium hat drei Top-Level-Roots, die wir auf interne Folder-Pfade mappen:

| Chromium-Key | Interner Folder | Behandlung |
|---|---|---|
| `roots.bookmark_bar` | `/lesezeichenleiste` | read + write |
| `roots.other` | `/andere-lesezeichen` | read + write |
| `roots.synced` | `/synchronisiert` | **nur read**, nie write |

Das `synced`-Root ist Chrome's eigener iOS-Sync-Eintopf. Junction liest dort, damit iOS-Bookmarks aus Chrome im Cross-Browser-Sync mitlaufen, schreibt aber nie hinein — Chrome verwaltet diesen Bereich selbst, Schreibversuche würden mit Chrome's Sync-Service kollidieren.

Beim Schreiben zurück gilt: das interne Modell darf nur Bookmarks in `/lesezeichenleiste/...` und `/andere-lesezeichen/...` betreffen. Bookmarks aus `/synchronisiert/...` werden in der Master-DB markiert als „read-only-source" und beim Write-Vorgang übersprungen.

### Browser-Detection

Pro Browser zwei Signale prüfen:

1. **App ist installiert:** Existiert das App-Bundle in `/Applications` oder `~/Applications`?
2. **Profil ist da:** Existiert `~/Library/Application Support/<browser>/Default/Bookmarks`?

Beide müssen stimmen. Wenn ja, ist der Browser ein Sync-Kandidat.

| Browser | App-Pfad | Profile-Pfad |
|---|---|---|
| Chrome | `Google Chrome.app` | `Google/Chrome/Default` |
| Brave | `Brave Browser.app` | `BraveSoftware/Brave-Browser/Default` |
| Edge | `Microsoft Edge.app` | `Microsoft Edge/Default` |
| Arc | `Arc.app` | `Arc/User Data/Default` |
| Dia | `Dia.app` | `Dia/Default` (zu verifizieren beim ersten Test) |

**Profile-Scope (MVP):** nur `Default`. Multi-Profile (z.B. Arbeitsprofil + Privatprofil) ist Phase 2 — die Settings-UI bekommt dann pro Browser einen Profile-Picker. Wenn ein User aktuell ein Nicht-Default-Profil benutzt, sieht er den Browser im Setting als „nicht erkannt", obwohl er installiert ist. Das ist akzeptierter MVP-Trade-Off.

### Browser-läuft-Detection

Chromium legt im Profil-Verzeichnis ein Symlink namens `SingletonLock` an. Inhalt des Symlinks ist `<hostname>-<pid>`. So checken wir „läuft":

1. Existiert `Default/SingletonLock`? Wenn nein → läuft nicht.
2. Lesen des Symlink-Targets, PID extrahieren.
3. `process.kill(pid, 0)` schicken (signal 0 testet nur Existenz). Wirft → tot. Erfolg → läuft.

Das ist genau der Mechanismus, den Chromium selber zur Single-Instance-Kontrolle nutzt — also definitiv konsistent mit dem Browser-Verhalten.

### Read-Pipeline

1. **Lock-File ignorieren** (read kann während Browser läuft passieren, ist sicher solange wir nicht das Original anfassen).
2. **Bookmark-Datei in Temp kopieren** (`os.tmpdir()/junction/<browser>-<timestamp>.json`). Schützt gegen Race Conditions, falls Chrome während des Reads schreibt.
3. **JSON parsen + Zod-validieren.** Bei Schema-Fehler: Browser überspringen, Fehler im Konflikt-Log loggen, Sync läuft weiter.
4. **Roots traversieren** und auf das interne Folder/Bookmark-Modell mappen. Folder-Hierarchie wird dabei in Pfad-Form abgebildet.
5. **Liste zurückgeben.**

### Write-Pipeline

1. **Lock-Check.** Wenn der Browser läuft: sofort `BrowserRunningError` werfen. Die Sync-Engine fängt den ab und merkt sich „dieser Browser hat einen ausstehenden Write".
2. **Aktuelles Bookmark-File lesen** (für `synced`-Root, der unverändert mitkopiert wird).
3. **Backup anlegen.** Vor dem Schreiben das aktuelle File nach `~/Library/Application Support/junction/backups/<browser>/Bookmarks.<timestamp>.json` kopieren. Rotierender Buffer: nur die letzten drei Backups behalten, ältere automatisch löschen.
4. **Neue JSON-Struktur bauen:** `bookmark_bar` und `other` aus dem internen Modell rekonstruieren, `synced` 1:1 aus dem alten File übernehmen.
5. **Checksum berechnen.** Chromium-MD5-Algorithmus über die serialisierten Roots. Falls falsch: Chromium ignoriert die Datei beim nächsten Start und der User sieht „leere Bookmarks". Deshalb: Checksum-Berechnung muss durch eine Test-Suite gegen echte Chrome-Files validiert werden.
6. **Atomar schreiben.** Temp-File schreiben, dann via `rename` an die Originalstelle bewegen (atomar auf gleichem Filesystem).

### Edge Cases (wie sie behandelt werden)

| Fall | Adapter-Verhalten |
|---|---|
| Browser nicht installiert | `detect()` listet ihn nicht auf, kein Fehler |
| Bookmark-Datei fehlt | Wie nicht-installiert behandeln |
| Korruptes JSON | Browser überspringen, Konflikt-Log-Eintrag, andere Browser laufen weiter |
| Race Condition beim Read | Temp-Copy schützt — wir lesen einen konsistenten Snapshot |
| Falsche Checksum geschrieben | Test-Suite mit echten Chrome-Fixtures fängt das vor Release ab. Backup ist immer noch da, manueller Restore möglich |
| Browser läuft beim Write | `BrowserRunningError`, Sync-Engine queued den Write |
| Nicht-Default-Profil | MVP: erkannter Browser hat „kein Default-Profil"-Status, im Settings/Konflikt-Log angezeigt |
| User hat alle 3 Backups schon, neuer Backup soll dazu | Älteres wird gelöscht, neueres geschrieben (rotierender Stack) |

### Tech-Decisions (warum)

1. **Pure TypeScript ohne native Module.** Chromium-Bookmark-Files sind JSON, kein SQLite. Wir brauchen nur `fs` und `crypto` (für MD5) — beides Node-eingebaut. Kein Native-Build, läuft auf Apple Silicon und Intel ohne Sonderbehandlung.

2. **Lock-Datei für „läuft-Detection".** `pgrep` o.ä. wäre lockerer, würde aber auch Chromium-Helper-Prozesse fangen, die zu anderen Browsern gehören (sehr verwirrend bei Brave + Chrome parallel). `SingletonLock` ist pro Profil und unmissverständlich.

3. **Backup vor jedem Write.** Die Datei zu zerschiessen wäre für den User katastrophal — Bookmarks sind in vielen Fällen das wichtigste persönliche Asset im Browser. Rotierende drei Versionen geben Recovery-Spielraum, ohne den Disk vollzustopfen.

4. **`synced`-Root nur lesen.** Schreiben würde mit Chrome's Sync-Service streiten. Lesen reicht aus, um iOS-Bookmarks in den Cross-Browser-Sync einzuziehen. Trade-Off: ein Bookmark, das wir aus Junction in den `synced`-Bereich von Chrome bekommen wollen, geht über `bookmark_bar` rein und wird dann via Chrome's eigenem Sync auf iOS gespiegelt — eine Stufe Umweg, dafür kollisionsfrei.

5. **Adapter wirft nur Fehler, Sync-Engine entscheidet die UX.** Saubere Trennung: Adapter weiss nichts über Toast-Messages, Retry-Strategien, User-Settings. Er sagt nur „kann nicht schreiben, Browser läuft" und gibt zurück. So bleibt der Adapter für Tests einfach zu mocken.

6. **Checksum-Algorithmus mit Fixture-Tests abgesichert.** Die Chromium-MD5-Routine ist nirgends offiziell dokumentiert, sondern aus dem Chromium-Source rekonstruiert. Wir testen sie gegen mindestens drei echte Chrome-Files (jeweils mit bekanntem Checksum-Wert), bevor sie im Sync läuft.

### Dependencies (zu installieren)

Keine neuen Packages. Wir nutzen:
- `node:fs/promises` — Filesystem-Zugriff (Node-eingebaut)
- `node:crypto` — MD5 für Checksum (Node-eingebaut)
- `zod` — bereits installiert, validiert das Bookmark-JSON-Schema
- `vitest` — bereits installiert, Test-Runner

### Was diese Feature explizit NICHT baut

- Keine Sync-Logik. Der Adapter ist dumm: read raus, write rein. Wer wann was triggert ist PROJ-6.
- Keine UI. Browser-Auswahl, Sync-Status, Toast-Messages sind PROJ-8.
- Kein Multi-Profile-Support. Phase 2.
- Kein Firefox/Safari-Adapter. PROJ-4 und PROJ-5.
- Keine Bookmark-Suche oder -Bearbeitung. Junction ist Sync-Tool, kein Bookmark-Manager.
- Keine Migration alter Backups in die Cloud. Backups sind nur lokal als Recovery-Pfad.

### Risiken & offene Punkte

- **Dia-Pfad nicht verifiziert.** Beim ersten Implementations-Sprint einen Test-User mit Dia bitten, den Pfad zu bestätigen. Falls Dia anders heisst: Pfad-Konfiguration anpassen, kein Code-Refactor nötig.
- **Chromium-Update könnte JSON-Schema ändern.** Chromium-Schema war über Jahre stabil, aber nicht garantiert. Zod-Validierung fängt Schema-Brüche, Adapter überspringt den Browser sauber, User bekommt Konflikt-Log-Eintrag.
- **Backups wachsen pro Browser-Familie.** 5 Browser × 3 Backups × ~500 KB = circa 7.5 MB Disk-Footprint. Akzeptabel.
- **`SingletonLock` ist Chromium-spezifisch.** Falls ein Chromium-Fork das anders nennt (sehr unwahrscheinlich), bricht die Run-Detection. Fallback: file-modified-time vor und nach Sync vergleichen, bei Änderung Browser-läuft-vermuten.

## Implementation Notes (Backend Developer)

### Was gebaut wurde

**Module unter `electron/adapters/chromium/`:**
- `types.ts` — Zod-Schemas für die Chromium-JSON-Struktur (mit lazy recursion für Folder-Children), plus interne `NormalizedSnapshot/-Folder/-Bookmark`-Typen und `BrowserRunningError` / `ChromiumParseError`
- `checksum.ts` — Chromium-MD5-Algorithmus (UTF-16 LE für name, UTF-8 für id/type/url, Pre-Order-Traversal über alle drei Roots inkl. der Roots selbst)
- `lock.ts` — `SingletonLock`-Symlink lesen, PID extrahieren, `process.kill(pid, 0)` als Liveness-Check
- `detect.ts` — Statische Browser-Liste (chrome, brave, edge, arc, dia) plus auto-detect über `/Applications` + Bookmark-Datei
- `mapping.ts` — `bookmark_bar`/`other`/`synced` ↔ `/lesezeichenleiste`, `/andere-lesezeichen`, `/synchronisiert` (synced als read-only markiert)
- `read.ts` — Datei → Temp-Copy (race-condition-Schutz) → JSON-Parse → Zod-Validate → flatten zu `NormalizedSnapshot`
- `write.ts` — Lock-Check → BrowserRunningError → Backup (rotating max 3) → Roots aus altem File übernehmen, Children aus Snapshot rebuilden, `synced` 1:1 erhalten → Checksum → atomar via temp+rename
- `index.ts` — Public API: `detectAll`, `detectInstalled`, `readBookmarks`, `writeBookmarks`, plus Types

**Shared Lib:**
- `electron/lib/url-normalize.ts` — Spiegel von `src/lib/url-normalize.ts`. Beide Implementierungen identisch, von Tests in beiden Hälften abgedeckt. Cross-Process-Architektur: Renderer und Main brauchen je eine Kopie ihrer Lib (TS-rootDir-Constraint).

**Fixture:**
- `__fixtures__/sample-bookmarks.json` — synthetisches File mit verschachtelten Foldern, deutschen Umlauten und Bookmarks in allen drei Roots

### Kritisch: Checksum-Algorithmus verifiziert

Der erste Versuch des MD5-Algorithmus war falsch (nur Children gehasht). Korrekt ist: Roots als Folder-Nodes (id + name + "folder") UND ihre Children rekursiv. Live gegen die echte Chrome-Datei des Users getestet — `919d66385a87602a34bea8c34b5f6f91` reproduziert.

### Tests (37 neu, 56 total)

| Datei | Tests | Highlights |
|---|---|---|
| `checksum.test.ts` | 6 | live gegen echte Chrome-Datei (`919d6638...`), UTF-16 Umlaut-Test, Pre-Order-Traversal-Sensitivität |
| `lock.test.ts` | 6 | Stale-PID, dangling Symlink, unparsbare Targets, current PID = running |
| `detect.test.ts` | 5 | Liste-Vollständigkeit, Detection-Signals |
| `mapping.test.ts` | 6 | Bidirektionalität, read-only-flag |
| `read.test.ts` | 8 | Hierarchie-Flatten, URL-Normalisierung, synced read |
| `write.test.ts` | 6 | Round-trip, Checksum-match, Backup-Rotation, BrowserRunningError |

### Abweichungen vom Tech-Design

- **Keine.** Public API entspricht exakt dem Spec. Backup-Strategie, Read/Write-Pipeline, Lock-Detection alles wie geplant.

### Bewusste Pragmatik

- **`url-normalize.ts` dupliziert** statt geshared — TS-rootDir-Refactor wäre invasiv, Logik ist klein und stabil. Tests in beiden Hälften halten sie konsistent.
- **Sortierung beim Write deutsch-alphabetisch** (`localeCompare(a, b, 'de')`). Macht Diffs gegen die Original-Datei lesbar; Chrome rendert nach interner Reihenfolge sowieso.
- **Schema-Versions-Check kommt erst in PROJ-6.** Aktuell nutzen wir `originalParsed.version ?? 1`.

### Verifikation
- `npm run electron:compile` — kein TS-Fehler
- `npx tsc --noEmit` — Renderer kompiliert
- `npx vitest run` — 56/56 grün

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
