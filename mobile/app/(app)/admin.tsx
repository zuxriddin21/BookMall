import React, { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Book } from '@/api/types';
import { BOOK_STATUS_LABEL } from '@/lib/format';
import { BookRow } from '@/ui/content';
import { Button, Card, Chips, Empty, ErrorView, Field, Loading, Row, Screen, T, errorText, notice } from '@/ui/kit';

type St = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Admin: katalogga yuborilgan kitoblarni tasdiqlash yoki rad etish. */
export default function AdminScreen() {
  const [status, setStatus] = useState<St>('PENDING');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'books', status], queryFn: () => api<{ items: Book[] }>('/api/admin/books', { query: { status } }) });

  const act = async (b: Book, action: 'approve' | 'reject') => {
    if (action === 'reject' && (reasons[b.id] ?? '').trim().length < 3) return notice('Rad etish sababini yozing');
    setBusy(b.id + action);
    try {
      await api(`/api/admin/books/${b.id}/${action}`, { body: action === 'reject' ? { reason: reasons[b.id].trim() } : {} });
      await q.refetch();
      void qc.invalidateQueries({ queryKey: ['books'] });
    } catch (e) {
      notice('Bajarilmadi', errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title="Katalog tekshiruvi" onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Chips<St> value={status} onChange={setStatus} options={(['PENDING', 'APPROVED', 'REJECTED'] as St[]).map((s) => ({ value: s, label: BOOK_STATUS_LABEL[s] }))} />
      {q.isLoading ? <Loading /> : q.error ? <ErrorView error={q.error} onRetry={() => q.refetch()} /> : q.data?.items.length ? q.data.items.map((b) => (
        <Card key={b.id}>
          <BookRow book={b} />
          {b.isbn13 ? <T variant="small">ISBN: {b.isbn13}</T> : <T variant="small">ISBN ko‘rsatilmagan</T>}
          {b.description ? <T variant="small" numberOfLines={4}>{b.description}</T> : null}
          {status === 'PENDING' && (
            <View style={{ gap: 8 }}>
              <Field placeholder="Rad etish sababi (rad etsangiz)" value={reasons[b.id] ?? ''} onChangeText={(t) => setReasons((r) => ({ ...r, [b.id]: t }))} />
              <Row>
                <Button style={{ flex: 1 }} small title="Tasdiqlash" onPress={() => act(b, 'approve')} loading={busy === b.id + 'approve'} />
                <Button style={{ flex: 1 }} small variant="outline" title="Rad etish" onPress={() => act(b, 'reject')} loading={busy === b.id + 'reject'} />
              </Row>
            </View>
          )}
          {status === 'REJECTED' && <Button small variant="secondary" title="Baribir tasdiqlash" onPress={() => act(b, 'approve')} loading={busy === b.id + 'approve'} />}
        </Card>
      )) : <Empty title={status === 'PENDING' ? 'Tekshiruvni kutayotgan kitob yo‘q' : 'Ro‘yxat bo‘sh'} />}
    </Screen>
  );
}
