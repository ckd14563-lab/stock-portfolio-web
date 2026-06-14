import { NextRequest, NextResponse } from 'next/server';
import { ensureTable } from '@/lib/db';

// KST 오늘 날짜 (YYYY-MM-DD)
function todayKST() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const db = await ensureTable();
    const result = await db.execute('SELECT * FROM snapshots ORDER BY date ASC');
    return NextResponse.json(result.rows.map(r => ({
      date:      r.date as string,
      principal: r.principal as number,
      valueKrw:  r.value_krw as number,
      usdKrw:    r.usd_krw as number,
    })));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { principal, valueKrw, usdKrw } = await req.json();
    const date = todayKST();
    const db = await ensureTable();
    await db.execute({
      sql: `INSERT INTO snapshots (date, principal, value_krw, usd_krw)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
              principal = excluded.principal,
              value_krw = excluded.value_krw,
              usd_krw   = excluded.usd_krw`,
      args: [date, principal ?? 0, valueKrw ?? 0, usdKrw ?? 1380],
    });
    return NextResponse.json({ ok: true, date });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
