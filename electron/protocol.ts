import { protocol, app, net } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Custom protocol that serves the Next.js static export from app.getAppPath()/out.
// We use this instead of file:// so that absolute asset paths emitted by Next
// (e.g. /_next/static/chunks/foo.css) resolve correctly regardless of the
// current page's depth in the route tree. With file:// those would be
// interpreted as filesystem root and fail to load.
//
// The 'app' scheme is registered as standard + secure + supportFetchAPI before
// app.whenReady so that loadURL('app://...') works in BrowserWindow and so
// that the page is treated as a same-origin secure context.

const SCHEME = 'app';

// Must be called BEFORE app.whenReady().
export function registerAppProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
}

// Must be called AFTER app.whenReady().
export function registerAppProtocolHandler(): void {
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    // app://-/popover/  -> /popover/
    // app://-/_next/static/chunks/foo.css -> /_next/static/chunks/foo.css
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const baseDir = path.join(app.getAppPath(), 'out');
    const safePath = path.normalize(path.join(baseDir, pathname));
    // Block path traversal: ensure the resolved file stays inside the out dir.
    if (!safePath.startsWith(baseDir)) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(safePath).toString());
  });
}
