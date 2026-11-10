import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { api } from '@/api/client';
import type { Book } from '@/api/types';
import { C, F, R } from '@/theme';
import { BookCover, Field, Loading, Row, T } from './kit';

export type PickedBook = { id: string; title: string; author?: string; coverUrl?: string | null };

/** Katalogdan kitob tanlash (qidirib). */
export function BookPicker({ value, onChange, label = 'Kitob', error }: { value: PickedBook | null; onChange: (b: PickedBook | null) => void; label?: string; error?: string }) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 300); return () => clearTimeout(t); }, [text]);
  const res = useQuery({ enabled: q.length >= 2 && !value, queryKey: ['books', 'pick', q], queryFn: () => api<{ items: Book[] }>('/api/books', { query: { q, limit: 8 } }) });

  if (value) {
    return (
      <View style={{ gap: 6 }}>
        <T variant="label">{label}</T>
        <Row style={{ padding: 10, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface }}>
          <BookCover uri={value.coverUrl} title={value.title} width={36} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, color: C.ink }}>{value.title}</Text>
            {value.author ? <T variant="small">{value.author}</T> : null}
          </View>
          <Pressable accessibilityLabel="Kitobni olib tashlash" onPress={() => onChange(null)} hitSlop={8}><X size={20} color={C.muted} /></Pressable>
        </Row>
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Field label={label} value={text} onChangeText={setText} placeholder="Kitob nomi yoki muallif" error={error} autoCorrect={false} />
      {res.isLoading && q.length >= 2 ? <Loading /> : null}
      {res.data?.items.map((b) => (
        <Pressable key={b.id} onPress={() => { onChange({ id: b.id, title: b.title, author: b.author, coverUrl: b.coverUrl }); setText(''); }}
          style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 8, borderRadius: R.md, backgroundColor: C.surface }}>
          <BookCover uri={b.coverUrl} title={b.title} width={32} />
          <View style={{ flex: 1 }}><Text style={{ fontFamily: F.semibold, color: C.ink }}>{b.title}</Text><T variant="small">{b.author}</T></View>
        </Pressable>
      ))}
      {res.data && res.data.items.length === 0 ? <T variant="small">Katalogda topilmadi</T> : null}
    </View>
  );
}
