import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { api } from '@/api/client';
import type { Book, Listing } from '@/api/types';
import { pickAndUpload } from '@/lib/pickMedia';
import { R } from '@/theme';
import { BookPicker, type PickedBook } from '@/ui/BookPicker';
import { Button, Chips, Field, FormError, Loading, Row, Screen, T, confirm, errorText, fieldErr, notice } from '@/ui/kit';

/** E’lon: katalogdagi kitob + narx + son + holat + rasmlar. ?id= bo‘lsa — tahrirlash. */
export default function ListingForm() {
  const { id, bookId } = useLocalSearchParams<{ id?: string; bookId?: string }>();
  const qc = useQueryClient();
  const mine = useQuery({ enabled: Boolean(id), queryKey: ['listings', 'mine'], queryFn: () => api<{ items: Listing[] }>('/api/listings/mine') });
  const preBook = useQuery({ enabled: Boolean(bookId), queryKey: ['book', bookId], queryFn: () => api<{ book: Book }>(`/api/books/${bookId}`) });
  const existing = mine.data?.items.find((l) => l.id === id);
  const [book, setBook] = useState<PickedBook | null>(null);
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');
  const [condition, setCondition] = useState<'NEW' | 'USED'>('NEW');
  const [desc, setDesc] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (existing) {
      setBook({ id: existing.book.id, title: existing.book.title, author: existing.book.author, coverUrl: existing.book.coverUrl });
      setPrice(String(existing.price)); setQty(String(existing.quantity)); setCondition(existing.condition);
      setDesc(existing.description ?? ''); setPhotos(existing.photos); setPaused(existing.status === 'PAUSED');
    }
  }, [existing]);
  useEffect(() => { if (preBook.data) setBook({ id: preBook.data.book.id, title: preBook.data.book.title, author: preBook.data.book.author, coverUrl: preBook.data.book.coverUrl }); }, [preBook.data]);
  if (id && mine.isLoading) return <Screen title="E’lon"><Loading /></Screen>;

  const done = () => { void qc.invalidateQueries({ queryKey: ['listings'] }); void qc.invalidateQueries({ queryKey: ['offers'] }); router.back(); };
  const save = async () => {
    setError(null);
    const p = Number(price.replace(/\s/g, ''));
    const q = Number(qty);
    if (!Number.isFinite(p) || !Number.isInteger(q)) return setError(new Error('Narx va sonni raqamda yozing'));
    setBusy(true);
    try {
      const common = { price: p, quantity: q, description: desc.trim() || null, photos };
      if (existing) await api(`/api/listings/${existing.id}`, { method: 'PUT', body: { ...common, status: paused ? 'PAUSED' : 'ACTIVE' } });
      else await api('/api/listings', { body: { ...common, bookId: book?.id, condition } });
      done();
    } catch (e) {
      const err = e as { code?: string; data?: { listingId?: string } };
      if (err.code === 'LISTING_EXISTS' && err.data?.listingId) {
        notice('Bu kitob do‘koningizda bor', 'Mavjud e’lonni tahrirlang.');
        router.replace({ pathname: '/seller/listing', params: { id: err.data.listingId } });
      } else setError(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!existing || !(await confirm('E’lonni o‘chirish', 'Kitob do‘koningizdan olib tashlanadi.', 'O‘chirish', true))) return;
    try { await api(`/api/listings/${existing.id}`, { method: 'DELETE' }); done(); } catch (e) { notice('O‘chirilmadi', errorText(e)); }
  };
  const addPhoto = async () => {
    if (photos.length >= 8) return notice('Ko‘pi bilan 8 ta rasm');
    setUp(true);
    try { const r = await pickAndUpload('images'); if (r) setPhotos((x) => [...x, r.url]); } catch (e) { notice('Yuklanmadi', errorText(e)); } finally { setUp(false); }
  };

  return (
    <Screen title={existing ? 'E’lonni tahrirlash' : 'Kitobni sotuvga qo‘yish'}>
      {existing ? <BookPicker value={book} onChange={() => undefined} /> : (
        <>
          <BookPicker value={book} onChange={setBook} error={fieldErr(error, 'bookId')} />
          {!book && <Button small variant="ghost" title="Katalogda yo‘qmi? Yangi kitob qo‘shing" onPress={() => router.push('/books/new')} />}
        </>
      )}
      <Field label="Narx (so‘m)" value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="65000" error={fieldErr(error, 'price')} />
      <Field label="Soni" value={qty} onChangeText={setQty} keyboardType="number-pad" error={fieldErr(error, 'quantity')} />
      {!existing && <View style={{ gap: 6 }}><T variant="label">Holati</T><Chips value={condition} onChange={setCondition} options={[{ value: 'NEW', label: 'Yangi' }, { value: 'USED', label: 'Ishlatilgan' }]} /></View>}
      <Field label="Izoh (ixtiyoriy)" value={desc} onChangeText={setDesc} multiline placeholder="Masalan: qattiq muqova, sovg‘a qog‘ozi bilan" />
      <T variant="label">Mahsulot rasmlari (ixtiyoriy)</T>
      <Row style={{ flexWrap: 'wrap' }}>
        {photos.map((u) => (
          <View key={u}>
            <Image source={{ uri: u }} style={{ width: 72, height: 96, borderRadius: R.sm }} />
            <Pressable accessibilityLabel="Rasmni olib tashlash" onPress={() => setPhotos((x) => x.filter((y) => y !== u))} style={{ position: 'absolute', top: 2, right: 2, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, padding: 2 }}><X size={14} color="#fff" /></Pressable>
          </View>
        ))}
        <Button small variant="outline" title={up ? 'Yuklanmoqda…' : '+ Rasm'} onPress={addPhoto} loading={up} />
      </Row>
      {existing && <View style={{ gap: 6 }}><T variant="label">Sotuv</T><Chips value={paused ? 'p' : 'a'} onChange={(v) => setPaused(v === 'p')} options={[{ value: 'a', label: 'Sotuvda' }, { value: 'p', label: 'Vaqtincha to‘xtatilgan' }]} /></View>}
      <FormError error={error && !fieldErr(error, 'price') && !fieldErr(error, 'quantity') ? error : null} />
      <Button title="Saqlash" onPress={save} loading={busy} disabled={!book || !price || up} />
      {existing && <Button title="Do‘kondan olib tashlash" variant="outline" onPress={remove} />}
    </Screen>
  );
}
