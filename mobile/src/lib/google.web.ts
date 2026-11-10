export class GoogleCancelled extends Error {}

/** Brauzer versiyasi faqat sinov uchun: Google orqali ro‘yxatdan o‘tish telefon ilovasida ishlaydi. */
export async function getGoogleIdToken(): Promise<string> {
  throw new Error('Google orqali ro‘yxatdan o‘tish telefon ilovasida ishlaydi');
}
