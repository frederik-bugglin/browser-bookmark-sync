# PROJ-4: Bookmark-Adapter Firefox und Zen

## Status: Planned
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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
