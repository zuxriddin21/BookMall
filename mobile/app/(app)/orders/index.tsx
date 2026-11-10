import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from '@/api/client';
import type { Order } from '@/api/types';
import { Button, Empty, ErrorView, Loading, Screen } from '@/ui/kit';
import { OrderCard } from '@/ui/OrderCard';

export default function MyOrders() {
  const q = useQuery({ queryKey: ['orders', 'mine'], queryFn: () => api<{ items: Order[] }>('/api/orders/mine') });
  return (
    <Screen title="Mening buyurtmalarim" onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      {q.isLoading ? <Loading /> : q.error ? <ErrorView error={q.error} onRetry={() => q.refetch()} /> : q.data?.items.length
        ? q.data.items.map((o) => <OrderCard key={o.id} order={o} />)
        : <Empty title="Hali buyurtma yo‘q" text="Kitob sahifasida do‘konni tanlab buyurtma bering" action={<Button small variant="secondary" title="Kitob qidirish" onPress={() => router.push('/search')} />} />}
    </Screen>
  );
}
