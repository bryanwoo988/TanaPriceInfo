// TanaPriceInfo API client for React Native (no React needed in this file).
// Copy this file into your app. Docs: README.md in this folder.

export const API_URL = 'https://bryanwoo988.github.io/TanaPriceInfo/api/latest.json';
export const SUPPORTED_SCHEMA = 2;
const CACHE_KEY = 'tana:latest:v2';

// ---------- types (match api/latest.json, schema 2) ----------

export type SourceKey = 'mpob' | 'fama' | 'pricecatcher';
export type Region = 'north' | 'south' | 'central' | 'east_coast' | 'sabah' | 'sarawak';

export interface Source {
  name: string;
  title: string;
  url: string;                       // official page to check the price
  home: string;
  date_kind: 'price' | 'collected';
  max_age_days: number;
  data_date: string | null;          // YYYY-MM-DD
  last_attempt?: string | null;      // ISO time, Malaysia
  last_success?: string | null;
  ok?: boolean | null;               // false = last collection failed
}

export interface MpobLatest {
  unit: string;
  date?: string;
  prices?: Record<Region, number | null>;
  previous_date?: string | null;
  change?: Record<Region, number | null>;
}

export type FamaLevel = 'Ladang' | 'Borong' | 'Runcit';  // farm / wholesale / retail
/** FAMA average over the window, weighted by number of price records. */
export interface FamaItem {
  level: FamaLevel;
  state: string | null;      // null = all Malaysia (latest.json has only these)
  district: string | null;   // per district: api/fama_daerah.json
  item: string; grade: string; unit: string; category: string;
  price: number;             // RM per unit
  records: number;           // how many FAMA price records the average uses
  latest_date: string;       // newest record in the window
}
export interface FamaWindow { from: string; to: string; days: number; method: string }
export interface PcItem {
  state: string; item: string; unit: string; category: string;
  premises: number; median: number | null; min: number | null; max: number | null;
}

export interface Latest {
  schema: number;
  generated_at: string;
  sources: Record<SourceKey, Source>;
  mpob: MpobLatest;
  fama: { date: string | null; window: FamaWindow | null; levels: FamaLevel[]; items: FamaItem[] };
  pricecatcher: { date: string | null; items: PcItem[] };
}

export const REGION_NAMES: Record<Region, string> = {
  north: 'Utara', south: 'Selatan', central: 'Tengah',
  east_coast: 'Pantai Timur', sabah: 'Sabah', sarawak: 'Sarawak',
};

// ---------- freshness (same rule as the PWA) ----------

export type FreshLevel = 'ok' | 'late' | 'failed' | 'none';
export interface Freshness { level: FreshLevel; label: string; ageDays: number | null }

/** Today's date in Malaysia (YYYY-MM-DD), whatever the phone's time zone. */
export function todayMYT(now: number = Date.now()): string {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}

export function freshness(src: Source | undefined, now: number = Date.now()): Freshness {
  if (!src || !src.data_date) return { level: 'none', label: 'Tiada data', ageDays: null };
  const ageDays = Math.round(
    (Date.parse(todayMYT(now)) - Date.parse(src.data_date)) / 86_400_000,
  );
  if (src.ok === false) return { level: 'failed', label: 'Gagal dikutip', ageDays };
  if (ageDays > src.max_age_days) return { level: 'late', label: `Lewat ${ageDays} hari`, ageDays };
  return { level: 'ok', label: 'Terkini', ageDays };
}

// ---------- fetching with offline cache ----------

/** Anything with AsyncStorage's getItem/setItem (pass AsyncStorage itself). */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface LoadResult {
  data: Latest;
  fromCache: boolean;   // true = network failed, showing the saved copy
  error?: string;       // why the network request failed
}

export class SchemaError extends Error {}

function check(data: unknown): Latest {
  const d = data as Latest;
  if (!d || typeof d !== 'object' || typeof d.schema !== 'number') {
    throw new Error('Jawapan API tidak sah');
  }
  if (d.schema !== SUPPORTED_SCHEMA) {
    throw new SchemaError(`Format data berubah (schema ${d.schema}). Sila kemas kini app.`);
  }
  return d;
}

export async function fetchLatest(timeoutMs = 15_000, fetchFn: typeof fetch = fetch): Promise<Latest> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchFn(API_URL, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return check(await r.json());
  } finally {
    clearTimeout(timer);
  }
}

export async function readCache(store: KeyValueStore): Promise<Latest | null> {
  try {
    const raw = await store.getItem(CACHE_KEY);
    return raw ? check(JSON.parse(raw)) : null;
  } catch {
    return null; // old/corrupt cache: ignore
  }
}

/**
 * Network first; on failure fall back to the saved copy.
 * Throws only when there is neither network data nor a cache,
 * or when the API format changed (SchemaError).
 */
export async function loadPrices(store: KeyValueStore, fetchFn: typeof fetch = fetch): Promise<LoadResult> {
  try {
    const data = await fetchLatest(15_000, fetchFn);
    try { await store.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* storage full: still show */ }
    return { data, fromCache: false };
  } catch (e) {
    if (e instanceof SchemaError) throw e;
    const cached = await readCache(store);
    if (!cached) throw e;
    return { data: cached, fromCache: true, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- small helpers for display ----------

const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];

export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export const fmtRM = (v: number | null | undefined): string => (v == null ? '—' : `RM ${v.toFixed(2)}`);
