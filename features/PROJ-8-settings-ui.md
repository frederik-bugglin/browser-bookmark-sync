# PROJ-8: Settings-UI

## Status: Planned
**Created:** 2026-05-06
**Last Updated:** 2026-05-06

## Dependencies
- PROJ-1 (Electron-Shell) für das Fenster

## User Stories
- Als Nutzer möchte ich pro Browser ein- oder ausschalten können, ob er am Sync teilnimmt
- Als Nutzer möchte ich pro Browser sehen, ob er installiert, erkannt und mit korrekten Permissions versehen ist
- Als Nutzer möchte ich Auto-Sync und das Intervall in einer klaren UI einstellen
- Als Nutzer möchte ich die App-Einstellungen jederzeit ohne Neustart ändern können

## Acceptance Criteria
- [ ] Settings-Fenster hat eine Browser-Liste mit Status pro Browser:
  - Installiert / nicht installiert
  - Erkannt (Bookmark-Datei gefunden) / nicht erkannt
  - Permissions OK / fehlt (relevant für Safari)
  - Toggle "In Sync einbeziehen" (default: an, wenn erkannt)
- [ ] Settings haben einen Toggle "Auto-Sync aktivieren"
- [ ] Settings haben einen Dropdown "Sync-Intervall" (5/15/30/60 Minuten)
- [ ] Settings haben einen Toggle "macOS-Notifications bei Fehlern"
- [ ] Settings haben einen Toggle "Beim Login starten"
- [ ] Settings haben einen Logout-Button
- [ ] Änderungen werden sofort gespeichert (kein "Apply"-Button nötig) und greifen ohne Neustart
- [ ] Settings werden in `electron-store` persistiert
- [ ] Settings-UI rendert in der Next.js-App, nutzt vorhandene shadcn/ui-Komponenten (Switch, Select, Card)

## Edge Cases
- Was passiert, wenn ein Browser während des Settings-Öffnens installiert/deinstalliert wird? Live-Detection bei jedem Öffnen des Settings-Fensters
- Was passiert, wenn ich alle Browser ausschalte? Sync läuft trotzdem (gegen Cloud-State), aber ohne Effekt. UI zeigt Hinweis "Keine Browser aktiv"
- Was passiert, wenn ich das Intervall auf 5 Min setze und einen sehr langsamen Sync habe? Wenn Sync länger als Intervall dauert, wird der nächste übersprungen (siehe PROJ-7)
- Was passiert, wenn das Logout während eines Syncs gedrückt wird? Sync wird abgebrochen, danach Logout durchgeführt
- Was passiert mit Settings bei einem App-Update? Schema-Migration im Settings-Store (Version-Field)

## Technical Requirements (optional)
- Settings-Schema typed via Zod
- shadcn/ui-Komponenten: Switch, Select, Card, Badge (für Status), Button
- Storage: `electron-store` mit Schema-Validation
- Settings-Reactivity: Settings-Änderung triggert Event, das andere Module (Sync-Engine, Tray) abhören

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
