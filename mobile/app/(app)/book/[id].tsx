import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Book, Offer, Paged, Post, Shelf } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { BOOK_STATUS_LABEL, SHELF_LABEL, som } from '@/lib/format';
import { C, F, R, S } from '@/theme';
import { PostCard } from '@/ui/content';
import { Avatar, Badge, BookCover, Button, Card, Chip, ErrorView, Field, Loading, Row, Screen, Section, Stars, T, Verified, errorText, notice } from '@/ui/kit';

type Detail = { book: Book; stats: { readers: number; avgRating: number | null; reviews: number } };
type Entry = { shelf: Shelf; rating: number | null; currentPage: number };

export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ['book', id], queryFn: () => api<Detail>(`/api/books/${id}`) });
  const offers = useQuery({ queryKey: ['offers', id], queryFn: () => api<{ offers: Offer[] }>(`/api/books/${id}/offers`), enabled: detail.data?.book.status === 'APPROVED' });
  const reviews = useQuery({ queryKey: ['posts', 'book', id], queryFn: () => api<Paged<Post>>('/api/posts', { query: { bookId: id, limit: 5 } }), enabled: detail.data?.book.status === 'APPROVED' });
  const entryQ = useQuery({
    queryKey: ['shelf-entry', id],
    enabled: Boolean(detail.data?.book.myShelf),
    queryFn: async () => (await api<{ items: (Entry & { book: Book })[] }>('/api/me/books')).items.find((x) => x.book.id === id) ?? null,
  });
  const [page, setPage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (entryQ.data) setPage(String(entryQ.data.currentPage)); }, [entryQ.data]);

  if (detail.isLoading) return <Screen title=""><Loading /></Screen>;
  if (detail.error || !detail.data) return <Screen title="Kitob"><ErrorView error={detail.error} onRetry={() => detail.refetch()} /></Screen>;
  const { book, stats } = detail.data;
  const entry = entryQ.data;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['book', id] });
    void qc.invalidateQueries({ queryKey: ['shelf-entry', id] });
    void qc.invalidateQueries({ queryKey: ['shelf'] });
    void qc.invalidateQueries({ queryKey: ['reading-stats'] });
  };
  const setShelf = async (shelf: Shelf | null, rating?: number) => {
    setBusy(true);
    try {
      if (shelf === null) await api(`/api/me/books/${id}`, { method: 'DELETE' });
      else await api(`/api/me/books/${id}`, { method: 'PUT', body: { shelf, ...(rating !== undefined ? { rating } : {}) } });
      refresh();
    } catch (e) {
      notice('Saqlanmadi', errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const saveProgress = async () => {
    const n = Number(page);
    if (!Number.isInteger(n) || n < 0) return notice('Sahifa raqamini to‘g‘ri yozing');
    setBusy(true);
    try {
      const r = await api<{ pagesLogged: number; entry: Entry }>(`/api/me/books/${id}/progress`, { body: { currentPage: n } });
      refresh();
      notice(r.entry.shelf === 'READ' ? 'Tabriklaymiz! Kitob o‘qib tugatildi' : 'Saqlandi', r.pagesLogged ? `+${r.pagesLogged} sahifa` : undefined);
    } catch (e) {
      notice('Saqlanmadi', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={book.title} onRefresh={() => { void detail.refetch(); void offers.refetch(); void reviews.refetch(); }} refreshing={detail.isRefetching}>
      <Row gap={16} style={{ alignItems: 'flex-start' }}>
        <BookCover uri={book.coverUrl} title={book.title} width={110} />
        <View style={{ flex: 1, gap: 6 }}>
          <T variant="title">{book.title}</T>
          <T style={{ fontFamily: F.semibold }}>{book.author}</T>
          {book.publisher && (
            <T variant="small" onPress={book.publisher.slug ? () => router.push(`/publisher/${book.publisher!.slug}`) : undefined} style={book.publisher.slug ? { color: C.primary } : undefined}>
              {book.publisher.name}
            </T>
          )}
          <T variant="small">{[book.category?.name, book.publishedYear, book.pageCount ? `${book.pageCount} bet` : null].filter(Boolean).join(' · ')}</T>
          {stats.avgRating ? <Row gap={6}><Stars value={Math.round(stats.avgRating)} /><T variant="small">{stats.avgRating} · {stats.readers} kitobxon</T></Row> : null}
          {book.status !== 'APPROVED' && <Badge label={BOOK_STATUS_LABEL[book.status]} tone={book.status === 'REJECTED' ? 'danger' : 'warn'} />}
        </View>
      </Row>
      {book.status === 'REJECTED' && book.rejectionReason ? <Card style={{ backgroundColor: C.dangerSoft, borderColor: C.dangerSoft }}><T>Rad etish sababi: {book.rejectionReason}</T></Card> : null}

      {book.status === 'APPROVED' && (
        <Card>
          <T variant="label">Mening javonim</T>
          <Row style={{ flexWrap: 'wrap' }}>
            {(['WANT_TO_READ', 'READING', 'READ'] as Shelf[]).map((s) => (
              <Chip key={s} label={SHELF_LABEL[s]} active={book.myShelf === s} onPress={() => !busy && setShelf(s)} />
            ))}
            {book.myShelf && <Chip label="Olib tashlash" onPress={() => !busy && setShelf(null)} />}
          </Row>
          {book.myShelf === 'READING' && (
            <Row style={{ alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Field label={`Qaysi sahifadasiz?${book.pageCount ? ` (jami ${book.pageCount})` : ''}`} value={page} onChangeText={setPage} keyboardType="number-pad" />
              </View>
              <Button title="Saqlash" small onPress={saveProgress} loading={busy} style={{ height: 50 }} />
            </Row>
          )}
          {book.myShelf === 'READ' && (
            <Row><T variant="small">Bahoingiz:</T><Stars value={entry?.rating ?? null} size={24} onChange={(r) => setShelf('READ', r)} /></Row>
          )}
        </Card>
      )}

      {book.description ? <Section title="Kitob haqida"><T>{book.description}</T></Section> : null}
      {book.isbn13 ? <T variant="small">ISBN: {book.isbn13}</T> : null}

      {book.status === 'APPROVED' && (
        <Section title="Narxlar" action={hasRole('SELLER') ? <Button small variant="secondary" title="Sotuvga qo‘yish" onPress={() => router.push({ pathname: '/seller/listing', params: { bookId: book.id } })} /> : undefined}>
          {offers.isLoading ? <Loading /> : offers.data?.offers.length ? offers.data.offers.map((o, i) => (
            <Card key={o.id} style={i === 0 && offers.data!.offers.length > 1 ? { borderColor: C.green } : undefined}>
              <Row>
                <Pressable onPress={() => router.push(`/store/${o.store.slug}`)}><Avatar uri={o.store.logoUrl} name={o.store.name} size={36} /></Pressable>
                <View style={{ flex: 1 }}>
                  <Row gap={4}><Text style={{ fontFamily: F.bold, color: C.ink, fontSize: 15 }} onPress={() => router.push(`/store/${o.store.slug}`)}>{o.store.name}</Text>{o.store.verified && <Verified />}</Row>
                  <T variant="small">{[o.store.city, o.condition === 'USED' ? 'Ishlatilgan' : 'Yangi', `${o.quantity} dona`].filter(Boolean).join(' · ')}</T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontFamily: F.bold, color: C.green, fontSize: 16 }}>{som(o.price)}</Text>
                  {i === 0 && offers.data!.offers.length > 1 && <T variant="small">eng arzon</T>}
                </View>
              </Row>
              {o.description ? <T variant="small">{o.description}</T> : null}
              <Button title="Buyurtma berish" small onPress={() => router.push({ pathname: '/order/[listingId]', params: { listingId: o.id, bookId: book.id } })} />
            </Card>
          )) : <T variant="muted">Hozircha hech bir do‘konda sotuvda yo‘q.</T>}
        </Section>
      )}

      {book.status === 'APPROVED' && (
        <Section title={`Taqrizlar va postlar${stats.reviews ? ` (${stats.reviews} taqriz)` : ''}`}
          action={<Button small variant="secondary" title="Taqriz yozish" onPress={() => router.push({ pathname: '/post/new', params: { type: 'REVIEW', bookId: book.id, bookTitle: book.title } })} />}>
          {reviews.data?.items.length ? reviews.data.items.map((p) => <PostCard key={p.id} post={p} onChanged={() => reviews.refetch()} />) : <T variant="muted">Hali hech kim yozmagan. Birinchi bo‘ling!</T>}
        </Section>
      )}
      <View style={{ height: 8, borderRadius: R.sm }} />
    </Screen>
  );
}
