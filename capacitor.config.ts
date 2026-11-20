import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'kz.kzhome.pilot',
  appName: 'KZ Home',
  webDir: 'dist',
  // Bundle the same Web build; never load a remote page into the native bridge.
  loggingBehavior: 'none',
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
};

export default config;
