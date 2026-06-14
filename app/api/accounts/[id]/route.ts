import { NextRequest, NextResponse } from 'next/server';
import { ensureTable } from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
