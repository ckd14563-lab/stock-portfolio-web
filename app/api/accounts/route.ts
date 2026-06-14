import { NextRequest, NextResponse } from 'next/server';
import { ensureTable, rowToAccount } from '@/lib/db';

function authorized(req: NextRequest): boolean {
  const secret = (process.env.PERSONAL_TOKEN ?? '').trim();
  if (!secret) return true;
  return (req.headers.get('x-token') ?? '') === secret;
}

export async function GET() {
  try {
    const db = await ensureTable();
    const result = await db.execute('SELECT * FROM accounts ORDER BY created_at ASC');
    return NextResponse.json(result.rows.map(rowToAccount));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  try {
    const db = await ensureTable();
    const data = await req.json();
    const id = Date.now().toString();
    const createdAt = Date.now();
    await db.execute({
      sql: 'INSERT INTO accounts (id, name, brokerage, color, created_at) VALUES (?, ?, ?, ?, ?)',
      args: [id, data.name ?? '', data.brokerage ?? '', data.color ?? '#00C853', createdAt],
    });
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
