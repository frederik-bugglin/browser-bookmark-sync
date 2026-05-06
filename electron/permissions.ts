import { EventEmitter } from 'node:events';
import { shell } from 'electron';
import {
  FULL_DISK_ACCESS_URL,
  defaultBookmarksPath,
  probePermission,
} from './adapters/safari';

export type PermissionStatus = 'unknown' | 'granted' | 'denied' | 'unavailable';

export type PermissionsState = {
  safari: PermissionStatus;
};

// Maps the adapter's tri-state probe result onto the UI's quad-state. The
// renderer's `unknown` only ever holds at boot before the first probe runs.
function probeToStatus(plistPath: string): PermissionStatus {
  const result = probePermission(plistPath);
  if (result.status === 'granted') return 'granted';
  if (result.status === 'denied') return 'denied';
  return 'unavailable';
}

export class PermissionsService extends EventEmitter {
  private state: PermissionsState = { safari: 'unknown' };

  getState(): PermissionsState {
    return this.state;
  }

  probeSafari(): PermissionStatus {
    const next = probeToStatus(defaultBookmarksPath());
    if (next !== this.state.safari) {
      this.state = { ...this.state, safari: next };
      this.emit('change', this.state);
    }
    return next;
  }

  async openSafariSettings(): Promise<void> {
    await shell.openExternal(FULL_DISK_ACCESS_URL);
  }
}
