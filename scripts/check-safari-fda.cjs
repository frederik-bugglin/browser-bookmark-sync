// Probes Full Disk Access on the Safari Bookmarks.plist using the SAME
// access-check logic as electron/adapters/safari/permission.ts.
//
// Run with the project's Electron binary so the result reflects what
// Junction sees:
//   ./node_modules/.bin/electron scripts/check-safari-fda.cjs

const { accessSync, constants, existsSync, statSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const plistPath = path.join(os.homedir(), 'Library/Safari/Bookmarks.plist');
console.log('Plist path:    ', plistPath);
console.log('Process pid:   ', process.pid);
console.log('Process bin:   ', process.execPath);

console.log('Exists:        ', existsSync(plistPath));

try {
  const stat = statSync(plistPath);
  console.log('Size:          ', stat.size, 'bytes');
  console.log('Mtime:         ', stat.mtime.toISOString());
} catch (err) {
  console.log('Stat error:    ', err.code, err.message);
}

try {
  accessSync(plistPath, constants.R_OK);
  console.log('=> RESULT:     GRANTED (TCC ok, file readable)');
} catch (err) {
  console.log('=> RESULT:     DENIED', err.code, '-', err.message);
}

// Also probe the Safari directory itself, which often fails sooner if
// FDA is missing.
try {
  const safariDir = path.dirname(plistPath);
  accessSync(safariDir, constants.R_OK);
  console.log('=> Dir read:   ok');
} catch (err) {
  console.log('=> Dir read:   FAIL', err.code, '-', err.message);
}

setTimeout(() => process.exit(0), 100);
