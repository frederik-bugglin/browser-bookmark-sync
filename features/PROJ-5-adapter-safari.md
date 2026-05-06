# PROJ-5: Bookmark-Adapter Safari

## Status: Planned
**Created:** 2026-05-06
**Last Updated:** 2026-05-06

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
- [ ] Bookmarks-Bar (`BookmarksBar`), Reading-List (`com.apple.ReadingList`) und Bookmark-Menu werden korrekt unterschieden
- [ ] Unit-Tests mit Fixture-plist-Dateien

## Edge Cases
- Was passiert, wenn der User Full Disk Access verweigert? Safari wird im Sync übersprungen, Konflikt-Log enthält Eintrag, Settings zeigen Status "Permission fehlt"
- Was passiert, wenn der User die Permission später widerruft? Adapter erkennt das beim nächsten Sync, springt automatisch ins Onboarding
- Was passiert mit der Reading List? MVP: ignorieren, Reading List ist eine separate Datenstruktur und nicht Teil des klassischen Bookmark-Sets. Optional in Settings späterer Phase.
- Was passiert mit iCloud-synchronisierten Bookmarks? Safari speichert sie in derselben plist. Schreiben wirkt sich also auch auf iCloud aus. Das ist erwünscht (Brücke zu iOS Safari).
- Was passiert, wenn macOS die plist im Hintergrund umstrukturiert (z.B. nach Update)? Adapter schreibt nicht blind, sondern parsed zuerst, modifiziert in-place und schreibt zurück. Unbekannte Felder werden erhalten.
- Was passiert, wenn die plist gross ist (5000+ Bookmarks)? Read und Write müssen unter 2 Sekunden bleiben (Performance-Test in QA)

## Technical Requirements (optional)
- plist-Parser: `simple-plist` oder `bplist-parser` (TypeScript-fähig)
- Atomarer Write über `fs.writeFile` zu Temp + `fs.rename`
- Probe-Mechanismus für Permission: `fs.accessSync(path)` mit Catch auf EACCES ist robuster als `fs.statSync`
- TCC-Deeplink: Electron `shell.openExternal()` mit URL `x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles` (kein eigener Shell-Spawn nötig)
- Onboarding-UI nutzt das bereits existierende Next.js-UI aus PROJ-1

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
