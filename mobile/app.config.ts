import type { ExpoConfig } from 'expo/config';

// Google Cloud Console'dagi iOS Client ID'ning "reversed" ko‘rinishi (com.googleusercontent.apps.XXXX)
const googleIosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME || 'com.googleusercontent.apps.replace-me';

const config: ExpoConfig = {
  name: 'BookMall',
  slug: 'bookmall',
  scheme: 'bookmall',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'uz.bookmall.app',
    supportsTablet: false,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: 'uz.bookmall.app',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#F5F2EB' },
  },
  web: { favicon: './assets/favicon.png', bundler: 'metro', output: 'single' },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 220, resizeMode: 'contain', backgroundColor: '#F5F2EB' }],
    'expo-secure-store',
    'expo-font',
    'expo-video',
    [
      'expo-image-picker',
      {
        photosPermission: 'BookMall post, muqova va profil rasmlarini tanlash uchun galereyangizga ruxsat so‘raydi.',
        cameraPermission: 'BookMall kitob va post rasmlarini suratga olish uchun kameraga ruxsat so‘raydi.',
        microphonePermission: false,
      },
    ],
    ['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }],
  ],
  experiments: { typedRoutes: false },
};

export default config;
