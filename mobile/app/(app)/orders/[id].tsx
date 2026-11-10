import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Order } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { ORDER_STATUS_LABEL, ago, som } from '@/lib/format';
import { C, F } from '@/theme';
import { Badge, Button, Card, ErrorView, Loading, Row, Screen, T, confirm, errorText, notice } from '@/ui/kit';
import { statusTone } from '@/ui/OrderCard';

const NEXT: Record<string, { status: Order['status']; label: string; danger?: boolean }[]> = {
  PENDING: [{ status: 'CONFIRMED', label: 'Tasdiqlash' }, { status: 'CANCELLED', label: 'Bekor qilish', danger: true }],
  CONFIRMED: [{ status: 'SHIPPED', label: 'Yo‘lga chiqdi' }, { status: 'COMPLETED', label: 'Yetkazildi' }, { status: 'CANCELLED', label: 'Bekor qilish', danger: true }],
  SHIPPED: [{ status: 'COMPLETED', label: 'Yetkazildi' }],
};

/** Buyurtma tafsilotlari. Sotuvchi holatini o‘zgartiradi, xaridor kutilayotganini bekor qila oladi. */
export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['orders', id], queryFn: () => api<{ order: Order }>(`/api/orders/${id}`) });
  const [busy, setBusy] = useState<string | null>(null);
  if (q.isLoading) return <Screen title="Buyurtma"><Loading /></Screen>;
  if (!q.data) return <Screen title="Buyurtma"><ErrorView error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const o = q.data.order;
  const isSeller = me?.store?.id === o.store.id;
  const isBuyer = me?.user.id === o.buyerId;
  const actions = isSeller ? NEXT[o.status] ?? [] : isBuyer && o.status === 'PENDING' ? [{ status: 'CANCELLED' as const, label: 'Buyurtmani bekor qilish', danger: true }] : [];

  const change = async (status: Order['status'], label: string, danger?: boolean) => {
    if (danger && !(await confirm(label, 'Buyurtma bekor qilinadi va kitoblar do‘kon zaxirasiga qaytadi.', 'Bekor qilish', true))) return;
    setBusy(status);
    try {
      await api(`/api/orders/${id}/status`, { body: { status } });
      await q.refetch();
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['listings'] });
    } catch (e) {
      notice('O‘zgartirilmadi', errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title={`Buyurtma №${o.number}`} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Badge label={ORDER_STATUS_LABEL[o.status]} tone={statusTone(o.status)} />
        <T variant="small">{ago(o.createdAt)}</T>
      </Row>
      <Card>
        <T variant="label">Kitoblar</T>
        {o.items.map((i) => (
          <Row key={i.id} style={{ justifyContent: 'space-between' }}>
            <T style={{ flex: 1 }} onPress={i.bookId ? () => router.push(`/book/${i.bookId}`) : undefined}>{i.title} × {i.quantity}</T>
            <T>{som(i.unitPrice * i.quantity)}</T>
          </Row>
        ))}
        <View style={{ height: 1, backgroundColor: C.line }} />
        <Row style={{ justifyContent: 'space-between' }}><T variant="h2">Jami</T><Text style={{ fontFamily: F.bold, fontSize: 17, color: C.green }}>{som(o.total)}</Text></Row>
      </Card>
      <Card>
        <T variant="label">{isSeller ? 'Xaridor' : 'Yetkazish'}</T>
        <T>{o.contactName}</T>
        <T selectable>{o.contactPhone}</T>
        <T>{o.address}</T>
        {o.note ? <T variant="small">Izoh: {o.note}</T> : null}
      </Card>
      {!isSeller && (
        <Card onPress={() => router.push(`/store/${o.store.slug}`)}>
          <T variant="label">Do‘kon</T>
          <T variant="h2">{o.store.name}</T>
          {o.store.phone ? <T selectable>{o.store.phone}</T> : null}
        </Card>
      )}
      {actions.map((a) => (
        <Button key={a.status} title={a.label} variant={a.danger ? 'outline' : 'primary'} loading={busy === a.status} onPress={() => change(a.status, a.label, a.danger)} />
      ))}
    </Screen>
  );
}
