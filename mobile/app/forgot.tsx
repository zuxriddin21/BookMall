import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/api/client';
import { getGoogleIdToken, GoogleCancelled } from '@/lib/google';
import { Button, Card, Field, FormError, Screen, T, fieldErr, notice } from '@/ui/kit';
import { S } from '@/theme';

/** Parolni tiklash: ro‘yxatdan o‘tilgan Google hisobi bilan tasdiqlash → yangi parol. */
export default function ForgotScreen() {
  const [step, setStep] = useState<{ resetToken: string; username: string } | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const verify = async () => {
    setError(null);
    setLoading(true);
    try {
      const idToken = await getGoogleIdToken();
      setStep(await api('/api/auth/forgot-password/google', { body: { idToken } }));
    } catch (e) {
      if (!(e instanceof GoogleCancelled)) setError(e);
    } finally {
      setLoading(false);
    }
  };

  const localErr = password && confirm && password !== confirm ? 'Parollar bir xil emas' : undefined;
  const save = async () => {
    if (!step || localErr) return;
    setError(null);
    setLoading(true);
    try {
      await api('/api/auth/forgot-password/reset', { body: { resetToken: step.resetToken, password, passwordConfirm: confirm } });
      notice('Parol yangilandi', `Endi “${step.username}” login va yangi parol bilan kiring.`);
      router.replace('/login');
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen title="Parolni tiklash">
      {!step ? (
        <View style={{ gap: S.md }}>
          <T>Ro‘yxatdan o‘tishda foydalangan Google hisobingizni tanlang. Shundan so‘ng yangi parol qo‘yasiz.</T>
          <FormError error={error} />
          <Button title="Google orqali tasdiqlash" onPress={verify} loading={loading} />
        </View>
      ) : (
        <View style={{ gap: S.md }}>
          <Card><T variant="small">Loginingiz</T><T variant="h2">{step.username}</T></Card>
          <Field label="Yangi parol" value={password} onChangeText={setPassword} secureTextEntry placeholder="Kamida 8 belgi, harf va raqam" error={fieldErr(error, 'password')} />
          <Field label="Yangi parolni tasdiqlang" value={confirm} onChangeText={setConfirm} secureTextEntry error={localErr ?? fieldErr(error, 'passwordConfirm')} />
          <FormError error={error && !fieldErr(error, 'password') ? error : null} />
          <Button title="Parolni saqlash" onPress={save} loading={loading} disabled={!password || !confirm || Boolean(localErr)} />
          <T variant="small">Barcha qurilmalardagi eski kirishlar yopiladi.</T>
        </View>
      )}
    </Screen>
  );
}
