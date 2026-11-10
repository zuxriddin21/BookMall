import React, { useState } from 'react';
import { router } from 'expo-router';
import { api } from '@/api/client';
import { Button, Field, FormError, Screen, T, fieldErr, notice } from '@/ui/kit';

export default function ChangePassword() {
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mismatch = pw && pw2 && pw !== pw2 ? 'Parollar bir xil emas' : undefined;
  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      await api('/api/auth/change-password', { body: { currentPassword: cur, newPassword: pw, newPasswordConfirm: pw2 } });
      notice('Parol o‘zgartirildi', 'Boshqa qurilmalardagi kirishlar yopildi.');
      router.back();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen title="Parolni o‘zgartirish">
      <Field label="Joriy parol" value={cur} onChangeText={setCur} secureTextEntry />
      <Field label="Yangi parol" value={pw} onChangeText={setPw} secureTextEntry placeholder="Kamida 8 belgi, harf va raqam" error={fieldErr(error, 'newPassword')} />
      <Field label="Yangi parolni tasdiqlang" value={pw2} onChangeText={setPw2} secureTextEntry error={mismatch ?? fieldErr(error, 'newPasswordConfirm')} />
      <FormError error={error && !fieldErr(error, 'newPassword') ? error : null} />
      <Button title="Saqlash" onPress={save} loading={busy} disabled={!cur || !pw || !pw2 || Boolean(mismatch)} />
      <T variant="small">Parolni unutgan bo‘lsangiz — tizimdan chiqib, “Parolni unutdingizmi?” orqali tiklang.</T>
    </Screen>
  );
}
