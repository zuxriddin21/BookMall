import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button, errorText, notice } from './kit';

export function FollowButton({ targetType, targetId, initial, onChange }: { targetType: 'USER' | 'STORE' | 'PUBLISHER'; targetId: string; initial: boolean; onChange?: (f: boolean) => void }) {
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const toggle = async () => {
    setBusy(true);
    try {
      await api('/api/follows', { method: following ? 'DELETE' : 'POST', body: { targetType, targetId } });
      setFollowing(!following);
      onChange?.(!following);
      void qc.invalidateQueries({ queryKey: ['feed', 'following'] });
    } catch (e) {
      notice('Bajarilmadi', errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return <Button small title={following ? 'Obunadasiz' : 'Obuna bo‘lish'} variant={following ? 'outline' : 'primary'} onPress={toggle} loading={busy} />;
}
