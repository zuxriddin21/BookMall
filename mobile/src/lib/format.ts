export const som = (n: number | null | undefined) => (n == null ? '' : `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so‘m`);

export function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'hozirgina';
  if (s < 3600) return `${Math.floor(s / 60)} daqiqa oldin`;
  if (s < 86400) return `${Math.floor(s / 3600)} soat oldin`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} kun oldin`;
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export const ROLE_LABEL: Record<string, string> = { READER: 'Kitobxon', BLOGGER: 'Bloger', SELLER: 'Do‘kon', PUBLISHER: 'Nashriyot', ADMIN: 'Admin' };
export const SHELF_LABEL: Record<string, string> = { WANT_TO_READ: 'O‘qimoqchiman', READING: 'O‘qiyapman', READ: 'O‘qidim' };
export const POST_TYPE_LABEL: Record<string, string> = {
  GENERAL: 'Post', REVIEW: 'Taqriz', RECOMMENDATION: 'Tavsiya', NEW_ARRIVAL: 'Yangi kelgan', PROMOTION: 'Aksiya',
  ANNOUNCEMENT: 'E’lon', NEW_RELEASE: 'Yangi nashr', NEWS: 'Yangilik', REPOST: 'Repost',
};
export const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Kutilmoqda', CONFIRMED: 'Tasdiqlandi', SHIPPED: 'Yo‘lda', COMPLETED: 'Yetkazildi', CANCELLED: 'Bekor qilindi',
};
export const BOOK_STATUS_LABEL: Record<string, string> = { PENDING: 'Tekshirilmoqda', APPROVED: 'Katalogda', REJECTED: 'Rad etildi' };
