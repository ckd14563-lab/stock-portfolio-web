import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = (process.env.PERSONAL_TOKEN ?? '').trim();
  if (!secret) return NextResponse.json({ ok: true });
  const token = req.headers.get('x-token') ?? '';
  if (token === secret) return NextResponse.json({ ok: true });
  return NextResponse.json({ ok: false }, { status: 401 });
}
