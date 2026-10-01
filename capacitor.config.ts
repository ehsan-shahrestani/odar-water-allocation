import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ir.odar.client',
  appName: 'اُدار',
  webDir: 'dist/client/browser',
  server: {
    androidScheme: 'https',
    hostname: 'odar.ir',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: '#07482d',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      backgroundColor: '#07482d',
      style: 'DARK',
    },
  },
};

export default config;
