import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Bell as BellIcon } from 'lucide-react-native';
import { api } from '@/api/client';
import { C, F } from '@/theme';

/** O‘ng tepadagi qo‘ng‘iroqcha: o‘qilmagan bildirishnomalar soni bilan. */
export function Bell() {
  const { data } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api<{ total: number }>('/api/notifications/unread-count'),
    refetchInterval: 30_000,
  });
  const n = data?.total ?? 0;
  return (
    <Pressable accessibilityLabel={n ? `Bildirishnomalar, ${n} ta yangi` : 'Bildirishnomalar'} onPress={() => router.push('/notifications')} hitSlop={8}
      style={{ width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>
      <BellIcon size={21} color={C.ink} />
      {n > 0 && (
        <View style={{ position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.bg }}>
          <Text style={{ color: '#fff', fontFamily: F.bold, fontSize: 11 }}>{n > 99 ? '99+' : n}</Text>
        </View>
      )}
    </Pressable>
  );
}
