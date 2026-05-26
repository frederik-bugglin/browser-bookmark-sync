import { BrowserWindow, screen, type Rectangle } from 'electron';
import type { JsonStore } from './store';
import type { AppState } from './state';
import { isDev, preloadPath, rendererURL } from './paths';
import { isSafeExternalUrl, safeOpenExternal } from './safe-open-external';

// Allowed origins for in-window navigation. Anything else is blocked; safe
// http(s) URLs are routed to the user's external browser via shell.openExternal.
const RENDERER_DEV_ORIGIN = 'http://localhost:3000';
const RENDERER_PROD_ORIGIN = 'app://-';

function isAllowedInternalUrl(url: string): boolean {
  if (url.startsWith('file://')) return true;
  if (url.startsWith(`${RENDERER_DEV_ORIGIN}/`) || url === RENDERER_DEV_ORIGIN) return true;
  if (url.startsWith(`${RENDERER_PROD_ORIGIN}/`) || url === RENDERER_PROD_ORIGIN) return true;
  return false;
}

// Block in-window navigation to external sites and pop-ups. External http(s)
// links are opened in the user's default browser; everything else is denied.
function lockDownNavigation(win: BrowserWindow): void {
  win.webContents.on('will-navigate', (event, url) => {
    if (isAllowedInternalUrl(url)) return;
    event.preventDefault();
    if (isSafeExternalUrl(url)) void safeOpenExternal(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void safeOpenExternal(url);
    return { action: 'deny' };
  });
}

const MAIN_DEFAULTS = { width: 960, height: 640 };
const POPOVER_SIZE = { width: 360, height: 460 };

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private popoverWindow: BrowserWindow | null = null;

  constructor(private readonly appStateStore: JsonStore<AppState>) {}

  async showMain(): Promise<void> {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show();
      this.mainWindow.focus();
      return;
    }

    const stored = this.appStateStore.get().mainWindowBounds;
    const bounds = stored && this.boundsAreVisible(stored)
      ? stored
      : { ...MAIN_DEFAULTS, x: undefined as number | undefined, y: undefined as number | undefined };

    const win = new BrowserWindow({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      minWidth: 720,
      minHeight: 480,
      title: 'Junction',
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#0e1410',
      show: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    lockDownNavigation(win);

    win.on('close', (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        win.hide();
      }
    });

    win.on('moved', () => this.persistBounds(win));
    win.on('resized', () => this.persistBounds(win));

    win.once('ready-to-show', () => win.show());
    await win.loadURL(rendererURL(''));
    if (isDev) win.webContents.openDevTools({ mode: 'detach' });

    this.mainWindow = win;
  }

  async showOnboarding(): Promise<void> {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show();
      this.mainWindow.focus();
      await this.mainWindow.loadURL(rendererURL('onboarding'));
      return;
    }
    await this.showMain();
    if (this.mainWindow) await this.mainWindow.loadURL(rendererURL('onboarding'));
  }

  async togglePopover(trayBounds: Rectangle): Promise<void> {
    if (this.popoverWindow && !this.popoverWindow.isDestroyed()) {
      if (this.popoverWindow.isVisible()) {
        this.popoverWindow.hide();
        return;
      }
      this.positionPopover(this.popoverWindow, trayBounds);
      this.popoverWindow.show();
      this.popoverWindow.focus();
      return;
    }

    const win = new BrowserWindow({
      width: POPOVER_SIZE.width,
      height: POPOVER_SIZE.height,
      frame: false,
      resizable: false,
      transparent: false,
      backgroundColor: '#0e1410',
      show: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      fullscreenable: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    lockDownNavigation(win);

    this.positionPopover(win, trayBounds);

    win.on('blur', () => {
      if (!isDev) win.hide();
    });

    await win.loadURL(rendererURL('popover'));
    win.once('ready-to-show', () => {
      win.show();
      win.focus();
    });

    this.popoverWindow = win;
  }

  hidePopover(): void {
    if (this.popoverWindow && !this.popoverWindow.isDestroyed()) {
      this.popoverWindow.hide();
    }
  }

  private positionPopover(win: BrowserWindow, trayBounds: Rectangle): void {
    const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
    const x = Math.round(trayBounds.x + trayBounds.width / 2 - POPOVER_SIZE.width / 2);
    const y = Math.round(trayBounds.y + trayBounds.height + 6);
    const clampedX = Math.max(
      display.workArea.x + 8,
      Math.min(x, display.workArea.x + display.workArea.width - POPOVER_SIZE.width - 8),
    );
    win.setBounds({ x: clampedX, y, width: POPOVER_SIZE.width, height: POPOVER_SIZE.height });
  }

  private persistBounds(win: BrowserWindow): void {
    const { x, y, width, height } = win.getBounds();
    this.appStateStore.set({ mainWindowBounds: { x, y, width, height } });
  }

  private boundsAreVisible(b: { x: number; y: number; width: number; height: number }): boolean {
    return screen.getAllDisplays().some((d) => {
      const wa = d.workArea;
      return b.x < wa.x + wa.width && b.x + b.width > wa.x && b.y < wa.y + wa.height && b.y + b.height > wa.y;
    });
  }

  private isQuitting = false;

  setQuitting(value: boolean): void {
    this.isQuitting = value;
  }
}
