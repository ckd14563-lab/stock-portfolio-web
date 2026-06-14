'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PriceData, Stock } from '@/lib/types';
import { fmtDate } from '@/lib/format';
import { getStocks } from '@/lib/storage';

// ─── 지수 ────────────────────────────────────────────────
const INDEX_GROUPS = [
  { region: '🇺🇸 미국', indices: [
    { symbol: '^IXIC', name: '나스닥' }, { symbol: '^GSPC', name: 'S&P 500' },
    { symbol: '^DJI',  name: '다우존스' }, { symbol: '^SOX', name: '필라 반도체' },
  ]},
  { region: '🇰🇷 한국', indices: [
    { symbol: '^KS11', name: 'KOSPI' }, { symbol: '^KQ11', name: 'KOSDAQ' },
  ]},
  { region: '🇯🇵 일본',       indices: [{ symbol: '^N225',     name: '닛케이 225' }]},
  { region: '🇨🇳🇭🇰 중국·홍콩', indices: [
    { symbol: '000001.SS', name: '상해종합' }, { symbol: '^HSI', name: '항셍(HK)' },
  ]},
  { region: '🇮🇳 인도',       indices: [{ symbol: '^NSEI',     name: 'NIFTY 50' }]},
  { region: '🇪🇺 유럽',       indices: [
    { symbol: '^GDAXI', name: 'DAX' }, { symbol: '^FTSE', name: 'FTSE 100' },
    { symbol: '^FCHI',  name: 'CAC 40' }, { symbol: '^STOXX50E', name: 'Euro Stoxx 50' },
  ]},
];

// ─── 환율 ────────────────────────────────────────────────
const FX_PAIRS = [
  { symbol: 'USDKRW=X', name: '달러/원',     flag: '🇺🇸' },
  { symbol: 'JPYKRW=X', name: '엔/원',       flag: '🇯🇵' },
  { symbol: 'EURKRW=X', name: '유로/원',     flag: '🇪🇺' },
  { symbol: 'GBPKRW=X', name: '파운드/원',   flag: '🇬🇧' },
  { symbol: 'INRKRW=X', name: '루피/원',     flag: '🇮🇳' },
  { symbol: 'AUDKRW=X', name: '호주달러/원', flag: '🇦🇺' },
  { symbol: 'CNYKRW=X', name: '위안/원',     flag: '🇨🇳' },
  { symbol: 'VNDKRW=X', name: '동/원',       flag: '🇻🇳' },
  { symbol: 'THBKRW=X', name: '바트/원',     flag: '🇹🇭' },
];

const ALL_INDEX_SYMBOLS = INDEX_GROUPS.flatMap(g => g.indices.map(i => i.symbol));
const ALL_FX_SYMBOLS    = FX_PAIRS.map(p => p.symbol);

// ─── 타입 ────────────────────────────────────────────────
type MarketTab = 'indices' | 'fx' | 'cap' | 'news';
type CapRegion = 'US' | 'KR';
type NewsMode  = 'market' | 'my';

interface CapItem {
  rank: number; symbol: string; name: string;
  price: number; change: number; changePct: number;
  marketCap: number; currency: string;
}

interface NewsItem {
  guid: string; title: string; titleKo?: string;
  description?: string; descKo?: string;
  link: string; pubTime: number; publisher: string;
  region?: string; stockName?: string; stockTicker?: string;
}

// ─── 포맷 ────────────────────────────────────────────────
function fmtIndexVal(v: number) {
  return v >= 1000 ? v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v.toFixed(2);
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
function fmtPct(pct: number) { return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`; }

function fmtPrice(price: number, currency: string) {
  if (currency === 'KRW') return `₩${Math.round(price).toLocaleString('ko-KR')}`;
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtMarketCap(cap: number, currency: string) {
  if (currency === 'KRW') {
    const jo = cap / 1e12;
    if (jo >= 1) return `${jo.toFixed(1)}조`;
    return `${Math.round(cap / 1e8)}억`;
  }
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9)  return `$${(cap / 1e9).toFixed(1)}B`;
  return `$${(cap / 1e6).toFixed(0)}M`;
}

function buildSymbol(ticker: string, market: string) {
  if (market === 'US') return ticker.toUpperCase();
  if (market === 'KS') return `${ticker}.KS`;
  return `${ticker}.KQ`;
}

const regionLabel: Record<string, string> = {
  US: '🇺🇸 미국', KR: '🇰🇷 한국', JP: '🇯🇵 일본', HK: '🇭🇰 홍콩',
};

// ─── 컴포넌트 ────────────────────────────────────────────
export default function MarketPage() {
  const [tab, setTab] = useState<MarketTab>('indices');

  // 지수·환율
  const [indices,      setIndices]      = useState<Record<string, PriceData>>({});
  const [fxRates,      setFxRates]      = useState<Record<string, PriceData>>({});
  const [idxFxLoading, setIdxFxLoading] = useState(true);
  const [updatedAt,    setUpdatedAt]    = useState<string | null>(null);

  // 시총
  const [capRegion,  setCapRegion]  = useState<CapRegion>('US');
  const [usCapData,  setUsCapData]  = useState<CapItem[]>([]);
  const [krCapData,  setKrCapData]  = useState<CapItem[]>([]);
  const [capLoading, setCapLoading] = useState(false);
  const [usCapLoaded,setUsCapLoaded]= useState(false);
  const [krCapLoaded,setKrCapLoaded]= useState(false);
  const [capError,   setCapError]   = useState('');

  // 뉴스
  const [newsMode,       setNewsMode]       = useState<NewsMode>('market');
  const [marketNews,     setMarketNews]     = useState<NewsItem[]>([]);
  const [myNews,         setMyNews]         = useState<NewsItem[]>([]);
  const [myStocks,       setMyStocks]       = useState<Stock[]>([]);
  const [mktNewsLoading, setMktNewsLoading] = useState(false);
  const [myNewsLoading,  setMyNewsLoading]  = useState(false);
  const [mktNewsLoaded,  setMktNewsLoaded]  = useState(false);
  const [myNewsLoaded,   setMyNewsLoaded]   = useState(false);
  const [newsQuery,      setNewsQuery]      = useState('');
  const [selectedStock,  setSelectedStock]  = useState('all');

  // ── 로드 ──────────────────────────────────────────────
  const loadIdxFx = useCallback(async () => {
    setIdxFxLoading(true);
    try {
      const [idxRes, fxRes] = await Promise.allSettled([
        fetch(`/api/prices?symbols=${encodeURIComponent(ALL_INDEX_SYMBOLS.join(','))}`),
        fetch(`/api/prices?symbols=${encodeURIComponent(ALL_FX_SYMBOLS.join(','))}`),
      ]);
      if (idxRes.status === 'fulfilled') setIndices(await idxRes.value.json());
      if (fxRes.status  === 'fulfilled') setFxRates(await fxRes.value.json());
      setUpdatedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    } catch { /* ignore */ }
    finally { setIdxFxLoading(false); }
  }, []);

  const loadCap = useCallback(async (region: CapRegion) => {
    setCapLoading(true);
    setCapError('');
    try {
      // 1) 순위·시총 목록 먼저 (즉시 반환)
      const rankRes = await fetch(`/api/market/rank?region=${region}`);
      const rankJson = await rankRes.json();
      if (!Array.isArray(rankJson) || rankJson.length === 0) {
        setCapError(rankJson?.error ?? '데이터를 불러올 수 없습니다');
        if (region === 'US') setUsCapLoaded(true); else setKrCapLoaded(true);
        return;
      }
      const ranked = rankJson as CapItem[];

      // 2) 가격·등락 별도 수신 (/api/prices, v8 chart 사용)
      const symbols = ranked.map(r => r.symbol).join(',');
      try {
        const priceRes = await fetch(`/api/prices?symbols=${encodeURIComponent(symbols)}`);
        const priceMap: Record<string, { currentPrice: number; changeAmount: number; changePercent: number; currency: string }> = await priceRes.json();
        const withPrices = ranked.map(r => {
          const p = priceMap[r.symbol];
          return p ? { ...r, price: p.currentPrice, change: p.changeAmount, changePct: p.changePercent, currency: p.currency || r.currency } : r;
        });
        if (region === 'US') { setUsCapData(withPrices); setUsCapLoaded(true); }
        else                  { setKrCapData(withPrices); setKrCapLoaded(true); }
      } catch {
        // 가격 수신 실패해도 순위만이라도 표시
        if (region === 'US') { setUsCapData(ranked); setUsCapLoaded(true); }
        else                  { setKrCapData(ranked); setKrCapLoaded(true); }
      }
    } catch (e) {
      setCapError((e as Error).message);
      if (region === 'US') setUsCapLoaded(true); else setKrCapLoaded(true);
    } finally {
      setCapLoading(false);
    }
  }, []);

  const loadMarketNews = useCallback(async () => {
    setMktNewsLoading(true);
    try {
      const data = await fetch('/api/market/news').then(r => r.json());
      setMarketNews(Array.isArray(data) ? data : []);
      setMktNewsLoaded(true);
    } catch { setMktNewsLoaded(true); }
    finally { setMktNewsLoading(false); }
  }, []);

  const loadMyNews = useCallback(async () => {
    setMyNewsLoading(true);
    try {
      const stocks = await getStocks();
      setMyStocks(stocks);
      if (stocks.length === 0) { setMyNewsLoaded(true); return; }
      const syms = stocks.map(s => `${buildSymbol(s.ticker, s.market)}|${s.name}`).join(',');
      const data = await fetch(`/api/news?symbols=${encodeURIComponent(syms)}`).then(r => r.json());
      setMyNews(Array.isArray(data) ? data : []);
      setMyNewsLoaded(true);
    } catch { setMyNewsLoaded(true); }
    finally { setMyNewsLoading(false); }
  }, []);

  // ── 이펙트 ────────────────────────────────────────────
  useEffect(() => { loadIdxFx(); }, [loadIdxFx]);

  useEffect(() => {
    if (tab !== 'cap') return;
    if (capRegion === 'US' && !usCapLoaded) loadCap('US');
    if (capRegion === 'KR' && !krCapLoaded) loadCap('KR');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, capRegion]);

  useEffect(() => {
    if (tab === 'news' && !mktNewsLoaded && !mktNewsLoading) loadMarketNews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab === 'news' && newsMode === 'my' && !myNewsLoaded && !myNewsLoading) loadMyNews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, newsMode]);

  // ── 헬퍼 ──────────────────────────────────────────────
  const handleRefresh = () => {
    if (tab === 'indices' || tab === 'fx') {
      loadIdxFx();
    } else if (tab === 'cap') {
      if (capRegion === 'US') setUsCapLoaded(false);
      else setKrCapLoaded(false);
      loadCap(capRegion);
    } else {
      if (newsMode === 'market') { setMktNewsLoaded(false); loadMarketNews(); }
      else { setMyNewsLoaded(false); loadMyNews(); }
    }
  };

  const isLoading = tab === 'indices' || tab === 'fx' ? idxFxLoading
    : tab === 'cap' ? capLoading
    : newsMode === 'market' ? mktNewsLoading : myNewsLoading;

  const capData   = capRegion === 'US' ? usCapData   : krCapData;
  const capLoaded = capRegion === 'US' ? usCapLoaded : krCapLoaded;

  const filteredNews = (() => {
    const base = newsMode === 'market' ? marketNews : myNews;
    const q = newsQuery.trim().toLowerCase();
    let list = q ? base.filter(item =>
      (item.titleKo ?? item.title).toLowerCase().includes(q) ||
      item.title.toLowerCase().includes(q) ||
      (item.descKo ?? item.description ?? '').toLowerCase().includes(q)
    ) : base;
    if (newsMode === 'my' && selectedStock !== 'all') list = list.filter(n => n.stockTicker === selectedStock);
    return list;
  })();

  const tabBtn = (key: MarketTab): React.CSSProperties => ({
    flex: 1, padding: '8px 2px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
    background: tab === key ? '#00C853' : 'transparent',
    color:      tab === key ? '#fff'    : '#8B949E',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
  });

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>🌐 시장</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {updatedAt && <span style={{ fontSize: 11, color: '#8B949E' }}>{updatedAt} 기준</span>}
          <button onClick={handleRefresh} disabled={isLoading}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #30363D', background: 'transparent', color: '#8B949E', cursor: 'pointer', fontSize: 13, touchAction: 'manipulation' }}>
            {isLoading ? '⏳' : '🔄'}
          </button>
        </div>
      </div>

      {/* 메인 탭 */}
      <div style={{ display: 'flex', gap: 4, background: '#161B22', border: '1px solid #30363D', borderRadius: 10, padding: 4, marginBottom: 16 }}>
        <button style={tabBtn('indices')} onClick={() => setTab('indices')}>📈 지수</button>
        <button style={tabBtn('fx')}      onClick={() => setTab('fx')}>💱 환율</button>
        <button style={tabBtn('cap')}     onClick={() => setTab('cap')}>🏆 시총</button>
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
                          <div style={{ fontSize: 12, color: c, marginTop: 4 }}>{pct! >= 0 ? '▲' : '▼'} {fmtPct(pct!)}</div>
                          <div style={{ fontSize: 11, color: '#8B949E', marginTop: 2 }}>{d.changeAmount >= 0 ? '+' : ''}{fmtIndexVal(d.changeAmount)}</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 14, color: '#8B949E', paddingTop: 4 }}>{idxFxLoading ? '...' : '—'}</div>
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
                      <div style={{ fontSize: 11, color: c, marginTop: 4 }}>{pct! >= 0 ? '▲' : '▼'} {fmtPct(pct!)}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: '#8B949E', paddingTop: 4 }}>{idxFxLoading ? '...' : '—'}</div>
                  )}
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: '#8B949E', marginTop: 12, textAlign: 'center' }}>* 외화 1단위 기준 원화 환산값</p>
        </div>
      )}

      {/* ── 시총 탭 ── */}
      {tab === 'cap' && (
        <>
          {/* 지역 토글 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {(['US', 'KR'] as CapRegion[]).map(r => (
              <button key={r} onClick={() => setCapRegion(r)}
                style={{ flex: 1, padding: '9px 4px', borderRadius: 10, border: `1px solid ${capRegion === r ? '#00C853' : '#30363D'}`,
                  background: capRegion === r ? 'rgba(0,200,83,0.1)' : 'transparent',
                  color: capRegion === r ? '#00C853' : '#8B949E',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {r === 'US' ? '🇺🇸 미국 TOP 100' : '🇰🇷 한국 TOP 100'}
              </button>
            ))}
          </div>

          {capLoading && !capLoaded && (
            <div style={{ textAlign: 'center', padding: 60, color: '#8B949E' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🏆</div>
              <div>시총 순위 불러오는 중...</div>
              <div style={{ fontSize: 12, marginTop: 6, color: '#6E7681' }}>최초 1회만 시간이 걸립니다</div>
            </div>
          )}

          {capLoaded && capData.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#8B949E' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
              <div style={{ fontSize: 14 }}>데이터를 불러올 수 없습니다</div>
              {capError && <div style={{ fontSize: 12, marginTop: 8, color: '#6E7681', wordBreak: 'break-all' }}>{capError}</div>}
            </div>
          )}

          {capData.length > 0 && (
            <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #21262D', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>
                  {capRegion === 'US' ? '🇺🇸 미국' : '🇰🇷 한국'} 시총 TOP {capData.length}
                </span>
                {capLoading && <span style={{ fontSize: 11, color: '#8B949E' }}>업데이트 중...</span>}
              </div>
              {capData.map((item, i) => {
                const c = item.changePct > 0 ? '#00C853' : item.changePct < 0 ? '#FF1744' : '#8B949E';
                return (
                  <div key={item.symbol} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: i < capData.length - 1 ? '1px solid #21262D' : 'none' }}>
                    <div style={{ width: 28, textAlign: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: item.rank <= 3 ? 13 : 11, fontWeight: 700, color: item.rank === 1 ? '#FFD700' : item.rank === 2 ? '#C0C0C0' : item.rank === 3 ? '#CD7F32' : '#6E7681' }}>
                        {item.rank <= 3 ? ['🥇','🥈','🥉'][item.rank - 1] : `#${item.rank}`}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#8B949E', marginTop: 1 }}>{item.symbol}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{fmtPrice(item.price, item.currency)}</div>
                      <div style={{ fontSize: 11, color: c, marginTop: 1 }}>
                        {item.changePct >= 0 ? '▲' : '▼'} {Math.abs(item.changePct).toFixed(2)}%
                        {'  '}
                        <span style={{ color: '#6E7681' }}>{item.change >= 0 ? '+' : ''}{item.currency === 'KRW' ? `₩${Math.round(Math.abs(item.change)).toLocaleString('ko-KR')}` : `$${Math.abs(item.change).toFixed(2)}`}</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#6E7681', marginTop: 1 }}>시총 {fmtMarketCap(item.marketCap, item.currency)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── 뉴스 탭 ── */}
      {tab === 'news' && (
        <div>
          {/* 시장/내 종목 서브탭 */}
          <div style={{ display: 'flex', gap: 6, background: '#161B22', border: '1px solid #30363D', borderRadius: 10, padding: 4, marginBottom: 14 }}>
            <button onClick={() => setNewsMode('market')}
              style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                background: newsMode === 'market' ? '#00C853' : 'transparent',
                color:      newsMode === 'market' ? '#fff'    : '#8B949E' }}>
              🌐 시장 전체
            </button>
            <button onClick={() => setNewsMode('my')}
              style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                background: newsMode === 'my' ? '#00C853' : 'transparent',
                color:      newsMode === 'my' ? '#fff'    : '#8B949E' }}>
              📈 내 종목
            </button>
          </div>

          {/* 검색창 */}
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: '#8B949E', pointerEvents: 'none' }}>🔍</span>
            <input value={newsQuery} onChange={e => setNewsQuery(e.target.value)}
              placeholder="뉴스 검색 (예: 나스닥, 금리, 반도체)"
              style={{ width: '100%', background: '#0D1117', border: '1px solid #30363D', borderRadius: 10, padding: '11px 36px 11px 36px', color: '#E6EDF3', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            {newsQuery && (
              <button onClick={() => setNewsQuery('')}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#8B949E', cursor: 'pointer', fontSize: 16, padding: 4 }}>✕</button>
            )}
          </div>

          {/* 내 종목 필터 */}
          {newsMode === 'my' && !myNewsLoading && myStocks.length > 0 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 14, paddingBottom: 4 }}>
              {['all', ...myStocks.map(s => s.ticker)].map(t => {
                const label  = t === 'all' ? '전체' : myStocks.find(s => s.ticker === t)?.name ?? t;
                const active = selectedStock === t;
                return (
                  <button key={t} onClick={() => setSelectedStock(t)}
                    style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${active ? '#00C853' : '#30363D'}`,
                      background: active ? 'rgba(0,200,83,0.1)' : 'transparent',
                      color: active ? '#00C853' : '#8B949E',
                      fontSize: 13, fontWeight: active ? 700 : 400, whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer' }}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* 로딩 */}
          {(newsMode === 'market' ? mktNewsLoading : myNewsLoading) && (
            <div style={{ textAlign: 'center', padding: 40, color: '#8B949E' }}>
              {newsMode === 'market' ? '뉴스 번역 중... (30초 정도 걸립니다)' : '뉴스 불러오는 중...'}
            </div>
          )}

          {/* 내 종목 없음 */}
          {newsMode === 'my' && myNewsLoaded && myStocks.length === 0 && !myNewsLoading && (
            <div style={{ textAlign: 'center', padding: 60, color: '#8B949E' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              <div>포트폴리오에 주식을 추가하면 관련 뉴스를 볼 수 있어요</div>
            </div>
          )}

          {/* 뉴스 없음 */}
          {!(newsMode === 'market' ? mktNewsLoading : myNewsLoading) && filteredNews.length === 0
            && (newsMode === 'market' || myStocks.length > 0)
            && (newsMode === 'market' ? mktNewsLoaded : myNewsLoaded) && (
            <div style={{ textAlign: 'center', padding: 40, color: '#8B949E' }}>
              {newsQuery ? `"${newsQuery}" 검색 결과가 없습니다.` : '뉴스가 없습니다'}
            </div>
          )}

          {/* 뉴스 카드 */}
          {!(newsMode === 'market' ? mktNewsLoading : myNewsLoading) && filteredNews.map((item, i) => (
            <a key={item.guid ?? i} href={item.link} target="_blank" rel="noopener noreferrer"
              style={{ textDecoration: 'none', display: 'block', background: '#161B22', border: '1px solid #30363D', borderRadius: 14, padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                {newsMode === 'my' && item.stockName && (
                  <span style={{ background: 'rgba(0,200,83,0.15)', color: '#00C853', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>
                    {item.stockName}
                  </span>
                )}
                {newsMode === 'market' && item.region && (
                  <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 6, color: '#8B949E' }}>
                    {regionLabel[item.region] ?? item.region}
                  </span>
                )}
                <span style={{ fontSize: 11, color: '#8B949E', marginLeft: 'auto' }}>{fmtDate(item.pubTime)}</span>
              </div>
              <div style={{ color: '#E6EDF3', fontSize: 15, fontWeight: 700, lineHeight: 1.5, marginBottom: 6 }}>
                {item.titleKo || item.title}
              </div>
              {item.descKo && (
                <div style={{ color: '#C9D1D9', fontSize: 13, lineHeight: 1.65, marginBottom: 8 }}>{item.descKo}</div>
              )}
              {item.titleKo && item.titleKo !== item.title && (
                <div style={{ color: '#6E7681', fontSize: 11, lineHeight: 1.4, marginBottom: 8, fontStyle: 'italic' }}>{item.title}</div>
              )}
              {item.publisher && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, paddingTop: 8, borderTop: '1px solid #21262D' }}>
                  <span style={{ fontSize: 11, color: '#8B949E' }}>출처</span>
                  <span style={{ fontSize: 11, color: '#00C853', fontWeight: 700 }}>{item.publisher}</span>
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
