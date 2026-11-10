import React, { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Shelf, ShelfEntry } from '@/api/types';
import { C, F, R, S } from '@/theme';
import { SHELF_LABEL } from '@/lib/format';
import { BookCover, Button, Card, Chips, Empty, ErrorView, Loading, Row, Stars, T } from '@/ui/kit';

type Stats = { shelves: { read: number; reading: number; wantToRead: number }; readThisYear: number; pagesLast30Days: number; pagesTotal: number };

/** Saqlanmalar: shaxsiy kitob javoni va o‘qish statistikasi. */
export default function SavedScreen() {
  const [shelf, setShelf] = useState<Shelf>('READING');
  const list = useQuery({ queryKey: ['shelf', shelf], queryFn: () => api<{ items: ShelfEntry[] }>('/api/me/books', { query: { shelf } }) });
  const stats = useQuery({ queryKey: ['reading-stats'], queryFn: () => api<Stats>('/api/me/reading-stats') });
  const s = stats.data;

  const header = (
    <View style={{ gap: S.lg, paddingBottom: S.md }}>
      <T variant="display">Saqlanmalar</T>
      {s && (
        <Card style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {[
            [s.shelves.read, 'o‘qilgan'],
            [s.readThisYear, 'shu yil'],
            [s.pagesLast30Days, 'sahifa / 30 kun'],
          ].map(([n, l]) => (
            <View key={String(l)} style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: F.display, fontSize: 24, color: C.ink }}>{n}</Text>
              <T variant="small">{l}</T>
            </View>
          ))}
        </Card>
      )}
      <Chips<Shelf> value={shelf} onChange={setShelf} options={(['READING', 'WANT_TO_READ', 'READ'] as Shelf[]).map((v) => ({
        value: v, label: `${SHELF_LABEL[v]}${s ? ` (${v === 'READ' ? s.shelves.read : v === 'READING' ? s.shelves.reading : s.shelves.wantToRead})` : ''}`,
      }))} />
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <FlatList
        data={list.data?.items ?? []}
        keyExtractor={(e) => e.book.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: S.lg, gap: S.sm, paddingBottom: 40 }}
        renderItem={({ item }) => {
          const pct = item.book.pageCount ? Math.min(100, Math.round((item.currentPage / item.book.pageCount) * 100)) : null;
          return (
            <Pressable onPress={() => router.push(`/book/${item.book.id}`)} style={{ flexDirection: 'row', gap: 12, padding: 12, backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line }}>
              <BookCover uri={item.book.coverUrl} title={item.book.title} width={56} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text numberOfLines={2} style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>{item.book.title}</Text>
                <T variant="small">{item.book.author}</T>
                {item.shelf === 'READ' && item.rating ? <Stars value={item.rating} /> : null}
                {item.shelf === 'READING' && (
                  <View style={{ gap: 4 }}>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: C.surfaceAlt }}>
                      <View style={{ height: 6, borderRadius: 3, width: `${pct ?? 0}%`, backgroundColor: C.green }} />
                    </View>
                    <T variant="small">{item.currentPage}{item.book.pageCount ? ` / ${item.book.pageCount} sahifa (${pct}%)` : ' sahifa'}</T>
                  </View>
                )}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={list.isLoading ? <Loading /> : list.error ? <ErrorView error={list.error} onRetry={() => list.refetch()} /> : (
          <Empty title="Bu javon bo‘sh" text="Kitob sahifasida “O‘qimoqchiman”, “O‘qiyapman” yoki “O‘qidim” tugmasini bosing"
            action={<Button small variant="secondary" title="Kitob qidirish" onPress={() => router.push('/search')} />} />
        )}
        refreshing={list.isRefetching}
        onRefresh={() => { void list.refetch(); void stats.refetch(); }}
      />
    </SafeAreaView>
  );
}
