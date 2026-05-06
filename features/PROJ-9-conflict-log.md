# PROJ-9: Konflikt-Log

## Status: Planned
**Created:** 2026-05-06
**Last Updated:** 2026-05-06 (Refined via /requirements)

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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
