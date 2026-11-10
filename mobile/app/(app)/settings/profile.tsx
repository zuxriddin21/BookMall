import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { pickAndUpload } from '@/lib/pickMedia';
import { S } from '@/theme';
import { Avatar, Button, Field, FormError, Screen, T, errorText, fieldErr, notice } from '@/ui/kit';

export default function EditProfile() {
  const { me, refreshMe, hasRole } = useAuth();
  const qc = useQueryClient();
  const u = me!.user;
  const [name, setName] = useState(u.name);
  const [bio, setBio] = useState(u.bio ?? '');
  const [phone, setPhone] = useState(u.phone ?? '');
  const [avatar, setAvatar] = useState(u.avatar);
  const [headline, setHeadline] = useState(me?.bloggerProfile?.headline ?? '');
  const [website, setWebsite] = useState(me?.bloggerProfile?.website ?? '');
  const [cover, setCover] = useState(me?.bloggerProfile?.coverUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const pick = async (set: (u: string) => void) => {
    setUploading(true);
    try {
      const r = await pickAndUpload('images');
      if (r) set(r.url);
    } catch (e) {
      notice('Yuklanmadi', errorText(e));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      await api('/api/profile/me', { method: 'PUT', body: { name: name.trim(), bio: bio.trim() || null, phone: phone.trim() || null, avatar } });
      if (hasRole('BLOGGER')) await api('/api/me/blogger-profile', { method: 'PUT', body: { headline: headline.trim() || null, website: website.trim() || null, coverUrl: cover } });
      await refreshMe();
      void qc.invalidateQueries({ queryKey: ['user'] });
      router.back();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Profilni tahrirlash">
      <View style={{ alignItems: 'center', gap: S.sm }}>
        <Pressable onPress={() => pick(setAvatar)}><Avatar uri={avatar} name={name} size={96} /></Pressable>
        <Button small variant="ghost" title={uploading ? 'Yuklanmoqda…' : 'Rasmni almashtirish'} onPress={() => pick(setAvatar)} loading={uploading} />
      </View>
      <Field label="Ism" value={name} onChangeText={setName} error={fieldErr(error, 'name')} />
      <Field label="O‘zim haqimda" value={bio} onChangeText={setBio} multiline maxLength={300} error={fieldErr(error, 'bio')} />
      <Field label="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" hint="Faqat sizga va siz buyurtma bergan do‘konga ko‘rinadi" error={fieldErr(error, 'phone')} />
      {hasRole('BLOGGER') && (
        <View style={{ gap: S.md }}>
          <T variant="h2">Blog profili</T>
          <Field label="Shior" value={headline} onChangeText={setHeadline} maxLength={120} />
          <Field label="Veb-sayt / Telegram kanal" value={website} onChangeText={setWebsite} autoCapitalize="none" placeholder="https://..." error={fieldErr(error, 'website')} />
          <Button variant="outline" title={cover ? 'Muqova rasmini almashtirish' : 'Muqova rasmi qo‘shish'} onPress={() => pick(setCover)} loading={uploading} />
        </View>
      )}
      <FormError error={error && !fieldErr(error, 'name') && !fieldErr(error, 'phone') ? error : null} />
      <Button title="Saqlash" onPress={save} loading={busy} disabled={uploading || name.trim().length < 2} />
      <T variant="small">Login: @{u.username} (o‘zgartirib bo‘lmaydi)</T>
    </Screen>
  );
}
