import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

let configured = false;
function configure() {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    scopes: ['email', 'profile'],
  });
  configured = true;
}

export class GoogleCancelled extends Error {}

/** Google hisobini tanlash oynasini ochadi va serverga yuboriladigan ID tokenni qaytaradi. */
export async function getGoogleIdToken(): Promise<string> {
  if (!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
    throw new Error('Google orqali kirish hali sozlanmagan');
  }
  configure();
  if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  // Har safar hisob tanlash oynasi chiqishi uchun avvalgi tanlovni unutamiz
  await GoogleSignin.signOut().catch(() => undefined);
  try {
    const res = await GoogleSignin.signIn();
    if (res.type !== 'success') throw new GoogleCancelled();
    if (!res.data.idToken) throw new Error('Google token olinmadi');
    return res.data.idToken;
  } catch (e) {
    if (e instanceof GoogleCancelled || (e as { code?: string }).code === statusCodes.SIGN_IN_CANCELLED) throw new GoogleCancelled();
    throw e;
  }
}
