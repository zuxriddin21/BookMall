import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Book, Category } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { pickAndUpload } from '@/lib/pickMedia';
import { C, S } from '@/theme';
import { BookRow } from '@/ui/content';
import { BookCover, Button, Card, Chips, Field, FormError, Loading, Row, Screen, T, errorText, fieldErr, notice } from '@/ui/kit';

/** Markaziy katalogga kitob qo‘shish yoki (?id=) tahrirlash. Takror kitob bo‘lsa — mavjudi ko‘rsatiladi. */
export default function BookForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api<{ categories: Category[] }>('/api/categories') });
  const existing = useQuery({ enabled: Boolean(id), queryKey: ['book', id], queryFn: () => api<{ book: Book }>(`/api/books/${id}`) });
  const [f, setF] = useState<Record<string, string>>({ title: '', author: '', isbn: '', description: '', publisherName: '', publishedYear: '', pageCount: '' });
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [language, setLanguage] = useState('uz');
  const [cover, setCover] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [dup, setDup] = useState<Book | null>(null);
  const set = (k: string) => (t: string) => setF((x) => ({ ...x, [k]: t }));
  const isPublisher = hasRole('PUBLISHER') && !hasRole('ADMIN');

  useEffect(() => {
    const b = existing.data?.book;
    if (!b) return;
    setF({ title: b.title, author: b.author, isbn: b.isbn13 ?? '', description: b.description ?? '', publisherName: b.publisher?.name ?? '', publishedYear: b.publishedYear ? String(b.publishedYear) : '', pageCount: b.pageCount ? String(b.pageCount) : '' });
    setCategoryId(b.category?.id ?? null); setLanguage(b.language); setCover(b.coverUrl);
  }, [existing.data]);
  if (id && existing.isLoading) return <Screen title="Kitob"><Loading /></Screen>;
  const approvedEdit = existing.data?.book.status === 'APPROVED';

  const save = async () => {
    setError(null); setDup(null);
    setBusy(true);
    const num = (k: string) => (f[k].trim() ? Number(f[k]) : null);
    const body: Record<string, unknown> = approvedEdit
      ? { description: f.description.trim() || null, coverUrl: cover, categoryId, pageCount: num('pageCount'), publishedYear: num('publishedYear'), language }
      : {
          title: f.title.trim(), author: f.author.trim(), isbn: f.isbn.trim() || null, categoryId, description: f.description.trim() || null, coverUrl: cover,
          publisherName: isPublisher ? undefined : f.publisherName.trim() || null, publishedYear: num('publishedYear'), pageCount: num('pageCount'), language,
        };
    try {
      const r = await api<{ book: Book }>(id ? `/api/books/${id}` : '/api/books', { method: id ? 'PUT' : 'POST', body });
      void qc.invalidateQueries({ queryKey: ['books'] });
      void qc.invalidateQueries({ queryKey: ['book', r.book.id] });
      if (r.book.status === 'APPROVED') { notice('Saqlandi'); router.back(); return; }
      notice('Kitob yuborildi', 'Administrator tekshirgach katalogda paydo bo‘ladi. Holatini “Mening kitoblarim” bo‘limida ko‘rasiz.');
      if (!id && hasRole('SELLER')) router.replace({ pathname: '/seller/listing', params: { bookId: r.book.id } });
      else router.back();
    } catch (e) {
      const err = e as { code?: string; data?: { book?: Book } };
      if (err.code === 'DUPLICATE_BOOK' && err.data?.book) setDup(err.data.book);
      else setError(e);
    } finally {
      setBusy(false);
    }
  };
  const pickCover = async () => {
    setUp(true);
    try { const r = await pickAndUpload('images'); if (r) setCover(r.url); } catch (e) { notice('Yuklanmadi', errorText(e)); } finally { setUp(false); }
  };

  return (
    <Screen title={id ? 'Kitobni tahrirlash' : 'Katalogga kitob qo‘shish'}>
      {!id && <T variant="muted">Har bir kitob katalogda bir marta bo‘ladi. Avval qidiruvda borligini tekshiring — bor bo‘lsa, shunchaki sotuvga qo‘ying.</T>}
      {dup && (
        <Card style={{ borderColor: C.gold }}>
          <T variant="h2">Bu kitob katalogda allaqachon bor</T>
          <BookRow book={dup} />
          {hasRole('SELLER') && dup.status === 'APPROVED' && <Button title="Shu kitobni sotuvga qo‘yish" onPress={() => router.replace({ pathname: '/seller/listing', params: { bookId: dup.id } })} />}
        </Card>
      )}
      <Row style={{ alignItems: 'flex-end' }}>
        <BookCover uri={cover} title={f.title || 'Muqova'} width={80} />
        <Button small variant="outline" title={up ? 'Yuklanmoqda…' : cover ? 'Muqovani almashtirish' : 'Muqova yuklash'} onPress={pickCover} loading={up} />
      </Row>
      <Field label="Kitob nomi" value={f.title} onChangeText={set('title')} editable={!approvedEdit} error={fieldErr(error, 'title')} />
      <Field label="Muallif" value={f.author} onChangeText={set('author')} editable={!approvedEdit} error={fieldErr(error, 'author')} />
      <Field label="ISBN (bo‘lsa)" value={f.isbn} onChangeText={set('isbn')} editable={!approvedEdit} keyboardType="number-pad" placeholder="978-..." error={fieldErr(error, 'isbn')} />
      {!isPublisher && !approvedEdit && <Field label="Nashriyot" value={f.publisherName} onChangeText={set('publisherName')} />}
      <View style={{ gap: 6 }}>
        <T variant="label">Kategoriya</T>
        {cats.data && <Chips<string> value={categoryId ? String(categoryId) : ''} onChange={(v) => setCategoryId(v ? Number(v) : null)} options={[{ value: '', label: 'Tanlanmagan' }, ...cats.data.categories.map((c) => ({ value: String(c.id), label: c.name }))]} />}
      </View>
      <View style={{ gap: 6 }}>
        <T variant="label">Tili</T>
        <Chips value={language} onChange={setLanguage} options={[{ value: 'uz', label: 'O‘zbekcha' }, { value: 'ru', label: 'Ruscha' }, { value: 'en', label: 'Inglizcha' }, { value: 'other', label: 'Boshqa' }]} />
      </View>
      <Row>
        <View style={{ flex: 1 }}><Field label="Nashr yili" value={f.publishedYear} onChangeText={set('publishedYear')} keyboardType="number-pad" error={fieldErr(error, 'publishedYear')} /></View>
        <View style={{ flex: 1 }}><Field label="Sahifalar" value={f.pageCount} onChangeText={set('pageCount')} keyboardType="number-pad" error={fieldErr(error, 'pageCount')} /></View>
      </Row>
      <Field label="Tavsif" value={f.description} onChangeText={set('description')} multiline />
      <FormError error={error && !['title', 'author', 'isbn', 'publishedYear', 'pageCount'].some((k) => fieldErr(error, k)) ? error : null} />
      <Button title={id ? 'Saqlash' : 'Yuborish'} onPress={save} loading={busy} disabled={up || !f.title.trim() || !f.author.trim()} />
      <View style={{ height: S.lg }} />
    </Screen>
  );
}
