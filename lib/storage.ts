import type { Stock, Account, KisCredentials } from './types';

// ── 앱 토큰 (쓰기 인증용) ─────────────────────────────────────────

const APP_TOKEN_KEY = 'app_token';

export const getAppToken = (): string =>
  typeof window !== 'undefined' ? (localStorage.getItem(APP_TOKEN_KEY) ?? '') : '';

export const saveAppToken = (token: string) =>
  localStorage.setItem(APP_TOKEN_KEY, token);

function authHeaders(): Record<string, string> {
  const token = getAppToken();
  return token
    ? { 'Content-Type': 'application/json', 'x-token': token }
    : { 'Content-Type': 'application/json' };
}

// ── 주식 CRUD — Turso DB (API 경유) ──────────────────────────────

async function checkRes(res: Response): Promise<void> {
  if (res.ok) return;
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('앱 토큰이 올바르지 않습니다.\n설정 탭에서 앱 토큰을 확인해주세요.');
  throw new Error(body.error ?? `오류 ${res.status}`);
}

export async function getStocks(): Promise<Stock[]> {
  try {
    const res = await fetch('/api/stocks');
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

export async function addStock(data: Omit<Stock, 'id' | 'createdAt'>): Promise<void> {
  const res = await fetch('/api/stocks', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  await checkRes(res);
}

export async function updateStock(id: string, data: Partial<Stock>): Promise<void> {
  const res = await fetch(`/api/stocks/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  await checkRes(res);
}

export async function deleteStock(id: string): Promise<void> {
  const res = await fetch(`/api/stocks/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  await checkRes(res);
}

export async function syncKisStocks(kisStocks: Omit<Stock, 'id' | 'createdAt'>[]): Promise<void> {
  const res = await fetch('/api/stocks/sync-kis', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ stocks: kisStocks }),
  });
  await checkRes(res);
}

// ── 계좌 CRUD ────────────────────────────────────────────────────

export async function getAccounts(): Promise<Account[]> {
  try {
    const res = await fetch('/api/accounts');
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

export async function addAccount(data: { name: string; brokerage: string; color: string }): Promise<void> {
  const res = await fetch('/api/accounts', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  await checkRes(res);
}

export async function updateAccount(id: string, data: { name: string; brokerage: string; color: string }): Promise<void> {
  const res = await fetch(`/api/accounts/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  await checkRes(res);
}

export async function deleteAccount(id: string): Promise<void> {
  const res = await fetch(`/api/accounts/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  await checkRes(res);
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
