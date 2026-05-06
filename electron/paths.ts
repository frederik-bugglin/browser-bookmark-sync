import path from 'node:path';
import { app } from 'electron';

export const isDev = !app.isPackaged;

const DEV_BASE_URL = 'http://localhost:3000';

export function rendererURL(route: '' | 'popover' | 'onboarding' | 'settings' | 'conflicts'): string {
  if (isDev) {
    return route ? `${DEV_BASE_URL}/${route}/` : `${DEV_BASE_URL}/`;
  }
  const file = path.join(app.getAppPath(), 'out', route, 'index.html');
  return `file://${file}`;
}

export const preloadPath = path.join(__dirname, 'preload.js');
