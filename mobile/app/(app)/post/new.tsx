import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Video, X } from 'lucide-react-native';
import { api } from '@/api/client';
import type { MediaItem, PostType } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { POST_TYPE_LABEL } from '@/lib/format';
import { pickAndUpload } from '@/lib/pickMedia';
import { C, R, S } from '@/theme';
import { BookPicker, type PickedBook } from '@/ui/BookPicker';
import { Button, Chips, Field, FormError, Row, Screen, Stars, T, errorText, fieldErr, notice } from '@/ui/kit';

type As = 'USER' | 'STORE' | 'PUBLISHER';
const TYPES: Record<As, PostType[]> = {
  USER: ['GENERAL', 'REVIEW', 'RECOMMENDATION'],
  STORE: ['GENERAL', 'NEW_ARRIVAL', 'PROMOTION', 'ANNOUNCEMENT', 'RECOMMENDATION'],
  PUBLISHER: ['GENERAL', 'NEW_RELEASE', 'NEWS', 'ANNOUNCEMENT', 'RECOMMENDATION'],
};

/** Yangi post: matn, rasm/video, kitob, baho. Do‘kon va nashriyot o‘z nomidan yoza oladi. */
export default function NewPost() {
  const p = useLocalSearchParams<{ type?: PostType; bookId?: string; bookTitle?: string }>();
  const { me, hasRole } = useAuth();
  const qc = useQueryClient();
  const actors: { value: As; label: string }[] = [{ value: 'USER', label: 'O‘zim' }];
  if (hasRole('SELLER') && me?.store) actors.push({ value: 'STORE', label: me.store.name });
  if (hasRole('PUBLISHER') && me?.publisher) actors.push({ value: 'PUBLISHER', label: me.publisher.name });
  const [as, setAs] = useState<As>('USER');
  const [type, setType] = useState<PostType>(p.type && TYPES.USER.includes(p.type) ? p.type : 'GENERAL');
  const [book, setBook] = useState<PickedBook | null>(p.bookId ? { id: p.bookId, title: p.bookTitle ?? 'Kitob' } : null);
  const [rating, setRating] = useState<number | null>(null);
  const [body, setBody] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const changeAs = (a: As) => { setAs(a); if (!TYPES[a].includes(type)) setType('GENERAL'); };
  const needsBook = type === 'REVIEW' || type === 'RECOMMENDATION';

  const addMedia = async () => {
    if (media.length >= 10) return notice('Ko‘pi bilan 10 ta fayl');
    setUploading(true);
    try {
      const r = await pickAndUpload('all');
      if (r) setMedia((m) => [...m, { kind: r.kind, url: r.url }]);
    } catch (e) {
      notice('Yuklanmadi', errorText(e));
    } finally {
      setUploading(false);
    }
  };

  const publish = async () => {
    setError(null);
    setLoading(true);
    try {
      await api('/api/posts', { body: { as, type, body: body.trim() || null, bookId: book?.id ?? null, rating: type === 'REVIEW' ? rating : null, media } });
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: ['posts'] });
      router.back();
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen title="Yangi post">
      {actors.length > 1 && (<View style={{ gap: 6 }}><T variant="label">Kimning nomidan</T><Chips<As> value={as} onChange={changeAs} options={actors} /></View>)}
      <View style={{ gap: 6 }}>
        <T variant="label">Turi</T>
        <Chips<PostType> value={type} onChange={setType} options={TYPES[as].map((t) => ({ value: t, label: t === 'GENERAL' ? 'Oddiy post' : POST_TYPE_LABEL[t] }))} />
      </View>
      <BookPicker label={needsBook ? 'Kitob (majburiy)' : 'Kitob (ixtiyoriy)'} value={book} onChange={setBook} error={fieldErr(error, 'bookId')} />
      {type === 'REVIEW' && <View style={{ gap: 6 }}><T variant="label">Bahoingiz</T><Stars value={rating} size={30} onChange={setRating} /></View>}
      <Field label="Matn" value={body} onChangeText={setBody} multiline placeholder={type === 'REVIEW' ? 'Kitob sizga nimasi bilan yoqdi?' : 'Nima haqida yozmoqchisiz?'} error={fieldErr(error, 'body')} maxLength={5000} />
      <Row style={{ flexWrap: 'wrap' }}>
        {media.map((m) => (
          <View key={m.url}>
            {m.kind === 'image'
              ? <Image source={{ uri: m.url }} style={{ width: 84, height: 84, borderRadius: R.md }} />
              : <View style={{ width: 84, height: 84, borderRadius: R.md, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}><Video size={28} color="#fff" /></View>}
            <Pressable accessibilityLabel="Faylni olib tashlash" onPress={() => setMedia((x) => x.filter((y) => y.url !== m.url))} style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, padding: 3 }}>
              <X size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
      </Row>
      <Button title={uploading ? 'Yuklanmoqda…' : 'Rasm yoki video qo‘shish'} variant="outline" icon={<ImagePlus size={18} color={C.ink} />} onPress={addMedia} loading={uploading} />
      <FormError error={error && !fieldErr(error, 'bookId') && !fieldErr(error, 'body') ? error : null} />
      <Button title="Joylash" onPress={publish} loading={loading} disabled={uploading || (needsBook && !book) || (!body.trim() && media.length === 0)} />
      <View style={{ height: S.lg }} />
    </Screen>
  );
}
