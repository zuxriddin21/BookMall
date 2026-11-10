import React from 'react';
import { router } from 'expo-router';
import { RolePicker } from '@/ui/RolePicker';
import { Screen, T, notice } from '@/ui/kit';

export default function AddRole() {
  return (
    <Screen title="Yangi rol qo‘shish">
      <T variant="muted">Bitta hisobda bir nechta rol bo‘lishi mumkin. Masalan, bloger o‘z do‘konini ham ochishi mumkin.</T>
      <RolePicker onDone={() => { notice('Rol qo‘shildi'); router.back(); }} />
    </Screen>
  );
}
