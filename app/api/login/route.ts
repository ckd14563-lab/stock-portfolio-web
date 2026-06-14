import { NextRequest, NextResponse } from 'next/server';
import { ensureTable } from '@/lib/db';

// 사용자가 입력할 PIN: DB 우선, fallback은 env
async function getLoginPassword(): Promise<string> {
  try {
    const db  = await ensureTable();
    const row = await db.execute("SELECT value FROM config WHERE key='app_password'");
    const val = row.rows[0]?.value as string | undefined;
    if (val) return val;
  } catch { /* ignore */ }
  return (process.env.PERSONAL_TOKEN ?? '').trim();
}

// 세션 쿠키에 쓸 값: 변경되지 않는 서버 시크릿
function getSessionSecret(): string {
  return (process.env.PERSONAL_TOKEN ?? '').trim();
}

export async function POST(req: NextRequest) {
  const { pin } = await req.json();
  const loginPw = await getLoginPassword();

  if (!loginPw || pin?.trim() !== loginPw) {
    return NextResponse.json({ error: '비밀번호가 틀렸습니다' }, { status: 401 });
  }

  const secret = getSessionSecret();
  const res = NextResponse.json({ ok: true });
  res.cookies.set('auth_token', secret || loginPw, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete('auth_token');
  return res;
}
