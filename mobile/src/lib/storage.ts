import * as SecureStore from 'expo-secure-store';

/** Telefonda tokenlar shifrlangan xotirada (Keychain / Keystore) saqlanadi. */
export const storage = {
  get: (k: string) => SecureStore.getItemAsync(k),
  set: (k: string, v: string) => SecureStore.setItemAsync(k, v),
  remove: (k: string) => SecureStore.deleteItemAsync(k),
};
