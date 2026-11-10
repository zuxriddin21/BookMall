import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Book, Publisher } from '@/api/types';
import { BookRow } from '@/ui/content';
import { FollowButton } from '@/ui/FollowButton';
import { PostList } from '@/ui/PostList';
import { Avatar, Button, Chips, Empty, ErrorView, Loading, Row, Screen, T, Verified } from '@/ui/kit';

/** Nashriyot sahifasi: kitoblari va yangiliklari. */
export default function PublisherScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [tab, setTab] = useState<'books' | 'posts'>('books');
  const q = useQuery({ queryKey: ['publisher', slug], queryFn: () => api<{ publisher: Publisher; books: Book[] }>(`/api/publishers/${slug}`) });
  if (q.isLoading) return <Screen title=""><Loading /></Screen>;
  if (!q.data) return <Screen title="Nashriyot"><ErrorView error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const { publisher: p, books } = q.data;
  return (
    <Screen title={p.name} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Row gap={14}>
        <Avatar uri={p.logoUrl} name={p.name} size={68} />
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={4}><T variant="title">{p.name}</T>{p.verified && <Verified />}</Row>
          <T variant="small">Nashriyot{p.city ? ` · ${p.city}` : ''}{p.foundedYear ? ` · ${p.foundedYear}-yildan` : ''} · {p.followersCount} obunachi</T>
        </View>
        {p.isMine ? <Button small variant="outline" title="Boshqarish" onPress={() => router.push('/publisher-panel')} /> : <FollowButton targetType="PUBLISHER" targetId={p.id} initial={Boolean(p.isFollowing)} onChange={() => q.refetch()} />}
      </Row>
      {p.description ? <T>{p.description}</T> : null}
      {p.website ? <T variant="small" selectable>{p.website}</T> : null}
      <Chips value={tab} onChange={setTab} options={[{ value: 'books', label: `Kitoblar (${books.length})` }, { value: 'posts', label: 'Yangiliklar' }]} />
      {tab === 'books' ? (books.length ? books.map((b) => <BookRow key={b.id} book={b} />) : <Empty title="Hali kitob qo‘shilmagan" />) : <PostList query={{ publisherId: p.id }} emptyText="Hali yangilik yo‘q" />}
    </Screen>
  );
}
