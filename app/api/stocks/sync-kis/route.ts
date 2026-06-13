import { NextRequest, NextResponse } from 'next/server';
import { ensureTable } from '@/lib/db';

export async function POST(req: NextRequest) {
  const db = await ensureTable();
  const { stocks } = await req.json();
  const now = Date.now();

  await db.execute("DELETE FROM stocks WHERE source = 'kis'");

  for (const s of stocks) {
    const id = `kis_${s.ticker}_${now}`;
    await db.execute({
      sql: `INSERT OR REPLACE INTO stocks (id, name, ticker, market, shares, avg_price, currency, source, brokerage, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'kis', ?, ?)`,
      args: [id, s.name, s.ticker, s.market, s.shares, s.avgPrice,
             s.currency, s.brokerage ?? '한국투자증권', now],
    });
  }

  return NextResponse.json({ ok: true, count: stocks.length });
}
