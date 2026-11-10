import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Listing, Order } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { som } from '@/lib/format';
import { C, F, R } from '@/theme';
import { OrgForm } from '@/ui/OrgForm';
import { OrderCard } from '@/ui/OrderCard';
import { Badge, BookCover, Button, Chips, Empty, ErrorView, Loading, Row, Screen, T } from '@/ui/kit';

type Tab = 'listings' | 'orders' | 'store';

/** Do‘kon paneli: e’lonlar, buyurtmalar, do‘kon profili. */
export default function SellerPanel() {
  const { me } = useAuth();
  const [tab, setTab] = useState<Tab>('listings');
  const [status, setStatus] = useState<string>('');
  const listings = useQuery({ queryKey: ['listings', 'mine'], queryFn: () => api<{ items: Listing[] }>('/api/listings/mine') });
  const orders = useQuery({ queryKey: ['orders', 'store', status], queryFn: () => api<{ items: Order[] }>('/api/orders/store', { query: { status } }) });
  if (!me?.store) return <Screen title="Do‘kon"><Empty title="Do‘kon profili yo‘q" action={<Button title="Do‘kon ochish" onPress={() => router.push('/settings/add-role')} />} /></Screen>;
  const pending = orders.data?.items.filter((o) => o.status === 'PENDING').length ?? 0;

  return (
    <Screen title={me.store.name} right={<Button small variant="ghost" title="Sahifam" onPress={() => router.push(`/store/${me.store!.slug}`)} />}
      onRefresh={() => { void listings.refetch(); void orders.refetch(); }} refreshing={listings.isRefetching || orders.isRefetching}>
      <Chips<Tab> value={tab} onChange={setTab} options={[
        { value: 'listings', label: `Kitoblarim (${listings.data?.items.length ?? 0})` },
        { value: 'orders', label: `Buyurtmalar${pending ? ` • ${pending} yangi` : ''}` },
        { value: 'store', label: 'Do‘kon ma’lumotlari' },
      ]} />

      {tab === 'listings' && (
        <View style={{ gap: 10 }}>
          <Row>
            <Button style={{ flex: 1 }} title="Katalogdan qo‘shish" onPress={() => router.push('/seller/listing')} />
            <Button style={{ flex: 1 }} variant="outline" title="Yangi kitob" onPress={() => router.push('/books/new')} />
          </Row>
          <Button variant="secondary" title="Aksiya yoki yangilik e’lon qilish" onPress={() => router.push('/post/new')} />
          {listings.isLoading ? <Loading /> : listings.error ? <ErrorView error={listings.error} onRetry={() => listings.refetch()} /> : listings.data?.items.length ? listings.data.items.map((l) => (
            <Pressable key={l.id} onPress={() => router.push({ pathname: '/seller/listing', params: { id: l.id } })}
              style={{ flexDirection: 'row', gap: 12, padding: 12, backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, alignItems: 'center' }}>
              <BookCover uri={l.photos[0] ?? l.book.coverUrl} title={l.book.title} width={46} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text numberOfLines={2} style={{ fontFamily: F.bold, color: C.ink }}>{l.book.title}</Text>
                <T variant="small">{l.quantity} dona · {l.condition === 'USED' ? 'ishlatilgan' : 'yangi'}</T>
                <Row gap={6}>
                  {l.status === 'PAUSED' && <Badge label="To‘xtatilgan" tone="warn" />}
                  {l.quantity === 0 && <Badge label="Tugagan" tone="danger" />}
                  {l.book.status === 'PENDING' && <Badge label="Kitob tekshirilmoqda" tone="warn" />}
                </Row>
              </View>
              <Text style={{ fontFamily: F.bold, color: C.green }}>{som(l.price)}</Text>
            </Pressable>
          )) : <Empty title="Hali kitob qo‘shmagansiz" text="Katalogdan kitob tanlab, narxi va sonini kiriting" />}
        </View>
      )}

      {tab === 'orders' && (
        <View style={{ gap: 10 }}>
          <Chips value={status} onChange={setStatus} options={[{ value: '', label: 'Hammasi' }, { value: 'PENDING', label: 'Yangi' }, { value: 'CONFIRMED', label: 'Tasdiqlangan' }, { value: 'SHIPPED', label: 'Yo‘lda' }, { value: 'COMPLETED', label: 'Yetkazilgan' }, { value: 'CANCELLED', label: 'Bekor' }]} />
          {orders.isLoading ? <Loading /> : orders.data?.items.length ? orders.data.items.map((o) => <OrderCard key={o.id} order={o} seller />) : <Empty title="Buyurtma yo‘q" />}
        </View>
      )}

      {tab === 'store' && <OrgForm kind="store" value={me.store} />}
    </Screen>
  );
}
