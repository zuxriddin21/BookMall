import React, { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, MessageCircle, Package, Repeat2, UserPlus, Info } from 'lucide-react-native';
import { api } from '@/api/client';
import type { Notification, Paged } from '@/api/types';
import { ago } from '@/lib/format';
import { C, F, S } from '@/theme';
import { Button, Chips, Empty, ErrorView, Loading, Screen } from '@/ui/kit';

type Cat = 'ALL' | 'SOCIAL' | 'ORDER' | 'SYSTEM';
const ICON: Record<string, typeof Heart> = { LIKE: Heart, COMMENT: MessageCircle, REPOST: Repeat2, FOLLOW: UserPlus };

/** 🔔 Bildirishnomalar: Ijtimoiy / Buyurtmalar / Tizim. */
export default function NotificationsScreen() {
  const [cat, setCat] = useState<Cat>('ALL');
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ['notifications', 'list', cat],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api<Paged<Notification>>('/api/notifications', { query: { category: cat === 'ALL' ? undefined : cat, cursor: pageParam } }),
    getNextPageParam: (l) => l.nextCursor,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  const markRead = async (ids?: string[]) => {
    await api('/api/notifications/read', { body: ids ? { ids } : { all: true } }).catch(() => undefined);
    void qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  const open = (n: Notification) => {
    if (!n.read) void markRead([n.id]);
    if (n.orderId) router.push(`/orders/${n.orderId}`);
    else if (n.postId) router.push(`/post/${n.postId}`);
    else if (n.bookId) router.push(`/book/${n.bookId}`);
    else if (n.actor) router.push(`/user/${n.actor.username}`);
  };

  return (
    <Screen title="Bildirishnomalar" scroll={false} padded={false} right={<Button small variant="ghost" title="Hammasini o‘qish" onPress={() => markRead()} />}>
      <View style={{ padding: S.lg, paddingBottom: S.sm }}>
        <Chips<Cat> value={cat} onChange={setCat} options={[{ value: 'ALL', label: 'Hammasi' }, { value: 'SOCIAL', label: 'Ijtimoiy' }, { value: 'ORDER', label: 'Buyurtmalar' }, { value: 'SYSTEM', label: 'Tizim' }]} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        renderItem={({ item: n }) => {
          const Icon = n.category === 'ORDER' ? Package : ICON[n.type] ?? Info;
          return (
            <Pressable onPress={() => open(n)} style={{ flexDirection: 'row', gap: 12, padding: S.lg, backgroundColor: n.read ? 'transparent' : C.surfaceAlt, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}><Icon size={18} color={n.type === 'LIKE' ? C.danger : C.primary} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: n.read ? F.body : F.semibold, color: C.ink, fontSize: 14 }}>{n.text}</Text>
                <Text style={{ fontFamily: F.body, color: C.muted, fontSize: 12 }}>{ago(n.createdAt)}</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={q.isLoading ? <Loading /> : q.error ? <ErrorView error={q.error} onRetry={() => q.refetch()} /> : <Empty title="Bildirishnoma yo‘q" text="Layk, izoh, obuna va buyurtmalar shu yerda ko‘rinadi" />}
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
        refreshing={q.isRefetching}
        onRefresh={() => q.refetch()}
      />
    </Screen>
  );
}
