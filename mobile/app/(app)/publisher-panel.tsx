import React, { useState } from 'react';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Book } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { BOOK_STATUS_LABEL } from '@/lib/format';
import { BookRow } from '@/ui/content';
import { OrgForm } from '@/ui/OrgForm';
import { Badge, Button, Chips, Empty, Loading, Row, Screen } from '@/ui/kit';

/** Nashriyot paneli: kitoblar (holati bilan), yangilik e’lon qilish, profil. */
export default function PublisherPanel() {
  const { me } = useAuth();
  const [tab, setTab] = useState<'books' | 'profile'>('books');
  const q = useQuery({ queryKey: ['books', 'mine'], queryFn: () => api<{ items: Book[] }>('/api/books/mine') });
  if (!me?.publisher) return <Screen title="Nashriyot"><Empty title="Nashriyot profili yo‘q" action={<Button title="Nashriyot qo‘shish" onPress={() => router.push('/settings/add-role')} />} /></Screen>;
  return (
    <Screen title={me.publisher.name} right={<Button small variant="ghost" title="Sahifam" onPress={() => router.push(`/publisher/${me.publisher!.slug}`)} />}
      onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Chips value={tab} onChange={setTab} options={[{ value: 'books', label: `Kitoblarimiz (${q.data?.items.length ?? 0})` }, { value: 'profile', label: 'Nashriyot ma’lumotlari' }]} />
      {tab === 'books' ? (
        <>
          <Row>
            <Button style={{ flex: 1 }} title="Kitob qo‘shish" onPress={() => router.push('/books/new')} />
            <Button style={{ flex: 1 }} variant="outline" title="Yangilik e’lon qilish" onPress={() => router.push('/post/new')} />
          </Row>
          {q.isLoading ? <Loading /> : q.data?.items.length ? q.data.items.map((b) => (
            <BookRow key={b.id} book={b} onPress={() => router.push({ pathname: '/books/new', params: { id: b.id } })}
              right={<Badge label={BOOK_STATUS_LABEL[b.status]} tone={b.status === 'APPROVED' ? 'success' : b.status === 'REJECTED' ? 'danger' : 'warn'} />} />
          )) : <Empty title="Hali kitob qo‘shilmagan" text="Nashr etgan kitoblaringizni katalogga qo‘shing — do‘konlar ularni sotuvga qo‘ya oladi" />}
        </>
      ) : <OrgForm kind="publisher" value={me.publisher} />}
    </Screen>
  );
}
