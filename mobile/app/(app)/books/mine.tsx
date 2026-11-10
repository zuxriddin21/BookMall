import React from 'react';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Book } from '@/api/types';
import { BOOK_STATUS_LABEL } from '@/lib/format';
import { BookRow } from '@/ui/content';
import { Badge, Button, Empty, Loading, Screen, T } from '@/ui/kit';

/** Men yuborgan kitoblar va ularning holati. */
export default function MyBooks() {
  const q = useQuery({ queryKey: ['books', 'mine'], queryFn: () => api<{ items: Book[] }>('/api/books/mine') });
  return (
    <Screen title="Mening kitoblarim" onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Button title="Kitob qo‘shish" onPress={() => router.push('/books/new')} />
      {q.isLoading ? <Loading /> : q.data?.items.length ? q.data.items.map((b) => (
        <BookRow key={b.id} book={b} onPress={() => router.push(b.status === 'APPROVED' ? `/book/${b.id}` : { pathname: '/books/new', params: { id: b.id } })}
          right={<Badge label={BOOK_STATUS_LABEL[b.status]} tone={b.status === 'APPROVED' ? 'success' : b.status === 'REJECTED' ? 'danger' : 'warn'} />} />
      )) : <Empty title="Hali kitob qo‘shmagansiz" />}
      <T variant="small">Tekshirilayotgan yoki rad etilgan kitobni bosib tahrirlashingiz mumkin. Rad etilgan kitob tuzatilgach qayta tekshiruvga yuboriladi.</T>
    </Screen>
  );
}
