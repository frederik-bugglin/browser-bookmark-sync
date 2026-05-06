# PROJ-5: Bookmark-Adapter Safari

## Status: In Progress
**Created:** 2026-05-06
**Last Updated:** 2026-05-06 (Backend done, ready for QA)

## Dependencies
- PROJ-1 (Electron-Shell) für die Permission-Onboarding-UI

## User Stories
- Als Safari-Nutzer möchte ich beim ersten Sync ein klares Onboarding bekommen, das mir Schritt für Schritt zeigt, wie ich Full Disk Access aktiviere
- Als Safari-Nutzer möchte ich, dass meine Bookmarks gelesen und beschrieben werden, damit sie im Sync mitlaufen
- Als Nutzer möchte ich nach erteilter Permission keine weiteren Eingriffe machen müssen, bis Safari ein neues macOS-Update zwingt

## Acceptance Criteria
- [ ] Beim ersten Lese-Versuch erkennt der Adapter, ob Full Disk Access erteilt ist (probe via `fs.access` auf `~/Library/Safari/Bookmarks.plist`)
- [ ] Wenn keine Permission erteilt ist, öffnet die App ein Onboarding-Dialog mit:
  - Erklärung, warum Full Disk Access nötig ist (macOS-TCC-Mechanismus)
  - Button "Systemeinstellungen öffnen", der die TCC-Seite direkt öffnet
  - "Ich habe es erteilt" Button zum erneuten Probe
- [ ] Read parsed das binary plist `~/Library/Safari/Bookmarks.plist`
- [ ] Bookmarks werden auf das interne Modell normalisiert (URL, Titel, Ordner-Pfad)
- [ ] Write erzeugt ein valides binary plist und überschreibt die Datei atomar (Temp + Rename)
- [ ] Vor dem Schreiben Backup anlegen
- [ ] Vor dem Schreiben prüfen, ob Safari läuft, und ggf. warnen (Safari überschreibt die Datei beim Beenden)
- [ ] Bookmarks-Bar (`BookmarksBar`) und Bookmark-Menu (`BookmarksMenu`) werden korrekt unterschieden und auf interne Roots gemappt
- [ ] Reading List (`com.apple.ReadingList`) wird beim Read komplett ignoriert und beim Write 1:1 erhalten — Adapter fasst sie nie an
- [ ] iCloud-Bookmarks werden wie lokale Bookmarks behandelt (Schreiben propagiert via iCloud zu iOS Safari — gewollt)
- [ ] Unit-Tests mit Fixture-plist-Dateien (Read + Write Round-Trip)

## Edge Cases
- Was passiert, wenn der User Full Disk Access verweigert? Safari wird im Sync übersprungen, Konflikt-Log enthält Eintrag, Settings zeigen Status "Permission fehlt"
- Was passiert, wenn der User die Permission später widerruft? Adapter erkennt das beim nächsten Sync, springt automatisch ins Onboarding
- Was passiert mit der Reading List? Komplett ignorieren — Adapter liest die `com.apple.ReadingList`-Struktur nicht aus und überschreibt sie beim Write nicht. Sie bleibt unangetastet im plist.
- Was passiert mit iCloud-synchronisierten Bookmarks? Safari speichert sie in derselben plist. Schreiben wirkt sich also auch auf iCloud aus. Das ist erwünscht (Brücke zu iOS Safari ohne eigene App).
- Was passiert mit Safari-Profilen (Sonoma+)? MVP: nur Default-Profil syncen (analog zu PROJ-4). Multi-Profile-Support kommt in Phase 2 mit der Settings-UI. Adapter muss erkennen, ob das System Profile nutzt, und in dem Fall den Profile-spezifischen plist-Pfad ansteuern.
- Was passiert, wenn macOS die plist im Hintergrund umstrukturiert (z.B. nach Update)? Adapter schreibt nicht blind, sondern parsed zuerst, modifiziert in-place und schreibt zurück. Unbekannte Top-Level-Felder werden erhalten (passthrough).
- Was passiert, wenn die plist gross ist (5000+ Bookmarks)? Read und Write müssen unter 2 Sekunden bleiben (Performance-Test in QA).
- Was passiert, wenn Safari die plist gerade selbst neu schreibt (Race)? Adapter macht atomic temp+rename; Safari prüft beim nächsten Lesen plist-Validität — kollidieren sie, gewinnt der spätere Write.

## Technical Requirements (optional)
- plist-Parser: `simple-plist` oder `bplist-parser` (TypeScript-fähig)
- Atomarer Write über `fs.writeFile` zu Temp + `fs.rename`
- Probe-Mechanismus für Permission: `fs.accessSync(path)` mit Catch auf EACCES ist robuster als `fs.statSync`
- TCC-Deeplink: Electron `shell.openExternal()` mit URL `x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles` (kein eigener Shell-Spawn nötig)
- Onboarding-UI nutzt das bereits existierende Next.js-UI aus PROJ-1

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Wo lebt der Adapter

Der Safari-Adapter ist Teil des Electron-Main-Prozesses, parallel zu PROJ-3 (Chromium) und PROJ-4 (Firefox). Pfad: `electron/adapters/safari/`. Gleiche Struktur, gleiche `NormalizedSnapshot`-Sprache wie die anderen Adapter — die Sync-Engine (PROJ-6) ruft alle drei einheitlich auf.

**Eine Implementation, ein Browser:** Safari hat keinen Fork wie Zen oder Brave. Falls Apple irgendwann Safari Profile (Sonoma 17+) tiefer ausbaut, dockt der Adapter daran an, bleibt aber eine Code-Linie.

### Komponenten-Struktur

**Backend (`electron/adapters/safari/`):**

```
safari/
+-- index.ts          // Public API: detect, read, write
+-- detect.ts         // App-Bundle-Check, Profile-Pfad, Permission-Probe
+-- permission.ts     // Probe-Logik + TCC-Deeplink-URL
+-- lock.ts           // Process-Scan: läuft Safari?
+-- read.ts           // plist parsen, Hierarchie auf NormalizedSnapshot mappen
+-- write.ts          // Backup, plist modifizieren, atomar zurückschreiben
+-- mapping.ts        // BookmarksBar/BookmarksMenu zu internen Roots
+-- types.ts          // Errors: BrowserRunningError, SafariPermissionError, SafariParseError
```

**Frontend (Permission-Onboarding):**

```
src/app/onboarding/permissions/safari/
+-- page.tsx          // Permission-Onboarding-Step

src/components/
+-- safari-permission-card.tsx   // Erklärung + Buttons + Status
```

Der Permission-Step liegt unter der existierenden `/onboarding`-Route. Nach Auth-Login leitet der Boot-Flow den User auf diese Seite, wenn Safari erkannt ist und die Permission fehlt. Nach erteilter Permission landet er auf dem Hauptfenster. Konsistent mit dem Magic-Link-Flow aus PROJ-2.

### Datenmodell (intern)

Identisch zu PROJ-3/4 — `NormalizedFolder` und `NormalizedBookmark` mit `pathNormalized`, `parentPath`, `rootKey`. Die Sync-Engine sieht keinen Unterschied zwischen den drei Browser-Familien.

**Zwei Roots in Safari** (Reading List ist explizit kein Root):

| Safari-Top-Level-Key (`Bookmarks.plist`) | Interner Folder | Spiegelbild |
|---|---|---|
| `BookmarksBar` | `/lesezeichenleiste` | Chromium `bookmark_bar`, Firefox `toolbar` |
| `BookmarksMenu` | `/andere-lesezeichen` | Chromium `other`, Firefox `unfiled` |
| `com.apple.ReadingList` | (nicht synchronisiert) | (keiner) — Adapter fasst sie nie an |

Safari kennt im Gegensatz zu Chromium und Firefox keinen `mobile`-/`synced`-Root, weil iCloud die Synchronisation transparent über die plist macht. Der Schreibweg via Junction propagiert automatisch zu iOS Safari, wenn iCloud-Bookmarks aktiviert sind — das ist der gewollte iOS-Sync-Pfad aus dem PRD.

### Safari-Bookmarks.plist (kurz)

Eine binary plist (Apples Format), Top-Level-Dictionary mit:
- `Children` (Array von Bookmark/Folder-Items, je rekursiv `Children`)
- jedes Item hat `WebBookmarkType` (`WebBookmarkTypeLeaf` für URL, `WebBookmarkTypeList` für Folder)
- `URLString`, `URIDictionary.title`, `WebBookmarkUUID`
- Ordner haben `Title` als Klartext-Name
- Top-Level enthält die Reading-List-Sektion (`com.apple.ReadingList`) als ein Children-Eintrag — wir filtern den beim Read und reichen ihn beim Write 1:1 durch

### Profile-Pfad-Resolution

MVP: nur Default-Profil. Pfad-Logik in drei Stufen:

1. **Default-Pfad zuerst:** `~/Library/Safari/Bookmarks.plist`. Wenn die Datei lesbar ist (Permission OK) und ein gültiges plist enthält, ist das das aktive Profil.
2. **Profile-spezifischer Pfad falls vorhanden:** Sonoma+ legt bei aktivierten Profilen ein zweites plist unter `~/Library/Safari/Profiles/<UUID>/Bookmarks.plist` an. Adapter erkennt das via `defaults read com.apple.Safari` oder durch Existenz des `Profiles/`-Ordners. MVP: liest und schreibt das Default-Profil aus Profiles, falls vorhanden.
3. **Fallback:** keine plist gefunden → Adapter listet Safari als „kein Profil erkannt", kein Fehler.

### Permission-Detection

`fs.accessSync(plistPath, fs.constants.R_OK)` ist der Probe-Mechanismus. Drei Fälle:
- **OK** → Adapter darf lesen
- **EACCES** → TCC blockiert. Onboarding wird getriggert.
- **ENOENT** → Datei existiert nicht. Safari ist installiert aber wurde nie gestartet, oder Profile-Pfad ist anders. Kein Permission-Issue, sondern „nichts zu syncen".

**TCC-Deeplink:** Electron `shell.openExternal()` mit URL `x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles`. Öffnet die Systemeinstellungen direkt auf der Full-Disk-Access-Seite. Junction muss in der Liste auftauchen, sobald der User dorthin navigiert. Der „Ich habe es erteilt"-Button im Onboarding probt erneut.

### Browser-läuft-Detection

Safari hat keinen Lock-File. Process-Scan über `pgrep` oder direktes Lesen aus `/proc`-Äquivalent — auf macOS via Node:

- `child_process.execFileSync('pgrep', ['-x', 'Safari'])` liefert PIDs der Safari-Hauptprozesse
- Exit-Code 0 = mindestens ein Match, Exit-Code 1 = kein Match
- Match → Safari läuft → `BrowserRunningError`, Sync-Engine queued den Write

`pgrep -x Safari` matched exakt auf den Prozessnamen `Safari`, ignoriert also Helper-Prozesse wie `Safari Web Content` oder `com.apple.Safari.SearchHelper`. Wir wollen nur den Hauptprozess wissen, denn nur der schreibt in `Bookmarks.plist`.

### Read-Pipeline

1. **Permission proben.** Bei EACCES → `SafariPermissionError`, Sync-Engine zeigt Onboarding.
2. **plist parsen** mit `simple-plist`. Datei wird in einem Schritt deserialisiert — keine Stream-API nötig, plist-Dateien sind klein (5'000 Bookmarks ≈ 1 MB).
3. **Hierarchie aufbauen.** Top-Level `Children` durchgehen, Reading-List-Item filtern, BookmarksBar und BookmarksMenu rekursiv traversieren.
4. **Auf NormalizedSnapshot mappen.** URL-Normalisierung wie bei den anderen Adaptern (Tracking-Parameter strippen).

### Write-Pipeline

1. **Permission und Lock-Check.** EACCES → `SafariPermissionError`. Safari läuft → `BrowserRunningError`.
2. **Backup.** Rotierender Buffer max 3 Versionen unter `<userData>/backups/safari/<browserId>/`.
3. **Original parsen.** Wir laden die existierende plist komplett — wir wollen die Reading-List-Sektion und unbekannte Top-Level-Keys 1:1 erhalten (passthrough).
4. **BookmarksBar und BookmarksMenu neu aufbauen** aus dem Snapshot. Reading List bleibt unangetastet.
5. **Serialisieren** mit `simple-plist` als binary plist (NICHT XML — Safari schreibt binary, wir bleiben kompatibel).
6. **Atomic write:** temp-Datei daneben, dann `rename` auf Original-Pfad. Bei Crash mitten im Schreiben verliert man höchstens die neue Version, nicht die alte.

### Tech-Decisions (warum)

1. **`simple-plist` als plist-Parser.** Wrapper über `bplist-parser` und `bplist-creator`, eine API für Read+Write, aktiv gepflegt, TypeScript-Types verfügbar. Konsistent mit der bisherigen Linie aus PROJ-1+2 (lieber eine kleine Library als zehn Module zusammenpuzzeln). Trade-Off: indirekte Dependency-Kette. Mitigation: Adapter-API ist abgeschottet, Wechsel zu `bplist-parser` direkt wäre überschaubar.

2. **Permission-Onboarding als eigene Route `/onboarding/permissions/safari`.** Klar getrennt vom Auth-Schritt, wiederverwendbares Pattern für künftige Permissions (z.B. AppleScript für PROJ-8 Login-Items). Konsistent mit dem Onboarding-Flow aus PROJ-2 (Magic Link in einem dedizierten Step).

3. **Process-Scan via `pgrep -x Safari` statt Lock-Datei.** Safari hat keinen Lock-Mechanismus. `pgrep -x` ist macOS-vorinstalliert, exakter Prozess-Match (kein Match bei Helper-Prozessen). Alternative AppleScript wäre fragiler und langsamer.

4. **Reading List komplett unangetastet.** Sie ist eine separate Datenstruktur (gespeicherte Artikel mit Read-Status, Offline-Cache), kein klassisches Bookmark. Beim Read filtern, beim Write per passthrough erhalten — Junction tut so, als gäbe es sie nicht.

5. **iCloud-Bookmarks behandeln wie lokale.** Safari speichert beide in derselben plist und differenziert nicht in der Datenstruktur. Schreiben propagiert automatisch via iCloud zu iOS Safari — genau das ist der iOS-Sync-Pfad aus dem PRD ("iOS-Pendants ziehen über die nativen Browser-Sync-Mechanismen automatisch nach").

6. **Permission-Probe via `fs.accessSync` mit catch auf EACCES.** Robuster als `fs.statSync` (das gibt bei TCC manchmal andere Fehler-Codes zurück). Synchron weil Adapter ohnehin synchron ist und der Probe-Aufruf <1 ms dauert.

7. **Backup mit Rotation max 3 Versionen.** Konsistent mit PROJ-3 und PROJ-4. plist-Dateien sind klein (1-5 MB selbst bei vielen Bookmarks), Footprint vernachlässigbar.

### Edge Cases

| Fall | Adapter-Verhalten |
|---|---|
| Safari nie gestartet (keine plist) | `hasDefaultProfile=false`, kein Fehler |
| Permission fehlt | `SafariPermissionError`, Sync-Engine zeigt Onboarding |
| Safari läuft beim Write | `BrowserRunningError`, Sync-Engine queued |
| Korrupte plist | `SafariParseError`, Browser überspringen |
| Sonoma-Profile aktiv | Default-Profil aus `~/Library/Safari/Profiles/<UUID>/` lesen |
| Reading List vorhanden | beim Read filtern, beim Write per passthrough erhalten |
| iCloud-Bookmarks vorhanden | wie lokale behandeln, Sync propagiert zu iOS |
| Safari schreibt parallel | atomic temp+rename — bei Race gewinnt der spätere Write |
| Plist hat unbekannte Top-Level-Keys | passthrough, nicht löschen |

### Dependencies (zu installieren)

- `simple-plist` — binary plist parser + creator (~50 KB, eine Dependency)
- alle anderen schon vorhanden: `electron` (für `shell.openExternal`), `node:fs`, `node:child_process`, `vitest`

### Was diese Feature explizit NICHT baut

- Kein Reading-List-Sync (Apple-spezifisch, kein Bookmark-Pendant in anderen Browsern)
- Keine Multi-Profile-Wahl — Phase 2 zusammen mit der Settings-UI
- Keine Wiederherstellung nach widerrufter Permission (User muss Junction neu starten — die Boot-Pipeline triggert dann das Onboarding)
- Keine Auto-Beenden von Safari vor dem Write — User entscheidet, wann er Safari schliesst

### Risiken & offene Punkte

- **TCC-Deeplink-URL.** Apple hat das URL-Schema mehrfach geändert. Aktuelle Form `x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles` ist auf macOS 14-15 verifiziert. Bei Update prüfen.
- **Sonoma-Profile-Detection.** Existenz des `Profiles/`-Ordners ist die Hauptindikation. Edge-Case: User hat Profiles aktiviert und wieder deaktiviert — der Ordner kann leer sein. Adapter prüft auf gültige plist im Profile-Pfad und fällt sonst auf den Default-Pfad zurück.
- **Reading-List-Passthrough-Treue.** `simple-plist` muss komplexe NSDictionary-Strukturen verlustfrei round-trippen. Risiko: Library deserialisiert manche Apple-spezifische Typen (NSDate, NSData) anders als Apple sie schreibt. Mitigation: Round-Trip-Test in der QA gegen eine echte Bookmarks.plist mit Reading-List-Inhalt.
- **plist-Format binary vs XML.** Safari schreibt binary. Beim Round-Trip schreiben wir auch binary, sonst verdoppelt sich die Datei und Spotlight reindexiert. `simple-plist` unterstützt beides — wir setzen Format explizit.
- **Codesigning + Notarization für TCC.** Für eine produktive App braucht es einen Apple-Developer-Cert, sonst meldet TCC Junction nicht in der Liste. Im Dev-Build (unsigned) erscheint Junction trotzdem, aber mit einem Warnsymbol. Das kommt im /deploy-Step zur Sprache.

## Implementation Notes (Frontend)

**Permission-Onboarding-UI gebaut, Backend-Adapter folgt mit `/backend PROJ-5`.**

**Files (Frontend):**
- `src/lib/types.ts` — `PermissionStatus`, `PermissionsState` ergänzt
- `src/lib/electron-bridge.ts` — neue Bridge-Sektion `permissions` (`getState`, `probeSafari`, `openSafariSettings`, `subscribe`); Mock-Bridge für UI-Dev simuliert ersten Probe als `denied`, nach erstem Re-Probe `granted`
- `src/components/safari-permission-card.tsx` — Erklärung + 3-Step-Anleitung + zwei Buttons mit Loading-States, Status-Anzeige bei `granted`/`unavailable`
- `src/app/onboarding/permissions/safari/page.tsx` — Onboarding-Seite mit BrandMark, Card, Continue-Button (öffnet Hauptfenster wenn granted) und Skip-Option

**Routen-Struktur:**
- `/onboarding` — bestehender Auth-Flow (Welcome → Login → Mail-Versand)
- `/onboarding/permissions/safari` — neuer Permission-Step nach Auth, derzeit standalone navigierbar; Sync-Engine (PROJ-6) wird später automatisch dorthin leiten

**shadcn-Components verwendet:** Button. Keine neuen Installationen nötig — alles über Composition.

**Mock-Bridge-Verhalten** (für Browser-Dev ohne Electron):
- Erster Probe: `denied`
- Klick auf "Systemeinstellungen öffnen" → öffnet Apple-Hilfe-Seite zu Full Disk Access (öffnet im Browser, in Electron später `shell.openExternal` mit TCC-Deeplink)
- Klick auf "Erneut prüfen" → `granted`, triggert `onGranted`-Callback
- Subscribe-Listener bekommt jeden State-Wechsel

**Was Backend (`/backend PROJ-5`) noch liefern muss:**
- Real `permissions:probe-safari` IPC-Handler im Main-Prozess (`fs.accessSync` auf `~/Library/Safari/Bookmarks.plist`)
- Real `permissions:open-safari-settings` (`shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles')`)
- Push-Event `permissions:state:changed` bei jeder Änderung
- Adapter-Module (detect, lock, read, write, mapping, types)

**Build- und Test-Status:**
- `npm run build`: grün, neue Route `/onboarding/permissions/safari` als statische Seite
- `npx tsc --noEmit`: 0 Fehler
- `npx vitest run`: 98/98 grün (kein Test broken)
- Live-Probe gegen `localhost:3000/onboarding/permissions/safari/` zeigt alle deutschen Strings

## Implementation Notes (Backend)

**Backend-Adapter komplett gebaut, IPC verdrahtet, alle Tests grün.**

**Files (Backend, Adapter):**
- `electron/adapters/safari/types.ts` — `RootKey`, `NormalizedFolder`, `NormalizedBookmark`, `NormalizedSnapshot`, Errors `BrowserRunningError`, `SafariPermissionError`, `SafariParseError`
- `electron/adapters/safari/mapping.ts` — `BookmarksBar↔toolbar`, `BookmarksMenu↔unfiled`, `SAFARI_ROOTS`, `READING_LIST_TITLE`, `rootKeyForPath`
- `electron/adapters/safari/permission.ts` — `probePermission` via `accessSync(R_OK)` mit ENOENT/EACCES-Diskriminierung, `safariInstalled`, `defaultBookmarksPath`, `FULL_DISK_ACCESS_URL` (TCC-Deeplink)
- `electron/adapters/safari/lock.ts` — `checkSafariRunning` via `pgrep -x Safari` mit Exit-Code-Diskriminierung; non-darwin gibt `not-running` zurück
- `electron/adapters/safari/detect.ts` — `detectSafari` mit Sonoma-Profile-Resolution (Profiles/<UUID>/Bookmarks.plist nach mtime, sonst Default-Pfad)
- `electron/adapters/safari/read.ts` — `parseSafariPlist` (mit Fehler-Mapping auf `SafariPermissionError`/`SafariParseError`), `readSafariBookmarks` mit Reading-List-Filter, URL-Tracking-Strip
- `electron/adapters/safari/write.ts` — `writeSafariBookmarks`: Lock-Check, Backup-Rotation (max 3), Reading-List-Passthrough, unbekannte Top-Level-Keys preserved, atomic temp+rename, binary plist
- `electron/adapters/safari/index.ts` — Public API
- `electron/adapters/safari/__fixtures__/build-fixture.ts` — synthetischer Bookmarks.plist-Builder (BookmarksBar, BookmarksMenu, ReadingList, ExtraLists)

**Files (Backend, IPC):**
- `electron/permissions.ts` — `PermissionsService` (EventEmitter): `getState`, `probeSafari`, `openSafariSettings`
- `electron/ipc.ts` — neue Handler `permissions:state:get`, `permissions:probe-safari`, `permissions:open-safari-settings`; Push-Event `permissions:state:changed` bei Änderung
- `electron/preload.ts` — `permissions`-Sub-Bridge (parallel zu `auth`)
- `electron/main.ts` — `PermissionsService` instanziiert, Boot-Probe (synchroner accessSync, <1 ms)

**Dependency:** `simple-plist@1.3.1` (Wrapper über `bplist-parser` + `bplist-creator`).

**Dev-Build mit unsigned Electron:** TCC weist Junction zurück, weil das Bundle nicht signiert ist. Erwarteter Output: `permission: 'denied'` für die Default-Bookmarks.plist. Das ist kein Bug, sondern beweist, dass die Probe sauber arbeitet — sobald der `/deploy`-Schritt Codesigning + Notarization einrichtet, taucht Junction in der Full-Disk-Access-Liste auf und der Probe meldet `granted`.

**Tests (28 neue Safari-Tests, gesamt 126/126 grün):**
- `mapping.test.ts` — 7 Tests: Title→Root-Mapping, Inverse, Path-Lookup, Reading-List-Konstante
- `permission.test.ts` — 5 Tests: Default-Pfad, TCC-URL-Form, granted/denied/unavailable
- `lock.test.ts` — 2 Tests: Struktur des Rückgabewerts, kein Throw
- `read.test.ts` — 6 Tests: Bar+Menu-Hierarchie, Reading-List-Filter, Tracking-Strip, Missing-File, Garbage-File, file://-Filter
- `write.test.ts` — 8 Tests: Round-Trip, Reading-List-Passthrough, Unknown-Lists-Passthrough, History-Proxy-Preserve, Binary-Plist-Magic-Bytes, Backup-Anlegen, Backup-Rotation, Append-Missing-Roots

**Live-Probe gegen echte `~/Library/Safari/Bookmarks.plist` (10 MB):**
- `detectSafari()` liefert `installed: true`, `permission: 'denied'`, `lock: { running: false, reason: 'not-running' }`
- Permission-denied-Pfad korrekt (Terminal hat keinen Full Disk Access — beweist die Probe-Logik)
- Read-Pfad gegen Live-Datei steht aus, da TCC blockt — durch Fixture-Tests abgedeckt

**Was Backend bewusst NICHT baut:**
- Kein Reading-List-Sync (Apple-spezifisch, kein Pendant in anderen Browsern)
- Keine Multi-Profile-Wahl im Settings (Phase 2 mit PROJ-8)
- Kein Auto-Quit von Safari vor dem Write — User entscheidet
- Keine Wiederherstellung nach widerrufter Permission im Live-Betrieb (Onboarding triggert beim nächsten Boot)

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
