'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import StockCard from '@/components/StockCard';
import AddStockModal from '@/components/AddStockModal';
import { getStocks, addStock, updateStock, deleteStock, syncKisStocks, getKisCredentials, getKisLastSync, setKisLastSync } from '@/lib/storage';
import { fmtCurrency, fmtPercent, fmtNumber } from '@/lib/format';
import type { Stock, PriceData } from '@/lib/types';

const PIE_COLORS = ['#00C853','#2196F3','#FF6B35','#9C27B0','#FF9800','#00BCD4','#E91E63','#8BC34A','#3F51B5','#FFC107'];

const BROKERAGE_ORDER = ['한국투자증권', 'NH투자증권', '메리츠증권', '삼성증권', '기타'];
const BROKERAGE_COLORS: Record<string, string> = {
  '한국투자증권': '#FF6B00',
  'NH투자증권': '#007B40',
  '메리츠증권': '#005BAC',
  '삼성증권': '#1428A0',
  '기타': '#8B949E',
};

interface DividendInfo {
  annualDividend: number;
  dividendYield: number;
  exDate: string | null;
}

function buildSymbol(ticker: string, market: string) {
  if (market === 'US') return ticker.toUpperCase();
  if (market === 'KS') return `${ticker}.KS`;
  return `${ticker}.KQ`;
}

// 파이차트 커스텀 라벨
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, value }: {
  cx: number; cy: number; midAngle: number;
  innerRadius: number; outerRadius: number; value: number;
}) {
  if (value < 5) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
      style={{ fontSize: 12, fontWeight: 700 }}>
      {value}%
    </text>
  );
}

export default function PortfolioPage() {
  const [stocks,   setStocks]   = useState<Stock[]>([]);
  const [prices,   setPrices]   = useState<Record<string, PriceData>>({});
  const [dividends, setDividends] = useState<Record<string, DividendInfo>>({});
  const [loading,  setLoading]  = useState(false);
  const [syncing,  setSyncing]  = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editData,  setEditData]  = useState<Stock | null>(null);
  const [defaultBrokerage, setDefaultBrokerage] = useState('');
  const [lastSync, setLastSyncState] = useState<string | null>(null);
  const [kisConnected, setKisConnected] = useState(false);

  const load = useCallback(async () => {
    const data = await getStocks();
    setStocks(data);
    setKisConnected(!!getKisCredentials());
    setLastSyncState(getKisLastSync());
    if (data.length === 0) return;
    setLoading(true);
    try {
      const symbols = data.map(s => buildSymbol(s.ticker, s.market)).join(',');
      const [priceRes, divRes] = await Promise.allSettled([
        fetch(`/api/prices?symbols=${encodeURIComponent(symbols)}`),
        fetch(`/api/dividends?symbols=${encodeURIComponent(symbols)}`),
      ]);

      if (priceRes.status === 'fulfilled') {
        const json: Record<string, PriceData> = await priceRes.value.json();
        const byId: Record<string, PriceData> = {};
        data.forEach(s => { const sym = buildSymbol(s.ticker, s.market); if (json[sym]) byId[s.id] = json[sym]; });
        setPrices(byId);
      }
      if (divRes.status === 'fulfilled') {
        const json: Record<string, DividendInfo> = await divRes.value.json();
        const byId: Record<string, DividendInfo> = {};
        data.forEach(s => { const sym = buildSymbol(s.ticker, s.market); if (json[sym]) byId[s.id] = json[sym]; });
        setDividends(byId);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data: Omit<Stock, 'id' | 'createdAt'>) => {
    if (editData) await updateStock(editData.id, data);
    else await addStock(data);
    setModalOpen(false); setEditData(null); setDefaultBrokerage('');
    load();
  };

  const handleEdit = (s: Stock) => { setEditData(s); setModalOpen(true); };
  const handleDelete = async (id: string) => { await deleteStock(id); load(); };

  const syncKis = async () => {
    const creds = getKisCredentials();
    if (!creds) return alert('설정 탭에서 KIS API를 먼저 연결해주세요.');
    setSyncing(true);
    try {
      const res = await fetch('/api/kis/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds) });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      await syncKisStocks(json.stocks);
      const now = new Date().toLocaleString('ko-KR');
      setKisLastSync(now); setLastSyncState(now);
      alert(`${json.stocks.length}개 종목을 불러왔습니다.`);
      load();
    } catch (e) { alert(`동기화 실패: ${(e as Error).message}`); }
    finally { setSyncing(false); }
  };

  const openAdd = (brokerage = '') => { setEditData(null); setDefaultBrokerage(brokerage); setModalOpen(true); };

  // ── 전체 통화별 요약 ──
  const summary = useMemo(() => {
    const byCur: Record<string, { cost: number; value: number }> = {};
    stocks.forEach(s => {
      if (!byCur[s.currency]) byCur[s.currency] = { cost: 0, value: 0 };
      byCur[s.currency].cost += s.shares * s.avgPrice;
      const p = prices[s.id];
      byCur[s.currency].value += p ? s.shares * p.currentPrice : s.shares * s.avgPrice;
    });
    return Object.entries(byCur).map(([cur, d]) => ({
      currency: cur, cost: d.cost, value: d.value,
      profit: d.value - d.cost,
      profitPct: d.cost > 0 ? ((d.value - d.cost) / d.cost) * 100 : 0,
    }));
  }, [stocks, prices]);

  // ── 배당 요약 ──
  const divSummary = useMemo(() => {
    const byCur: Record<string, { total: number; totalCost: number }> = {};
    stocks.forEach(s => {
      const d = dividends[s.id];
      if (!d || d.annualDividend <= 0) return;
      if (!byCur[s.currency]) byCur[s.currency] = { total: 0, totalCost: 0 };
      byCur[s.currency].total += d.annualDividend * s.shares;
      byCur[s.currency].totalCost += s.shares * s.avgPrice;
    });
    return Object.entries(byCur).map(([cur, d]) => ({
      currency: cur,
      annual: d.total,
      monthly: d.total / 12,
      yield: d.totalCost > 0 ? (d.total / d.totalCost) * 100 : 0,
    }));
  }, [stocks, dividends]);

  // ── 파이차트 ──
  const pieData = useMemo(() => {
    if (stocks.length === 0) return [];
    const total = stocks.reduce((s, x) => s + (prices[x.id]?.currentPrice ?? x.avgPrice) * x.shares, 0);
    if (!total) return [];
    return stocks.map((s, i) => ({
      name: s.name.length > 8 ? s.name.slice(0, 8) + '…' : s.name,
      value: Math.round(((prices[s.id]?.currentPrice ?? s.avgPrice) * s.shares / total) * 1000) / 10,
      amount: (prices[s.id]?.currentPrice ?? s.avgPrice) * s.shares,
      currency: s.currency,
      color: PIE_COLORS[i % PIE_COLORS.length],
    })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [stocks, prices]);

  // ── 증권사별 그룹 ──
  const grouped = useMemo(() => {
    const map: Record<string, Stock[]> = {};
    stocks.forEach(s => { const key = s.brokerage || '기타'; if (!map[key]) map[key] = []; map[key].push(s); });
    return Object.entries(map).sort(([a], [b]) => {
      const ai = BROKERAGE_ORDER.indexOf(a), bi = BROKERAGE_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [stocks]);

  return (
    <div>
      {/* ── 전체 요약 ── */}
      {summary.map(s => {
        const pc = s.profit > 0 ? '#00C853' : s.profit < 0 ? '#FF1744' : '#8B949E';
        return (
          <div key={s.currency} style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 16, padding: 18, marginBottom: 12 }}>
            <div style={{ color: '#8B949E', fontSize: 13, marginBottom: 14 }}>
              {s.currency === 'KRW' ? '🇰🇷 국내 전체' : '🇺🇸 해외 전체'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>총 매입금액</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{fmtCurrency(s.cost, s.currency)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>총 평가금액</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{fmtCurrency(s.value, s.currency)}</div>
              </div>
            </div>
            <div style={{ borderTop: '1px solid #30363D', paddingTop: 14 }}>
              <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>수익금 / 수익률</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: pc }}>
                {s.profit >= 0 ? '+' : ''}{fmtCurrency(s.profit, s.currency)} {fmtPercent(s.profitPct)}
              </div>
            </div>
          </div>
        );
      })}

      {/* ── 파이차트 ── */}
      {pieData.length >= 1 && (
        <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>📊 포트폴리오 구성</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieData} dataKey="value" nameKey="name"
                cx="50%" cy="50%" outerRadius={90}
                labelLine={false}
                label={(props) => <PieLabel {...props} />}
              >
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip
                formatter={(v: unknown, _: unknown, props: { payload?: { amount?: number; currency?: string } }) => {
                  const amount = props.payload?.amount;
                  const cur = props.payload?.currency ?? 'KRW';
                  return [
                    `${v}% · ${amount != null ? fmtCurrency(amount, cur) : ''}`,
                    '비중',
                  ];
                }}
                contentStyle={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 8, color: '#E6EDF3', fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* 범례 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {pieData.map((entry, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: entry.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#E6EDF3', flex: 1 }}>{entry.name}</span>
                <span style={{ fontSize: 12, color: '#8B949E', marginRight: 8 }}>{entry.value}%</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtCurrency(entry.amount, entry.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 배당 요약 ── */}
      {divSummary.length > 0 && (
        <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 16, padding: 18, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>💰 배당 현황</div>
          {divSummary.map(d => (
            <div key={d.currency} style={{ marginBottom: divSummary.length > 1 ? 14 : 0 }}>
              <div style={{ fontSize: 12, color: '#8B949E', marginBottom: 10 }}>
                {d.currency === 'KRW' ? '🇰🇷 국내' : '🇺🇸 해외'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div style={{ background: '#0D1117', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 6 }}>배당수익률</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#FFD700' }}>{d.yield.toFixed(2)}%</div>
                </div>
                <div style={{ background: '#0D1117', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 6 }}>연간 배당</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#FFD700' }}>{fmtCurrency(d.annual, d.currency)}</div>
                </div>
                <div style={{ background: '#0D1117', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 6 }}>월 환산</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#FFD700' }}>{fmtCurrency(d.monthly, d.currency)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 빈 상태 ── */}
      {stocks.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#8B949E' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>포트폴리오가 비어있어요</div>
          <div style={{ fontSize: 14, marginBottom: 20 }}>KIS 동기화 또는 + 버튼으로 추가해보세요</div>
          {kisConnected && (
            <button onClick={syncKis} disabled={syncing} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #FF6B00', background: 'transparent', color: '#FF6B00', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
              {syncing ? '동기화 중...' : '🔄 KIS 동기화'}
            </button>
          )}
        </div>
      )}

      {loading && stocks.length > 0 && (
        <div style={{ fontSize: 12, color: '#8B949E', marginBottom: 12, textAlign: 'center' }}>⏳ 실시간 가격 조회중...</div>
      )}

      {/* ── 증권사별 섹션 ── */}
      {grouped.map(([brokerage, bStocks]) => {
        const color = BROKERAGE_COLORS[brokerage] || '#8B949E';
        const isKis = brokerage === '한국투자증권';

        const krwStocks = bStocks.filter(s => s.currency === 'KRW');
        const usdStocks = bStocks.filter(s => s.currency === 'USD');
        const krwCost  = krwStocks.reduce((s, x) => s + x.shares * x.avgPrice, 0);
        const krwValue = krwStocks.reduce((s, x) => s + x.shares * (prices[x.id]?.currentPrice ?? x.avgPrice), 0);
        const usdCost  = usdStocks.reduce((s, x) => s + x.shares * x.avgPrice, 0);
        const usdValue = usdStocks.reduce((s, x) => s + x.shares * (prices[x.id]?.currentPrice ?? x.avgPrice), 0);

        return (
          <div key={brokerage} style={{ marginBottom: 28 }}>
            {/* 증권사 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 4, height: 18, background: color, borderRadius: 2 }} />
                <span style={{ fontWeight: 700, fontSize: 15 }}>{brokerage}</span>
                <span style={{ fontSize: 12, color: '#8B949E' }}>({bStocks.length}종목)</span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {isKis && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                    <button onClick={syncKis} disabled={syncing}
                      style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${color}`, background: 'transparent', color, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                      {syncing ? '동기화 중...' : '🔄 동기화'}
                    </button>
                    {lastSync && <span style={{ fontSize: 10, color: '#8B949E' }}>{lastSync}</span>}
                  </div>
                )}
                <button onClick={() => openAdd(brokerage)}
                  style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #30363D', background: 'transparent', color: '#8B949E', cursor: 'pointer', fontSize: 12 }}>
                  + 추가
                </button>
              </div>
            </div>

            {/* 증권사 미니 요약 */}
            {(krwCost > 0 || usdCost > 0) && (
              <div style={{ background: color + '11', border: `1px solid ${color}33`, borderRadius: 10, padding: '10px 14px', marginBottom: 10 }}>
                {krwCost > 0 && (() => {
                  const profit = krwValue - krwCost;
                  const pct = profit / krwCost * 100;
                  const c = profit > 0 ? '#00C853' : profit < 0 ? '#FF1744' : '#8B949E';
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#8B949E' }}>매입 {fmtCurrency(krwCost, 'KRW')} · 평가 {fmtCurrency(krwValue, 'KRW')}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: c }}>{profit >= 0 ? '+' : ''}{fmtPercent(pct)}</span>
                    </div>
                  );
                })()}
                {usdCost > 0 && (() => {
                  const profit = usdValue - usdCost;
                  const pct = profit / usdCost * 100;
                  const c = profit > 0 ? '#00C853' : profit < 0 ? '#FF1744' : '#8B949E';
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: krwCost > 0 ? 6 : 0 }}>
                      <span style={{ fontSize: 12, color: '#8B949E' }}>매입 {fmtCurrency(usdCost, 'USD')} · 평가 {fmtCurrency(usdValue, 'USD')}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: c }}>{profit >= 0 ? '+' : ''}{fmtPercent(pct)}</span>
                    </div>
                  );
                })()}
              </div>
            )}

            {bStocks.map(s => (
              <StockCard key={s.id} stock={s} price={prices[s.id]} dividend={dividends[s.id]} onEdit={handleEdit} onDelete={handleDelete} />
            ))}
          </div>
        );
      })}

      {/* FAB */}
      <button
        onClick={() => openAdd()}
        style={{ position: 'fixed', bottom: 80, right: 24, width: 58, height: 58, borderRadius: '50%', background: '#00C853', color: '#fff', fontSize: 28, border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,200,83,0.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
      >+</button>

      {modalOpen && (
        <AddStockModal
          onClose={() => { setModalOpen(false); setEditData(null); setDefaultBrokerage(''); }}
          onSave={handleSave}
          editData={editData}
          defaultBrokerage={defaultBrokerage}
        />
      )}
    </div>
  );
}
