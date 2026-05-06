import { app } from 'electron';

export function configureAutoLaunch(enabled: boolean): void {
  if (process.platform !== 'darwin') return;
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
  });
}

export function isAutoLaunchEnabled(): boolean {
  if (process.platform !== 'darwin') return false;
  return app.getLoginItemSettings().openAtLogin;
}
