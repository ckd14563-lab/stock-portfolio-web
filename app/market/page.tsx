'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PriceData } from '@/lib/types';
import { fmtDate } from '@/lib/format';

// ─── 지수 ────────────────────────────────────────────────
const INDEX_GROUPS = [
  {
    region: '🇺🇸 미국',
    indices: [
      { symbol: '^IXIC',    name: '나스닥' },
      { symbol: '^GSPC',    name: 'S&P 500' },
      { symbol: '^DJI',     name: '다우존스' },
      { symbol: '^SOX',     name: '필라 반도체' },
    ],
  },
  {
    region: '🇰🇷 한국',
    indices: [
      { symbol: '^KS11',    name: 'KOSPI' },
      { symbol: '^KQ11',    name: 'KOSDAQ' },
    ],
  },
  {
    region: '🇯🇵 일본',
    indices: [
      { symbol: '^N225',    name: '닛케이 225' },
    ],
  },
  {
    region: '🇨🇳🇭🇰 중국·홍콩',
    indices: [
      { symbol: '000001.SS', name: '상해종합' },
      { symbol: '^HSI',      name: '항셍(HK)' },
    ],
  },
  {
    region: '🇮🇳 인도',
    indices: [
      { symbol: '^NSEI',    name: 'NIFTY 50' },
    ],
  },
  {
    region: '🇪🇺 유럽',
    indices: [
      { symbol: '^GDAXI',   name: 'DAX' },
      { symbol: '^FTSE',    name: 'FTSE 100' },
      { symbol: '^FCHI',    name: 'CAC 40' },
      { symbol: '^STOXX50E',name: 'Euro Stoxx 50' },
    ],
  },
];

// ─── 환율 ────────────────────────────────────────────────
const FX_PAIRS = [
  { symbol: 'USDKRW=X', name: '달러/원',    flag: '🇺🇸' },
  { symbol: 'JPYKRW=X', name: '엔/원',      flag: '🇯🇵' },
  { symbol: 'EURKRW=X', name: '유로/원',    flag: '🇪🇺' },
  { symbol: 'GBPKRW=X', name: '파운드/원',  flag: '🇬🇧' },
  { symbol: 'INRKRW=X', name: '루피/원',    flag: '🇮🇳' },
  { symbol: 'AUDKRW=X', name: '호주달러/원',flag: '🇦🇺' },
  { symbol: 'CNYKRW=X', name: '위안/원',    flag: '🇨🇳' },
  { symbol: 'VNDKRW=X', name: '동/원',      flag: '🇻🇳' },
  { symbol: 'THBKRW=X', name: '바트/원',    flag: '🇹🇭' },
];

const ALL_INDEX_SYMBOLS = INDEX_GROUPS.flatMap(g => g.indices.map(i => i.symbol));
const ALL_FX_SYMBOLS    = FX_PAIRS.map(p => p.symbol);

function fmtIndexVal(v: number) {
  if (v >= 1000) return v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v.toFixed(2);
}

function fmtFxVal(v: number) {
  if (v >= 100)  return v.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
  if (v >= 1)    return v.toFixed(2);
  if (v >= 0.01) return v.toFixed(4);
  return v.toFixed(5);
}

function pctColor(pct: number | null) {
  if (pct == null) return '#8B949E';
  return pct > 0 ? '#00C853' : pct < 0 ? '#FF1744' : '#8B949E';
}

function fmtPct(pct: number) {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

interface NewsItem {
  guid: string;
  title: string;
  titleKo?: string;
  description?: string;
  descKo?: string;
  link: string;
  pubTime: number;
  publisher: string;
  region?: string;
}

export default function MarketPage() {
  const [tab, setTab] = useState<'indices' | 'fx' | 'news'>('indices');
  const [indices,   setIndices]   = useState<Record<string, PriceData>>({});
  const [fxRates,   setFxRates]   = useState<Record<string, PriceData>>({});
  const [news,      setNews]      = useState<NewsItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [newsQuery, setNewsQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [idxRes, fxRes, newsRes] = await Promise.allSettled([
        fetch(`/api/prices?symbols=${encodeURIComponent(ALL_INDEX_SYMBOLS.join(','))}`),
        fetch(`/api/prices?symbols=${encodeURIComponent(ALL_FX_SYMBOLS.join(','))}`),
        fetch('/api/market/news'),
      ]);
      if (idxRes.status  === 'fulfilled') setIndices(await idxRes.value.json());
      if (fxRes.status   === 'fulfilled') setFxRates(await fxRes.value.json());
      if (newsRes.status === 'fulfilled') setNews(await newsRes.value.json());
      setUpdatedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tabBtn = (key: typeof tab): React.CSSProperties => ({
    flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
    background: tab === key ? '#00C853' : 'transparent',
    color:      tab === key ? '#fff'    : '#8B949E',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
  });

  const regionLabel: Record<string, string> = {
    US: '🇺🇸 미국', KR: '🇰🇷 한국', JP: '🇯🇵 일본', HK: '🇭🇰 홍콩',
  };

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>🌐 시장</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {updatedAt && <span style={{ fontSize: 11, color: '#8B949E' }}>{updatedAt} 기준</span>}
          <button onClick={load} disabled={loading}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #30363D', background: 'transparent', color: '#8B949E', cursor: 'pointer', fontSize: 13, touchAction: 'manipulation' }}>
            {loading ? '⏳' : '🔄'}
          </button>
        </div>
      </div>

      {/* 서브 탭 */}
      <div style={{ display: 'flex', gap: 6, background: '#161B22', border: '1px solid #30363D', borderRadius: 10, padding: 4, marginBottom: 16 }}>
        <button style={tabBtn('indices')} onClick={() => setTab('indices')}>📈 지수</button>
        <button style={tabBtn('fx')}      onClick={() => setTab('fx')}>💱 환율</button>
        <button style={tabBtn('news')}    onClick={() => setTab('news')}>📰 뉴스</button>
      </div>

      {/* ── 지수 탭 ── */}
      {tab === 'indices' && (
        <div>
          {INDEX_GROUPS.map(group => (
            <div key={group.region} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#8B949E', fontWeight: 600, marginBottom: 8 }}>{group.region}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {group.indices.map(idx => {
                  const d = indices[idx.symbol];
                  const pct = d?.changePercent ?? null;
                  const c = pctColor(pct);
                  return (
                    <div key={idx.symbol} style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 10, padding: '12px 12px' }}>
                      <div style={{ fontSize: 12, color: '#8B949E', marginBottom: 6 }}>{idx.name}</div>
                      {d ? (
                        <>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtIndexVal(d.currentPrice)}</div>
                          <div style={{ fontSize: 12, color: c, marginTop: 4 }}>
                            {pct! >= 0 ? '▲' : '▼'} {fmtPct(pct!)}
                          </div>
                          <div style={{ fontSize: 11, color: '#8B949E', marginTop: 2 }}>
                            {d.changeAmount >= 0 ? '+' : ''}{fmtIndexVal(d.changeAmount)}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 14, color: '#8B949E', paddingTop: 4 }}>{loading ? '...' : '—'}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 환율 탭 ── */}
      {tab === 'fx' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {FX_PAIRS.map(fx => {
              const d = fxRates[fx.symbol];
              const pct = d?.changePercent ?? null;
              const c = pctColor(pct);
              return (
                <div key={fx.symbol} style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 10, padding: '12px 10px' }}>
                  <div style={{ fontSize: 10, color: '#8B949E', marginBottom: 4 }}>{fx.flag}</div>
                  <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 6 }}>{fx.name}</div>
                  {d ? (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtFxVal(d.currentPrice)}</div>
                      <div style={{ fontSize: 11, color: c, marginTop: 4 }}>
                        {pct! >= 0 ? '▲' : '▼'} {fmtPct(pct!)}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: '#8B949E', paddingTop: 4 }}>{loading ? '...' : '—'}</div>
                  )}
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: '#8B949E', marginTop: 12, textAlign: 'center' }}>
            * 외화 1단위 기준 원화 환산값
          </p>
        </div>
      )}

      {/* ── 뉴스 탭 ── */}
      {tab === 'news' && (
        <div>
          {/* 뉴스 검색창 */}
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: '#8B949E', pointerEvents: 'none' }}>🔍</span>
            <input
              value={newsQuery}
              onChange={e => setNewsQuery(e.target.value)}
              placeholder="뉴스 검색 (예: 나스닥, 금리, 반도체)"
              style={{ width: '100%', background: '#0D1117', border: '1px solid #30363D', borderRadius: 10, padding: '11px 36px 11px 36px', color: '#E6EDF3', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
            {newsQuery && (
              <button
                onClick={() => setNewsQuery('')}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#8B949E', cursor: 'pointer', fontSize: 16, padding: 4, lineHeight: 1 }}
              >✕</button>
            )}
          </div>

          {loading && news.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#8B949E' }}>뉴스 번역 중...</div>
          )}
          {!loading && news.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#8B949E' }}>뉴스를 불러올 수 없습니다.</div>
          )}
          {(() => {
            const q = newsQuery.trim().toLowerCase();
            const filtered = q
              ? news.filter(item =>
                  (item.titleKo ?? item.title).toLowerCase().includes(q) ||
                  item.title.toLowerCase().includes(q) ||
                  (item.descKo ?? item.description ?? '').toLowerCase().includes(q) ||
                  item.publisher.toLowerCase().includes(q)
                )
              : news;
            if (!loading && q && filtered.length === 0) {
              return <div style={{ textAlign: 'center', padding: 40, color: '#8B949E' }}>"{newsQuery}" 검색 결과가 없습니다.</div>;
            }
            return filtered.map((item, i) => (
            <a key={item.guid ?? i} href={item.link} target="_blank" rel="noopener noreferrer"
              style={{ textDecoration: 'none', display: 'block', background: '#161B22', border: '1px solid #30363D', borderRadius: 14, padding: 16, marginBottom: 12 }}>

              {/* 메타 (지역 + 시간) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                {item.region && (
                  <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 6, color: '#8B949E' }}>
                    {regionLabel[item.region] ?? item.region}
                  </span>
                )}
                <span style={{ fontSize: 11, color: '#8B949E', marginLeft: 'auto' }}>{fmtDate(item.pubTime)}</span>
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
            ));
          })()}
        </div>
      )}
    </div>
  );
}
