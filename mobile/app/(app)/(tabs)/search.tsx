import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Search as SearchIcon, X } from 'lucide-react-native';
import { api } from '@/api/client';
import type { Book, Category } from '@/api/types';
import { C, F, R, S } from '@/theme';
import { BookRow } from '@/ui/content';
import { Avatar, Chip, Chips, Empty, ErrorView, Loading, Row, T, Verified } from '@/ui/kit';

type Kind = 'books' | 'stores' | 'publishers';
type Sort = 'new' | 'price_asc' | 'popular' | 'title';
type Org = { id: string; name: string; slug: string; logoUrl: string | null; city: string | null; verified: boolean; listingsCount?: number; booksCount?: number };

function useDebounced<T>(v: T, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/** Qidiruv: kitob nomi, muallif, nashriyot, kategoriya bo‘yicha; do‘kon va nashriyotlar. */
export default function SearchScreen() {
  const [kind, setKind] = useState<Kind>('books');
  const [text, setText] = useState('');
  const q = useDebounced(text.trim());
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('new');
  const [inStock, setInStock] = useState(false);

  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api<{ categories: Category[] }>('/api/categories'), staleTime: 3600_000 });
  const books = useInfiniteQuery({
    enabled: kind === 'books',
    queryKey: ['books', 'search', q, category, sort, inStock],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<{ items: Book[]; page: number; hasMore: boolean }>('/api/books', {
      query: { q, category, sort, inStock: inStock ? 'true' : undefined, page: pageParam, limit: 20 },
    }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  const orgs = useQuery({
    enabled: kind !== 'books',
    queryKey: [kind, q],
    queryFn: () => api<{ items: Org[] }>(`/api/${kind}`, { query: { q } }),
  });

  const filters = kind === 'books' && (
    <View style={{ gap: S.sm, paddingBottom: S.sm }}>
      <Chips<string> value={category ?? ''} onChange={(v) => setCategory(v || null)}
        options={[{ value: '', label: 'Barcha kategoriyalar' }, ...(cats.data?.categories ?? []).map((c) => ({ value: c.slug, label: c.name }))]} />
      <Row style={{ flexWrap: 'wrap' }}>
        <Chip label="Yangi" active={sort === 'new'} onPress={() => setSort('new')} />
        <Chip label="Arzonroq" active={sort === 'price_asc'} onPress={() => setSort('price_asc')} />
        <Chip label="Ommabop" active={sort === 'popular'} onPress={() => setSort('popular')} />
        <Chip label="A–Z" active={sort === 'title'} onPress={() => setSort('title')} />
        <Chip label="Sotuvda bor" active={inStock} onPress={() => setInStock((x) => !x)} />
      </Row>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={{ padding: S.lg, gap: S.md }}>
        <Row style={{ height: 50, borderWidth: 1, borderColor: C.line, borderRadius: R.md, backgroundColor: C.surface, paddingHorizontal: 12 }}>
          <SearchIcon size={20} color={C.faint} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={kind === 'books' ? 'Kitob, muallif, nashriyot yoki kategoriya' : kind === 'stores' ? 'Do‘kon nomi' : 'Nashriyot nomi'}
            placeholderTextColor={C.faint}
            autoCorrect={false}
            returnKeyType="search"
            style={{ flex: 1, fontFamily: F.body, fontSize: 16, color: C.ink, height: '100%' }}
          />
          {text ? <Pressable accessibilityLabel="Tozalash" onPress={() => setText('')} hitSlop={8}><X size={18} color={C.faint} /></Pressable> : null}
        </Row>
        <Chips<Kind> value={kind} onChange={setKind} options={[{ value: 'books', label: 'Kitoblar' }, { value: 'stores', label: 'Do‘konlar' }, { value: 'publishers', label: 'Nashriyotlar' }]} />
      </View>
      {kind === 'books' ? (
        <FlatList
          data={books.data?.pages.flatMap((p) => p.items) ?? []}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => <BookRow book={item} />}
          ListHeaderComponent={filters || null}
          contentContainerStyle={{ paddingHorizontal: S.lg, gap: S.sm, paddingBottom: 40 }}
          ListEmptyComponent={books.isLoading ? <Loading /> : books.error ? <ErrorView error={books.error} onRetry={() => books.refetch()} /> : <Empty title="Hech narsa topilmadi" text="Boshqa so‘z bilan qidirib ko‘ring" />}
          onEndReached={() => books.hasNextPage && !books.isFetchingNextPage && books.fetchNextPage()}
          onEndReachedThreshold={0.4}
          keyboardShouldPersistTaps="handled"
        />
      ) : (
        <FlatList
          data={orgs.data?.items ?? []}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ paddingHorizontal: S.lg, gap: S.sm, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/${kind === 'stores' ? 'store' : 'publisher'}/${item.slug}`)}
              style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line }}>
              <Avatar uri={item.logoUrl} name={item.name} size={48} />
              <View style={{ flex: 1 }}>
                <Row gap={4}><Text style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>{item.name}</Text>{item.verified && <Verified />}</Row>
                <T variant="small">{[item.city, kind === 'stores' ? `${item.listingsCount ?? 0} ta kitob sotuvda` : `${item.booksCount ?? 0} ta kitob`].filter(Boolean).join(' · ')}</T>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={orgs.isLoading ? <Loading /> : orgs.error ? <ErrorView error={orgs.error} onRetry={() => orgs.refetch()} /> : <Empty title="Hech narsa topilmadi" />}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </SafeAreaView>
  );
}
