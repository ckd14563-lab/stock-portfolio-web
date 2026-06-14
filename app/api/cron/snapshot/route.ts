import { NextRequest, NextResponse } from 'next/server';
import { ensureTable, rowToStock } from '@/lib/db';

function buildSymbol(ticker: string, market: string) {
  if (market === 'US') return ticker.toUpperCase();
  if (market === 'KS') return `${ticker}.KS`;
  return `${ticker}.KQ`;
}

function todayKST() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const cronSecret = (process.env.CRON_SECRET ?? '').trim();
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const db = await ensureTable();

    const stockRows = await db.execute('SELECT * FROM stocks');
    const stocks = stockRows.rows.map(r => rowToStock(r as Record<string, unknown>));

    if (stocks.length === 0) {
      return NextResponse.json({ ok: true, skipped: 'no stocks', date: todayKST() });
    }

    // Yahoo Finance에서 가격 조회
    const syms = [...new Set(stocks.map(s => buildSymbol(s.ticker, s.market)))];
    const priceResults: Record<string, number> = {};

    await Promise.allSettled(
      [...syms, 'USDKRW=X'].map(async (symbol) => {
        try {
          const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
            { headers: { 'User-Agent': 'Mozilla/5.0' } }
          );
          const json = await res.json();
          const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (price) priceResults[symbol] = price as number;
        } catch { /* ignore */ }
      })
    );

    const usdKrw = priceResults['USDKRW=X'] ?? 1380;
    let principal = 0;
    let valueKrw  = 0;

    stocks.forEach(s => {
      const sym  = buildSymbol(s.ticker, s.market);
      const cur  = priceResults[sym] ?? s.avgPrice;
      const cost = s.shares * s.avgPrice;
      const val  = s.shares * cur;
      principal += s.currency === 'USD' ? cost * usdKrw : cost;
      valueKrw  += s.currency === 'USD' ? val  * usdKrw : val;
    });

    const date = todayKST();
    await db.execute({
      sql: `INSERT INTO snapshots (date, principal, value_krw, usd_krw)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
              principal = excluded.principal,
              value_krw = excluded.value_krw,
              usd_krw   = excluded.usd_krw`,
      args: [date, principal, valueKrw, usdKrw],
    });

    return NextResponse.json({ ok: true, date, principal: Math.round(principal), valueKrw: Math.round(valueKrw), usdKrw, stockCount: stocks.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
