/** Brauzerda (faqat sinov uchun) — localStorage. */
export const storage = {
  get: async (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: async (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* */ } },
  remove: async (k: string) => { try { localStorage.removeItem(k); } catch { /* */ } },
};
