import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { getGoogleIdToken, GoogleCancelled } from '@/lib/google';
import { Button, Field, FormError, Row, Screen, T, notice, errorText } from '@/ui/kit';
import { C, S } from '@/theme';

/** Kirish: login + parol. Ro‘yxatdan o‘tish — Google orqali. */
export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    setError(null);
    if (!username.trim() || !password) return setError(new Error('Login va parolni kiriting'));
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setError(null);
    setGLoading(true);
    try {
      const idToken = await getGoogleIdToken();
      const res = await api('/api/auth/google', { body: { idToken } });
      router.push({ pathname: '/signup', params: {
        signupToken: res.signupToken, name: res.profile.name, email: res.profile.email, suggested: res.suggestedUsername ?? '',
      } });
    } catch (e) {
      if (e instanceof GoogleCancelled) return;
      const err = e as { code?: string; data?: { username?: string } };
      if (err.code === 'ACCOUNT_EXISTS') {
        if (err.data?.username) setUsername(err.data.username);
        notice('Siz allaqachon ro‘yxatdan o‘tgansiz', `Loginingiz: ${err.data?.username ?? ''}\nParolingiz bilan kiring. Parolni unutgan bo‘lsangiz — “Parolni unutdingizmi?” ni bosing.`);
      } else {
        notice('Google orqali bo‘lmadi', errorText(e));
      }
    } finally {
      setGLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ alignItems: 'center', marginTop: 24, gap: 8 }}>
          <Image source={require('../assets/logo.png')} style={{ width: 240, height: 145, borderRadius: 16 }} contentFit="contain" />
          <T variant="muted" style={{ textAlign: 'center' }}>Kitobxonlar, blogerlar, do‘konlar va nashriyotlar bir joyda</T>
        </View>
        <View style={{ gap: S.md }}>
          <T variant="title">Kirish</T>
          <Field label="Login" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" placeholder="masalan: ali_kitobxon" />
          <Field label="Parol" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" placeholder="Parolingiz" onSubmitEditing={submit} returnKeyType="go" />
          <FormError error={error} />
          <Button title="Kirish" onPress={submit} loading={loading} />
          <Button title="Parolni unutdingizmi?" variant="ghost" onPress={() => router.push('/forgot')} />
        </View>
        <Row style={{ marginVertical: 4 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
          <T variant="small">Hisobingiz yo‘qmi?</T>
          <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
        </Row>
        <Button title="Google orqali davom etish" variant="outline" onPress={google} loading={gLoading} icon={<T style={{ fontSize: 18, fontWeight: '700', color: '#4285F4' }}>G</T>} />
        <T variant="small" style={{ textAlign: 'center' }}>Ro‘yxatdan o‘tish uchun Google hisobingiz bilan tasdiqlaysiz, so‘ng login va parol yaratasiz. Keyin faqat login va parol bilan kirasiz.</T>
      </Screen>
    </KeyboardAvoidingView>
  );
}
