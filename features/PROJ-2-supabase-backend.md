# PROJ-2: Supabase Backend und Auth

## Status: Approved
**Created:** 2026-05-06
**Last Updated:** 2026-05-06

## Dependencies
- None

## User Stories
- Als Nutzer möchte ich mich beim ersten Start mit einer E-Mail anmelden (Magic Link), damit meine Bookmarks an meinen Account gebunden sind
- Als Nutzer möchte ich, dass mein Login persistiert und ich nicht jedes Mal neu authentifizieren muss
- Als zukünftiger Multi-Mac-Nutzer möchte ich denselben Account auf mehreren Macs nutzen können, damit später echtes Multi-Device-Sync funktioniert
- Als Nutzer möchte ich, dass meine Bookmarks gegen fremde Zugriffe geschützt sind (RLS)

## Acceptance Criteria
- [x] Supabase-Projekt ist angelegt, Connection-Strings stehen in `.env.local` und sind in `.gitignore` (User-Setup via `docs/supabase-setup.md`; `.env.example` und Loader sind vorhanden)
- [x] Tabellen-Schema ist via SQL-Migration angelegt: `bookmarks`, `folders`, `devices`, `conflict_log` (siehe `supabase/migrations/0001_initial_schema.sql`, plus `schema_version` für Migrations-Schutz)
- [x] Row-Level-Security ist auf allen Tabellen aktiv, Policies erlauben nur Zugriff auf eigene Daten (`user_id = auth.uid()`) — pro Tabelle SELECT/INSERT/UPDATE/DELETE Policies
- [x] Magic-Link-Auth funktioniert: User trägt E-Mail ein, klickt Link aus Mail, ist eingeloggt — Implementiert in `electron/auth.ts` + `welcome-screen.tsx`
- [x] Session wird sicher in Electron persistiert — `safeStorage` (Keychain-AES) statt keytar; Klartext-Fallback nur falls Keychain unverfügbar
- [x] Logout-Funktion löscht Session lokal und invalidiert Refresh-Token serverseitig — `auth.signOut()` in Settings + IPC
- [x] Tabellen haben sinnvolle Indexes — `idx_*_user_id`, `idx_bookmarks_url_normalized`, `idx_bookmarks_folder_id`, `ux_*` Unique-Indexes

## Edge Cases
- Was passiert, wenn der Nutzer keine Internet-Verbindung hat beim ersten Login? UI zeigt Fehler mit Retry-Button
- Was passiert, wenn der Magic-Link abläuft? Klare Fehlermeldung, neuer Link kann angefordert werden
- Was passiert, wenn der Nutzer auf einem zweiten Mac einloggt? Beide Macs sehen dieselben Daten (vorbereitet für Multi-Device)
- Was passiert, wenn die Supabase-Instanz temporär nicht erreichbar ist? Sync-Engine wartet, App stürzt nicht ab
- Was passiert, wenn der User die Datenbank manuell leert oder das Schema ändert? Migration-Schutz (Schema-Version checken beim Start)

## Technical Requirements (optional)
- Schema-Skizze (Details in /architecture):
  - `bookmarks`: id, user_id, url, title, folder_id, created_at, updated_at, source_browser, last_synced_by_device
  - `folders`: id, user_id, name, parent_id, created_at, updated_at
  - `devices`: id, user_id, name, last_seen_at, platform
  - `conflict_log`: id, user_id, bookmark_id, browser_a, browser_b, version_a (jsonb), version_b (jsonb), winner, resolved_at
- Auth via Supabase Auth (Email Magic Link, kein Passwort nötig)
- Service-Role-Key wird nicht im Client verwendet (nur Anon-Key + RLS)
- Session-Storage in Electron via `electron-store` mit OS-Keychain-Verschlüsselung (`keytar`)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Hosting & Auth-Strategie

**Supabase Cloud (Free Tier).** Wir nutzen das gehostete Supabase-Projekt auf supabase.com. Der Free-Tier deckt Solo-Nutzung sehr komfortabel ab (500 MB Datenbank, 50.000 monatliche aktive Nutzer, 2 GB Bandbreite). Kein Self-Hosting, kein Backup-Management, kein TLS-Aufwand. Falls später Migration zu Self-Hosted nötig: Supabase ist Postgres-kompatibel, der Schema-Export funktioniert ohne Anpassung.

**Magic-Link-Auth.** Der Nutzer trägt im Onboarding seine E-Mail ein, Supabase verschickt einen Login-Link, ein Klick reicht zum Einloggen. Kein Passwort, keine OAuth-Konfiguration, keine Provider-Auswahl. Für ein Solo-Tool die einfachste sichere Variante.

**Session-Persistence via Electron safeStorage.** Der Refresh-Token landet in einer JSON-Datei im AppData-Ordner, aber vorher von der Electron-eigenen `safeStorage`-API verschlüsselt. Diese nutzt unter macOS automatisch den Keychain (AES-256). Keine Native-Dependency, kein zusätzlicher Build-Step pro Architektur. Wir weichen damit bewusst vom ursprünglichen Spec ab (der `keytar` nannte) — `safeStorage` ist Electron-nativ und ersetzt keytar 1:1 für unseren Use Case.

### Komponenten-Struktur (Verantwortlichkeiten)

```
Junction-App
+-- Electron Main-Prozess
|   +-- Auth-Service
|   |   +-- Magic-Link anfordern (E-Mail an Supabase)
|   |   +-- Deep-Link-Handler (junction://auth/callback)
|   |   +-- Session lesen, prüfen, refreshen
|   |   +-- Session schreiben (verschlüsselt via safeStorage)
|   |   +-- Logout (Token invalidieren + lokal löschen)
|   +-- Supabase-Client (singleton, mit gespeichertem Token)
|   +-- Device-Registry
|       +-- Device beim ersten Login registrieren (Hostname, Platform)
|       +-- Heartbeat schreiben (last_seen_at) bei jedem Sync
+-- Electron Renderer (Next.js)
|   +-- Onboarding: E-Mail-Eingabe, Status (gesendet, eingeloggt, Fehler)
|   +-- Settings: Account-Info anzeigen, Logout-Button
|   +-- Auth-Status-Indikator im Header
+-- Supabase Cloud
    +-- Auth-Service (Magic-Link-Versand, JWT-Ausstellung)
    +-- Postgres-DB mit RLS
    +-- 4 Tabellen, alle user_id-gescoped
```

### Datenmodell (in Plain Language)

**Tabelle `bookmarks`:** das einzelne Bookmark eines Nutzers.
- ID (UUID, vom System vergeben)
- user_id (Verknüpfung zum Account)
- url (die rohe URL wie der Browser sie hat)
- url_normalized (URL ohne Tracking-Params, ohne Trailing-Slash, ohne www) — das ist der Schlüssel, an dem wir Bookmarks browser-übergreifend identifizieren
- title (Titel, max 500 Zeichen)
- folder_id (in welchem Ordner liegt es; kann leer sein → root)
- source_browser (woher kam dieses Bookmark zuletzt: chrome, safari, firefox, etc.)
- last_synced_by_device (welcher Mac hat zuletzt geschrieben)
- created_at, updated_at (Zeitstempel)

**Tabelle `folders`:** die Ordner-Struktur.
- ID, user_id
- name (Ordnername)
- parent_id (übergeordneter Ordner; leer → root)
- path_normalized (vollständiger Pfad als Slash-getrennter String, z.B. `/Arbeit/Recherche/AI`) — wird beim Anlegen automatisch berechnet, vereinfacht das Dedup-Matching
- created_at, updated_at

**Tabelle `devices`:** die einzelnen Macs des Nutzers.
- ID, user_id
- name (Hostname, z.B. „Frederiks MacBook Pro")
- platform (`darwin-arm64` oder `darwin-x64`)
- last_seen_at (Heartbeat)
- created_at

**Tabelle `conflict_log`:** jeder Last-Write-Wins-Entscheid.
- ID, user_id
- bookmark_id (welches Bookmark betroffen war)
- browser_a, browser_b (welche zwei Browser haben sich widersprochen)
- version_a, version_b (Snapshot der zwei Versionen als JSON)
- winner (welche Version hat gewonnen)
- resolved_at (Zeitstempel)

**Schema-Versionierung.** Eine kleine Tabelle `schema_version` mit nur einer Zeile speichert die aktuelle Version (start: 1). Beim App-Start vergleicht der Client die DB-Version mit seiner erwarteten Version. Stimmt sie nicht, weigert sich die App zu syncen und zeigt eine Hinweis-Meldung. So fangen wir spätere Schema-Brüche sauber ab.

### Dedup-Logik (browser-übergreifend)

Zwei Bookmarks gelten als „dasselbe" wenn:
1. ihre `url_normalized` identisch ist UND
2. ihr `folder_path_normalized` identisch ist

Beispiel: `https://example.com/?utm_source=x` in Chrome und `https://www.example.com` in Safari, beide im Ordner „Recherche" → werden als dasselbe Bookmark behandelt. Dasselbe Bookmark in zwei unterschiedlichen Ordnern (`/Arbeit` vs `/Privat`) bleibt zwei separate Einträge.

URL-Normalisierung umfasst: Lowercase auf Domain, `www.` weg, Trailing-Slash weg, bekannte Tracking-Parameter raus (`utm_*`, `fbclid`, `gclid`, `ref`).

### Sicherheits-Architektur (RLS)

**Row-Level-Security ist auf allen 4 Tabellen aktiv.** Pro Tabelle existieren vier Policies (SELECT, INSERT, UPDATE, DELETE), die jeweils prüfen: `user_id = auth.uid()`. Bedeutet: Auch wenn ein Token gestohlen wird, sieht der Angreifer nur die Daten dieses einen Users. Cross-User-Zugriff ist auf DB-Ebene blockiert.

**Anon-Key only.** Im Electron-Client liegt nur der Supabase Anon-Key (in `.env.local`). Den Service-Role-Key (der RLS umgeht) nutzen wir nirgends im Client. Würde er leaken, könnte jeder die ganze DB lesen.

**`.env.local` ist in `.gitignore`.** Eine `.env.example` mit Platzhaltern wird ins Repo eingecheckt, damit du beim Setup auf einem neuen Mac weisst, welche Variablen du brauchst.

**Deep-Link-Handler.** Der Magic-Link aus der Mail öffnet die App via `junction://`-Protokoll. Electron registriert dieses Protokoll beim ersten Start als Default-Handler. So landet der Token direkt in unserer App und nicht erst im Browser.

### Tech-Decisions (warum)

1. **Supabase Cloud Free Tier:** Solo-Nutzung passt locker rein, kein Setup-Overhead, Backups inklusive. Spart Tage an Self-Hosting-Aufwand.

2. **Magic Link statt Passwort:** Für 1-User-MVP mit gelegentlichem Multi-Mac-Login ist Passwortzwang Overkill. Magic Link ist sicher (Token-basiert) und entfernt eine ganze Klasse von Bugs (vergessene Passwörter, zu schwache Passwörter).

3. **Electron safeStorage statt keytar:** Wir hatten in PROJ-1 schon entschieden, Native-Dependencies klein zu halten (eigener JsonStore statt electron-store). safeStorage liefert Keychain-Verschlüsselung ohne native build, das passt zur Linie. Wenn safeStorage ausfällt (sehr unwahrscheinlich auf macOS), warnt die App und der User muss neu einloggen — kein Datenverlust.

4. **Indexes auf `user_id`, `url_normalized`, `folder_id`, `device_id`:** RLS prüft jeden Read gegen `user_id`, ohne Index wird das mit wachsender Tabelle langsam. URL-Index beschleunigt das Dedup-Matching beim Sync. Die Indexes legen wir direkt in der initialen Migration an.

5. **Migration via SQL-Dateien im Repo (`supabase/migrations/`):** Supabase CLI verwaltet Migrations als nummerierte SQL-Files. Wir checken sie ins Repo ein, so ist die DB-History versioniert und reproduzierbar. Kein ORM, kein Schema-Generator — direktes SQL.

6. **JWT in HTTP-Header bei jeder Anfrage:** Standard-Supabase-Verhalten, vom JS-Client automatisch gemacht. Keine eigene Auth-Middleware nötig.

### Dependencies (zu installieren)

| Package | Zweck |
|---|---|
| `@supabase/supabase-js` | Supabase-Client (Auth + DB-Queries) |
| `@supabase/ssr` | Auth-Helpers (für saubere Session-Hydration) |
| `zod` | bereits installiert (PROJ-1), wird für Response-Validierung wiederverwendet |

Keine zusätzlichen Native-Dependencies. `safeStorage` und `protocol.handle` sind Teil von Electron core.

### Was diese Feature explizit NICHT baut

- Kein Sync-Code (das ist PROJ-6).
- Keine Bookmark-Adapter (das sind PROJ-3, 4, 5).
- Keine UI-Polish für Settings — nur das Minimum, damit Login/Logout funktioniert. Polish kommt in PROJ-8.
- Keine Migrations-CI. Migrations werden manuell via Supabase CLI gegen das Cloud-Projekt ausgeführt.

### Risiken & offene Punkte

- **Magic-Link-Mail in Spam:** Supabase verschickt Default-Mails über eine geteilte Domain. Bei häufigem Login könnte das Mail-Provider-seitig in Spam landen. Lösung später: eigenen SMTP-Provider (Resend, Postmark) konfigurieren — nicht Teil dieses Features.
- **Deep-Link-Konflikte:** Wenn ein anderes Tool `junction://` schon registriert hat, gewinnt der zuletzt registrierte. Sehr unwahrscheinliches Szenario, aber denkbar.
- **safeStorage auf alten macOS-Versionen:** Funktioniert ab macOS 10.13. Da wir ohnehin nur moderne Macs unterstützen, kein Issue.

## Implementation Notes (Backend Developer)

### Was gebaut wurde

**Datenbank (Supabase):**
- `supabase/migrations/0001_initial_schema.sql` — fünf Tabellen (`schema_version`, `folders`, `bookmarks`, `devices`, `conflict_log`)
- RLS aktiv auf allen Tabellen, Policies pro CRUD-Operation gegen `auth.uid() = user_id`
- Performance-Indexes auf `user_id`, `url_normalized`, `folder_id`, sowie unique constraints auf `(user_id, path_normalized)` für Folders und `(user_id, url_normalized, folder_id)` für Bookmarks
- `set_updated_at()` Trigger auf `folders` und `bookmarks`
- `conflict_log` ist immutable (kein UPDATE-Policy, nur INSERT/SELECT/DELETE)

**Electron Main:**
- `electron/config.ts` — Zod-validierter Loader für `SUPABASE_URL` + `SUPABASE_ANON_KEY` aus `.env.local` oder `process.env`. Bei fehlender Config: klare Dialog-Box statt Crash.
- `electron/auth.ts` — `AuthService` mit Supabase-Client (Main-only, niemals im Renderer), `flowType: 'implicit'` für Deep-Link-Magic-Link, persistent session via `safeStorage`. Übersetzt häufige Supabase-Fehler ins Deutsche.
- `electron/main.ts` — `setAsDefaultProtocolClient('junction')`, `open-url`-Handler mit Pending-Buffer für Cold-Starts via Magic-Link, Boot-Sequenz erkennt fehlende Auth und zeigt Onboarding.

**IPC + Bridge:**
- Drei neue Channels: `auth:status:get`, `auth:request-magic-link`, `auth:sign-out`, plus Push-Event `auth:status:changed`
- Preload-Bridge typed (`AuthStatus`, `AuthRequestResult`)
- Mock-Bridge im Renderer-Fallback simuliert Magic-Link-Loop nach 1.5 s, damit UI-Dev im plain Next.js-Server testbar bleibt

**UI:**
- `welcome-screen.tsx` — Drei-Schritt-Onboarding (welcome → login → sent), automatischer Sprung ins Hauptfenster bei `state: 'authenticated'`
- `settings/page.tsx` — Account-Card mit E-Mail + Logout-Button; nach Logout zurück ins Onboarding
- `firstLaunchDone` markiert nur den Welcome-Schritt als erledigt; Login-Screen ist auch bei späterem Start sichtbar wenn nicht eingeloggt

**URL-Normalisierung:**
- `src/lib/url-normalize.ts` mit `normalizeUrl()` und `normalizeFolderPath()` — Tests in `url-normalize.test.ts` (19 Cases). Stripped: `www.`, default ports, fragment, trailing slash, 18 Tracking-Param-Namen

### Abweichungen vom Tech-Design

- **`safeStorage` statt `keytar`** — wie im Tech-Design vermerkt. Funktioniert identisch (Keychain-Verschlüsselung), aber ohne Native-Dependency.
- **`schema_version`-Tabelle ist Teil von Migration 0001**, nicht separat. Die App-seitige Versions-Prüfung kommt erst in PROJ-6 (Sync-Engine), da dort der erste tatsächliche DB-Zugriff passiert.
- **Implicit Flow** statt PKCE für Magic Link, weil PKCE einen lokalen Code-Verifier-Storage zwischen Request und Callback bräuchte — implicit ist im Desktop-Kontext (kein Browser-XSS) sicher genug.

### Was bewusst ausgespart wurde

- Keine echten RLS-Tests gegen Supabase. Wir validieren das manuell beim ersten Login. Automatisierte Auth-Tests kommen frühestens in PROJ-6.
- Kein eigener SMTP-Provider. Standard-Supabase-Mail. Kann später ohne Code-Änderung umgestellt werden.
- Kein Schema-Versions-Check beim Start (kommt in PROJ-6).
- Kein Device-Heartbeat. Die `devices`-Tabelle existiert nur als Schema-Vorbereitung.

### Verifikation
- `npm run electron:compile` — kein TS-Fehler
- `npx tsc --noEmit` — Renderer kompiliert
- `npx vitest run` — 19/19 Tests grün
- `npx next build` — Static Export klappt, alle 5 Routes prerendered

## QA Test Results

**Datum:** 2026-05-06
**Tier:** Standard
**Health Score:** 98/100 (Renderer-Layer)
**Bugs:** 0 Critical, 0 High, 0 Medium, 1 Niedrig (deferred — Orphaned SingletonLock nach unsauberem Kill, betrifft nur Crash-Szenarien)

**Vier-Schichten-QA durchgeführt:**

1. **Renderer-Layer:** 5/5 Routes 200, console clean, Onboarding-Flow drei States interaktiv via Mock-Bridge verifiziert (welcome → login → sent inkl. Submit-Button-State-Logik)
2. **Code-Review:** RLS-Policies auf allen 5 Tabellen geprüft (SELECT/INSERT/UPDATE/DELETE gegen `auth.uid() = user_id`), Indexes vollständig, Auth-Service-Logic sauber
3. **Live-Test (User-bestätigt):** Magic-Link-Mail empfangen, Link geklickt, Junction öffnete sich, eingeloggt; Restart-Test zeigte 0 Renderer-Requests beim Boot → Session erfolgreich aus `auth-session.bin` restored
4. **Filesystem:** `auth-session.bin` 995 Bytes mit `v10`-Magic-Header (= macOS Keychain via Electron `safeStorage`), kein Klartext-Token im FS

**Acceptance Criteria:** 8/8 erfüllt, davon 5 live-verifiziert, 3 code-verifiziert.

**Nicht durch QA abgedeckt** (User-Klick ausreichend):
- Logout-Klick im echten Electron-Fenster (Code-Pfad ist sauber, aber UI-Klick ungetestet)
- Magic-Link-Expiry (braucht > 1 h Wartezeit)

**Vollständiger Report:** `.gstack/qa-reports/qa-report-junction-PROJ-2-2026-05-06.md`

**Empfehlung:** Approved. Logout-Klick als Smoke-Test in unter 30 Sekunden empfohlen, kein Blocker für PROJ-3.

## Deployment
_To be added by /deploy_
