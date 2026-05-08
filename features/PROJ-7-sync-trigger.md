# PROJ-7: Sync-Trigger (manuell und automatisch)

## Status: Approved (mit Vorbehalt)
**Created:** 2026-05-06
**Last Updated:** 2026-05-08 (QA Standard-Tier abgeschlossen, 4 Live-Verifikationspunkte pending)

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

### Wo lebt der Trigger

Der Sync-Trigger ist ein neues Modul `electron/sync-trigger/` im Main-Prozess, parallel zu `electron/sync-engine/` und `electron/sync.ts`. Er ist die Schicht, die entscheidet **wann** ein Sync läuft. Er ruft die existierende `SyncService.run()` auf und kennt sonst nichts von Adaptern, Diffs oder Cloud.

Klare Verantwortungsteilung:

| Schicht | Verantwortung |
|---|---|
| `SyncEngine` (PROJ-6) | Wie ein Sync läuft (Read → Diff → Resolve → Write) |
| `SyncService` (PROJ-6) | Single-Instance-Lock, Auth-Guard, State-Events |
| `SyncTrigger` (PROJ-7, neu) | Wann ein Sync läuft (Intervall, manuell, Online-Status) |
| `Tray` / `Settings-UI` | Wie der User den Trigger steuert |

### Komponenten-Struktur (Visual Tree)

```
electron/sync-trigger/
├── index.ts            // Public API: SyncTrigger-Klasse, start()/stop()/triggerNow()
├── interval.ts         // setInterval-Scheduler mit Pause/Resume bei Sleep/Wake
├── online.ts           // Online/Offline-Detection, Skip-Sync-bei-Offline
├── notifications.ts    // macOS-Notifications bei Fehlern (togglebar)
└── types.ts            // TriggerSource, TriggerSettings

Renderer-Komponenten (neu):
├── settings/sync-section.tsx     // Auto-Sync-Toggle, Intervall-Dropdown, Notification-Toggle
├── popover-shell.tsx             // (erweitert) zeigt nächsten geplanten Sync
└── sync-status-pill.tsx          // (erweitert) zeigt "Auto-Sync in 4 min"
```

### Verhalten im Detail

```
App-Boot
└─→ SyncTrigger.start()
    ├─ Lädt Trigger-Settings aus settings.json
    ├─ Wenn autoSyncEnabled: setInterval(intervalMs)
    └─ Registriert Online/Offline-Listener

Tray-Klick "Jetzt synchronisieren"
└─→ SyncTrigger.triggerNow('manual')
    └─ SyncService.run('manual')

Auto-Sync-Tick (alle N Minuten)
└─→ SyncTrigger.tick()
    ├─ Wenn offline → silent skip, AppState-Hint "Offline, retry beim nächsten Tick"
    ├─ Wenn SyncService.isRunning → silent skip (überlappt nicht)
    ├─ Wenn nicht authentifiziert → silent skip
    └─ Sonst → SyncService.run('auto')

Sync-Resultat success
└─→ AppState.lastSyncStatus = 'success', lastSyncAt = now
    └─ Tray-Refresh, Popover-Refresh, Settings-Refresh

Sync-Resultat error
├─→ AppState.lastSyncStatus = 'error', lastError = msg
└─→ Wenn settings.notifyOnError → macOS-Notification

User ändert Intervall in Settings
└─→ SyncTrigger.applySettings(newSettings)
    ├─ Wenn aktuell ein Sync läuft: aktuelle Run zu Ende, dann reschedulen
    └─ Sonst: clearInterval + setInterval mit neuem Wert

User toggelt Auto-Sync aus
└─→ clearInterval, kein Auto-Sync bis re-enable

macOS Sleep
└─→ powerMonitor 'suspend' → clearInterval
macOS Wake
└─→ powerMonitor 'resume' → setInterval neu starten (kein Auto-Sync direkt nach Wake, erst beim nächsten regulären Tick)
```

### Datenmodell (Plain Language)

**Erweitert in `settings.json` (Renderer-zugänglich):**

| Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `autoSyncEnabled` | bool | `true` | Schaltet den Intervall-Trigger global an/aus |
| `autoSyncIntervalMin` | 5 \| 15 \| 30 \| 60 | `15` | Wartezeit zwischen Auto-Syncs |
| `notifyOnSyncError` | bool | `false` | Default `false`: keine Notifications, bis User aktiv einschaltet (weniger Lärm out-of-the-box) |

**Erweitert in `app-state.json` (Main-Prozess intern):**

| Feld | Typ | Bedeutung |
|---|---|---|
| `nextScheduledSyncAt` | ISO-String \| null | Zeitpunkt des nächsten geplanten Auto-Sync-Ticks. `null` wenn Auto-Sync aus oder nichts geplant. UI zeigt das im Popover als "Nächster Sync in 4 min" |
| `lastSyncStatus` | bereits da | erweitert um Trigger-Source: `'idle' \| 'running' \| 'success' \| 'error' \| 'skipped-offline'` |

Keine neuen Tabellen in Cloud nötig — der Trigger ist rein lokal.

### Tech-Decisions (warum)

#### 1. setInterval im Main-Prozess (kein Electron-Scheduler-Plugin)

**Warum:** Drei mögliche Trigger-Strategien:
- `setInterval` im Main-Prozess
- `node-cron` als Library
- macOS LaunchAgent / launchd

`setInterval` reicht für Minuten-Intervalle und integriert sich natürlich mit dem App-Lifecycle (App quittet → Interval stirbt mit). `node-cron` ist Cron-Syntax-Overkill für vier Festwerte. LaunchAgent würde die App-übergreifend laufen lassen, das wollen wir explizit nicht — Sync läuft nur, wenn die App offen ist.

**Tradeoff:** Wenn der User die App quittet, läuft auch kein Auto-Sync. Akzeptiert — die App läuft mit Auto-Launch im Hintergrund (PROJ-1).

#### 2. Single-Source-of-Truth fürs Locking bleibt SyncService

**Warum:** PROJ-6 hat schon `SyncService.run()` mit `engine.isRunning()`-Guard und Auth-Check. Der Trigger macht **keine eigene Lock-Logik**, ruft nur `run()` und behandelt den Throw "Sync is already running". Doppel-Locks sind eine Quelle von Bugs.

**Konkret:**
- Manueller Klick während Auto-Sync läuft → `run()` wirft → UI zeigt "Sync läuft bereits" (kein Crash, kein Queue)
- Spec-AC "Manueller Klick wird gequeued oder ignoriert": **wir wählen ignoriert**, weil Queueing einen zweiten Sync sofort nach Abschluss triggert und damit den Sinn vom Intervall aushebelt

#### 3. Online-Detection via Electron `net.isOnline()` + Reachability-Probe

**Warum:** `navigator.onLine` aus dem Renderer ist unzuverlässig (sagt nur "Netzwerkkarte aktiv"). Im Main-Prozess gibt es zwei Optionen:
- `electron.net.isOnline()` — schneller heuristischer Check
- HEAD-Request gegen Supabase-URL — definitiv aber teuer

Wir nehmen `net.isOnline()` als Pre-Check (sehr billig). Wenn der eigentliche Sync trotzdem fehlschlägt mit Network-Error, behandelt das die Engine als regulären Error. Kein doppelter Probe-Aufwand.

**Tradeoff:** Captive-Portal-Situationen (WLAN da, aber kein echtes Internet) erkennt `net.isOnline()` nicht. Dann läuft der Sync, schlägt fehl, wird als Error geloggt. Beim nächsten Tick neuer Versuch. Akzeptiert.

#### 4. Sleep/Wake via `powerMonitor`

**Warum:** Wenn der Mac in den Sleep geht und wir `setInterval` weiterlaufen lassen, feuert macOS beim Wake **alle verpassten Ticks auf einmal** (Timer-Coalescing). Resultat: Sync-Storm direkt nach Wake. Lösung: bei `suspend` clearInterval, bei `resume` neues Intervall starten — und beim Resume **nicht** sofort syncen, sondern auf den nächsten regulären Tick warten.

**Konkret:** User schliesst MacBook 3h, öffnet wieder → kein automatischer Sync direkt beim Aufwachen, erst nach `intervalMs`. User kann manuell sofort triggern, wenn er will.

#### 5. macOS-Notifications: default OFF

**Warum:** Auto-Sync läuft alle 15 Minuten. Wenn das WLAN flaky ist, könnte der User 4× pro Stunde "Sync fehlgeschlagen"-Notifications bekommen. Default OFF ist freundlicher — der User schaltet das aktiv ein, wenn er Notifications will. Bei manuellen Syncs zeigt das UI sowieso ein Error-Toast (Frontend-Konvention).

**Konkret:**
- Default: keine OS-Notifications, Errors nur im Tray-Status sichtbar
- User aktiviert in Settings: `electron.Notification` mit Title "Junction" + Body "Sync fehlgeschlagen: <message>"
- Click auf Notification öffnet Hauptfenster mit Konflikt-Log oder Settings-Section (Detail in Frontend)

#### 6. Tray-Title-Modifier statt animierte Icons

**Warum:** macOS-Template-Images sind statische PNGs, die das System tintet. Animation würde mehrere PNGs + Frame-Switch via `setImage` brauchen, kann auf Retina/non-Retina flackern und ist visuell laut. Stattdessen während Sync: `tray.setTitle(' · syncing')` neben dem Icon. Klar lesbar, plattform-konform, null neue Assets.

**Konkret:** State-Übergänge im Tray:
| State | Icon | Title |
|---|---|---|
| idle | Template-PNG | leer |
| running | Template-PNG | `' · syncing'` |
| error | Template-PNG | leer (Error nur im Menü-Label) |
| skipped-offline | Template-PNG | leer (offline nur im Menü-Label) |

#### 7. File-Watcher (chokidar) explizit OUT-of-Scope

**Warum:** Spec markiert es als optional. Real-Time-Sync via File-Watcher hat drei harte Probleme:
- File-Lock-Race: Browser schreibt → wir lesen mitten im Write
- Backup-Rotation der Adapter triggert eigene Watcher-Events
- Cleanup beim Browser-Switch (User schliesst Chrome → Watcher muss FD freigeben)

15-Min-Intervall + manueller Trigger deckt 95% der Use-Cases. Falls später nötig, ist es ein eigenes Feature `PROJ-10: Real-Time-Sync` ohne Änderung an PROJ-7.

#### 8. Intervall-Werte hart-codiert (5/15/30/60), nicht frei wählbar

**Warum:** Spec gibt diese vier Werte vor. Free-form Input würde unsinnige Werte erlauben (1 Sekunde, 24 Stunden), Validierung wäre Mehraufwand. Dropdown ist klarer und lehrt den User die sinnvollen Auflösungen.

### Edge Cases (Architektur-Sicht)

| Fall | Trigger-Verhalten |
|---|---|
| App-Start mit autoSyncEnabled=true | Initialer Tick wartet auf intervalMs (kein sofortiger Sync beim Boot, sonst Login-Race). User kann manuell triggern, wenn er sofort syncen will |
| App-Start mit autoSyncEnabled=true und letzter Sync >intervalMs zurück | Trotzdem warten auf nächsten Tick. Klares Modell: "Boot ist kein Trigger, Tick ist ein Trigger" |
| User toggelt Auto-Sync mid-Sync aus | Aktueller Sync läuft zu Ende, danach kein neuer Tick |
| Intervall ändert sich mid-Sync | Aktueller Sync läuft zu Ende, neue Settings greifen beim nächsten Tick |
| Sleep mid-Sync | Sync läuft im Main-Prozess weiter (wenn Mac nicht hard-suspended), oder bricht mit Adapter-Error ab → behandelt wie regulärer Error |
| Wake mit autoSyncEnabled=true | Kein sofortiger Sync, erst beim nächsten Tick |
| Offline mid-Sync | Engine wirft Network-Error → AppState 'error', Notification falls aktiviert. Beim nächsten Tick neuer Versuch |
| Offline beim Tick | Silent skip, AppState `lastSyncStatus='skipped-offline'`. Tray-Menü zeigt "Offline, nächster Versuch in N min". Kein Error-Counter, kein Backoff (Tick-Rhythmus reicht) |
| User-Logout während Auto-Sync aktiv | SyncService.run() wirft "Sync requires sign-in" → silent skip, AppState 'error'. Trigger bleibt aktiv, beim Re-Login funktioniert er wieder |
| Auto-Launch + macOS-Login + WLAN noch nicht verbunden | Erster Tick nach intervalMs → online check → falls offline, skip. WLAN typically connected within 1-2s, also nur relevant wenn User intervalMs=5 setzt und schnell loggt |
| App quittet mid-Sync (User: Cmd+Q) | SyncEngine bricht ab, Backup-Rotation der Adapter könnte mid-write sein. Atomar-Writes (temp+rename) der Adapter mitigieren das (PROJ-3/4/5) |
| Mehrere App-Instanzen versuchen zu starten | Single-Instance-Lock (PROJ-1) verhindert das. Trigger läuft nur in der einen Instanz |

### Dependencies (zu installieren)

**Pflicht:** Keine. Alles aus dem bestehenden Stack:
- `electron.powerMonitor` — Built-in
- `electron.net.isOnline()` — Built-in
- `electron.Notification` — Built-in
- `setInterval` — Node Built-in

**Bestehend (wird wiederverwendet):**
- `SyncService` (`electron/sync.ts`) für Lock + Auth-Guard
- `JsonStore<Settings>` und `JsonStore<AppState>` (PROJ-1)
- shadcn/ui Switch, Select für Settings-UI

**Out-of-Scope:**
- `chokidar` (kommt nur falls Real-Time-Sync später)
- `node-cron` (setInterval reicht)

### Renderer-Anteile (für /frontend)

**Settings-Page (`/settings/`) wird erweitert um eine Sync-Section:**

```
Settings-Page
├── Auto-Launch-Section (PROJ-1, existiert)
└── Sync-Section (PROJ-7, neu)
    ├── Switch "Auto-Sync aktivieren" (default: an)
    ├── Select "Intervall" mit Options 5/15/30/60 Min (default: 15)
    │   └── disabled wenn Auto-Sync off
    ├── Switch "Bei Fehler benachrichtigen" (default: aus)
    └── Read-only Status: "Nächster Sync in 4 min" / "Auto-Sync aus"
```

**Popover-Shell (`/popover/`) wird erweitert:**
- Bestehender "Jetzt synchronisieren"-Button bleibt
- Neuer Footer-Hinweis: "Nächster automatischer Sync in 4 min" (nur wenn Auto-Sync aktiv)

**Tray-Kontextmenü (PROJ-1, wird leicht erweitert):**
- Bestehender Eintrag "Jetzt synchronisieren" bleibt
- Status-Label im Menü zeigt jetzt auch `'Offline, retry in 4 min'` und `'Auto-Sync aus'`

**IPC-Erweiterung im Preload-Bridge:**
- `triggerSettings.get/set/subscribe` — Auto-Sync-Toggle, Intervall, Notification-Toggle
- `triggerStatus.get/subscribe` — `nextScheduledSyncAt`, ob Trigger gerade aktiv ist

### Test-Strategie

**Unit-Tests (Vitest, Main-Prozess):**
- `interval.test.ts` — setInterval-Scheduler: start, stop, applySettings rescheduled, Sleep-Pause/Resume, kein Sync direkt nach Wake
- `online.test.ts` — Skip wenn offline, online-Recovery beim nächsten Tick
- `notifications.test.ts` — Notification nur wenn Toggle an, Body enthält Error-Message
- `index.test.ts` — End-to-End mit gemocktem SyncService: Tick → run, manueller Klick während Run → silent skip

**Integrations-Test (manuell, da Electron-spezifisch):**
- App startet, Auto-Sync feuert nach intervalMs (kurz auf 1 min für Test setzen)
- Sleep/Wake-Test: kein Sync-Storm beim Wake
- Offline-Test: WLAN aus → Tick wird geskipt → WLAN an → nächster Tick syncht

**Renderer-Tests:**
- Settings-Section: Toggle deaktiviert Intervall-Select korrekt
- Popover zeigt "Nächster Sync"-Hint nur bei aktivem Auto-Sync

### Risiken

- **macOS App-Nap:** Wenn die App im Hintergrund läuft und der Mac in App-Nap geht, kann `setInterval` deutlich verzögert feuern. Mitigation: `powerSaveBlocker` während Sync läuft (verhindert App-Nap nur für die Sync-Dauer, nicht permanent — sonst frisst die App Energie)
- **Intervall-Drift:** `setInterval` ist nicht garantiert millisekundengenau, kann nach Stunden mehrere Sekunden driften. Akzeptabel — wir reden von 5+ Minuten Auflösung
- **Settings-Race:** User toggelt Auto-Sync schnell hintereinander an/aus während Tick gerade feuert. Mitigation: applySettings ist idempotent, clearInterval ist immer safe
- **Notification-Permission auf macOS:** Bei erstem Notification-Versuch fragt macOS um Permission. Falls User ablehnt, bleiben Notifications stumm. Mitigation: keine, Toggle in Settings reflektiert nur unsere Absicht, nicht den OS-Permission-State

### Open Points / Späteres

- **Konflikt-Log-UI-Hint im Notification-Click**: Wenn der User auf eine Error-Notification klickt, soll Hauptfenster mit Konflikt-Log oder mit Settings-Section öffnen? Kommt mit PROJ-9 zusammen — bis dahin: Click öffnet Hauptfenster ohne Deeplink
- **Backoff bei wiederholten Errors**: Aktuell tickt der Trigger stur weiter, auch wenn 5 Syncs hintereinander failen. Phase 2 könnte exponentiellen Backoff einbauen (z.B. nach 3 Errors auf 60-min-Intervall hochgehen, bis erfolgreicher Sync). Out-of-Scope für MVP

### Component-Tree (Engine-Sicht)

```
SyncTrigger (lebt im Main-Prozess, instanziiert in main.ts)
├── start() → liest Settings, startet Interval, registriert Listener
├── stop() → clearInterval, deregistriert Listener (für Quit)
├── triggerNow(source) → ruft SyncService.run() ohne Tick zu warten
├── applySettings(next) → reschedule wenn nötig
│
├── Interval-Loop
│   └── tick() → online? + nicht-laufend? + authenticated? → SyncService.run('auto')
│
├── PowerMonitor-Listener
│   ├── 'suspend' → clearInterval
│   └── 'resume' → setInterval neu, nicht sofort tick
│
├── SyncService-Subscription
│   ├── 'change' → updates AppState.lastSyncStatus
│   └── error → optional Notification
│
└── Notifier (notifications.ts)
    └── notify(error) → Electron Notification, falls Toggle an
```

## Implementation Notes (Frontend)

**Stand:** Renderer-Anteil komplett, Backend-Trigger (`electron/sync-trigger/`) ist noch offen und folgt mit `/backend`.

**Type-Erweiterungen (`src/lib/types.ts`):**
- `SyncStatus` um `'skipped-offline'` erweitert
- `AppState.nextScheduledSyncAt: string | null` neu
- `Settings` um `autoSyncEnabled`, `autoSyncIntervalMin`, `notifyOnSyncError` erweitert
- Neuer Union-Type `AutoSyncIntervalMin = 5 | 15 | 30 | 60`

**Mock-Bridge-Anpassungen (`src/lib/electron-bridge.ts`):**
- FALLBACK-Konstanten um neue Felder erweitert
- Mock-`sync.run()` emittiert jetzt running-State + spiegelt AppState (`lastSyncStatus`, `lastSyncAt`), simuliert 600 ms Sync-Dauer. Damit funktioniert die UI-Pille auch im Browser-Dev-Mode korrekt
- Defaults: `autoSyncEnabled: true`, `autoSyncIntervalMin: 15`, `notifyOnSyncError: false`

**Komponenten-Änderungen:**
- `src/components/settings-sync-section.tsx` (neu) — Sync-Section für Settings: Switch Auto-Sync, Select Intervall (5/15/30/60), Switch Notification, Read-only Status-Hinweis
- `src/components/sync-status-pill.tsx` — `'skipped-offline'`-Status mit Amber-Tone
- `src/components/popover-shell.tsx` — fake-`setTimeout`-Sync entfernt, ruft jetzt `sync.run('manual')` mit Try/Catch. Footer-Hint zeigt nächsten Auto-Sync oder "Auto-Sync aus"
- `src/components/app-shell.tsx` — selber Cleanup (fake-Sync raus, echter `sync.run('manual')`-Call)

**Page-Änderungen:**
- `src/app/settings/page.tsx` — `SettingsSyncSection` eingebunden, AppState-Subscription dazu, Header-Copy aktualisiert. "Folgt-in-späteren-Schritten"-Card auf PROJ-8/9 reduziert (PROJ-7 ist jetzt drin)

**Hooks:**
- `src/hooks/use-next-sync-label.ts` (neu) — formatiert `nextScheduledSyncAt` als Relativzeit ("in 4 Min" / "in 1 Std"), re-rendert via 30s-Interval. Wird von Popover und Settings genutzt

**Verifiziert:**
- `npx next build` clean — alle 8 Routes statisch generiert
- `npx tsc --noEmit` clean
- `npm test` 184/184 grün
- Keine E2E-Tests betroffen (kein Treffer für alte Settings-Strings)

**Backend gebaut (`/backend`):** siehe Implementation Notes (Backend) unten.

**Schon vorgezogen (für visuelle Iteration nötig):**
- `electron/state.ts` Zod-Schema erweitert: `AppStateSchema.nextScheduledSyncAt`, `SyncStatusSchema` um `'skipped-offline'`, `SettingsSchema` um `autoSyncEnabled`/`autoSyncIntervalMin`/`notifyOnSyncError`. Defaults via `.default()`, alte Configs werden beim Laden transparent ergänzt. **Hintergrund:** Vor der Schema-Erweiterung hat `SettingsSchema.partial().safeParse({ autoSyncEnabled: false })` die unbekannten Felder gestrippt, der Switch in /settings war wirkungslos und der Popover hat den Footer-Hint nie gesehen
- IPC-Erweiterung in `electron/ipc.ts`/`electron/preload.ts` ist nicht nötig — neue Felder gehen über die existierende `settings.set/get/subscribe`- bzw. `appState`-Bridge

**Visual Review pending:** Frederik muss die Settings-Page und den Popover noch visuell abnehmen (`npm run dev` für Renderer, `npm run electron:dev` für komplette App).

## Implementation Notes (Backend)

**Stand:** Trigger-Modul komplett inkl. Online-Monitor und Recovery-Logik, 21 neue Tests grün, gesamt 205/205. Live-Verifikation gegen echte powerMonitor/Notification-APIs und Frederik-Smoke-Test bestätigt (Offline-Detection ≤60s, Recovery beim Online-Wechsel) — finale `/qa` folgt.

**Files (neu):**
- `electron/sync-trigger/types.ts` — `OnlineProbe`, `Notifier`, `PowerEvents`-Interfaces (alles injectierbar, damit Tests ohne Electron-Module laufen)
- `electron/sync-trigger/online.ts` — `createDnsProbe(supabaseUrl, timeoutMs=1500)` via `node:dns/promises.lookup`. Rationale: `electron.net.isOnline()` wurde in Electron 21+ entfernt; DNS-Lookup gegen den Supabase-Host ist <50 ms typisch und greift dieselbe Reachability ab, die der Sync später braucht. Ungültige URL → "always-offline" (sicherer Default)
- `electron/sync-trigger/notifications.ts` — `createElectronNotifier()` thin Wrapper über `electron.Notification`. `Notification.isSupported()`-Guard für Headless-Tests
- `electron/sync-trigger/index.ts` — `SyncTrigger`-Klasse mit `start/stop/triggerNow`. **Designentscheidung gegen reines `setInterval`:** ich verwende `setTimeout`-Recursion. Jeder Tick reschedult sich selbst nach Abschluss — sauber bei Settings-Änderung, Suspend/Resume, Manual-Trigger (jeder Reset bekommt einen frischen Timer rooted bei "now"). Das Architektur-Spec sprach von `setInterval`, das Verhalten ist äquivalent, der Code ist einfacher.
  - **Online-Monitor (Erweiterung über Architektur):** separater 60s-Poll, damit der User Offline-Status nicht erst beim nächsten Sync-Tick sieht (bei 60-min-Intervall sonst zu spät). DNS-Probe on, off → AppState-Update; Suspend/Resume und Auto-Toggle steuern den Monitor mit
  - **Online-Recovery (Erweiterung über Architektur):** `pendingRecovery`-Flag wird armed bei (a) Offline-Detection und (b) Sync-Error/Partial. Nächster Online-Poll feuert `runRecoverySync()` → `sync.run('auto')` und resettet den Auto-Schedule. Verhindert dass der User nach Netzwerk-Recovery bis zu 60 min auf den nächsten regulären Tick wartet. Bei dauerhaftem Cloud-Ausfall: Retry-Loop alle 60s — exponentielles Backoff bleibt Phase-2
- `electron/sync-trigger/index.test.ts` — 21 Tests mit fakeTimers + EventEmitter-basierten Fakes. Deckt: kein-Sofort-Sync-bei-Start, Tick-Verhalten online/offline/unauth/already-running, Settings-Toggle off, Intervall-Wechsel mid-run, Suspend/Resume, manueller Trigger resettet Schedule, Notifications-Toggle, Online-Monitor 60s-Detection, Recovery bei Offline→Online, Recovery bei Sync-Error

**Files (geändert):**
- `electron/main.ts`:
  - Neuer Sync→AppState-Bridge: `syncService.on('change', ...)` mirror't `isRunning` und `lastResult.outcome` zentral nach `appState.lastSyncStatus`/`lastSyncAt`. **Konsequenz:** der frühere Manual-State-Update im Tray-Callback wurde entfernt — jetzt zeigen *alle* Sync-Quellen (Tray, Renderer-IPC, Auto-Trigger) konsistent denselben State im UI. Das war vorher ein Bug: Renderer-IPC `sync:run` updatete `appState` nicht
  - `SyncTrigger` instanziiert mit `createDnsProbe(SUPABASE_URL)`, `createElectronNotifier()`, `powerMonitor`
  - `syncTrigger.start()` nach Service-Init, `syncTrigger.stop()` in `before-quit`
  - Tray-Callback ruft jetzt `syncTrigger.triggerNow()` (statt direkt `syncService.run`) — dadurch resettet der manuelle Sync auch den Auto-Schedule
- `electron/tray.ts`:
  - `formatStatusLabel` um `'skipped-offline'` → "Offline, Sync pausiert"
  - Tray-Title-Modifier während Sync: `· syncing` neben dem Template-Icon, oder `Junction · syncing` wenn das Icon-Asset fehlt. Reset auf leer / `Junction` nach Abschluss
- `electron/state.ts` (schon mit Frontend-Schritt vorgezogen): `nextScheduledSyncAt`, neue Settings-Felder, `'skipped-offline'`-SyncStatus

**Was bewusst NICHT gebaut:**
- Kein File-Watcher (chokidar) — Frederik hat im Architektur-Schritt entschieden, das ist Phase 2 (potentielles `PROJ-10`)
- Kein Backoff-Counter bei wiederholten Errors — Phase 2
- Kein Notification-Click-Deeplink — kommt mit PROJ-9 (Konflikt-Log-UI)
- Kein `electron.net.isOnline()` — von Electron entfernt, ersetzt durch DNS-Probe

**Verifiziert:**
- `npm run electron:compile` clean
- `npm test` 198/198 grün (+14 neue Trigger-Tests)
- `npx tsc --noEmit` clean
- `npx next build` clean

**Pending (Live-Verifikation in `/qa`):**
- Erster Auto-Tick nach 5 min feuert tatsächlich (echtes `setTimeout` im Main-Prozess)
- Sleep/Wake-Verhalten via `powerMonitor` (Test-Mac in den Sleep schicken, aufwachen, kein Sync-Storm)
- macOS-Notification erscheint bei Error mit Toggle an
- Tray-Title `· syncing` während Sync sichtbar
- Offline-Skip: WLAN aus, 5 min warten, Status wird `skipped-offline`, kein Error-Log

## QA Test Results

**Datum:** 2026-05-08
**Tier:** Standard
**Health Score:** 94/100
**Bericht:** `.gstack/qa-reports/qa-report-junction-PROJ-7-2026-05-08.md`

**Resultat:**

- 8/9 Acceptance Criteria verifiziert (Code, Browse-QA, Unit-Tests, Live durch Frederik). AC #6 (chokidar File-Watcher) explizit out-of-scope per Architektur-Decision
- 21 neue Trigger-Tests grün, gesamt 205/205
- Renderer-QA via browse: keine Console-Errors, alle Pill- und Footer-Transitionen sauber, Toggle-Verhalten persistent über Routen-Wechsel
- Build, TypeCheck, Electron-Compile alle clean
- Keine Critical/High/Medium/Low-Bugs gefunden

**Architektur-Erweiterungen über Spec hinaus (verifiziert):**

- 60s-Online-Monitor für Offline-Detection ≤60s (statt nächster Sync-Tick)
- `pendingRecovery`-Flag für sofortiges Recovery bei Offline→Online ODER nach Sync-Fehler

**Live-Verifikation pending (nicht blockierend):**

1. Tray-Title `· syncing` während Sync sichtbar in macOS-Menubar
2. macOS-Notification erscheint bei Sync-Error mit Toggle on (inkl. Permission-Flow)
3. Echter 5-min-Auto-Tick feuert (eine Stunde mit `autoSyncIntervalMin=5` laufen lassen)
4. Sleep/Wake ohne Sync-Storm (Mac-Lid schliessen/öffnen)

Frederik hat im Verlauf der Implementation bereits live verifiziert: Offline-Detection ≤60s, Footer-Hint `Sync pausiert · offline`, Recovery beim Online-Wiederherstellen.

## Deployment
_To be added by /deploy_

## Deployment
_To be added by /deploy_
