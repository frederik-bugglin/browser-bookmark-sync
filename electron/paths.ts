import path from 'node:path';
import { app } from 'electron';

export const isDev = !app.isPackaged;

const DEV_BASE_URL = 'http://localhost:3000';
// Custom protocol registered in electron/protocol.ts. Serves the Next.js
// static export so that absolute asset paths resolve correctly. The host
// segment is a placeholder ("-") because the protocol is host-less.
const PROD_BASE_URL = 'app://-';

export function rendererURL(route: '' | 'popover' | 'onboarding' | 'settings' | 'conflicts'): string {
  if (isDev) {
    return route ? `${DEV_BASE_URL}/${route}/` : `${DEV_BASE_URL}/`;
  }
  return route ? `${PROD_BASE_URL}/${route}/` : `${PROD_BASE_URL}/`;
}

export const preloadPath = path.join(__dirname, 'preload.js');
