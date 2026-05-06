# PROJ-1: Electron-Shell und Menüleisten-App

## Status: In Review
**Created:** 2026-05-06
**Last Updated:** 2026-05-06

## Dependencies
- None

## User Stories
- Als Nutzer möchte ich, dass die App nach dem Login als Menüleisten-Icon erscheint, damit sie unauffällig im Hintergrund läuft
- Als Nutzer möchte ich beim macOS-Login automatisch starten, damit der Sync ohne mein Zutun aktiv ist
- Als Nutzer möchte ich aus dem Menüleisten-Icon das Hauptfenster öffnen können, damit ich Status und Settings sehe
- Als Nutzer möchte ich die App per Quit beenden können, damit ich kontrollieren kann, wann sie läuft
- Als Nutzer möchte ich keinen Dock-Icon sehen, damit das Tool nicht zwischen meinen aktiven Apps auftaucht

## Acceptance Criteria
- [ ] Electron-App startet und zeigt ein Icon in der macOS-Menüleiste
- [ ] Klick auf das Icon öffnet ein Pop-up oder das Hauptfenster mit Sync-Status
- [ ] Auto-Launch beim macOS-Login ist in den Settings ein- und ausschaltbar (default: an)
- [ ] App läuft ohne Dock-Icon (`app.dock.hide()` auf macOS)
- [ ] Kontextmenü auf dem Icon enthält: Sync-Status, "Jetzt synchronisieren", "Settings öffnen", "Beenden"
- [ ] Fenster lässt sich öffnen, schliessen und wieder öffnen, ohne dass der Background-Sync stoppt
- [ ] Next.js-UI rendert im Electron-Fenster fehlerfrei (kein White-Screen, keine Hot-Reload-Konflikte)
- [ ] Build-Pipeline produziert eine signierte `.app` für lokale Tests (Notarization optional in dieser Phase)

## Edge Cases
- Was passiert, wenn der Nutzer das Icon ausblendet (macOS Bartender o.ä.)? App soll funktional bleiben, manueller Trigger über Hotkey oder Settings-Fenster reichen.
- Was passiert beim Start, wenn keine Internet-Verbindung besteht? UI zeigt Status "Offline", Sync-Engine pausiert ohne Crash.
- Was passiert, wenn der Nutzer Auto-Launch in macOS-Systemeinstellungen manuell deaktiviert? App respektiert das, zeigt es in den Settings korrekt an.
- Was passiert beim Update der App? Auto-Updater ist out-of-scope für MVP (manuelles Update reicht).
- Mehrere Instanzen: Wenn die App schon läuft und erneut gestartet wird, fokussiert sich die existierende Instanz statt eine zweite zu öffnen.

## Technical Requirements (optional)
- Electron mit `nodeIntegration: false`, `contextIsolation: true` (Sicherheit)
- Tray-Icon als Template-Image (passt sich Light/Dark-Mode an)
- Auto-Launch via `electron-builder` LaunchAgent oder `auto-launch` Library
- Window-State persistieren (Position, Grösse) zwischen App-Starts

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Übersicht
Die App ist eine native macOS-Desktop-Anwendung, gebaut mit Electron. Die UI ist die existierende Next.js-Anwendung, die als statisches Bundle innerhalb von Electron läuft. Es gibt zwei Fenster: ein kleines Popover, das per Tray-Klick auftaucht, und ein grösseres Hauptfenster für ausführliche Ansichten. Die App läuft permanent im Hintergrund und ist nur über das Menüleisten-Icon erreichbar.

### Komponenten-Struktur (Visual Tree)

```
App (läuft permanent im Hintergrund)
├── Tray-Icon (immer sichtbar in der macOS-Menüleiste)
│   ├── Linksklick  → Popover (Mini-Fenster)
│   └── Rechtsklick → Kontextmenü mit Quick-Actions
│
├── Popover (Mini-Fenster, ~320×400px, dropdown unter dem Tray-Icon)
│   ├── Header: Sync-Status + letzter Sync-Zeitpunkt
│   ├── Browser-Liste (kompakt, jeweils Icon + Status-Punkt)
│   ├── Button "Jetzt synchronisieren"
│   └── Link "Hauptfenster öffnen"
│
├── Hauptfenster (~900×600px, normal in Sicht)
│   ├── Header (Logo, aktueller Sync-Status, manueller Sync-Button)
│   ├── Sidebar: Navigation (Übersicht, Settings, Konflikt-Log)
│   └── Content-Bereich (wechselt nach Sidebar-Auswahl)
│       ├── Übersicht: Browser-Liste mit Detail-Status
│       ├── Settings: ausführliche Einstellungen (PROJ-8)
│       └── Konflikt-Log: Liste aller überschriebenen Versionen (PROJ-9)
│
└── Onboarding (nur beim allerersten Start)
    ├── Welcome-Screen
    ├── Login mit E-Mail (PROJ-2)
    ├── Browser-Detection (zeigt erkannte Browser)
    └── Permission-Setup für Safari (PROJ-5)
```

### Verhalten im Detail

| Aktion | Folge |
|---|---|
| App-Start | Tray-Icon erscheint, kein Dock-Icon, kein Fenster im Vordergrund |
| Linksklick auf Tray | Popover öffnet sich direkt unter dem Icon |
| Klick ausserhalb des Popover | Popover versteckt sich automatisch |
| Rechtsklick auf Tray | Kontextmenü mit "Jetzt synchronisieren", "Hauptfenster öffnen", "Settings", "Beenden" |
| Hauptfenster schliessen | Fenster wird versteckt, App läuft weiter, Tray bleibt aktiv |
| "Beenden" im Kontextmenü | App stoppt, Sync-Engine stoppt mit |
| macOS-Login | App startet automatisch (in Settings deaktivierbar) |
| App schon offen, neuer Start versucht | Bestehende Instanz bekommt Fokus, kein zweites Fenster |

### Data Model (lokal)

Persistiert wird ausschliesslich App- und Settings-State auf dem Mac. Eigentliche Bookmark-Daten kommen erst in PROJ-2 dazu (Supabase).

**App-State** (was die App über sich selbst weiss):
- Letzter Sync-Zeitpunkt
- Letzter Sync-Status (idle, läuft, erfolgreich, fehlgeschlagen)
- Position und Grösse des Hauptfensters
- Position des Popover relativ zum Tray-Icon
- Flag: erster Start erfolgt ja/nein

**User-Settings** (PROJ-1-Anteil, wird in PROJ-8 erweitert):
- Beim Login starten ja/nein (default: ja)

Speicherort: `~/Library/Application Support/browser-bookmark-sync/config.json`. Sensible Daten (Auth-Tokens) kommen in den macOS-Schlüsselbund (PROJ-2).

### Prozess-Architektur

Electron hat zwei Prozesstypen, die ich klar trenne:

**Main-Prozess** (Node.js, voller System-Zugriff):
- Verwaltet Tray-Icon, Fenster, Auto-Launch
- Hat als Einziges Zugriff aufs Dateisystem (wichtig für spätere Bookmark-Adapter)
- Speichert Settings und App-State
- Sendet IPC-Events an die UI

**Renderer-Prozess** (Browser-Sandbox, Next.js-UI):
- Zeigt UI an
- Hat keinen direkten Datei-Zugriff (Sicherheitsmodell)
- Spricht mit Main-Prozess über eine klar definierte IPC-Schnittstelle

Der Renderer fragt also nicht selbst die Festplatte ab, sondern bittet den Main-Prozess: "Gib mir den Sync-Status" oder "Speichere diese Einstellung". Das macht die App sicherer und einfacher zu testen.

### Tech-Entscheidungen mit Begründung

**Warum Electron, nicht Tauri oder SwiftUI?**
Wurde im Requirements-Schritt entschieden: maximale Wiederverwendung des Next.js-Starters, alle Bookmark-Parser sind als npm-Pakete verfügbar, ein Mental Model.

**Warum Next.js als Static Export, nicht als laufender Server?**
Die UI ist eine reine Frontend-Anwendung. Statische HTML/JS-Dateien werden direkt aus dem App-Bundle geladen, kein Webserver nötig. Spart Speicher, Startzeit und Komplexität.

**Warum zwei separate Fenster (Popover + Hauptfenster)?**
Popover und Hauptfenster haben unterschiedliche Anforderungen: Popover ist klein, fokus-sensitiv, schliesst sich von selbst. Hauptfenster bleibt offen, hat Tabs, ist vom Nutzer bewusst gesteuert. Zwei Fenster sind klarer als ein dynamisch wechselndes.

**Warum electron-store für die Persistierung?**
Settings sind klein und JSON-tauglich. electron-store handhabt Schema-Migrationen automatisch und legt die Datei am macOS-konformen Ort ab. Eine eigene Datei zu pflegen wäre Mehraufwand ohne Mehrwert.

**Warum Code-Signing schon in MVP planen?**
Safari (PROJ-5) braucht macOS Full Disk Access. Damit der TCC-Permission-Dialog überhaupt erscheint, muss die App signiert sein. Self-Signing reicht für lokale Tests, Apple Developer ID erst für Production-Build.

**Warum kein globaler Hotkey?**
Im Requirements-Schritt verworfen: weniger Konflikte mit anderen Tools, einfacherer MVP. Wird in PROJ-7 oder Settings später ergänzbar.

### Dependencies (zusätzlich zum Starter-Stack)

**Pflicht:**
- `electron` - Desktop-Frame
- `electron-builder` - Build und Packaging in `.app` und `.dmg`
- `electron-store` - Persistierung von Settings und App-State
- `concurrently` - parallel Next.js-Dev-Server und Electron starten

**Bestehend (aus Starter-Kit, wird wiederverwendet):**
- Next.js, React, TypeScript
- Tailwind, shadcn/ui (Card, Button, Tabs, Dialog, Switch, Badge)
- Lucide-Icons

**Out-of-Scope für MVP:**
- `electron-updater` (Auto-Updates kommen später)

### Open Points / Architektur-Entscheidungen für /architecture in späteren Features

- **PROJ-2:** Wo wird das Auth-Token sicher abgelegt? Empfehlung: macOS-Schlüsselbund via `keytar`.
- **PROJ-7:** File-Watcher läuft im Main-Prozess, Sync-Engine ebenso. Renderer wird per IPC informiert.
- **PROJ-5:** TCC-Deeplink öffnet Systemeinstellungen direkt aus dem Onboarding-UI.

### Test-Strategie für PROJ-1
- Unit-Tests für Window-State-Persistierung (electron-store-Mocking)
- Manueller Smoke-Test: App startet, Tray erscheint, Popover öffnet, Hauptfenster öffnet, Quit funktioniert
- Mehrfach-Start-Test: zweimal hintereinander öffnen → bestehende Instanz fokussiert
- Auto-Launch-Test: An/Aus-Toggle setzt LaunchAgent korrekt

### Risiken
- **Code-Signing:** Wenn Apple Developer ID nicht verfügbar, sind Permission-Dialoge in PROJ-5 möglicherweise eingeschränkt. Mitigation: Self-Signing für Dev, Developer-ID-Anmeldung rechtzeitig vor PROJ-5.
- **Next.js Static Export:** Einige Next.js-Features (Server Components, dynamische Routen) funktionieren im Static-Export-Modus nicht. Wir bauen die UI als reine Client-Side-App.
- **Electron-Updates:** Electron-Major-Versionen brechen gelegentlich APIs. Wir pinnen die Version und updaten bewusst.

## Implementation Notes (Frontend)

**Branding:** App heisst "Junction". Akzentfarbe `#008566` (HSL 165 100% 26%) im Light-Mode, leicht heller im Dark-Mode (165 75% 42%). Dark-Mode folgt System via `next-themes`.

**Stack-Erweiterung:**
- `electron@42`, `electron-builder@26`, `concurrently`, `wait-on`, `cross-env` als devDependencies
- Eigener kleiner JSON-Store auf `node:fs` + Zod statt `electron-store` (das ist seit v9 ESM-only und erschwert die CJS-Compilation)
- Next.js auf `output: 'export'` plus `trailingSlash: true` umgestellt

**Datei-Struktur neu:**
```
electron/                      Main-Prozess in TypeScript
  main.ts                      App-Lifecycle, Boot, Single-Instance-Lock
  windows.ts                   WindowManager (Main + Popover)
  tray.ts                      Tray-Icon + Kontextmenü
  ipc.ts                       IPC-Handler-Registrierung
  preload.ts                   contextBridge.exposeInMainWorld('junction')
  store.ts                     JsonStore-Klasse (atomar persistiert)
  state.ts                     Zod-Schemas für AppState + Settings
  paths.ts                     Dev/Prod URL-Resolver, Preload-Pfad
  autolaunch.ts                LoginItem-Steuerung via Electron-API
  tsconfig.json                Separate TS-Config (CJS, target ES2022)
assets/                        Icons + macOS-Entitlements
  icon.svg, icon.icns          App-Icon
  tray-iconTemplate.png/@2x    Tray-Icons (Template-Image für macOS Light/Dark)
  entitlements.mac.plist       Hardened Runtime Entitlements
electron-builder.yml           Packaging-Config (DMG, Mac arm64+x64)
```

**Renderer-Routes:**
- `/` Hauptfenster Übersicht (App-Shell mit Sidebar)
- `/settings/` (App-Shell, Toggle für Auto-Launch)
- `/conflicts/` (App-Shell, Stub mit Empty-State)
- `/popover/` Mini-Fenster (separate Layout, kein Sidebar)
- `/onboarding/` Welcome-Screen für ersten Start

**Renderer-Komponenten:**
- `app-shell.tsx`, `app-sidebar.tsx`, `app-header.tsx` für das Hauptfenster
- `popover-shell.tsx` für das Tray-Popover
- `welcome-screen.tsx` für Onboarding
- `brand-mark.tsx` (inline-SVG-Logo), `sync-status-pill.tsx`, `browser-list-compact.tsx`
- `theme-provider.tsx` als next-themes-Wrapper

**Renderer–Main-Bridge:** `src/lib/electron-bridge.ts` exponiert `junction()`. Im Browser ohne Preload (Next-Dev-Server) liefert es einen Mock-Bridge mit lokalem In-Memory-State, sodass die UI auch ausserhalb von Electron entwickelbar ist.

**IPC-API (über contextBridge):**
- `appState.get/set/subscribe`
- `settings.get/set/subscribe`
- `window.showMain/hidePopover/showOnboarding`
- `app.quit/openExternal/platform`

**Persistierung:**
- `app-state.json` und `settings.json` in `app.getPath('userData')`
- Atomar geschrieben (Temp + Rename), Schema-validiert mit Zod

**Window-Verhalten:**
- Hauptfenster: `titleBarStyle: hiddenInset`, schliessen versteckt nur (`event.preventDefault` im close-Handler)
- Popover: frameless, `alwaysOnTop`, schliesst sich bei `blur`, automatische Positionierung unter dem Tray-Icon
- Bounds des Hauptfensters werden im AppState persistiert und beim Neustart validiert

**Tray-Icon:** Template-PNG (22×22, @2x 44×44) via `setTemplateImage(true)`, sodass macOS automatisch Light/Dark-Tinten-Anpassung übernimmt. Fallback auf `tray.setTitle('Junction')` falls die PNG nicht geladen werden kann.

**Auto-Launch:** Via `app.setLoginItemSettings({ openAtLogin, openAsHidden: true })`. Wechselt sofort beim Toggle in Settings.

**Build-Pipeline-Scripts (package.json):**
- `electron:compile` — TypeScript-Compile von `electron/` nach `dist-electron/`
- `electron:dev` — `concurrently` mit Next-Dev-Server + Electron, `wait-on` für Synchronisation
- `electron:build` — Next-Build + TS-Compile + electron-builder zu DMG

**Verifiziert:**
- TypeScript-Compile von Electron-Sources lief fehlerfrei durch
- `npm run build` erzeugt erfolgreich Static-Export für alle 5 Routes
- Smoke-Test im Simulator (App startet, Tray erscheint, Popover öffnet) steht noch aus

**Known Follow-ups (nicht MVP-blockierend):**
- App-Icon (icon.svg/icns) ist der Junction-Erstwurf, kann später vom Designer überarbeitet werden
- Apple Developer ID für Code-Signing muss vor PROJ-5 (Safari Full Disk Access) eingerichtet werden
- Statisches Public-Asset-Cleanup (next.svg, vercel.svg etc. aus dem Starter) noch offen

## QA Test Results

**Datum:** 2026-05-06
**Tier:** Standard
**Vollständiger Bericht:** [.gstack/qa-reports/qa-report-junction-PROJ-1-2026-05-06.md](../.gstack/qa-reports/qa-report-junction-PROJ-1-2026-05-06.md)

**Verifiziert (Renderer):** Alle 5 Next.js-Routes laden mit Status 200, Console-Output clean, Layout konsistent, Branding sauber.

| AC | Ergebnis |
|---|---|
| AC1 Tray-Icon erscheint | ⏳ Manuell |
| AC2 Klick öffnet Popover/Hauptfenster | ⏳ Manuell |
| AC3 Auto-Launch toggelbar, default an | ✅ UI verifiziert, Reboot manuell |
| AC4 Kein Dock-Icon | ✅ Code-verifiziert |
| AC5 Kontextmenü mit 4 Einträgen | ✅ Code-verifiziert |
| AC6 Fenster schliessen ohne Sync-Stop | ✅ Code-verifiziert |
| AC7 Next.js-UI rendert fehlerfrei | ✅ Browser-verifiziert |
| AC8 Build-Pipeline | ✅ `npm run build` ok, DMG-Build manuell |

**Health Score Renderer-Layer:** 95/100

**Findings:** keine Critical/High/Medium/Low-Bugs.

**Manuell zu testen vor finalem Approve:**
1. Tray-Icon sichtbar in macOS-Menüleiste
2. Linksklick öffnet Popover unter Icon
3. Rechtsklick zeigt Kontextmenü mit korrekten Einträgen
4. Hauptfenster-Schliessen versteckt nur, App läuft weiter
5. Kein Dock-Icon
6. Auto-Launch nach Reboot
7. `npm run electron:build` erzeugt DMG (optional in dieser Phase)
8. Single-Instance-Lock greift (zweiter Start fokussiert bestehende Instanz)

**Status nach QA:** Approved mit Vorbehalt (Renderer und Code geprüft, native Electron-Tests benötigen manuelle Verifikation durch Frederik).

## Deployment
_To be added by /deploy_
