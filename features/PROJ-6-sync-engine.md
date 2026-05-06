# PROJ-6: Sync-Engine

## Status: Planned
**Created:** 2026-05-06
**Last Updated:** 2026-05-06

## Dependencies
- PROJ-2 (Supabase Backend) für Cloud-State
- Mindestens ein Adapter (PROJ-3, PROJ-4 oder PROJ-5) für Read/Write

## User Stories
- Als Nutzer möchte ich, dass alle Bookmarks aus allen aktivierten Browsern in einen gemeinsamen Stand gemerged werden, damit jeder Browser denselben Inhalt hat
- Als Nutzer möchte ich, dass bei einem Konflikt die zuletzt geänderte Version gewinnt (Last-Write-Wins), damit Sync nie hängt
- Als Nutzer möchte ich, dass jede überschriebene Version im Konflikt-Log landet, damit ich nachvollziehen und ggf. wiederherstellen kann
- Als Nutzer möchte ich, dass die Ordner-Struktur beim Sync erhalten bleibt, auch wenn Browser unterschiedliche Hierarchien haben

## Acceptance Criteria
- [ ] Sync-Lauf folgt dem Schema: Read alle Adapter → Diff gegen Cloud-State → Resolve Konflikte (LWW) → Write Cloud → Write Adapter
- [ ] Bookmark-Identität basiert auf normalisierter URL + Titel + Ordner-Pfad (Hash als ID)
- [ ] Last-Write-Wins-Logik: bei Konflikt vergleicht Engine `updated_at`-Timestamps der zwei Versionen, neuere gewinnt
- [ ] Verlierende Version wird in `conflict_log` geschrieben (mit beiden Versionen als JSONB)
- [ ] Ordner-Mapping: jeder Browser hat eine Standard-Mapping-Regel (z.B. Chromium "Bookmark Bar" ↔ Safari "BookmarksBar" ↔ Firefox "Bookmarks Toolbar")
- [ ] Ordner-Mapping ist konfigurierbar pro Browser (default: automatisch)
- [ ] Sync ist idempotent: zweimal hintereinander ausgeführt ohne Änderung erzeugt keinen Konflikt-Log-Eintrag
- [ ] Sync ist atomic pro Browser: entweder ganzer Browser-Write erfolgreich oder Rollback zum Backup
- [ ] Performance: voller Sync mit 1000 Bookmarks und 3 Browsern in unter 10 Sekunden
- [ ] Sync-Lauf erzeugt strukturiertes Log (Anzahl gelesener/geschriebener Bookmarks, Konflikte, Dauer pro Adapter)

## Edge Cases
- Was passiert, wenn ein Bookmark in Browser A gelöscht und in Browser B unverändert bleibt? Engine erkennt Delete via fehlendes Bookmark + älterer `updated_at` in Cloud → löscht es überall
- Was passiert, wenn ein Bookmark in Browser A umbenannt und in Browser B verschoben wurde? Beide Änderungen sind orthogonal (verschiedene Felder), Engine merged beide
- Was passiert, wenn zwei Browser denselben Konflikt haben (z.B. unterschiedliche Titel)? LWW pro Feld oder pro Bookmark? Entscheidung: pro Bookmark als atomare Einheit, jüngere `updated_at` gewinnt komplett
- Was passiert mit duplizierten URLs in einem Browser (z.B. zweimal dieselbe URL in unterschiedlichen Ordnern)? Beide bleiben erhalten, Identität via URL+Titel+Ordner-Pfad
- Was passiert, wenn ein Adapter während des Syncs crasht? Andere Adapter laufen durch, gecrashter Adapter wird im Log markiert, Cloud-State bleibt konsistent
- Was passiert bei einem Bookmark ohne URL (z.B. Ordner-Eintrag in Chromium)? Wird als Folder behandelt, nicht als Bookmark
- Was passiert mit sehr alten Bookmarks ohne `updated_at` (Legacy-Daten)? Default-Wert: Epoch 0, frischer Eintrag gewinnt automatisch

## Technical Requirements (optional)
- Bookmark-Identität: SHA-256 Hash über `normalize(url) + title + folderPath`
- URL-Normalisierung: lowercase Host, trailing-slash entfernen, Tracking-Parameter (`utm_*`) entfernen (Liste in Settings später erweiterbar)
- Cloud-Push als Batched Upsert (max. 500 Rows pro Request)
- Konflikt-Log-Eintrag enthält: Bookmark-ID, beide Versionen als JSONB, Winner-Browser, Timestamp, Sync-Run-ID
- Sync-Lauf hat eine UUID, alle Logs/Konflikte werden mit dieser ID verknüpft (für Debugging)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
