import { useState, useCallback } from 'react';

export const useRefresh = (onRefreshCallback: () => Promise<void> | void) => {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await onRefreshCallback?.();
    } finally {
      setRefreshing(false);
    }
  }, [onRefreshCallback]);

  return { refreshing, onRefresh };
};
