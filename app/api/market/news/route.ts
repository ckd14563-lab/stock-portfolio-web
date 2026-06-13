import { NextResponse } from 'next/server';
import { translateToKo } from '@/lib/translate';
import { fetchYahooRSS } from '@/lib/rss';

export const revalidate = 300;

const MARKET_SYMBOLS = [
  { sym: '^GSPC',  region: 'US' },
  { sym: '^IXIC',  region: 'US' },
  { sym: '^KS11',  region: 'KR' },
  { sym: '^N225',  region: 'JP' },
  { sym: '^HSI',   region: 'HK' },
];

export async function GET() {
  const all: Array<Record<string, unknown>> = [];

  await Promise.allSettled(
    MARKET_SYMBOLS.map(async ({ sym, region }) => {
      const items = await fetchYahooRSS(sym);
      items.forEach(item => all.push({ ...item, region }));
    })
  );

  // 중복 제거 + 시간순 정렬
  const seen = new Set<string>();
  const unique = all.filter(item => {
    const id = item.guid as string;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  unique.sort((a, b) => ((b.pubTime as number) ?? 0) - ((a.pubTime as number) ?? 0));
  const items = unique.slice(0, 25);

  // 제목 + 요약 한국어 번역 (병렬)
  const titles = items.map(i => (i.title as string) ?? '');
  const descs  = items.map(i => (i.description as string) ?? '');
  const [titlesKo, descsKo] = await Promise.all([
    translateToKo(titles),
    translateToKo(descs),
  ]);
  items.forEach((item, i) => {
    item.titleKo = titlesKo[i];
    item.descKo  = descsKo[i];
  });

  return NextResponse.json(items);
}
