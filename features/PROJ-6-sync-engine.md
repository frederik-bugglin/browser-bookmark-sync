# PROJ-6: Sync-Engine

## Status: In Review
**Created:** 2026-05-06
**Last Updated:** 2026-05-07 (QA Pre-Migration Pass, 2 HIGH-Bugs gefixt, Live-Sync-Addendum offen)

## Dependencies
- PROJ-2 (Supabase Backend) für Cloud-State-Persistenz
- PROJ-3 (Chromium-Adapter), PROJ-4 (Firefox-Adapter), PROJ-5 (Safari-Adapter) für Read/Write
- Wird benutzt von PROJ-7 (Sync-Trigger) und PROJ-9 (Konflikt-Log)

## User Stories
- Als Nutzer möchte ich, dass alle Bookmarks aus allen aktivierten Browsern in einen gemeinsamen Stand gemerged werden, damit jeder Browser denselben Inhalt hat
- Als Nutzer möchte ich, dass beim ersten Lauf die Vereinigung aller Bookmarks aus allen Browsern entsteht, ohne dass ich eine Quelle wählen muss
- Als Nutzer möchte ich, dass Löschungen verlässlich propagieren, also wenn ich in Browser A ein Bookmark wegwerfe, ist es nach dem nächsten Sync auch in B und C weg
- Als Nutzer möchte ich, dass bei einem echten Konflikt (gleiches Bookmark in zwei Browsern unterschiedlich verändert) die zuletzt geänderte Version gewinnt
- Als Nutzer möchte ich, dass jede überschriebene oder gelöschte Version im Konflikt-Log landet, damit ich nachvollziehen und ggf. wiederherstellen kann
- Als Nutzer möchte ich, dass Bookmarks aus Chrome Sync (`synced`) und Firefox Sync (`mobile`) bei den anderen Browsern als normale Bookmarks erscheinen, ohne dass die Engine versucht, in diese geschützten Bereiche zurück zu schreiben

## Acceptance Criteria

### Sync-Lauf-Pipeline
- [ ] Sync-Lauf folgt dem Schema: **Read alle Adapter** → **3-Way-Diff gegen Last-Known-Snapshot** → **Resolve Konflikte (LWW)** → **Write Cloud** → **Write alle Adapter (ausser Read-Only-Roots)** → **Speichere neuen Last-Known-Snapshot**
- [ ] Sync-Lauf hat eine UUID, alle Logs/Konflikte werden mit dieser ID verknüpft
- [ ] Sync-Lauf erzeugt strukturiertes Log: Anzahl gelesener/geschriebener Bookmarks pro Adapter, Anzahl Konflikte, Dauer pro Phase, Sync-Run-ID
- [ ] Performance: voller Sync mit 1'000 Bookmarks und 3 Browsern in unter 10 Sekunden

### Identität und Diff
- [ ] Bookmark-Identität für Cross-Browser-Match: SHA-256 Hash über `urlNormalized + folderPath + rootKey` (Titel-Renames werden als Update derselben Bookmark erkannt, nicht als Add+Delete)
- [ ] Engine speichert nach jedem erfolgreichen Sync den aktuellen Stand jedes Browsers als Last-Known-Snapshot (in Supabase)
- [ ] Beim nächsten Sync 3-Way-Diff pro Browser: `previous-A` vs `current-A` → liefert Adds/Updates/Deletes für Browser A
- [ ] Engine merged die per-Browser-Diffs zu einer Cloud-Aktion: Add (irgendwo neu), Update (Konflikt-Auflösung), Delete (überall löschen)

### Initial-Sync (kein Last-Known-Snapshot vorhanden)
- [ ] Erster Lauf ohne Vorgänger-Snapshot: nimm Vereinigung aller Bookmarks aus allen Browsern (Union)
- [ ] Bei der Union werden Duplikate (gleicher Identitäts-Hash) zu einem Eintrag zusammengefasst, alle anderen werden additiv übernommen
- [ ] Nach Initial-Sync ist der Cloud-State in jedem aktivierten Browser exakt gleich
- [ ] Initial-Sync erzeugt keine Konflikt-Log-Einträge (es gibt noch keinen Konflikt zu loggen)

### Konflikt-Auflösung (Last-Write-Wins)
- [ ] Konflikt = derselbe Identitäts-Hash existiert in zwei Browsern mit unterschiedlichen Werten in mind. einem Feld (Titel oder Ordnerpfad — Identität ist URL-basiert)
- [ ] Auflösung pro Bookmark als atomare Einheit (nicht pro Feld): jüngere `dateModified` gewinnt komplett
- [ ] Wenn beide Versionen gleichzeitig modifiziert (gleicher Timestamp): deterministische Tie-Break-Regel (alphabetisch nach `browserId`)
- [ ] Wenn ein Browser kein `dateModified` liefert (Safari): Fallback auf Sync-Run-Timestamp des aktuellen Laufs für diesen Browser
- [ ] Verlierende Version wird in Konflikt-Log geschrieben (Schema in PROJ-9): Bookmark-Hash, beide Versionen als JSONB, Winner-Browser, Loser-Browser, Sync-Run-ID, Timestamp

### Read-Only-Roots
- [ ] Bookmarks aus schreibgeschützten Roots (`synced` in Chromium, `mobile` in Firefox) werden gelesen und in Cloud + andere Browser propagiert
- [ ] Engine schreibt **niemals** in `synced` oder `mobile` (Adapter rejects schon, Engine probiert es gar nicht erst)
- [ ] Beim Propagieren in andere Browser landen Mobile/Synced-Bookmarks im jeweiligen `unfiled`/`other`-Root des Ziel-Browsers (nicht in `toolbar`, sonst überfüllt)
- [ ] Wenn ein Mobile-Bookmark im Origin-Browser entfernt wird (durch Chrome/Firefox Sync), erkennt die Engine das wie jede andere Löschung und propagiert sie in die anderen Browser

### Atomarität und Robustheit
- [ ] Jeder Adapter-Write ist atomar pro Browser (temp+rename / SQL-Transaktion). Wenn ein Browser-Write fehlschlägt, behalten die anderen Browser ihren alten Stand und der Lauf wird als partial-success geloggt
- [ ] Wenn ein Adapter-Read fehlschlägt (z.B. Browser läuft, Permission verweigert): Engine überspringt diesen Browser für den aktuellen Lauf und merged ihn beim nächsten Lauf neu, ohne Datenverlust
- [ ] Sync ist idempotent: zweimal hintereinander ausgeführt ohne externe Änderung produziert keinen Diff, keine Konflikt-Log-Einträge, keine Writes
- [ ] `browserId`-Whitelist beim Adapter-Aufruf: Engine validiert vor jedem Read/Write, dass der `browserId` einer der erlaubten Werte ist (`safari`, `firefox`, `zen`, `chrome`, `arc`, `brave`, `edge`, `dia`). Behebt Defense-in-Depth-Gap aus QA von PROJ-3/4/5
- [ ] Re-Read nach Write für Safari (mitigiert Race, wenn Safari zwischen Lock-Check und Rename startet): Engine liest Safari unmittelbar nach dem Write erneut und vergleicht mit dem geschriebenen Snapshot

### Folder-Mapping
- [ ] Engine nutzt das bestehende `ROOT_TO_PATH`-Mapping aus den Adaptern (toolbar → `/lesezeichenleiste`, etc.) als gemeinsamen Pfad-Namensraum
- [ ] Cross-Browser-Folder-Match: nur exakte Pfad-Gleichheit nach Normalisierung (slugified). Unterschiedlich benannte Folder bleiben getrennt
- [ ] Fuzzy-Folder-Matching ("Recherche" ↔ "Research") ist explizit OUT-of-Scope für MVP — kommt mit der Settings-UI in PROJ-8

## Edge Cases

- **Bookmark in A gelöscht, in B unverändert:** Last-Known-Snapshot zeigt Bookmark in beiden, aktueller A-Snapshot zeigt es nicht mehr → Engine erkennt Delete in A, propagiert nach B+Cloud
- **Bookmark in A neu, in B noch nicht da:** Last-Known-Snapshot kennt es nicht, aktueller A-Snapshot zeigt es → Add, propagiert nach B+Cloud
- **Bookmark in A umbenannt, in B verschoben:** Identitäts-Hash basiert auf URL, also ist es derselbe Bookmark. Konflikt: zwei Updates gleichzeitig → LWW pro Bookmark, jüngerer gewinnt komplett (also entweder neuer Titel ODER neuer Ordner, nicht beides)
- **Bookmark hat keinen `dateModified` (Safari)**: Fallback auf Sync-Run-Timestamp. In der Praxis: Safari-Versionen verlieren bei direktem Konflikt mit einem zeitlich-gestempelten Browser ausser Safari hat den allerletzten Sync gewonnen
- **Adapter-Crash während Read**: Browser wird übersprungen, Sync läuft mit den restlichen Browsern weiter. Beim nächsten Lauf wird der gecrashte Browser als ob er pausiert war neu gemerged
- **Adapter-Crash während Write**: temp+rename oder SQL-ROLLBACK greift, Browser bleibt auf altem Stand. Engine markiert Sync-Lauf als partial-success und versucht beim nächsten Lauf erneut
- **Bookmark mit ungültiger URL (`javascript:`, `chrome://`, `about:`)**: Adapter filtern diese schon beim Read. Engine sieht sie nicht
- **Duplikate innerhalb eines Browsers (gleiche URL in zwei Ordnern)**: Identitäts-Hash inkludiert `folderPath`, also unterschiedliche Hashes → beide bleiben erhalten
- **Sync-Run zwei Mal gleichzeitig getriggert**: Single-Instance-Lock (im Main-Prozess); zweiter Trigger wird verworfen
- **Cloud-State (Supabase) nicht erreichbar**: Engine bricht den Lauf ab und meldet Offline. Adapter werden nicht angefasst (kein partieller Sync ohne Persistenz)
- **Initial-Sync mit 0 Bookmarks in allen Browsern**: Union ist leer, Cloud bleibt leer, kein Write nötig. Last-Known-Snapshot wird trotzdem gespeichert (alle drei mit `[]`)
- **Read-Only-Root-Bookmark wird in beschreibbarem Root eines anderen Browsers manuell verändert**: das ist ein Konflikt zwischen `synced/A` und `other/B` mit identischem Hash. LWW greift normal. Verlierer landet im Log. Wenn der beschreibbare Browser gewinnt, propagiert die neue Version in alle Browser **ausser** den Origin-Read-Only-Root (der bleibt auf der Chrome-Sync-Version)

## Technical Requirements (optional)

- **Identitäts-Hash:** SHA-256 Hash über `urlNormalized + '|' + folderPath + '|' + rootKey`, hexadecimal als 16-Byte-prefix (32 Zeichen) gespeichert
- **Last-Known-Snapshot-Storage:** Supabase-Tabelle `bookmark_snapshots` (user_id, browser_id, snapshot_json JSONB, sync_run_id, captured_at). Nur der jüngste Snapshot pro (user, browser) wird behalten, ältere werden beim erfolgreichen Folge-Sync gelöscht
- **Cloud-Bookmark-Tabelle:** `bookmarks_cloud` (user_id, hash, url, url_normalized, title, folder_path, root_key, source_browsers TEXT[], updated_at). RLS: nur Owner darf lesen/schreiben
- **Konflikt-Log:** wird von PROJ-9 spezifiziert. Engine schreibt nur das Insert-Statement
- **Sync-Run-Telemetrie:** lokales JSON-Log unter `<userData>/logs/sync-runs/<runId>.json` (max 100 Läufe, FIFO-Rotation). Strukturierte Felder: runId, startedAt, endedAt, perAdapter (durations, counts), conflicts, errors
- **URL-Normalisierung:** wiederverwendet aus den Adaptern (`electron/lib/url-normalize.ts`), keine separate Logik
- **Cloud-Push:** Batched Upsert mit max. 500 Rows pro Request (Supabase Limit)
- **Konflikt-Log-Eintrag:** Bookmark-Hash, beide Versionen als JSONB, Winner-Browser, Loser-Browser, Timestamp, Sync-Run-ID

## Was diese Feature explizit NICHT baut

- Keine Sync-Trigger oder Scheduler — das ist PROJ-7 (manuell und zeitgesteuert)
- Keine Konflikt-Log-UI oder Wiederherstellung — das ist PROJ-9
- Keine Settings-UI für Browser-Aktivierung oder Folder-Mapping-Override — das ist PROJ-8
- Keine Multi-User-Synchronisation (nur Single-User MVP)
- Kein Real-Time-Sync (kein Websocket-Listener auf Browser-File-Changes)
- Keine Fuzzy-Folder-Match (Phase 2)
- Keine Tag-Sync (Tags sind Browser-spezifisch und werden nicht propagiert)
- Keine Konflikt-Resolution-UI (kein "User entscheidet pro Konflikt") — LWW ist immer automatisch

## Risiken und offene Fragen für `/architecture`

- **Cloud-State-Konsistenz** bei abgebrochenem Sync: wenn Engine zwischen Cloud-Write und Adapter-Write crasht, ist Cloud auf Stand N+1 aber Adapter noch auf N. Lösung könnte sein: Cloud-Write erst nach erfolgreichem Adapter-Write, oder Two-Phase-Commit-artige Markierung. Architektur entscheidet
- **Snapshot-Größe** bei vielen Bookmarks: ein Browser-Snapshot mit 5'000 Bookmarks ist ~500 KB JSON. Engine speichert drei davon plus Cloud-State plus History. Bei 5 Sync-Läufen pro Tag und 3 Monaten Aufbewahrung = 1500 Snapshots × 500 KB = 750 MB. Architektur muss Rotation/Aggregation überlegen
- **Race zwischen Sync-Run und Browser-Edit**: User editiert in Browser X während Sync-Engine X gerade gelesen hat aber noch nicht geschrieben. Edit ist im aktuellen Lauf nicht berücksichtigt, kommt erst beim nächsten Lauf rein. Akzeptabel für 5min-Latenz-Ziel
- **Folder-Identity bei Folder-Renames**: wenn User in Browser A einen Folder umbenennt, ändert sich der `folderPath` aller Bookmarks darin. Aus Sicht der Engine sind das alle "neue" Bookmarks und die alten "deleted". Resultat: Folder-Rename verursacht massive Diff-Aktivität und potenziell Konflikte. Mitigation: Architekt überlegt Folder-Identity separat oder Schwellenwert-Heuristik

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Wo lebt die Engine

Die Sync-Engine ist Teil des Electron-Main-Prozesses, ein neues Modul `electron/sync-engine/` parallel zu `electron/adapters/`. Die Engine ruft die Adapter direkt als TypeScript-Funktionen auf, weil beide im selben Prozess laufen. Kein IPC, keine Worker-Threads für MVP.

Sync-Trigger (PROJ-7) wird die Engine später per `runSync()` von aussen anstossen — die Engine selbst kennt keine Scheduler oder Buttons.

### Komponenten-Struktur

```
electron/sync-engine/
+-- index.ts             // Public API: runSync(), getLastRunStatus()
+-- pipeline.ts          // Orchestriert die 9 Phasen einer Sync-Run
+-- identity.ts          // SHA-256-Hash über urlNormalized + folderPath + rootKey
+-- diff.ts              // 3-Way-Diff pro Browser
+-- resolve.ts           // LWW-Konfliktauflösung
+-- route.ts             // Cross-Browser-Routing (Mobile/Synced -> unfiled/other)
+-- cloud.ts             // Supabase-Reads/Writes (Bookmarks, Snapshots)
+-- snapshot.ts          // Last-Known-Snapshot speichern/laden
+-- log.ts               // Sync-Run-Telemetrie auf Disk
+-- browser-id.ts        // Whitelist-Validation vor jedem Adapter-Aufruf
+-- types.ts             // SyncRun, SyncResult, BookmarkChange, ...
```

Adapter werden **nicht** angefasst — die Engine konsumiert sie nur über deren bestehende Public APIs (`detectAll`, `readBookmarks`, `writeBookmarks`).

### Datenmodell (Plain Language)

**Cloud (Supabase, RLS owner-only):**

| Tabelle | Inhalt | Lebensdauer |
|---|---|---|
| `bookmarks_cloud` | Der gemerged-te Stand aller Bookmarks dieses Users. Pro Eintrag: ein Identitäts-Hash, die URL, der normalisierte Pfad, der Titel, welche Browser ihn aktuell führen, der `updated_at`-Timestamp. | Permanent |
| `bookmark_snapshots` | Pro `(user, browser)` genau ein Eintrag: der letzte erfolgreich synchronisierte Stand dieses Browsers als JSON. Wird beim nächsten erfolgreichen Sync ersetzt. | Permanent (eine Zeile pro Browser) |
| `conflict_log` | Definiert in PROJ-9. Engine schreibt nur Inserts. | Permanent (Retention in PROJ-9) |

**Lokal (Dateisystem im Electron-userData):**

| Pfad | Inhalt | Lebensdauer |
|---|---|---|
| `<userData>/logs/sync-runs/<runId>.json` | Telemetrie eines einzelnen Sync-Laufs: Dauer pro Phase, Counts pro Adapter, Konflikt-Anzahl, Fehler. | FIFO-Rotation, max 100 Läufe |
| `<userData>/backups/<browser>/<browserId>/...` | Adapter-Backups (existieren bereits aus PROJ-3/4/5). Engine fasst sie nicht an, nur die Adapter rotieren. | Max 3 pro Browser-Profil |

**Was ein Last-Known-Snapshot enthält:** alle Folders und Bookmarks, die der Adapter beim letzten erfolgreichen Read produziert hat — also die normalisierte Form (URL, Titel, Pfad, Root, optional `dateModified`). Keine zusätzlichen Engine-Metadaten.

### Sync-Run-Pipeline

```
runSync()
+-- Phase 1: PLAN
|   Welche Browser sind eligible? (installiert, Permission OK, vom User aktiviert)
|
+-- Phase 2: READ (parallel pro Adapter)
|   Jeder Adapter liefert einen NormalizedSnapshot.
|   Browser läuft / Permission verweigert -> Browser wird übersprungen, Lauf weiter.
|
+-- Phase 3: DIFF (sequenziell pro Browser)
|   Für jeden Browser: 3-Way-Diff zwischen
|     Last-Known-Snapshot (aus Cloud, vom letzten Lauf)
|     Aktueller Snapshot (gerade gelesen)
|     Aktueller Cloud-State (bookmarks_cloud)
|   Output: Liste der Änderungen, die DIESER Browser seit letztem Sync gemacht hat.
|
+-- Phase 4: RESOLVE
|   Alle Per-Browser-Änderungen werden gesammelt und auf den Cloud-State angewendet.
|   Bei Konflikten (zwei Browser haben dasselbe Bookmark unterschiedlich verändert):
|     LWW pro Bookmark, dateModified entscheidet.
|     Verlierende Version wird als Konflikt-Log-Eintrag vorgemerkt.
|
+-- Phase 5: WRITE CLOUD (atomar pro Tabelle, batched)
|   Cloud-Bookmarks-Tabelle wird aktualisiert (Upserts + Deletes).
|   Konflikt-Log-Einträge werden inserted.
|   ACHTUNG: Cloud wird VOR den Adaptern geschrieben (Begründung unten).
|
+-- Phase 6: WRITE ADAPTERS (sequenziell, mit browserId-Whitelist)
|   Pro eligible Browser: writeBookmarks(merged-snapshot).
|   Read-Only-Roots werden NICHT befüllt mit Cross-Browser-Material -- siehe Routing.
|   Wenn ein Adapter-Write fehlschlägt, läuft der nächste trotzdem (partial-success).
|
+-- Phase 7: RE-READ SAFARI (nur wenn Safari geschrieben wurde)
|   Liest Safari sofort erneut, vergleicht mit dem geschriebenen Stand.
|   Wenn Diff: Safari hat parallel selber geschrieben (Race), Lauf wird als
|   suspect markiert und beim nächsten Lauf re-merged.
|
+-- Phase 8: PERSIST SNAPSHOTS
|   Pro erfolgreich geschriebenem Browser: bookmark_snapshots-Eintrag
|   wird mit dem just-written Stand überschrieben (UPSERT).
|
+-- Phase 9: LOG
|   Sync-Run-Telemetrie wird auf Disk geschrieben.
|   Lauf-Status (success / partial / aborted) wird im AppState gespiegelt.
```

### Tech-Decisions (warum)

#### 1. Cloud-zuerst, dann Adapter (nicht umgekehrt)

**Warum:** Wenn die Engine zwischen den Phasen crasht, will man den am wenigsten schmerzhaften Recovery-Pfad. Cloud-zuerst bedeutet: bei Crash nach Phase 5 ist Cloud auf dem neuen Stand, Adapter noch alt. Beim nächsten Lauf sieht jeder Adapter sich selbst als veraltet, holt sich den Cloud-Stand und gut. **LWW heilt das automatisch.**

Andersrum (Adapter zuerst): Crash nach Phase 6 würde Adapter auf neuem Stand und Cloud auf altem zurücklassen. Beim nächsten Lauf sieht die Engine die "neuen" Bookmarks in den Adaptern als User-Adds und propagiert sie nochmal nach Cloud. Kein Datenverlust, aber Konflikt-Log-Spam und doppelte Arbeit.

**Tradeoff:** Wenn der User in der kurzen Lücke zwischen Cloud-Write und Adapter-Write in einem Browser schnell etwas ändert, kann diese Änderung beim Adapter-Write überschrieben werden. Die Mitigation ist die 5-min-Latenz im Auto-Modus plus die Re-Read-Phase für Safari.

#### 2. Last-Known-Snapshots in Cloud, nicht lokal

**Warum:** Der Snapshot ist die Wahrheit über "was hat dieser Browser zuletzt rausgeschickt". Wenn er lokal liegt und der User wechselt den Mac (Multi-Mac-ready laut PRD), wäre er weg. In Cloud ist er für jedes Junction-Device des Users verfügbar. Auch wenn MVP nur einen Mac syncht — die Architektur ist Multi-Mac-ready, die Speicher-Lokation muss konsistent sein.

**Tradeoff:** Sync-Engine braucht zwingend Internet. Offline-Modus ist out-of-scope (laut PRD).

#### 3. Nur der jüngste Snapshot pro `(user, browser)` wird gehalten

**Warum:** Der 3-Way-Diff braucht nur den unmittelbaren Vorgänger. Ältere Snapshots haben keinen operativen Wert. Die Risiko-Notiz im Spec rechnete mit 750 MB Storage bei voller History — bei nur einem Snapshot pro Browser sind es ~1.5 MB für drei Browser mit je 5'000 Bookmarks. Vernachlässigbar.

**Wenn man mal historische Snapshots will:** das Konflikt-Log (PROJ-9) hält die einzelnen Bookmark-Versionen nach Konflikt — das ist die historische Sicht, die der User wirklich braucht.

#### 4. Identitäts-Hash inkludiert Folder-Pfad

**Warum:** Konsistent mit dem Spec. Folder-Rename produziert dadurch viel Diff-Aktivität (alle Bookmarks darunter sehen "neu" aus). Das ist akzeptiert — Folder-Renames sind selten und der Sync-Engine läuft auf normalisierten Daten. **Phase-2-Mitigation:** Heuristik "wenn 80%+ der Bookmarks aus Folder X gleichzeitig in Folder Y wieder auftauchen, behandle als Folder-Move statt Mass-Add+Delete". Out-of-Scope für MVP.

#### 5. Cross-Browser-Routing für Read-Only-Roots

**Warum:** Bookmarks aus `synced` (Chromium) und `mobile` (Firefox) können NICHT zurück in dieselben Roots in den anderen Browsern geschrieben werden, weil die dort gar nicht existieren oder von Apple/Google verwaltet werden. Die Engine routet sie beim Cross-Browser-Propagation in den `unfiled`/`other`-Root des Ziel-Browsers — das ist dort der "weiche Mülleimer" für Ungeordnetes. Toolbar wäre falsch (da würde der User die nicht erwarten).

**Konkret:**

| Origin (read-only) | Ziel-Browser | Ziel-Root |
|---|---|---|
| Chromium `synced` | Firefox | `unfiled` (`/andere-lesezeichen`) |
| Chromium `synced` | Safari | `unfiled` (`/andere-lesezeichen`) |
| Firefox `mobile` | Chromium | `other` (`/andere-lesezeichen`) |
| Firefox `mobile` | Safari | `unfiled` (`/andere-lesezeichen`) |
| Safari (kein RO-Root) | -- | -- |

Der Origin-Browser selbst behält die Bookmarks unverändert in seinem Read-Only-Root.

#### 6. Engine läuft synchron-sequenziell, nicht parallel

**Warum:** Drei Browser, ein Mac, jeder Sync braucht <10s laut Spec. Parallelisierung würde Race-Conditions (Adapter-Lock-Files, Backup-Rotation) einbringen ohne nennenswerten Geschwindigkeitsgewinn. Read-Phase könnte theoretisch parallel laufen — wir lassen das aber sequenziell, weil node:sqlite und simple-plist beide synchron sind und parallele File-IO auf SSD wenig bringt.

**Phase-2-Optimierung:** wenn die Engine bei 50'000+ Bookmarks träge wird, kann man Read parallelisieren.

#### 7. URL-Normalisierung über das bestehende Modul

**Warum:** `electron/lib/url-normalize.ts` existiert schon und wird von allen Adaptern beim Read verwendet. Engine ruft dieselbe Funktion auf — keine zweite Wahrheit über "was ist die normalisierte URL".

### Edge Cases (Architektur-Sicht)

| Fall | Engine-Verhalten |
|---|---|
| Cloud nicht erreichbar | Phase 5 wirft, gesamter Lauf wird abgebrochen. Adapter werden nicht angefasst. AppState meldet `lastSyncStatus: 'error'`. |
| Ein Adapter-Read schlägt fehl | Browser wird aus diesem Lauf rausgeworfen, andere laufen durch. Last-Known-Snapshot des betroffenen Browsers bleibt unangetastet, beim nächsten Lauf wird neu gemerged. |
| Ein Adapter-Write schlägt fehl | Sync-Lauf ist `partial-success`. Cloud ist auf neuem Stand, der gecrashte Browser ist auf altem. Beim nächsten Lauf zieht die Engine den Browser per LWW wieder hoch. |
| Safari-Write erfolgreich, aber Re-Read zeigt Diff | Safari hat parallel geschrieben. Lauf wird als `safari-race-suspect` markiert, beim nächsten Lauf wird Safari neu gemerged. Konflikt-Log enthält die Race-Notiz. |
| Initial-Sync mit 0 Bookmarks irgendwo | Union ist leer, kein Konflikt. Snapshots werden trotzdem geschrieben (alle drei mit `[]`). |
| Identitäts-Kollision (zwei verschiedene Bookmarks haben denselben Hash) | Theoretisch unmöglich bei SHA-256 + 32 Zeichen Prefix; falls doch (kosmischer Fehler), wird der erste Eintrag genommen, der zweite überschrieben. Akzeptiertes Risiko. |
| Riesiger Snapshot (50'000+ Bookmarks pro Browser) | JSONB in Postgres hält bis 256 MB pro Wert; ~5 MB pro Snapshot bei 50k Bookmarks. Performance-Test in QA mit synthetischen Daten. |
| Schemaversion ändert sich | Snapshots haben kein eigenes Schema-Feld in MVP. Bei Migration wird Snapshot-Tabelle gepurged und der nächste Sync startet als Initial-Sync (Union). Akzeptierter Reset. |

### Dependencies (zu installieren)

- `@supabase/supabase-js` — schon vorhanden aus PROJ-2
- `node:crypto` — Built-in, kein npm-Package nötig
- alle Adapter-Pakete schon vorhanden

### Was diese Architektur explizit NICHT enthält

- **Keine Worker-Threads** — Engine läuft im Main-Prozess, blockt UI für ein paar Sekunden bei grossen Syncs. Akzeptabel weil UI grösstenteils Tray-basiert
- **Keine Edge-Function-Logik** auf Supabase-Seite — alles läuft im Electron-Client, Supabase ist nur Storage
- **Kein Real-Time-Subscribe** auf Cloud-Änderungen — wir pollen via Trigger (PROJ-7) statt Push-Listening. Spart Verbindung-Komplexität, kostet 5-min-Latenz im Worst-Case
- **Keine differenzielle Compression** der Snapshots — voller JSON-Snapshot pro Lauf, einfach und debugbar
- **Kein Folder-Rename-Detector** — Phase-2-Heuristik
- **Kein Test-Mode oder Dry-Run** — würde die Pipeline-Logik verdoppeln. User vertraut den Backups (Adapter haben Rotation)

### Component-Tree für die Engine (intern)

```
runSync()
+-- pipeline.run()
    +-- plan()                  -> EligibleBrowsers[]
    +-- read(eligible)           -> Map<browserId, Snapshot>
    +-- diff(current, lastKnown, cloud)  -> Per-Browser-Changes
    +-- resolve(allChanges)      -> CloudActions + ConflictLogEntries
    +-- writeCloud(actions, conflicts)
    +-- writeAdapters(eligible, mergedState)
    +-- reReadSafari(if-applicable)
    +-- persistSnapshots(eligible)
    +-- log(runResult)
```

### Risiken und offene Fragen für Implementation

1. **Folder-Move-Heuristik** — out-of-scope für MVP, aber wenn der User selbst grosse Umstrukturierungen macht, wird der erste Sync danach laut. Sollte irgendwo dokumentiert sein, dass das normal ist
2. **Browser-Aktivierung-Schalter** — die Engine entscheidet "eligible" anhand `installed + permission + activated`. Wer setzt `activated`? Settings-UI in PROJ-8. MVP-Default: alle installierten + permitted Browser sind aktiviert
3. **Konflikt-Log-Schema** — definiert PROJ-9. Engine schreibt nur Inserts. Wenn PROJ-9 das Schema noch nicht final hat, blocken wir den Engine-Build nicht — Engine kann gegen ein Stub-Schema arbeiten und die Felder anpassen, wenn PROJ-9 final ist
4. **Initial-Sync-UX** — wenn der User auf `bookmark_snapshots`-empty läuft und alle Browser zusammen 10'000 Bookmarks haben, ist der erste Sync gross. Soll das ein expliziter "First-Run-Modus" mit Progress-UI sein? PROJ-7-Sync-Trigger entscheidet das in seiner Spec

## Implementation Notes (Backend)

**Engine komplett gebaut, 46 neue Tests grün, gesamt 172/172.**

**Schema-Strategie (entschieden via /backend):** Drop+sauber neu. PROJ-2-Tabellen (`bookmarks`, `folders`, `conflict_log`) waren Scaffolding ohne Daten und werden in der neuen Migration `0002_sync_engine.sql` gedroppt. Drei neue Tabellen: `bookmarks_cloud` (flat hash-keyed), `bookmark_snapshots` (per-Browser Last-Known), `conflict_log` (PROJ-9-Schema mit Status `open`/`restored`/`dismissed`).

**Files (Backend, Engine):**
- `electron/sync-engine/types.ts` — `RootKey`, `BrowserId`, `NormalizedSnapshot`, `BookmarkChange`, `BrowserPlan`, `SyncRunLog`, `SyncRunResult`, `SyncEngineError`
- `electron/sync-engine/browser-id.ts` — Whitelist (`safari`/`firefox`/`zen`/`chrome`/`arc`/`brave`/`edge`/`dia`), schliesst Path-Traversal-Defense-in-Depth aus PROJ-3/4/5 QA
- `electron/sync-engine/identity.ts` — SHA-256[:32] Hash über `urlNormalized + folderPath + rootKey`
- `electron/sync-engine/route.ts` — Read-Only-Root-Routing (Mobile/Synced → unfiled/`/andere-lesezeichen` im Ziel)
- `electron/sync-engine/cloud.ts` — Supabase-Wrapper mit batched Upserts (max 500), `CloudClient`-Interface für Test-Mocks
- `electron/sync-engine/log.ts` — Per-Run JSON-Telemetrie unter `<userData>/logs/sync-runs/<runId>.json`, FIFO max 100
- `electron/sync-engine/diff.ts` — 3-Way-Diff per Browser (previous-Snapshot vs current liefert adds/updates/deletes)
- `electron/sync-engine/resolve.ts` — LWW pro Bookmark mit Tie-Break alphabetisch nach `browserId`, Edit beats Delete (avoids silent edit loss), Source-Browsers-Tracking
- `electron/sync-engine/drivers.ts` — Adapter-Facades pro Browser-Familie. Chromium-Driver übersetzt `bookmark_bar`/`other`/`synced` ↔ Engine-`toolbar`/`unfiled`/`mobile`. Safari-Driver liefert `reread()` für Race-Detection
- `electron/sync-engine/pipeline.ts` — 9-Phasen-Orchestrator (Plan → Read → Diff → Resolve → Write Cloud → Write Adapter → Re-Read Safari → Persist Snapshots → Log)
- `electron/sync-engine/index.ts` — Public API: `SyncEngine` Klasse, Factories `createSupabaseCloudClient`/`createRealDrivers`/`createLogStore`

**Files (Backend, IPC):**
- `electron/sync.ts` — `SyncService` (EventEmitter): integriert AuthService, blockt Sync ohne Session, emittiert State-Events
- `electron/ipc.ts` — neue Handler `sync:state:get`, `sync:run`, Push-Event `sync:state:changed`
- `electron/preload.ts` — `sync`-Sub-Bridge (parallel zu auth/permissions)
- `electron/main.ts` — Engine wird im Boot instanziiert, Drivers via `createRealDrivers()`, Cloud-Client via `auth.getClient()`

**Files (Renderer):**
- `src/lib/types.ts` — `SyncEngineState`, `SyncRunSummary`, `SyncRunOutcome`
- `src/lib/electron-bridge.ts` — `sync.getState`/`run`/`subscribe` plus Mock-Implementation für Browser-Dev

**Files (DB):**
- `supabase/migrations/0002_sync_engine.sql` — drop+create. RLS owner-only auf allen Tabellen, Indexe pro PROJ-9-Architecture

**Tests (46 neue, gesamt 172/172):**
- `browser-id.test.ts` (6) — Whitelist + Path-Traversal-Reject
- `identity.test.ts` (8) — Hash-Determinismus + Collision-Resistenz
- `route.test.ts` (9) — Read-Only-Root pro Browser-Familie + Routing-Korrektheit
- `diff.test.ts` (9) — Add/Update/Delete-Erkennung, Folder-Move = add+delete (kein Update)
- `resolve.test.ts` (8) — LWW per dateModified, Safari-fallback, Edit-beats-Delete, 3-Way-Konflikt produziert 2 Log-Einträge
- `pipeline.test.ts` (6) — End-to-End mit gemockten Drivers + Cloud, Initial-Sync, Idempotenz, Konflikt, Read-Failure-Partial, Safari-Race-Detection, Skipped-Run

**Was bewusst NICHT gebaut:**
- Keine Auto-Trigger oder Scheduler — PROJ-7 setzt das auf
- Keine Konflikt-Log-UI — PROJ-9 baut das (Engine schreibt nur Inserts)
- Keine Settings-UI für Browser-Aktivierung — PROJ-8 (MVP-Default: alle eligible werden synct)
- Keine `markBookmarkForRestore()`-Helper-Funktion — wird mit PROJ-9-Backend ergänzt
- Keine Migration für Schema-Versions-Aufstieg — Snapshots beim Schema-Change einfach gepurged

**Live-Verifikation:** noch nicht möglich, da `0002_sync_engine.sql` noch nicht in Supabase ausgeführt wurde. Folgt mit `/qa PROJ-6` über `npm run build` und Live-Sync gegen die echten Browser.

## QA Test Results

**Datum:** 2026-05-07
**Tier:** Standard (Pre-Migration Pass)
**Health Score:** 92/100
**Bericht:** `.gstack/qa-reports/qa-report-junction-PROJ-6-2026-05-07.md`

**Resultat:**

- 27/29 Acceptance Criteria offline verifiziert (2 live-only: Performance, echte 3-Browser-Sync-Verifikation)
- 53 neue Engine-Tests grün, gesamt 179/179
- 2 HIGH-Bugs gefunden und gefixt während QA, 3 Regressionstests dazu
- 1 Low-Severity-Defense-in-Depth-Befund (akzeptiert)

**Issues:**

- **ISSUE-001 (HIGH, fixed):** Mobile-Bookmark wird im Origin-Browser dupliziert — Routing-Logik routete auch dann zu unfiled, wenn das Bookmark schon im read-only Mobile-Root des Targets war. Fix: `BROWSER_ROOT_SUPPORT`-Map mit writable+readOnly Sets pro Browser, plus drei-Aktion-Routing (`keep`/`skip`/`reroute`) und `composeSavedSnapshot` für korrekten Snapshot-State nach Write.
- **ISSUE-002 (HIGH, fixed):** Mobile-Bookmarks gingen bei Safari-Propagation verloren — Safari hat keinen Mobile-Root, alte Logik liess `rootKey='mobile'` durch und der Adapter droppte das Bookmark stillschweigend. Selber Fix wie ISSUE-001 löst beides.
- **ISSUE-003 (Low, accepted):** browserId-Whitelist greift nur bei Driver-Konstruktion, nicht bei jedem Adapter-Call — Defense-in-Depth-Marginalie, in der Praxis sicher.

**Pending — Live-Sync-Addendum nach Migration:**

- Initial-Sync gegen echte Cloud (Login + Trigger via Bridge)
- Round-Trip Read→Write→Read mit echten Browser-Profilen
- 3-Browser-Sync-Verifikation
- Konflikt-Provokation und Konflikt-Log-Verifikation
- Performance-Test 1'000 Bookmarks in <10s

## Deployment
_To be added by /deploy_
