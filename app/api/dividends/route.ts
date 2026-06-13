import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const symbols = req.nextUrl.searchParams.get('symbols') ?? '';
  if (!symbols) return NextResponse.json({});

  const list = symbols.split(',').filter(Boolean);
  const results: Record<string, unknown> = {};
  const now = Date.now() / 1000;
  const oneYearAgo = now - 365 * 24 * 3600;

  await Promise.allSettled(
    list.map(async (symbol) => {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2y&events=dividends`,
          { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000),
            next: { revalidate: 3600 } }
        );
        const json = await res.json();
        const meta = json?.chart?.result?.[0]?.meta;
        const divEvents = json?.chart?.result?.[0]?.events?.dividends;
        if (!meta || !divEvents) return;

        const currentPrice: number = meta.regularMarketPrice;
        if (!currentPrice) return;

        // 최근 1년 배당금 합산
        const entries = Object.values(divEvents) as Array<{ amount: number; date: number }>;
        const recent = entries.filter(e => e.date >= oneYearAgo);
        if (recent.length === 0) return;

        const annualDividend = recent.reduce((s, e) => s + e.amount, 0);
        const dividendYield = (annualDividend / currentPrice) * 100;

        // 최근 배당 기준일
        const latestDiv = entries.sort((a, b) => b.date - a.date)[0];
        const exDate = latestDiv
          ? new Date(latestDiv.date * 1000).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
          : null;

        results[symbol] = { annualDividend, dividendYield, exDate };
      } catch { /* ignore */ }
    })
  );

  return NextResponse.json(results);
}
