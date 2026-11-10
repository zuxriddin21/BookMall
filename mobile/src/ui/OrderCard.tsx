import React from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Order } from '@/api/types';
import { ORDER_STATUS_LABEL, ago, som } from '@/lib/format';
import { C, F } from '@/theme';
import { Badge, Card, Row, T } from './kit';

export const statusTone = (s: Order['status']) => (s === 'CANCELLED' ? 'danger' : s === 'COMPLETED' ? 'success' : s === 'PENDING' ? 'warn' : 'neutral') as 'danger' | 'success' | 'warn' | 'neutral';

export function OrderCard({ order, seller }: { order: Order; seller?: boolean }) {
  return (
    <Card onPress={() => router.push(`/orders/${order.id}`)}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>№{order.number} · {seller ? order.contactName : order.store.name}</Text>
        <Badge label={ORDER_STATUS_LABEL[order.status]} tone={statusTone(order.status)} />
      </Row>
      <T variant="small" numberOfLines={2}>{order.items.map((i) => `${i.title} × ${i.quantity}`).join(', ')}</T>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="small">{ago(order.createdAt)}</T>
        <Text style={{ fontFamily: F.bold, color: C.green }}>{som(order.total)}</Text>
      </Row>
      <View />
    </Card>
  );
}
