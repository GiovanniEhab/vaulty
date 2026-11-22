import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vaulty.app',
  appName: 'Vaulty',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
