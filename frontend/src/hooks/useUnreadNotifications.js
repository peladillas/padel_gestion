import { useState, useEffect, useCallback } from 'react';
import { notificationService } from '../services/api';

// Polling, not a websocket push — matches the rest of this stack (no
// realtime layer anywhere else either). 45s keeps the bell reasonably
// fresh without hammering the API from every open tab.
export default function useUnreadNotifications(intervalMs = 45000) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    notificationService.getUnreadCount()
      .then(r => setCount(r.data?.count || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { count, refresh };
}
