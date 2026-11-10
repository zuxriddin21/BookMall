import React from 'react';
import { useAuth } from '@/auth/AuthContext';
import { RolePicker } from '@/ui/RolePicker';
import { Button, Screen, T } from '@/ui/kit';

/** Birinchi kirish: 4 ta roldan birini tanlash. */
export default function RoleScreen() {
  const { me, logout } = useAuth();
  return (
    <Screen>
      <T variant="display">Xush kelibsiz, {me?.user.name.split(' ')[0]}!</T>
      <T variant="muted">BookMall’dan qanday foydalanasiz? Keyinroq boshqa rollarni ham qo‘shishingiz mumkin.</T>
      <RolePicker />
      <Button title="Chiqish" variant="ghost" onPress={logout} />
    </Screen>
  );
}
