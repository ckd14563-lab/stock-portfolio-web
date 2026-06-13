import { NextRequest, NextResponse } from 'next/server';
import { ensureTable, rowToStock } from '@/lib/db';

export async function GET() {
  const db = await ensureTable();
  const result = await db.execute('SELECT * FROM stocks ORDER BY created_at ASC');
  return NextResponse.json(result.rows.map(rowToStock));
}

export async function POST(req: NextRequest) {
  const db = await ensureTable();
  const data = await req.json();
  const id = Date.now().toString();
  const createdAt = Date.now();
  await db.execute({
    sql: `INSERT INTO stocks (id, name, ticker, market, shares, avg_price, currency, source, brokerage, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, data.name, data.ticker, data.market, data.shares, data.avgPrice,
           data.currency, data.source ?? 'manual', data.brokerage ?? '', createdAt],
  });
  return NextResponse.json({ id, createdAt });
}
