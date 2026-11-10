import React, { useState } from 'react';
import { api, saveTokens } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button, Card, Field, FormError, Screen, T, confirm } from '@/ui/kit';
import { C } from '@/theme';

/** Hisobni butunlay o‘chirish (App Store va Google Play talabi). */
export default function DeleteAccount() {
  const { logout } = useAuth();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const remove = async () => {
    if (!(await confirm('Hisobni o‘chirish', 'Barcha ma’lumotlaringiz, postlaringiz, do‘kon yoki nashriyot profilingiz butunlay o‘chiriladi. Buni qaytarib bo‘lmaydi.', 'O‘chirish', true))) return;
    setError(null);
    setBusy(true);
    try {
      await api('/api/auth/account', { method: 'DELETE', body: { password: pw } });
      await saveTokens(null);
      await logout();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  return (
    <Screen title="Hisobni o‘chirish">
      <Card style={{ backgroundColor: C.dangerSoft, borderColor: C.dangerSoft }}>
        <T>Hisob o‘chirilgach: profil, postlar, izohlar, javoningiz, do‘kon/nashriyot profili va e’lonlar o‘chadi. Buyurtma tarixidagi summalar do‘konlarda hisob uchun saqlanadi.</T>
      </Card>
      <Field label="Tasdiqlash uchun parolingiz" value={pw} onChangeText={setPw} secureTextEntry />
      <FormError error={error} />
      <Button title="Hisobni butunlay o‘chirish" variant="danger" onPress={remove} loading={busy} disabled={!pw} />
    </Screen>
  );
}
