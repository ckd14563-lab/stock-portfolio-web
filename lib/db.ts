import { createClient } from '@libsql/client';
import type { Stock, Account } from './types';

export function getDB() {
  return createClient({
    url: (process.env.TURSO_DATABASE_URL ?? 'file:./portfolio.db').trim(),
    authToken: process.env.TURSO_AUTH_TOKEN?.trim(),
  });
}

export async function ensureTable() {
  const db = getDB();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS stocks (
      id         TEXT    PRIMARY KEY,
      name       TEXT    NOT NULL,
      ticker     TEXT    NOT NULL,
      market     TEXT    NOT NULL,
      shares     REAL    NOT NULL,
      avg_price  REAL    NOT NULL,
      currency   TEXT    NOT NULL,
      source     TEXT    NOT NULL DEFAULT 'manual',
      brokerage  TEXT    NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    )
  `);

  // 마이그레이션: account_id 컬럼 추가 (이미 있으면 무시)
  try { await db.execute("ALTER TABLE stocks ADD COLUMN account_id TEXT NOT NULL DEFAULT ''"); } catch {}

  await db.execute(`
    CREATE TABLE IF NOT EXISTS accounts (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      brokerage  TEXT NOT NULL DEFAULT '',
      color      TEXT NOT NULL DEFAULT '#00C853',
      created_at INTEGER NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS snapshots (
      date       TEXT PRIMARY KEY,
      principal  REAL NOT NULL DEFAULT 0,
      value_krw  REAL NOT NULL DEFAULT 0,
      usd_krw    REAL NOT NULL DEFAULT 1380
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // 기본 비밀번호 "7014" — 이미 있으면 무시
  await db.execute(`INSERT OR IGNORE INTO config (key, value) VALUES ('app_password', '7014')`);

  return db;
}

export function rowToStock(row: Record<string, unknown>): Stock {
  return {
    id:        row.id         as string,
    name:      row.name       as string,
    ticker:    row.ticker     as string,
    market:    row.market     as 'KS' | 'KQ' | 'US',
    shares:    row.shares     as number,
    avgPrice:  row.avg_price  as number,
    currency:  row.currency   as 'KRW' | 'USD',
    source:    row.source     as 'manual' | 'kis',
    brokerage: row.brokerage  as string,
    accountId: (row.account_id as string) ?? '',
    createdAt: row.created_at as number,
  };
}

export function rowToAccount(row: Record<string, unknown>): Account {
  return {
    id:        row.id         as string,
    name:      row.name       as string,
    brokerage: row.brokerage  as string,
    color:     row.color      as string,
    createdAt: row.created_at as number,
  };
}
