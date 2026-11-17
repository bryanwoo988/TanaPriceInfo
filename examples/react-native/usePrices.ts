// React hook: shows the saved copy at once, then refreshes from the network.
// Needs: npm install @react-native-async-storage/async-storage
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Latest, SchemaError, loadPrices, readCache } from './tanaPrices';

// Data changes once a day (~6:20 pm Malaysia time); no need to ask more often.
const REFRESH_ON_FOREGROUND_MS = 30 * 60_000;

export interface PricesState {
  data: Latest | null;
  loading: boolean;      // first load, nothing to show yet
  refreshing: boolean;   // pull-to-refresh in progress
  fromCache: boolean;    // offline: showing the saved copy
  error: string | null;
  refresh: () => Promise<void>;
}

export function usePrices(): PricesState {
  const [data, setData] = useState<Latest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetch = useRef(0);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await loadPrices(AsyncStorage);
      setData(r.data);
      setFromCache(r.fromCache);
      setError(r.error ?? null);
      lastFetch.current = Date.now();
    } catch (e) {
      setError(e instanceof SchemaError ? e.message : 'Tiada sambungan dan tiada data tersimpan.');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    readCache(AsyncStorage).then((c) => {
      if (alive && c) { setData(c); setLoading(false); }
    });
    refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && Date.now() - lastFetch.current > REFRESH_ON_FOREGROUND_MS) refresh();
    });
    return () => { alive = false; sub.remove(); };
  }, [refresh]);

  return { data, loading, refreshing, fromCache, error, refresh };
}
