'use client';

import { useState, useEffect, useCallback } from 'react';
import { getStocks } from '@/lib/storage';
import { fmtDate } from '@/lib/format';
import type { Stock } from '@/lib/types';

interface NewsItem {
  guid: string;
  title: string;
  titleKo?: string;
  description?: string;
  descKo?: string;
  link: string;
  pubTime: number;
  publisher: string;
  stockName: string;
  stockTicker: string;
}

function buildSymbol(ticker: string, market: string) {
  if (market === 'US') return ticker.toUpperCase();
  if (market === 'KS') return `${ticker}.KS`;
  return `${ticker}.KQ`;
}

export default function NewsPage() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [selected, setSelected] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await getStocks();
    setStocks(data);
    if (data.length === 0) { setLoading(false); return; }
    setLoading(true);
    try {
      const symbols = data.map(s => `${buildSymbol(s.ticker, s.market)}|${s.name}`).join(',');
      const res = await fetch(`/api/news?symbols=${encodeURIComponent(symbols)}`);
      setNews(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = selected === 'all' ? news : news.filter(n => n.stockTicker === selected);

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>📰 주식 뉴스</h1>

      {/* 종목 필터 */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16, paddingBottom: 4 }}>
        {['all', ...stocks.map(s => s.ticker)].map((t) => {
          const label = t === 'all' ? '전체' : stocks.find(s => s.ticker === t)?.name ?? t;
          const active = selected === t;
          return (
            <button key={t} onClick={() => setSelected(t)}
              style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${active ? '#00C853' : '#30363D'}`, background: active ? 'rgba(0,200,83,0.1)' : 'transparent', color: active ? '#00C853' : '#8B949E', fontSize: 13, fontWeight: active ? 700 : 400, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {label}
            </button>
          );
        })}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#8B949E' }}>뉴스 번역 중...</div>}

      {!loading && stocks.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: '#8B949E' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div>포트폴리오에 주식을 추가하면 관련 뉴스를 볼 수 있어요</div>
        </div>
      )}

      {!loading && filtered.length === 0 && stocks.length > 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#8B949E' }}>뉴스가 없습니다</div>
      )}

      {filtered.map((item, i) => (
        <a key={item.guid ?? i} href={item.link} target="_blank" rel="noopener noreferrer"
          style={{ textDecoration: 'none', display: 'block', background: '#161B22', border: '1px solid #30363D', borderRadius: 14, padding: 16, marginBottom: 12 }}>

          {/* 종목 태그 + 시간 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ background: 'rgba(0,200,83,0.15)', color: '#00C853', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>
              {item.stockName}
            </span>
            <span style={{ color: '#8B949E', fontSize: 11 }}>{fmtDate(item.pubTime)}</span>
          </div>

          {/* 한국어 제목 */}
          <div style={{ color: '#E6EDF3', fontSize: 15, fontWeight: 700, lineHeight: 1.5, marginBottom: 6 }}>
            {item.titleKo || item.title}
          </div>

          {/* 한국어 요약 */}
          {item.descKo && (
            <div style={{ color: '#C9D1D9', fontSize: 13, lineHeight: 1.65, marginBottom: 8 }}>
              {item.descKo}
            </div>
          )}

          {/* 원문 제목 */}
          {item.titleKo && item.titleKo !== item.title && (
            <div style={{ color: '#6E7681', fontSize: 11, lineHeight: 1.4, marginBottom: 8, fontStyle: 'italic' }}>
              {item.title}
            </div>
          )}

          {/* 출처 */}
          {item.publisher && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, paddingTop: 8, borderTop: '1px solid #21262D' }}>
              <span style={{ fontSize: 11, color: '#8B949E' }}>출처</span>
              <span style={{ fontSize: 11, color: '#00C853', fontWeight: 700 }}>{item.publisher}</span>
            </div>
          )}
        </a>
      ))}
    </div>
  );
}
