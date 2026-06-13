import type { Stock, KisCredentials } from './types';

// ── 주식 CRUD — Turso DB (API 경유) ──────────────────────────────

export async function getStocks(): Promise<Stock[]> {
  try {
    const res = await fetch('/api/stocks');
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

export async function addStock(data: Omit<Stock, 'id' | 'createdAt'>): Promise<void> {
  await fetch('/api/stocks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateStock(id: string, data: Partial<Stock>): Promise<void> {
  await fetch(`/api/stocks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteStock(id: string): Promise<void> {
  await fetch(`/api/stocks/${id}`, { method: 'DELETE' });
}

export async function syncKisStocks(kisStocks: Omit<Stock, 'id' | 'createdAt'>[]): Promise<void> {
  await fetch('/api/stocks/sync-kis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stocks: kisStocks }),
  });
}

// ── KIS 인증 — 로컬에만 저장 (민감 정보) ─────────────────────────

const KIS_KEY          = 'kis_credentials';
const KIS_TOKEN_KEY    = 'kis_token';
const KIS_LAST_SYNC_KEY = 'kis_last_sync';

export const getKisCredentials = (): KisCredentials | null => {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(KIS_KEY) ?? 'null'); }
  catch { return null; }
};

export const saveKisCredentials = (creds: KisCredentials) =>
  localStorage.setItem(KIS_KEY, JSON.stringify(creds));

export const clearKisCredentials = () => {
  localStorage.removeItem(KIS_KEY);
  localStorage.removeItem(KIS_TOKEN_KEY);
};

export const getKisLastSync = (): string | null =>
  typeof window !== 'undefined' ? localStorage.getItem(KIS_LAST_SYNC_KEY) : null;

export const setKisLastSync = (time: string) =>
  localStorage.setItem(KIS_LAST_SYNC_KEY, time);
