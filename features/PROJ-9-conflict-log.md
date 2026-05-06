# PROJ-9: Konflikt-Log

## Status: Planned
**Created:** 2026-05-06
**Last Updated:** 2026-05-06

## Dependencies
- PROJ-2 (Supabase Backend) für `conflict_log`-Tabelle
- PROJ-6 (Sync-Engine) als Erzeuger der Einträge

## User Stories
- Als Nutzer möchte ich nach einem Sync sehen, welche Bookmarks überschrieben wurden, damit ich nichts unbemerkt verliere
- Als Nutzer möchte ich pro Konflikt die "verlierende" Version einsehen, damit ich sie ggf. manuell wiederherstellen kann
- Als Nutzer möchte ich das Konflikt-Log nach Datum, Browser oder Bookmark filtern, damit ich gezielt suchen kann
- Als Nutzer möchte ich bei kritischen Konflikten benachrichtigt werden (optional)

## Acceptance Criteria
- [ ] Konflikt-Log-Seite zeigt eine Tabelle aller Konflikte (jüngste zuerst)
- [ ] Spalten: Datum, Browser-A, Browser-B, Bookmark-Titel, Winner, Aktion (Detail-Button)
- [ ] Detail-Ansicht zeigt beide Versionen (URL, Titel, Ordner) und markiert Unterschiede
- [ ] Detail-Ansicht hat einen Button "Verlierende Version wiederherstellen" (überschreibt aktuellen Cloud-State und triggert nächsten Sync)
- [ ] Filter: Datums-Range, Browser-Pair, Suche im Titel
- [ ] Pagination oder Infinite-Scroll bei mehr als 100 Einträgen
- [ ] Konflikt-Log wird automatisch nach 90 Tagen gepruned (in Settings konfigurierbar)
- [ ] Tray-Icon zeigt Badge oder Indicator, wenn neue Konflikte seit dem letzten Öffnen entstanden sind

## Edge Cases
- Was passiert, wenn das Wiederherstellen einer alten Version selbst einen Konflikt erzeugt? Neuer Konflikt-Log-Eintrag, normale LWW-Logik
- Was passiert, wenn eine Bookmark-ID nicht mehr existiert (zwischenzeitlich gelöscht)? Detail zeigt "Bookmark gelöscht", Wiederherstellen erstellt es neu
- Was passiert mit sehr vielen Konflikten (1000+)? Pagination, Server-seitiges Filtern via Supabase
- Was passiert, wenn der User offline ist und Konflikte ansehen will? Letzte X Konflikte werden lokal gecacht (z.B. die letzten 50)
- Was passiert mit Konflikten, die exakt gleichzeitig entstanden sind (gleiche `updated_at`)? Tie-Breaker: alphabetische Browser-Reihenfolge, dokumentiert im Log

## Technical Requirements (optional)
- shadcn/ui-Komponenten: Table, Dialog (Detail), DatePicker, Input (Suche), Badge
- Konflikt-Log-Daten kommen via Supabase-Query (RLS-geschützt)
- Diff-Visualisierung mit `diff`-Library (Wort-Level)
- Pruning via Supabase Edge Function oder lokal beim App-Start
- Notification-Mechanismus via macOS-Notifications wenn neue Konflikte seit letztem Öffnen (siehe PROJ-7)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
