import { NextResponse } from "next/server";
import { ensureTable, rowToStock } from "@/lib/db";

function buildSymbol(ticker: string, market: string) {
  if (market === "US") return ticker.toUpperCase();
  if (market === "KS") return `${ticker}.KS`;
  return `${ticker}.KQ`;
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await ensureTable();
    const rows = await db.execute("SELECT * FROM stocks");
    const stocks = rows.rows.map(r => rowToStock(r as Record<string, unknown>));
    if (stocks.length === 0) return NextResponse.json([]);

    const results = await Promise.allSettled(
      stocks.map(async (s) => {
        const sym = buildSymbol(s.ticker, s.market);
        try {
          const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1y&events=div`,
            { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 3600 } }
          );
          const json = await res.json();
          const result  = json?.chart?.result?.[0];
          const meta    = result?.meta;
          const divEvts = (result?.events?.dividends ?? {}) as Record<string, { amount: number; date: number }>;
          const divList = Object.values(divEvts);
          const annualDivPerShare = divList.reduce((sum, d) => sum + d.amount, 0);
          const currentPrice      = (meta?.regularMarketPrice as number) ?? s.avgPrice;
          const divYield          = currentPrice > 0 ? (annualDivPerShare / currentPrice) * 100 : 0;
          const sorted            = [...divList].sort((a, b) => b.date - a.date);
          const lastDivDate       = sorted.length > 0
            ? new Date(sorted[0].date * 1000).toISOString().slice(0, 10)
            : null;
          const monthlyIncome = new Array(12).fill(0) as number[];
          divList.forEach(d => {
            const month = new Date(d.date * 1000).getMonth();
            monthlyIncome[month] += d.amount * s.shares;
          });
          return {
            id: s.id, name: s.name, ticker: s.ticker, market: s.market,
            currency: s.currency, shares: s.shares, accountId: s.accountId,
            currentPrice, annualDivPerShare, divYield,
            annualIncome: annualDivPerShare * s.shares,
            lastDivDate, hasDividend: annualDivPerShare > 0,
            monthlyIncome,
          };
        } catch {
          return {
            id: s.id, name: s.name, ticker: s.ticker, market: s.market,
            currency: s.currency, shares: s.shares, accountId: s.accountId,
            currentPrice: s.avgPrice, annualDivPerShare: 0, divYield: 0,
            annualIncome: 0, lastDivDate: null, hasDividend: false,
            monthlyIncome: new Array(12).fill(0) as number[],
          };
        }
      })
    );

    return NextResponse.json(
      results
        .filter(r => r.status === "fulfilled")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map(r => (r as PromiseFulfilledResult<any>).value)
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
