import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BookOpen, Megaphone, Store, Building2, Check } from 'lucide-react-native';
import { api } from '@/api/client';
import type { MeResponse, Role } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { C, F, R, S } from '@/theme';
import { Button, Field, FormError, T, fieldErr } from './kit';

const ROLES: { role: Exclude<Role, 'ADMIN'>; title: string; text: string; Icon: typeof BookOpen }[] = [
  { role: 'READER', title: 'Kitobxon', text: 'Kitob topish, narxlarni solishtirish, buyurtma berish, o‘qiganlaringizni yuritish', Icon: BookOpen },
  { role: 'BLOGGER', title: 'Kitob blogeri', text: 'Taqrizlar, tavsiyalar, rasm va videolar bilan auditoriya yig‘ish', Icon: Megaphone },
  { role: 'SELLER', title: 'Do‘kon / Sotuvchi', text: 'Kitoblarni narxi va soni bilan sotuvga qo‘yish, buyurtmalar qabul qilish', Icon: Store },
  { role: 'PUBLISHER', title: 'Nashriyot', text: 'Kitoblaringizni katalogga qo‘shish, yangi nashrlar va yangiliklar', Icon: Building2 },
];

/** Rol tanlash: birinchi kirishda va keyin yangi rol qo‘shishda ishlatiladi. */
export function RolePicker({ onDone }: { onDone?: (m: MeResponse) => void }) {
  const { me, setMe } = useAuth();
  const owned = me?.user.roles ?? [];
  const [role, setRole] = useState<Exclude<Role, 'ADMIN'> | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const opt = (k: string) => (f[k]?.trim() ? f[k].trim() : undefined);

  const submit = async () => {
    if (!role) return;
    setError(null);
    setLoading(true);
    try {
      const body: Record<string, unknown> = { role };
      if (role === 'BLOGGER') body.blogger = { headline: opt('headline') };
      if (role === 'SELLER') body.store = { name: f.name?.trim() ?? '', city: opt('city'), phone: opt('phone'), address: opt('address'), description: opt('description') };
      if (role === 'PUBLISHER') body.publisher = { name: f.name?.trim() ?? '', city: opt('city'), phone: opt('phone'), website: opt('website'), description: opt('description') };
      const res = await api<MeResponse>('/api/me/roles', { body });
      setMe(res);
      onDone?.(res);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  const ferr = (k: string) => fieldErr(error, `store.${k}`) ?? fieldErr(error, `publisher.${k}`) ?? fieldErr(error, `blogger.${k}`);

  return (
    <View style={{ gap: S.md }}>
      {ROLES.map(({ role: r, title, text, Icon }) => {
        const has = owned.includes(r);
        const active = role === r;
        return (
          <Pressable key={r} disabled={has} onPress={() => { setRole(r); setError(null); }} style={[st.card, active && st.active, has && { opacity: 0.5 }]}
            accessibilityRole="radio" accessibilityState={{ checked: active, disabled: has }}>
            <View style={[st.icon, active && { backgroundColor: C.primary }]}><Icon size={22} color={active ? '#fff' : C.primary} /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={st.title}>{title}</Text>
              <T variant="small">{has ? 'Bu rol sizda bor' : text}</T>
            </View>
            {active && <Check size={20} color={C.primary} />}
          </Pressable>
        );
      })}

      {role === 'BLOGGER' && (
        <Field label="Blog shiori (ixtiyoriy)" value={f.headline ?? ''} onChangeText={set('headline')} placeholder="Masalan: Har hafta bitta taqriz" error={ferr('headline')} />
      )}
      {(role === 'SELLER' || role === 'PUBLISHER') && (
        <View style={{ gap: S.md }}>
          <Field label={role === 'SELLER' ? 'Do‘kon nomi' : 'Nashriyot nomi'} value={f.name ?? ''} onChangeText={set('name')} placeholder={role === 'SELLER' ? 'Kitob Olami' : 'Sharq nashriyoti'} error={ferr('name')} />
          <Field label="Shahar" value={f.city ?? ''} onChangeText={set('city')} placeholder="Toshkent" error={ferr('city')} />
          <Field label="Telefon" value={f.phone ?? ''} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="+998 90 123 45 67" error={ferr('phone')} />
          {role === 'SELLER'
            ? <Field label="Manzil" value={f.address ?? ''} onChangeText={set('address')} placeholder="Ko‘cha, uy" error={ferr('address')} />
            : <Field label="Veb-sayt" value={f.website ?? ''} onChangeText={set('website')} autoCapitalize="none" placeholder="https://..." error={ferr('website')} />}
          <Field label="Qisqacha ma’lumot" value={f.description ?? ''} onChangeText={set('description')} multiline error={ferr('description')} />
        </View>
      )}
      <FormError error={error} />
      <Button title="Davom etish" onPress={submit} loading={loading} disabled={!role || ((role === 'SELLER' || role === 'PUBLISHER') && !f.name?.trim())} />
    </View>
  );
}

const st = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: S.lg, borderRadius: R.lg, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.surface },
  active: { borderColor: C.primary },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.bold, fontSize: 16, color: C.ink },
});
