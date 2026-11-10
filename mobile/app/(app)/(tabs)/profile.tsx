import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Package, Store, Building2, ShieldCheck, UserCog, KeyRound, PlusCircle, LogOut, Trash2, BookPlus } from 'lucide-react-native';
import { api } from '@/api/client';
import type { PublicProfile } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { ROLE_LABEL } from '@/lib/format';
import { C, F, R, S } from '@/theme';
import { Avatar, Badge, Card, Row, Screen, T, confirm } from '@/ui/kit';

function Item({ icon, label, href, onPress, danger }: { icon: React.ReactNode; label: string; href?: Href; onPress?: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress ?? (() => href && router.push(href))} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: S.lg }, pressed && { backgroundColor: C.surfaceAlt }]}>
      {icon}
      <Text style={{ flex: 1, fontFamily: F.semibold, fontSize: 15, color: danger ? C.danger : C.ink }}>{label}</Text>
      <ChevronRight size={18} color={C.faint} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { me, hasRole, logout } = useAuth();
  const prof = useQuery({ queryKey: ['user', me?.user.username], enabled: Boolean(me), queryFn: () => api<PublicProfile>(`/api/users/${me!.user.username}`) });
  if (!me) return null;
  const u = me.user;
  const st = prof.data?.stats;
  const ic = (I: typeof Package, color: string = C.primary) => <I size={20} color={color} />;

  return (
    <Screen onRefresh={() => prof.refetch()} refreshing={prof.isRefetching}>
      <Row gap={14}>
        <Avatar uri={u.avatar} name={u.name} size={72} />
        <View style={{ flex: 1, gap: 4 }}>
          <T variant="title">{u.name}</T>
          <T variant="muted">@{u.username}</T>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>{u.roles.map((r) => <Badge key={r} label={ROLE_LABEL[r]} tone={r === 'ADMIN' ? 'primary' : 'neutral'} />)}</Row>
        </View>
      </Row>
      {u.bio ? <T>{u.bio}</T> : null}
      {st && (
        <Card style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {[[st.postsCount, 'post', `/user/${u.username}`], [st.followersCount, 'obunachi', `/follows/${u.username}?tab=followers`], [st.followingCount, 'obuna', `/follows/${u.username}?tab=following`], [st.booksReadCount, 'o‘qilgan', '/saved']].map(([n, l, href]) => (
            <Pressable key={String(l)} onPress={() => router.push(href as Href)} style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: F.display, fontSize: 22, color: C.ink }}>{n}</Text>
              <T variant="small">{l}</T>
            </Pressable>
          ))}
        </Card>
      )}

      <View style={{ backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
        <Item icon={ic(UserCog)} label="Mening sahifam" href={`/user/${u.username}`} />
        <Item icon={ic(Package)} label="Mening buyurtmalarim" href="/orders" />
        {hasRole('SELLER') && me.store && <Item icon={ic(Store)} label={`Do‘konim: ${me.store.name}`} href="/seller" />}
        {hasRole('PUBLISHER') && me.publisher && <Item icon={ic(Building2)} label={`Nashriyotim: ${me.publisher.name}`} href="/publisher-panel" />}
        {hasRole('SELLER', 'PUBLISHER', 'ADMIN') && <Item icon={ic(BookPlus)} label="Katalogga qo‘shgan kitoblarim" href="/books/mine" />}
        {hasRole('ADMIN') && <Item icon={ic(ShieldCheck)} label="Admin: kitoblarni tasdiqlash" href="/admin" />}
      </View>

      <View style={{ backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
        <Item icon={ic(UserCog)} label="Profilni tahrirlash" href="/settings/profile" />
        <Item icon={ic(PlusCircle)} label="Yangi rol qo‘shish" href="/settings/add-role" />
        <Item icon={ic(KeyRound)} label="Parolni o‘zgartirish" href="/settings/password" />
        <Item icon={ic(LogOut, C.text)} label="Chiqish" onPress={async () => { if (await confirm('Chiqish', 'Hisobingizdan chiqasizmi?', 'Chiqish')) await logout(); }} />
        <Item icon={ic(Trash2, C.danger)} label="Hisobni o‘chirish" href="/settings/delete" danger />
      </View>
    </Screen>
  );
}
