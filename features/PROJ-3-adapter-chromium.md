# PROJ-3: Bookmark-Adapter Chromium-Familie

## Status: Planned
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
- [ ] Adapter erkennt automatisch installierte Chromium-Browser und deren Profile auf macOS
- [ ] Read-Pfade pro Browser sind korrekt:
  - Chrome: `~/Library/Application Support/Google/Chrome/Default/Bookmarks`
  - Brave: `~/Library/Application Support/BraveSoftware/Brave-Browser/Default/Bookmarks`
  - Edge: `~/Library/Application Support/Microsoft Edge/Default/Bookmarks`
  - Arc: `~/Library/Application Support/Arc/User Data/Default/Bookmarks`
  - Dia: (Pfad ermitteln, ggf. dynamisch via App-Bundle)
- [ ] Read parsed das JSON-Schema korrekt: `roots.bookmark_bar`, `roots.other`, `roots.synced` mit Children-Tree
- [ ] Read normalisiert auf das interne Bookmark-Modell (URL, Titel, Ordner-Pfad, Created/Modified)
- [ ] Write erzeugt valides Chromium-JSON inklusive `checksum`-Feld (Chromium prüft dies, sonst wird die Datei rejected)
- [ ] Write erstellt Backup der Original-Datei vor Überschreiben
- [ ] Vor dem Schreiben prüft der Adapter, ob der Browser läuft, und warnt den Nutzer (Chrome überschreibt sonst die Datei beim Beenden)
- [ ] Unit-Tests mit Fixture-Dateien für jede Browser-Variante

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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
