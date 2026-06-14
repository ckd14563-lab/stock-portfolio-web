import { NextRequest, NextResponse } from 'next/server';
import { ensureTable } from '@/lib/db';

export async function PUT(req: NextRequest) {
  const { newPassword } = await req.json();
  if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 4) {
    return NextResponse.json({ error: '비밀번호는 4자 이상이어야 합니다' }, { status: 400 });
  }

  const pw = newPassword.trim();
  const db = await ensureTable();
  await db.execute({ sql: "INSERT OR REPLACE INTO config (key, value) VALUES ('app_password', ?)", args: [pw] });

  // 새 비밀번호로 쿠키 재발급
  const res = NextResponse.json({ ok: true });
  res.cookies.set('auth_token', pw, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  return res;
}
