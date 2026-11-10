import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react-native';
import { api } from '@/api/client';
import type { Book, Offer, Order } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { som } from '@/lib/format';
import { C, F, R } from '@/theme';
import { BookCover, Button, Card, ErrorView, Field, FormError, Loading, Row, Screen, T, fieldErr } from '@/ui/kit';

/** Buyurtma berish: soni, ism, telefon, manzil. To‘lov — yetkazib berilganda (do‘kon bilan kelishiladi). */
export default function OrderScreen() {
  const { listingId, bookId } = useLocalSearchParams<{ listingId: string; bookId: string }>();
  const { me } = useAuth();
  const qc = useQueryClient();
  const book = useQuery({ queryKey: ['book', bookId], queryFn: () => api<{ book: Book }>(`/api/books/${bookId}`) });
  const offers = useQuery({ queryKey: ['offers', bookId], queryFn: () => api<{ offers: Offer[] }>(`/api/books/${bookId}/offers`) });
  const offer = offers.data?.offers.find((o) => o.id === listingId);
  const [qty, setQty] = useState(1);
  const [name, setName] = useState(me?.user.name ?? '');
  const [phone, setPhone] = useState(me?.user.phone ?? '');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (offers.isLoading || book.isLoading) return <Screen title="Buyurtma"><Loading /></Screen>;
  if (!offer || !book.data) return <Screen title="Buyurtma"><ErrorView error={offers.error ?? new Error('Bu taklif endi sotuvda yo‘q')} /></Screen>;

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await api<{ order: Order }>('/api/orders', { body: { items: [{ listingId, quantity: qty }], contactName: name.trim(), contactPhone: phone.trim(), address: address.trim(), note: note.trim() || undefined } });
      void qc.invalidateQueries({ queryKey: ['offers', bookId] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
      router.replace(`/orders/${r.order.id}`);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  const b = book.data.book;
  return (
    <Screen title="Buyurtma berish">
      <Card>
        <Row gap={12}>
          <BookCover uri={b.coverUrl} title={b.title} width={52} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>{b.title}</Text>
            <T variant="small">{offer.store.name} · {offer.condition === 'USED' ? 'ishlatilgan' : 'yangi'}</T>
            <Text style={{ fontFamily: F.bold, color: C.green }}>{som(offer.price)}</Text>
          </View>
        </Row>
        <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
          <T>Soni</T>
          <Row gap={14}>
            <Pressable accessibilityLabel="Kamaytirish" onPress={() => setQty((q) => Math.max(1, q - 1))} style={{ width: 36, height: 36, borderRadius: R.sm, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}><Minus size={18} color={C.ink} /></Pressable>
            <Text style={{ fontFamily: F.bold, fontSize: 18, minWidth: 24, textAlign: 'center' }}>{qty}</Text>
            <Pressable accessibilityLabel="Ko‘paytirish" onPress={() => setQty((q) => Math.min(offer.quantity, q + 1))} style={{ width: 36, height: 36, borderRadius: R.sm, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}><Plus size={18} color={C.ink} /></Pressable>
          </Row>
        </Row>
        <T variant="small">Do‘konda {offer.quantity} dona bor</T>
      </Card>
      <Field label="Ismingiz" value={name} onChangeText={setName} error={fieldErr(error, 'contactName')} />
      <Field label="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+998 90 123 45 67" error={fieldErr(error, 'contactPhone')} />
      <Field label="Yetkazish manzili" value={address} onChangeText={setAddress} placeholder="Shahar, tuman, ko‘cha, uy" multiline error={fieldErr(error, 'address')} />
      <Field label="Izoh (ixtiyoriy)" value={note} onChangeText={setNote} placeholder="Masalan: qo‘ng‘iroq qilib keling" />
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="h2">Jami</T>
        <Text style={{ fontFamily: F.display, fontSize: 24, color: C.ink }}>{som(offer.price * qty)}</Text>
      </Row>
      <FormError error={error && !fieldErr(error, 'contactName') && !fieldErr(error, 'contactPhone') && !fieldErr(error, 'address') ? error : null} />
      <Button title="Buyurtmani yuborish" onPress={submit} loading={loading} disabled={!name.trim() || !phone.trim() || !address.trim()} />
      <T variant="small">To‘lov va yetkazib berish shartlarini do‘kon siz bilan telefon orqali kelishadi.</T>
    </Screen>
  );
}
