import { NextRequest, NextResponse } from 'next/server';

async function fetchPrice(symbol: string): Promise<{ price?: number; changePercent?: number }> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(3000) }
    );
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return {};
    const prev = meta.previousClose ?? meta.chartPreviousClose;
    const cur = meta.regularMarketPrice;
    return {
      price: cur,
      changePercent: prev > 0 ? ((cur - prev) / prev) * 100 : 0,
    };
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (q.length < 1) return NextResponse.json([]);

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&enableFuzzyQuery=false&enableCb=false`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) }
    );
    const json = await res.json();
    const quotes = (json?.quotes ?? []) as Array<Record<string, unknown>>;

    const filtered = quotes
      .filter(q => (q.quoteType === 'EQUITY' || q.quoteType === 'ETF') && q.symbol)
      .slice(0, 6);

    // 상위 6개 가격 병렬 조회
    const priceMap = await Promise.allSettled(
      filtered.map(q => fetchPrice(q.symbol as string))
    );

    const results = filtered.map((q, i) => {
      const symbol = q.symbol as string;
      let market: 'KS' | 'KQ' | 'US' = 'US';
      let ticker = symbol;

      if (symbol.endsWith('.KS')) { market = 'KS'; ticker = symbol.slice(0, -3); }
      else if (symbol.endsWith('.KQ')) { market = 'KQ'; ticker = symbol.slice(0, -3); }

      const rawName = (q.shortname || q.longname || ticker) as string;
      const priceData = priceMap[i].status === 'fulfilled' ? priceMap[i].value : {};

      return {
        symbol,
        ticker,
        market,
        name: rawName.replace(/&amp;/g, '&'),
        exchange: (q.exchange ?? '') as string,
        price: priceData.price,
        changePercent: priceData.changePercent,
      };
    });

    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}
