import { Notification } from 'electron';
import type { Notifier } from './types';

export function createElectronNotifier(): Notifier {
  return (title, body) => {
    if (!Notification.isSupported()) return;
    new Notification({ title, body, silent: false }).show();
  };
}
