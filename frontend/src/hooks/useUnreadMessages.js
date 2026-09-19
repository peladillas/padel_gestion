import { useState, useEffect, useCallback } from 'react';
import { messagingService } from '../services/api';

export default function useUnreadMessages(intervalMs = 45000) {
  const [counts, setCounts] = useState({ user: 0, club: 0 });

  const refresh = useCallback(() => {
    messagingService.getUnreadCount()
      .then(r => setCounts({ user: r.data?.user || 0, club: r.data?.club || 0 }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { counts, total: counts.user + counts.club, refresh };
}
