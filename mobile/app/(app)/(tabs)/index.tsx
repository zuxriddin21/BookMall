import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react-native';
import { api } from '@/api/client';
import type { Book, Paged, Post } from '@/api/types';
import { C, F, S } from '@/theme';
import { Bell } from '@/ui/Bell';
import { BookTile, PostCard } from '@/ui/content';
import { Chips, Empty, ErrorView, Loading, Row, T, Button } from '@/ui/kit';

type Scope = 'all' | 'following';

/** Asosiy: tavsiyalar + umumiy lenta (taqrizlar, aksiyalar, yangi nashrlar). */
export default function HomeScreen() {
  const [scope, setScope] = useState<Scope>('all');
  const rec = useQuery({ queryKey: ['books', 'recommended'], queryFn: () => api<{ items: Book[] }>('/api/books/recommended', { query: { limit: 12 } }) });
  const feed = useInfiniteQuery({
    queryKey: ['feed', scope],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api<Paged<Post>>('/api/feed', { query: { scope, cursor: pageParam, limit: 15 } }),
    getNextPageParam: (last) => last.nextCursor,
  });
  const posts = feed.data?.pages.flatMap((p) => p.items) ?? [];

  const header = (
    <View style={{ gap: S.lg, paddingBottom: S.md }}>
      {rec.data?.items.length ? (
        <View style={{ gap: S.md }}>
          <T variant="h2">Siz uchun</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {rec.data.items.map((b) => <BookTile key={b.id} book={b} />)}
          </ScrollView>
        </View>
      ) : null}
      <Chips<Scope> value={scope} onChange={setScope} options={[{ value: 'all', label: 'Hammasi' }, { value: 'following', label: 'Obunalarim' }]} />
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <Row style={{ paddingHorizontal: S.lg, height: 56, justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: F.display, fontSize: 26, color: C.gold }}>Book<Text style={{ color: C.green }}>Mall</Text></Text>
        <Bell />
      </Row>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PostCard post={item} />}
        contentContainerStyle={{ padding: S.lg, gap: S.md, paddingBottom: 100 }}
        ListHeaderComponent={header}
        ListEmptyComponent={feed.isLoading ? <Loading /> : feed.error ? <ErrorView error={feed.error} onRetry={() => feed.refetch()} /> : (
          <Empty
            title={scope === 'following' ? 'Obunalaringizdan hali post yo‘q' : 'Lenta hozircha bo‘sh'}
            text={scope === 'following' ? 'Blogerlar, do‘konlar va nashriyotlarga obuna bo‘ling' : 'Birinchi bo‘lib kitob haqida yozing!'}
            action={scope === 'following' ? <Button small variant="secondary" title="Qidirish" onPress={() => router.push('/search')} /> : undefined}
          />
        )}
        onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
        onEndReachedThreshold={0.4}
        ListFooterComponent={feed.isFetchingNextPage ? <Loading /> : null}
        refreshing={feed.isRefetching}
        onRefresh={() => { void feed.refetch(); void rec.refetch(); }}
      />
      <Pressable accessibilityLabel="Yangi post" onPress={() => router.push('/post/new')}
        style={{ position: 'absolute', right: 20, bottom: 20, width: 58, height: 58, borderRadius: 29, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }}>
        <Plus size={28} color="#fff" />
      </Pressable>
    </SafeAreaView>
  );
}
