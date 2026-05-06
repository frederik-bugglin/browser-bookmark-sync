# PROJ-7: Sync-Trigger (manuell und automatisch)

## Status: Planned
**Created:** 2026-05-06
**Last Updated:** 2026-05-06

## Dependencies
- PROJ-1 (Electron-Shell) für Tray-UI
- PROJ-6 (Sync-Engine) als ausgeführte Aktion

## User Stories
- Als Nutzer möchte ich aus dem Menüleisten-Icon mit einem Klick einen Sync starten, damit ich volle Kontrolle habe
- Als Nutzer möchte ich Auto-Sync einschalten können, damit ich nie manuell triggern muss
- Als Nutzer möchte ich das Auto-Intervall einstellen können (z.B. alle 5/15/60 Minuten), damit ich Performance vs. Aktualität abwägen kann
- Als Nutzer möchte ich, dass Auto-Sync auch dann läuft, wenn ich gerade aktiv im Browser arbeite (nicht-blockierend)
- Als Nutzer möchte ich sehen, wann der letzte Sync war und ob er erfolgreich war

## Acceptance Criteria
- [ ] Tray-Icon-Menü hat einen "Jetzt synchronisieren"-Button, der einen Sync auslöst
- [ ] Während eines Syncs zeigt das Tray-Icon einen Spinner oder verändert seinen Zustand (Active-Indicator)
- [ ] Settings haben einen Toggle "Auto-Sync aktivieren" (default: an)
- [ ] Settings haben einen Dropdown für Intervall: 5 / 15 / 30 / 60 Minuten (default: 15)
- [ ] Auto-Sync läuft per `setInterval` im Main-Prozess, überlappt sich nicht (wenn ein Sync läuft, wird der nächste übersprungen)
- [ ] Optional: File-Watcher pro Adapter (chokidar) erkennt Bookmark-Änderungen und triggert Debounced-Sync (15s nach letzter Änderung)
- [ ] Sync wird nicht ausgelöst, wenn keine Internet-Verbindung besteht (silent skip, retry beim nächsten Tick)
- [ ] Letzter Sync-Zeitpunkt und Status (success/error) werden im Tray-Menü und in den Settings angezeigt
- [ ] Bei Sync-Fehler erscheint optional eine macOS-Notification (in Settings togglebar)

## Edge Cases
- Was passiert, wenn der Mac in den Sleep geht während eines Syncs? Sync wird beim Aufwachen nicht automatisch fortgesetzt, läuft beim nächsten Trigger neu
- Was passiert, wenn sich das Intervall ändert während ein Sync läuft? Neues Intervall greift erst nach Abschluss des aktuellen Syncs
- Was passiert bei sehr kurzen Intervallen (5 Min) plus File-Watcher? Debounce-Schutz: ein Sync pro Minute maximal, danach Cooldown
- Was passiert, wenn der Nutzer manuell triggert während Auto-Sync läuft? Manueller Klick wird gequeued oder ignoriert (UI-Hinweis: "Sync läuft bereits")
- Was passiert bei vielen aufeinanderfolgenden Bookmark-Änderungen (Browser-Bulk-Edit)? File-Watcher debounce verhindert Sync-Storm
- Was passiert, wenn der User die App quittet während Sync läuft? Aktueller Sync wird abgebrochen (Adapter rollback zum Backup)

## Technical Requirements (optional)
- File-Watcher via `chokidar` (cross-platform, robuster als `fs.watch`)
- Debounce: 15 Sekunden nach letzter Änderung der Bookmark-Datei
- Sync-Mutex: gleichzeitig nie mehr als ein Sync-Lauf
- Sync-State persistiert (last sync time, last sync status) zwischen App-Neustarts
- macOS-Notifications via Electron `Notification`-API

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
