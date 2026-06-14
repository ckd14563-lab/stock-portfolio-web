import { NextRequest, NextResponse } from 'next/server';
import { ensureTable } from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await ensureTable();
  const { id } = await params;
  const data = await req.json();
  await db.execute({
    sql: `UPDATE stocks SET name=?, ticker=?, market=?, shares=?, avg_price=?, currency=?, brokerage=?, source=?, account_id=? WHERE id=?`,
    args: [data.name, data.ticker, data.market, data.shares, data.avgPrice,
           data.currency, data.brokerage ?? '', data.source ?? 'manual',
           data.accountId ?? '', id],
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await ensureTable();
  const { id } = await params;
  await db.execute({ sql: 'DELETE FROM stocks WHERE id=?', args: [id] });
  return NextResponse.json({ ok: true });
}
