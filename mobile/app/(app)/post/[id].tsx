import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Send, Trash2 } from 'lucide-react-native';
import { api } from '@/api/client';
import type { Comment, Post } from '@/api/types';
import { ago } from '@/lib/format';
import { C, F, R, S } from '@/theme';
import { PostCard } from '@/ui/content';
import { Avatar, ErrorView, Loading, Row, Screen, T, confirm, errorText, notice } from '@/ui/kit';

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const post = useQuery({ queryKey: ['post', id], queryFn: () => api<{ post: Post }>(`/api/posts/${id}`) });
  const comments = useQuery({ queryKey: ['comments', id], queryFn: () => api<{ items: Comment[] }>(`/api/posts/${id}/comments`) });
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await api(`/api/posts/${id}/comments`, { body: { body: text.trim() } });
      setText('');
      await Promise.all([comments.refetch(), post.refetch()]);
    } catch (e) {
      notice('Yuborilmadi', errorText(e));
    } finally {
      setSending(false);
    }
  };
  const del = async (c: Comment) => {
    if (!(await confirm('Izohni o‘chirish', 'Bu izohni o‘chirasizmi?', 'O‘chirish', true))) return;
    try {
      await api(`/api/comments/${c.id}`, { method: 'DELETE' });
      await Promise.all([comments.refetch(), post.refetch()]);
    } catch (e) {
      notice('O‘chirilmadi', errorText(e));
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen title="Post" onRefresh={() => { void post.refetch(); void comments.refetch(); }} refreshing={post.isRefetching}>
        {post.isLoading ? <Loading /> : post.data ? <PostCard key={`${post.data.post.id}-${post.data.post.likeCount}-${post.data.post.repostCount}`} post={post.data.post} detail /> : <ErrorView error={post.error} onRetry={() => post.refetch()} />}
        <T variant="h2">Izohlar</T>
        {comments.data?.items.length === 0 && <T variant="muted">Hali izoh yo‘q</T>}
        {comments.data?.items.map((c) => (
          <Row key={c.id} style={{ alignItems: 'flex-start' }} gap={10}>
            <Pressable onPress={() => router.push(`/user/${c.author.username}`)}><Avatar uri={c.author.avatar} name={c.author.name} size={34} /></Pressable>
            <View style={{ flex: 1, backgroundColor: C.surface, borderRadius: R.md, padding: 10, gap: 2 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: F.bold, color: C.ink }} onPress={() => router.push(`/user/${c.author.username}`)}>{c.author.name}</Text>
                <T variant="small">{ago(c.createdAt)}</T>
              </Row>
              <T>{c.body}</T>
            </View>
            {c.canDelete && <Pressable accessibilityLabel="Izohni o‘chirish" onPress={() => del(c)} hitSlop={8} style={{ paddingTop: 8 }}><Trash2 size={16} color={C.faint} /></Pressable>}
          </Row>
        ))}
      </Screen>
      <Row style={{ padding: S.md, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.surface }}>
        <TextInput value={text} onChangeText={setText} placeholder="Izoh yozing…" placeholderTextColor={C.faint} multiline maxLength={2000}
          style={{ flex: 1, minHeight: 42, maxHeight: 120, borderRadius: R.md, backgroundColor: C.bg, paddingHorizontal: 12, paddingVertical: 10, fontFamily: F.body, fontSize: 15, color: C.ink }} />
        <Pressable accessibilityLabel="Yuborish" onPress={send} disabled={sending || !text.trim()} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: text.trim() ? C.primary : C.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          <Send size={18} color={text.trim() ? '#fff' : C.faint} />
        </Pressable>
      </Row>
    </KeyboardAvoidingView>
  );
}
