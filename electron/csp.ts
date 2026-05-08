import { session } from 'electron';
import { isDev } from './paths';

// Production: strict CSP. Renderer is bundled Next.js loaded from file://.
// All network IO goes through the main process via IPC, so connect-src is
// 'self' only. Inline scripts/styles are allowed because Next.js emits a
// hydration script and Tailwind/shadcn use inline style attributes.
const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

// Dev: allow Next.js HMR (eval, websockets to localhost:3000).
const DEV_CSP = [
  "default-src 'self' http://localhost:3000",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:3000",
  "style-src 'self' 'unsafe-inline' http://localhost:3000",
  "img-src 'self' data: http://localhost:3000",
  "font-src 'self' data: http://localhost:3000",
  "connect-src 'self' http://localhost:3000 ws://localhost:3000",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

export function installCsp(): void {
  const policy = isDev ? DEV_CSP : PROD_CSP;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    });
  });
}
