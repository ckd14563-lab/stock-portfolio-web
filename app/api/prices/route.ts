import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const symbols = req.nextUrl.searchParams.get('symbols') ?? '';
  if (!symbols) return NextResponse.json({});

  const list = symbols.split(',').filter(Boolean);
  const results: Record<string, unknown> = {};

  await Promise.allSettled(
    list.map(async (symbol) => {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
          { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 60 } }
        );
        const json = await res.json();
        const meta = json?.chart?.result?.[0]?.meta;
        if (!meta) return;
        const prevClose = meta.previousClose ?? meta.chartPreviousClose;
        const current = meta.regularMarketPrice;
        results[symbol] = {
          symbol,
          currentPrice: current,
          previousClose: prevClose,
          changeAmount: current - prevClose,
          changePercent: prevClose > 0 ? ((current - prevClose) / prevClose) * 100 : 0,
          currency: meta.currency,
        };
      } catch { /* ignore */ }
    })
  );

  return NextResponse.json(results);
}
