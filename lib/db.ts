import { createClient } from '@libsql/client';
import type { Stock } from './types';

export function getDB() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL ?? 'file:./portfolio.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
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
  return db;
}

export function rowToStock(row: Record<string, unknown>): Stock {
  return {
    id:        row.id        as string,
    name:      row.name      as string,
    ticker:    row.ticker    as string,
    market:    row.market    as 'KS' | 'KQ' | 'US',
    shares:    row.shares    as number,
    avgPrice:  row.avg_price as number,
    currency:  row.currency  as 'KRW' | 'USD',
    source:    row.source    as 'manual' | 'kis',
    brokerage: row.brokerage as string,
    createdAt: row.created_at as number,
  };
}
