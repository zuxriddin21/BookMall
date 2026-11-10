import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { C, F, R } from '@/theme';
import { Avatar, Badge, Chips, Empty, Loading, Screen, T } from '@/ui/kit';

type Item = { id: string; type?: 'USER' | 'STORE' | 'PUBLISHER'; name: string; username?: string; slug?: string; avatar?: string | null; image?: string | null };

export default function FollowsScreen() {
  const { username, tab: initial } = useLocalSearchParams<{ username: string; tab?: string }>();
  const [tab, setTab] = useState<'followers' | 'following'>(initial === 'following' ? 'following' : 'followers');
  const q = useQuery({ queryKey: ['follows', username, tab], queryFn: () => api<{ items: Item[] }>(`/api/users/${username}/${tab}`) });
  const open = (i: Item) => {
    const type = i.type ?? 'USER';
    const slug = i.slug ?? i.username;
    router.push(type === 'STORE' ? `/store/${slug}` : type === 'PUBLISHER' ? `/publisher/${slug}` : `/user/${slug}`);
  };
  return (
    <Screen title={`@${username}`}>
      <Chips value={tab} onChange={setTab} options={[{ value: 'followers', label: 'Obunachilar' }, { value: 'following', label: 'Obunalar' }]} />
      {q.isLoading ? <Loading /> : q.data?.items.length ? q.data.items.map((i) => (
        <Pressable key={`${i.type}-${i.id}`} onPress={() => open(i)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, backgroundColor: C.surface, borderRadius: R.md }}>
          <Avatar uri={i.avatar ?? i.image} name={i.name} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, color: C.ink }}>{i.name}</Text>
            <T variant="small">{i.type && i.type !== 'USER' ? '' : `@${i.username ?? i.slug}`}</T>
          </View>
          {i.type === 'STORE' && <Badge label="Do‘kon" />}
          {i.type === 'PUBLISHER' && <Badge label="Nashriyot" />}
        </Pressable>
      )) : <Empty title={tab === 'followers' ? 'Obunachilar yo‘q' : 'Obunalar yo‘q'} />}
    </Screen>
  );
}
