import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button, Card, Field, FormError, Screen, T, fieldErr } from '@/ui/kit';
import { C, S } from '@/theme';

/** Google’dan keyin: login, parol va parolni tasdiqlash. */
export default function SignupScreen() {
  const p = useLocalSearchParams<{ signupToken: string; name: string; email: string; suggested: string }>();
  const { acceptSession } = useAuth();
  const [username, setUsername] = useState(p.suggested ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [avail, setAvail] = useState<{ available: boolean; reason: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const u = username.trim();
    if (u.length < 3) return setAvail(null);
    const t = setTimeout(() => {
      api('/api/auth/username-available', { query: { username: u } }).then(setAvail).catch(() => setAvail(null));
    }, 350);
    return () => clearTimeout(t);
  }, [username]);

  if (!p.signupToken) {
    return <Screen title="Ro‘yxatdan o‘tish"><T>Ro‘yxatdan o‘tishni “Google orqali davom etish” tugmasidan boshlang.</T><Button title="Orqaga" onPress={() => router.replace('/login')} /></Screen>;
  }

  const localErr = password && confirm && password !== confirm ? 'Parollar bir xil emas' : undefined;
  const submit = async () => {
    setError(null);
    if (localErr) return;
    setLoading(true);
    try {
      const res = await api('/api/auth/complete-signup', { body: { signupToken: p.signupToken, username: username.trim(), password, passwordConfirm: confirm } });
      await acceptSession(res);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen title="Hisob yaratish">
      <Card>
        <T variant="small">Google hisobi tasdiqlandi</T>
        <T variant="h2">{p.name}</T>
        <T variant="muted">{p.email}</T>
      </Card>
      <View style={{ gap: S.md }}>
        <Field
          label="Login"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="ali_kitobxon"
          error={fieldErr(error, 'username') ?? (avail && !avail.available ? avail.reason ?? 'Bu login band' : undefined)}
          hint={avail?.available ? '✓ Bu login bo‘sh' : '3–20 belgi: lotin harflari, raqam, “_” va “.”'}
        />
        <Field label="Parol" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="Kamida 8 belgi, harf va raqam" error={fieldErr(error, 'password')} />
        <Field label="Parolni tasdiqlang" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="Parolni qayta yozing" error={localErr ?? fieldErr(error, 'passwordConfirm')} />
        <FormError error={error && !fieldErr(error, 'username') && !fieldErr(error, 'password') && !fieldErr(error, 'passwordConfirm') ? error : null} />
        <Button title="Hisob yaratish" onPress={submit} loading={loading} disabled={!username || !password || !confirm || Boolean(localErr)} />
        <T variant="small" style={{ color: C.muted }}>Keyingi safar faqat shu login va parol bilan kirasiz.</T>
      </View>
    </Screen>
  );
}
