# PROJ-6: Sync-Engine

## Status: Planned
**Created:** 2026-05-06
**Last Updated:** 2026-05-06 (Refined via /requirements)

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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
