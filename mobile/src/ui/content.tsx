import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useQueryClient } from '@tanstack/react-query';
import { Heart, MessageCircle, Repeat2, Trash2 } from 'lucide-react-native';
import { api } from '@/api/client';
import type { Book, Post, MediaItem } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { C, F, R, S } from '@/theme';
import { ago, POST_TYPE_LABEL, som, SHELF_LABEL } from '@/lib/format';
import { Avatar, Badge, BookCover, confirm, errorText, notice, Row, Stars, T, Verified } from './kit';

export function openActor(p: Post['postedAs']) {
  if (p.type === 'STORE') router.push(`/store/${p.slug}`);
  else if (p.type === 'PUBLISHER') router.push(`/publisher/${p.slug}`);
  else router.push(`/user/${p.slug}`);
}

function Video({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return <VideoView player={player} style={st.media} nativeControls contentFit="cover" />;
}

export function MediaGallery({ media }: { media: MediaItem[] }) {
  if (!media.length) return null;
  if (media.length === 1) {
    const m = media[0];
    return m.kind === 'video' ? <Video uri={m.url} /> : <Image source={{ uri: m.url }} style={st.media} contentFit="cover" />;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {media.map((m) => (
        <View key={m.url} style={{ width: 240 }}>
          {m.kind === 'video' ? <Video uri={m.url} /> : <Image source={{ uri: m.url }} style={st.media} contentFit="cover" />}
        </View>
      ))}
    </ScrollView>
  );
}

function PostBody({ post, compact }: { post: Post; compact?: boolean }) {
  const a = post.postedAs;
  return (
    <View style={{ gap: S.sm }}>
      <Row>
        <Pressable onPress={() => openActor(a)}><Avatar uri={a.logoUrl} name={a.name} size={compact ? 32 : 40} /></Pressable>
        <View style={{ flex: 1 }}>
          <Row gap={4}>
            <Text numberOfLines={1} style={st.name} onPress={() => openActor(a)}>{a.name}</Text>
            {a.verified && <Verified />}
          </Row>
          <T variant="small" numberOfLines={1}>
            {a.type === 'USER' ? `@${post.author.username}` : a.type === 'STORE' ? 'Do‘kon' : 'Nashriyot'} · {ago(post.createdAt)}
          </T>
        </View>
        {post.type !== 'GENERAL' && <Badge label={POST_TYPE_LABEL[post.type]} tone={post.type === 'PROMOTION' ? 'warn' : 'neutral'} />}
      </Row>
      {post.rating ? <Stars value={post.rating} /> : null}
      {post.body ? <T numberOfLines={compact ? 4 : undefined}>{post.body}</T> : null}
      <MediaGallery media={post.media} />
      {post.book && (
        <Pressable onPress={() => router.push(`/book/${post.book!.id}`)} style={st.bookChip}>
          <BookCover uri={post.book.coverUrl} title={post.book.title} width={36} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={st.name}>{post.book.title}</Text>
            <T variant="small" numberOfLines={1}>{post.book.author}</T>
          </View>
        </Pressable>
      )}
    </View>
  );
}

/** Lentadagi post: layk, izoh, repost va o‘chirish ishlaydi. */
export function PostCard({ post, onChanged, detail }: { post: Post; onChanged?: () => void; detail?: boolean }) {
  const { me } = useAuth();
  const qc = useQueryClient();
  const isRepost = post.type === 'REPOST';
  const target = isRepost && post.repostOf && !('deleted' in post.repostOf && post.repostOf.deleted) ? (post.repostOf as Post) : post;
  const [liked, setLiked] = useState(target.likedByMe);
  const [likes, setLikes] = useState(target.likeCount);
  const [reposted, setReposted] = useState(target.repostedByMe);
  const [reposts, setReposts] = useState(target.repostCount);
  const [busy, setBusy] = useState(false);
  const mine = me?.user.id === post.author.id;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['feed'] });
    void qc.invalidateQueries({ queryKey: ['posts'] });
    void qc.invalidateQueries({ queryKey: ['post'] });
    onChanged?.();
  };

  const toggleLike = async () => {
    const next = !liked;
    setLiked(next); setLikes((n) => n + (next ? 1 : -1));
    try {
      const r = await api<{ likeCount: number }>(`/api/posts/${target.id}/like`, { method: next ? 'POST' : 'DELETE' });
      setLikes(r.likeCount);
    } catch (e) {
      setLiked(!next); setLikes((n) => n + (next ? -1 : 1));
      notice('Bajarilmadi', errorText(e));
    }
  };

  const toggleRepost = async () => {
    if (target.author.id === me?.user.id) return notice('O‘z postingizni ulasha olmaysiz');
    if (busy) return;
    setBusy(true);
    try {
      if (reposted) {
        await api(`/api/posts/${target.id}/repost`, { method: 'DELETE' });
        setReposted(false); setReposts((n) => Math.max(0, n - 1));
      } else {
        await api(`/api/posts/${target.id}/repost`, { body: {} });
        setReposted(true); setReposts((n) => n + 1);
      }
      refresh();
    } catch (e) {
      notice('Bajarilmadi', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirm('Postni o‘chirish', 'Bu postni o‘chirasizmi?', 'O‘chirish', true))) return;
    try {
      await api(`/api/posts/${post.id}`, { method: 'DELETE' });
      refresh();
      if (detail) router.back();
    } catch (e) {
      notice('O‘chirilmadi', errorText(e));
    }
  };

  return (
    <Pressable disabled={detail} onPress={() => router.push(`/post/${target.id}`)} style={st.card}>
      {isRepost && (
        <Row gap={6}>
          <Repeat2 size={14} color={C.muted} />
          <T variant="small" onPress={() => router.push(`/user/${post.author.username}`)}>{post.author.name} ulashdi · {ago(post.createdAt)}</T>
        </Row>
      )}
      {isRepost && post.body ? <T>{post.body}</T> : null}
      {isRepost ? (
        target === post ? <View style={st.deleted}><T variant="small">Asl post o‘chirilgan</T></View> : <View style={st.nested}><PostBody post={target} compact={!detail} /></View>
      ) : (
        <PostBody post={post} compact={!detail} />
      )}
      {target !== post || !isRepost ? (
        <Row style={st.actions} gap={20}>
          <Pressable accessibilityLabel="Yoqtirish" onPress={toggleLike} hitSlop={8} style={st.action}>
            <Heart size={20} color={liked ? C.danger : C.muted} fill={liked ? C.danger : 'transparent'} />
            <Text style={st.count}>{likes}</Text>
          </Pressable>
          <Pressable accessibilityLabel="Izohlar" onPress={() => router.push(`/post/${target.id}`)} hitSlop={8} style={st.action}>
            <MessageCircle size={20} color={C.muted} />
            <Text style={st.count}>{target.commentCount}</Text>
          </Pressable>
          <Pressable accessibilityLabel="Ulashish" onPress={toggleRepost} hitSlop={8} style={st.action}>
            <Repeat2 size={21} color={reposted ? C.green : C.muted} />
            <Text style={[st.count, reposted && { color: C.green }]}>{reposts}</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          {mine && (
            <Pressable accessibilityLabel="O‘chirish" onPress={remove} hitSlop={8}><Trash2 size={18} color={C.faint} /></Pressable>
          )}
        </Row>
      ) : mine ? (
        <Row style={st.actions}><View style={{ flex: 1 }} /><Pressable onPress={remove} hitSlop={8}><Trash2 size={18} color={C.faint} /></Pressable></Row>
      ) : null}
    </Pressable>
  );
}

/** Kitob qatori: muqova, nom, muallif, eng arzon narx. */
export function BookRow({ book, onPress, right }: { book: Book; onPress?: () => void; right?: React.ReactNode }) {
  return (
    <Pressable onPress={onPress ?? (() => router.push(`/book/${book.id}`))} style={({ pressed }) => [st.bookRow, pressed && { opacity: 0.8 }]}>
      <BookCover uri={book.coverUrl} title={book.title} width={56} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={2} style={st.bookTitle}>{book.title}</Text>
        <T variant="small" numberOfLines={1}>{book.author}{book.publisher ? ` · ${book.publisher.name}` : ''}</T>
        <Row gap={6} style={{ marginTop: 4, flexWrap: 'wrap' }}>
          {book.minPrice != null ? <Text style={st.price}>{som(book.minPrice)} dan</Text> : <T variant="small">Sotuvda yo‘q</T>}
          {book.offersCount > 1 && <Badge label={`${book.offersCount} do‘kon`} />}
          {book.myShelf && <Badge label={SHELF_LABEL[book.myShelf]} tone="success" />}
        </Row>
      </View>
      {right}
    </Pressable>
  );
}

/** Gorizontal kitoblar qatori (bosh sahifada). */
export function BookTile({ book }: { book: Book }) {
  return (
    <Pressable onPress={() => router.push(`/book/${book.id}`)} style={{ width: 112, gap: 6 }}>
      <BookCover uri={book.coverUrl} title={book.title} width={112} />
      <Text numberOfLines={2} style={[st.bookTitle, { fontSize: 13 }]}>{book.title}</Text>
      <T variant="small" numberOfLines={1}>{book.author}</T>
      {book.minPrice != null && <Text style={[st.price, { fontSize: 12 }]}>{som(book.minPrice)}</Text>}
    </Pressable>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: S.lg, gap: S.md },
  nested: { borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: S.md },
  deleted: { padding: S.md, backgroundColor: C.surfaceAlt, borderRadius: R.md },
  name: { fontFamily: F.bold, fontSize: 15, color: C.ink, flexShrink: 1 },
  media: { width: '100%', aspectRatio: 4 / 3, borderRadius: R.md, backgroundColor: C.surfaceAlt },
  bookChip: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 8, borderRadius: R.md, backgroundColor: C.bg },
  actions: { paddingTop: 4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { fontFamily: F.semibold, fontSize: 13, color: C.muted },
  bookRow: { flexDirection: 'row', gap: 12, padding: 12, backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, alignItems: 'center' },
  bookTitle: { fontFamily: F.bold, fontSize: 15, color: C.ink },
  price: { fontFamily: F.bold, fontSize: 14, color: C.green },
});
