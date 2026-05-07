import { Menu, Tray, app, nativeImage } from 'electron';
import path from 'node:path';
import type { JsonStore } from './store';
import type { AppState } from './state';
import type { WindowManager } from './windows';
import { isDev } from './paths';

const TRAY_ICON_FILE = isDev
  ? path.join(__dirname, '..', 'assets', 'tray-iconTemplate.png')
  : path.join(process.resourcesPath, 'assets', 'tray-iconTemplate.png');

export function createTray(
  windows: WindowManager,
  appStateStore: JsonStore<AppState>,
  onSyncRequested: () => void,
): Tray {
  const image = loadTrayImage();
  const tray = new Tray(image);
  tray.setToolTip('Junction');
  if (image.isEmpty()) tray.setTitle('Junction');

  const refreshMenu = () => {
    // Window-bounds saves during shutdown can fire AppState change events
    // after we've called tray.destroy(). Guard so we don't crash on exit.
    if (tray.isDestroyed()) return;

    const status = appStateStore.get().lastSyncStatus;
    const lastAt = appStateStore.get().lastSyncAt;
    const statusLabel = formatStatusLabel(status, lastAt);

    const contextMenu = Menu.buildFromTemplate([
      { label: statusLabel, enabled: false },
      { type: 'separator' },
      { label: 'Jetzt synchronisieren', click: () => onSyncRequested() },
      { label: 'Hauptfenster öffnen', click: () => windows.showMain() },
      { type: 'separator' },
      { label: 'Beenden', click: () => app.quit() },
    ]);

    tray.setContextMenu(contextMenu);
  };

  refreshMenu();
  appStateStore.on('change', refreshMenu);

  tray.on('click', () => {
    if (tray.isDestroyed()) return;
    const bounds = tray.getBounds();
    void windows.togglePopover(bounds);
  });

  tray.on('right-click', () => {
    if (tray.isDestroyed()) return;
    tray.popUpContextMenu();
  });

  return tray;
}

function loadTrayImage(): Electron.NativeImage {
  try {
    const img = nativeImage.createFromPath(TRAY_ICON_FILE);
    if (!img.isEmpty()) {
      img.setTemplateImage(true);
      return img;
    }
  } catch {
    // fall through to empty image, title fallback used
  }
  return nativeImage.createEmpty();
}

function formatStatusLabel(status: string, lastAt: string | null): string {
  if (status === 'running') return 'Synchronisiert…';
  if (status === 'error') return 'Letzter Sync: Fehler';
  if (lastAt) {
    const date = new Date(lastAt);
    const formatted = date.toLocaleString('de-CH', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `Letzter Sync: ${formatted}`;
  }
  return 'Noch nicht synchronisiert';
}
