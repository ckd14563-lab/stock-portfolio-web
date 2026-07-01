import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const RANGE_INTERVAL: Record<string, string> = {
  '5d':  '1h',
  '1mo': '1d',
  '3mo': '1d',
  '6mo': '1wk',
  '1y':  '1wk',
  '5y':  '1mo',
  'max': '3mo',
};

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol') ?? '';
  const range  = req.nextUrl.searchParams.get('range')  ?? '1y';
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  const interval = RANGE_INTERVAL[range] ?? '1wk';

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return NextResponse.json({ error: 'no data' }, { status: 500 });

    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

    const data = timestamps
      .map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), close: closes[i] ?? null }))
      .filter(d => d.close != null);

    const currency: string = result.meta?.currency ?? '';
    return NextResponse.json({ data, currency });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
