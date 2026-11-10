import React, { useState } from 'react';
import { View } from 'react-native';
import { api } from '@/api/client';
import type { Publisher, Store } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { pickAndUpload } from '@/lib/pickMedia';
import { S } from '@/theme';
import { Avatar, Button, Field, FormError, Row, errorText, fieldErr, notice } from './kit';

/** Do‘kon yoki nashriyot profilini tahrirlash. */
export function OrgForm({ kind, value }: { kind: 'store' | 'publisher'; value: Store | Publisher }) {
  const { refreshMe } = useAuth();
  const v = value as Store & Publisher;
  const [f, setF] = useState<Record<string, string>>({
    name: v.name ?? '', city: v.city ?? '', phone: v.phone ?? '', description: v.description ?? '',
    address: v.address ?? '', website: v.website ?? '', foundedYear: v.foundedYear ? String(v.foundedYear) : '',
  });
  const [logo, setLogo] = useState(v.logoUrl);
  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = (k: string) => (t: string) => setF((x) => ({ ...x, [k]: t }));
  const n = (k: string) => f[k]?.trim() || null;

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name: f.name.trim(), city: n('city'), phone: n('phone'), description: n('description'), logoUrl: logo };
      if (kind === 'store') body.address = n('address');
      else { body.website = n('website'); body.foundedYear = f.foundedYear ? Number(f.foundedYear) : null; }
      await api(`/api/me/${kind}`, { method: 'PUT', body });
      await refreshMe();
      notice('Saqlandi');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const pickLogo = async () => {
    setUp(true);
    try { const r = await pickAndUpload('images'); if (r) setLogo(r.url); } catch (e) { notice('Yuklanmadi', errorText(e)); } finally { setUp(false); }
  };

  return (
    <View style={{ gap: S.md }}>
      <Row>
        <Avatar uri={logo} name={f.name} size={64} />
        <Button small variant="outline" title={up ? 'Yuklanmoqda…' : 'Logotip yuklash'} onPress={pickLogo} loading={up} />
      </Row>
      <Field label="Nomi" value={f.name} onChangeText={set('name')} error={fieldErr(error, 'name')} />
      <Field label="Shahar" value={f.city} onChangeText={set('city')} />
      <Field label="Telefon" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" error={fieldErr(error, 'phone')} />
      {kind === 'store'
        ? <Field label="Manzil" value={f.address} onChangeText={set('address')} />
        : <>
            <Field label="Veb-sayt" value={f.website} onChangeText={set('website')} autoCapitalize="none" error={fieldErr(error, 'website')} />
            <Field label="Tashkil topgan yil" value={f.foundedYear} onChangeText={set('foundedYear')} keyboardType="number-pad" error={fieldErr(error, 'foundedYear')} />
          </>}
      <Field label="Ta’rif" value={f.description} onChangeText={set('description')} multiline />
      <FormError error={error && !fieldErr(error, 'name') && !fieldErr(error, 'phone') ? error : null} />
      <Button title="Saqlash" onPress={save} loading={busy} disabled={up || f.name.trim().length < 2} />
    </View>
  );
}
