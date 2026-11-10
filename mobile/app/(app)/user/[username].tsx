import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { api } from '@/api/client';
import type { PublicProfile } from '@/api/types';
import { ROLE_LABEL } from '@/lib/format';
import { C, F, R } from '@/theme';
import { FollowButton } from '@/ui/FollowButton';
import { PostList } from '@/ui/PostList';
import { Avatar, Badge, Button, Card, ErrorView, Loading, Row, Screen, T } from '@/ui/kit';

export default function UserScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const q = useQuery({ queryKey: ['user', username], queryFn: () => api<PublicProfile>(`/api/users/${username}`) });
  if (q.isLoading) return <Screen title=""><Loading /></Screen>;
  if (!q.data) return <Screen title="Profil"><ErrorView error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const { user, stats, bloggerProfile, store, publisher, isFollowing, isMe } = q.data;
  return (
    <Screen title={`@${user.username}`} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      {bloggerProfile?.coverUrl ? <Image source={{ uri: bloggerProfile.coverUrl }} style={{ width: '100%', height: 140, borderRadius: R.lg }} contentFit="cover" /> : null}
      <Row gap={14}>
        <Avatar uri={user.avatar} name={user.name} size={68} />
        <View style={{ flex: 1, gap: 4 }}>
          <T variant="title">{user.name}</T>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>{user.roles.map((r) => <Badge key={r} label={ROLE_LABEL[r]} />)}</Row>
        </View>
        {isMe ? <Button small variant="outline" title="Tahrirlash" onPress={() => router.push('/settings/profile')} /> : <FollowButton targetType="USER" targetId={user.id} initial={isFollowing} onChange={() => q.refetch()} />}
      </Row>
      {bloggerProfile?.headline ? <T style={{ fontFamily: F.semibold }}>{bloggerProfile.headline}</T> : null}
      {user.bio ? <T>{user.bio}</T> : null}
      {bloggerProfile?.website ? <T variant="small" selectable>{bloggerProfile.website}</T> : null}
      <Card style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        {[[stats.postsCount, 'post', null], [stats.followersCount, 'obunachi', 'followers'], [stats.followingCount, 'obuna', 'following'], [stats.booksReadCount, 'o‘qilgan', null]].map(([n, l, tab]) => (
          <Pressable key={String(l)} disabled={!tab} onPress={() => router.push(`/follows/${user.username}?tab=${tab}`)} style={{ alignItems: 'center' }}>
            <Text style={{ fontFamily: F.display, fontSize: 22, color: C.ink }}>{n}</Text>
            <T variant="small">{l}</T>
          </Pressable>
        ))}
      </Card>
      {store && <Card onPress={() => router.push(`/store/${store.slug}`)}><T variant="label">Do‘koni</T><T variant="h2">{store.name}</T></Card>}
      {publisher && <Card onPress={() => router.push(`/publisher/${publisher.slug}`)}><T variant="label">Nashriyoti</T><T variant="h2">{publisher.name}</T></Card>}
      <T variant="h2">Postlar</T>
      <PostList query={{ username: user.username }} emptyText="Hali post yo‘q" />
    </Screen>
  );
}
