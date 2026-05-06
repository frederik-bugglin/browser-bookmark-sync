# Product Requirements Document

## Vision
Ein macOS-Desktop-Tool, das Bookmarks zwischen verschiedenen Desktop-Browsern (Chrome, Safari, Firefox, Arc, Brave, Edge, Zen, Dia) automatisch synchronisiert. iOS-Pendants ziehen über die nativen Browser-Sync-Mechanismen (iCloud, Google Sync, Firefox Sync) automatisch nach. Ziel: ein einheitlicher Bookmark-Stand auf allen Geräten, ohne dass ein einzelner Browser zur Hauptquelle erklärt werden muss.

## Target Users
**Primär:** Power-User auf macOS, die mehrere Browser parallel nutzen, etwa für unterschiedliche Kontexte (Arbeit, Privat, Recherche). Konkret: Designer, Entwickler, Researcher.

**Pain Points:**
- Bookmarks fragmentieren über mehrere Browser hinweg
- Native Sync-Mechanismen funktionieren nur innerhalb eines Browser-Ökosystems (Chrome ↔ Chrome, Safari ↔ Safari)
- Manuelles Pflegen oder Export/Import ist mühsam und fehleranfällig
- Es gibt aktuell kein Tool, das alle macOS-Browser auf einer Maschine ohne Browser-Extensions zusammenführt

## Core Features (Roadmap)

| Priority | Feature | Status |
|----------|---------|--------|
| P0 (MVP) | PROJ-1: Electron-Shell und Menüleisten-App | Planned |
| P0 (MVP) | PROJ-2: Supabase Backend und Auth | Planned |
| P0 (MVP) | PROJ-3: Bookmark-Adapter Chromium-Familie | Planned |
| P0 (MVP) | PROJ-4: Bookmark-Adapter Firefox und Zen | Planned |
| P0 (MVP) | PROJ-5: Bookmark-Adapter Safari | Planned |
| P0 (MVP) | PROJ-6: Sync-Engine | Planned |
| P0 (MVP) | PROJ-7: Sync-Trigger (manuell und automatisch) | Planned |
| P0 (MVP) | PROJ-8: Settings-UI | Planned |
| P0 (MVP) | PROJ-9: Konflikt-Log | Planned |

## Success Metrics
- Sync läuft fehlerfrei zwischen mindestens drei verschiedenen Browser-Familien (Chromium, Firefox, Safari)
- Latenz im Auto-Modus: Bookmark-Änderung in Browser A erscheint innerhalb von fünf Minuten in Browser B
- Keine stillen Datenverluste: jede Last-Write-Wins-Entscheidung ist im Konflikt-Log nachvollziehbar
- Initialer Setup pro Browser unter zwei Minuten (Permissions inklusive)
- Stabilität: Sync läuft eine Woche im Auto-Modus ohne Crash oder Datei-Korruption

## Constraints
- **Plattform:** macOS only (Apple Silicon und Intel). Kein Windows, kein Linux.
- **Solo-Projekt:** Frederik baut allein, kein Team
- **Stack:** Electron + Next.js + TypeScript + Supabase
- **Safari:** benötigt zwingend macOS Full Disk Access (TCC-Permission). Kein Workaround.
- **Firefox/Zen:** `places.sqlite` ist gelockt während der Browser läuft. Lösung: Datei kopieren, dann lesen.
- **Single User MVP:** Architektur ist Multi-Mac-ready (Supabase-Auth, Device-Konzept), aber MVP synchronisiert nur Browser auf einem Mac.

## Non-Goals
- Keine eigene iOS-App (iOS läuft über native Browser-Sync der jeweiligen Hersteller)
- Keine Windows- oder Linux-Unterstützung
- Keine Browser-Extensions
- Kein Multi-User-Sharing (Bookmarks zwischen verschiedenen Personen)
- Kein Bookmark-Manager mit Suche, Tags oder erweiterter Organisation
- Kein Import aus Bookmark-Diensten wie Pocket, Raindrop, Pinboard
- Keine Verschlüsselung End-to-End (Supabase RLS ist die Sicherheitsgrenze für v1)

---

Use `/requirements` to create detailed feature specifications for each item in the roadmap above.
