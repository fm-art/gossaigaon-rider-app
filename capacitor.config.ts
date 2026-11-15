import type {CapacitorConfig} from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gossaigaon.rider',
  appName: 'Gossaigaon Fleet',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
