import { NextRequest, NextResponse } from 'next/server';
import { ensureTable } from '@/lib/db';

function authorized(req: NextRequest): boolean {
  const secret = (process.env.PERSONAL_TOKEN ?? '').trim();
  if (!secret) return true;
  return (req.headers.get('x-token') ?? '') === secret;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  try {
    const db = await ensureTable();
    const { id } = await params;
    const data = await req.json();
    await db.execute({
      sql: 'UPDATE accounts SET name=?, brokerage=?, color=? WHERE id=?',
      args: [data.name, data.brokerage ?? '', data.color ?? '#00C853', id],
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  try {
    const db = await ensureTable();
    const { id } = await params;
    await db.execute({ sql: 'DELETE FROM accounts WHERE id=?', args: [id] });
    await db.execute({ sql: "UPDATE stocks SET account_id='' WHERE account_id=?", args: [id] });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
