import React from 'react';
import { View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Paged, Post } from '@/api/types';
import { PostCard } from './content';
import { Button, Empty, ErrorView, Loading } from './kit';

/** Filtrlangan postlar (foydalanuvchi, do‘kon, nashriyot) — "Yana" tugmasi bilan. */
export function PostList({ query, emptyText }: { query: Record<string, string>; emptyText: string }) {
  const q = useInfiniteQuery({
    queryKey: ['posts', query],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api<Paged<Post>>('/api/posts', { query: { ...query, cursor: pageParam, limit: 10 } }),
    getNextPageParam: (l) => l.nextCursor,
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (!items.length) return <Empty title={emptyText} />;
  return (
    <View style={{ gap: 12 }}>
      {items.map((p) => <PostCard key={p.id} post={p} />)}
      {q.hasNextPage && <Button title="Yana" variant="secondary" onPress={() => q.fetchNextPage()} loading={q.isFetchingNextPage} />}
    </View>
  );
}
