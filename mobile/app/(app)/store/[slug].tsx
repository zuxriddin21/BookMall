import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Listing, Store } from '@/api/types';
import { som } from '@/lib/format';
import { C, F, R } from '@/theme';
import { FollowButton } from '@/ui/FollowButton';
import { PostList } from '@/ui/PostList';
import { Avatar, BookCover, Button, Chips, Empty, ErrorView, Loading, Row, Screen, T, Verified } from '@/ui/kit';

/** Do‘kon sahifasi: sotuvdagi kitoblar va postlar (aksiya, yangi kelganlar). */
export default function StoreScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [tab, setTab] = useState<'books' | 'posts'>('books');
  const q = useQuery({ queryKey: ['store', slug], queryFn: () => api<{ store: Store; listings: Listing[] }>(`/api/stores/${slug}`) });
  if (q.isLoading) return <Screen title=""><Loading /></Screen>;
  if (!q.data) return <Screen title="Do‘kon"><ErrorView error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const { store, listings } = q.data;
  return (
    <Screen title={store.name} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Row gap={14}>
        <Avatar uri={store.logoUrl} name={store.name} size={68} />
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={4}><T variant="title">{store.name}</T>{store.verified && <Verified />}</Row>
          <T variant="small">Do‘kon{store.city ? ` · ${store.city}` : ''} · {store.followersCount} obunachi</T>
        </View>
        {store.isMine ? <Button small variant="outline" title="Boshqarish" onPress={() => router.push('/seller')} /> : <FollowButton targetType="STORE" targetId={store.id} initial={Boolean(store.isFollowing)} onChange={() => q.refetch()} />}
      </Row>
      {store.description ? <T>{store.description}</T> : null}
      {store.phone || store.address ? <T variant="small" selectable>{[store.phone, store.address].filter(Boolean).join(' · ')}</T> : null}
      <Chips value={tab} onChange={setTab} options={[{ value: 'books', label: `Kitoblar (${listings.length})` }, { value: 'posts', label: 'Postlar' }]} />
      {tab === 'books' ? (listings.length ? listings.map((l) => (
        <Pressable key={l.id} onPress={() => router.push(`/book/${l.book.id}`)} style={{ flexDirection: 'row', gap: 12, padding: 12, backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, alignItems: 'center' }}>
          <BookCover uri={l.photos[0] ?? l.book.coverUrl} title={l.book.title} width={52} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={2} style={{ fontFamily: F.bold, color: C.ink, fontSize: 15 }}>{l.book.title}</Text>
            <T variant="small">{l.book.author} · {l.condition === 'USED' ? 'ishlatilgan' : 'yangi'} · {l.quantity} dona</T>
          </View>
          <Text style={{ fontFamily: F.bold, color: C.green }}>{som(l.price)}</Text>
        </Pressable>
      )) : <Empty title="Hozircha sotuvda kitob yo‘q" />) : <PostList query={{ storeId: store.id }} emptyText="Hali post yo‘q" />}
    </Screen>
  );
}
