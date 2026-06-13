import { NextRequest, NextResponse } from 'next/server';
import { translateToKo } from '@/lib/translate';
import { fetchYahooRSS } from '@/lib/rss';

export const revalidate = 300;

export async function GET(req: NextRequest) {
  const symbols = req.nextUrl.searchParams.get('symbols') ?? '';
  if (!symbols) return NextResponse.json([]);

  const list = symbols.split(',').filter(Boolean);
  const all: Array<Record<string, unknown>> = [];

  await Promise.allSettled(
    list.map(async (entry) => {
      const [symbol, name] = entry.split('|');
      const items = await fetchYahooRSS(symbol);
      items.forEach(item => all.push({ ...item, stockName: name, stockTicker: symbol }));
    })
  );

  const sorted = all.sort(
    (a, b) => ((b.pubTime as number) ?? 0) - ((a.pubTime as number) ?? 0)
  );

  // 제목 + 요약 번역 (병렬)
  const titles = sorted.map(i => (i.title as string) ?? '');
  const descs  = sorted.map(i => (i.description as string) ?? '');
  const [titlesKo, descsKo] = await Promise.all([
    translateToKo(titles),
    translateToKo(descs),
  ]);
  sorted.forEach((item, i) => {
    item.titleKo = titlesKo[i];
    item.descKo  = descsKo[i];
  });

  return NextResponse.json(sorted);
}
