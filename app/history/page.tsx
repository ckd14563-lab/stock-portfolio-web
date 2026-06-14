'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts';
import { getStocks, getAccounts, getAppToken } from '@/lib/storage';
import type { Stock, Account } from '@/lib/types';

type Period  = '일' | '월' | '년';
type Tab     = '추이' | '비중' | '배당';
type PieView = '종목별' | '계좌별' | '통화별' | '시장별';

interface Snapshot { date: string; principal: number; valueKrw: number; usdKrw: number; }
interface DivItem {
  id: string; name: string; ticker: string; market: string;
  currency: string; shares: number; accountId: string;
  currentPrice: number; annualDivPerShare: number; divYield: number;
  annualIncome: number; lastDivDate: string | null; hasDividend: boolean;
  monthlyIncome: number[];
}

const PIE_COLORS = ['#00C853','#2196F3','#FF6B35','#9C27B0','#FF9800','#00BCD4','#E91E63','#FF1744','#795548','#607D8B','#CDDC39','#009688'];

function buildSymbol(ticker: string, market: string) {
  if (market === 'US') return ticker.toUpperCase();
  if (market === 'KS') return `${ticker}.KS`;
  return `${ticker}.KQ`;
}

function fmtBrief(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000)      return `${Math.round(n / 10_000)}만`;
  return n.toLocaleString('ko-KR');
}

function fmtKrw(n: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(n);
}

function fmtLabel(date: string, period: Period) {
  if (period === '일') return date.slice(5).replace('-', '/');
  if (period === '월') return date.slice(2, 7).replace('-', '/');
  return date.slice(0, 4);
}

function aggregate(snapshots: Snapshot[], period: Period): Snapshot[] {
  if (period === '일') {
    const cutoff = new Date(Date.now() + 9 * 3600_000);
    cutoff.setDate(cutoff.getDate() - 59);
    return snapshots.filter(s => s.date >= cutoff.toISOString().slice(0, 10));
  }
  if (period === '월') {
    const groups: Record<string, Snapshot> = {};
    snapshots.forEach(s => { groups[s.date.slice(0, 7)] = s; });
    const cutoff = new Date(Date.now() + 9 * 3600_000);
    cutoff.setMonth(cutoff.getMonth() - 23);
    return Object.values(groups).filter(s => s.date.slice(0, 7) >= cutoff.toISOString().slice(0, 7));
  }
  const groups: Record<string, Snapshot> = {};
  snapshots.forEach(s => { groups[s.date.slice(0, 4)] = s; });
  return Object.values(groups);
}

function LineTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const principal = payload.find(p => p.name === '원금')?.value ?? 0;
  const value     = payload.find(p => p.name === '평가금액')?.value ?? 0;
  const profit = value - principal;
  const pct = principal > 0 ? (profit / principal) * 100 : 0;
  const pc = profit >= 0 ? '#00C853' : '#FF1744';
  return (
    <div style={{ background: '#0D1117', border: '1px solid #30363D', borderRadius: 10, padding: '12px 14px', fontSize: 12 }}>
      <div style={{ color: '#8B949E', marginBottom: 8 }}>{label}</div>
      <div style={{ color: '#8B949E' }}>원금&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span style={{ color: '#E6EDF3', fontWeight: 700 }}>{fmtKrw(principal)}</span></div>
      <div style={{ color: '#8B949E', marginTop: 4 }}>평가금액 <span style={{ color: '#00C853', fontWeight: 700 }}>{fmtKrw(value)}</span></div>
      {principal > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #21262D', color: pc, fontWeight: 700 }}>
          {profit >= 0 ? '+' : ''}{fmtKrw(profit)} ({profit >= 0 ? '+' : ''}{pct.toFixed(2)}%)
        </div>
      )}
    </div>
  );
}

function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { pct: number } }> }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div style={{ background: '#0D1117', border: '1px solid #30363D', borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: '#E6EDF3', fontWeight: 700, marginBottom: 4 }}>{item.name}</div>
      <div style={{ color: '#00C853' }}>{fmtKrw(item.value)}</div>
      <div style={{ color: '#8B949E', marginTop: 2 }}>{item.payload.pct.toFixed(1)}%</div>
    </div>
  );
}

export default function HistoryPage() {
  const [tab,       setTab]       = useState<Tab>('추이');
  const [period,    setPeriod]    = useState<Period>('일');
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const [stocks,     setStocks]     = useState<Stock[]>([]);
  const [accounts,   setAccounts]   = useState<Account[]>([]);
  const [priceMap,   setPriceMap]   = useState<Record<string, number>>({});
  const [usdKrwRate, setUsdKrwRate] = useState(1380);

  const [pieView,    setPieView]    = useState<PieView>('종목별');
  const [divData,    setDivData]    = useState<DivItem[]>([]);
  const [divLoading, setDivLoading] = useState(false);
  const [divLoaded,  setDivLoaded]  = useState(false);

  const saveAndLoad = useCallback(async () => {
    setLoading(true);
    try {
      const [stockList, accountList] = await Promise.all([getStocks(), getAccounts()]);
      setStocks(stockList);
      setAccounts(accountList);

      let principal = 0, valueKrw = 0, usdKrw = 1380;
      const pMap: Record<string, number> = {};

      if (stockList.length > 0) {
        const syms   = stockList.map(s => buildSymbol(s.ticker, s.market)).join(',');
        const priceRes = await fetch(`/api/prices?symbols=${encodeURIComponent(`${syms},USDKRW=X`)}`).catch(() => null);
        const raw: Record<string, { currentPrice: number }> = priceRes ? await priceRes.json().catch(() => ({})) : {};

        if (raw['USDKRW=X']?.currentPrice) usdKrw = raw['USDKRW=X'].currentPrice;
        setUsdKrwRate(usdKrw);

        stockList.forEach(s => {
          const sym = buildSymbol(s.ticker, s.market);
          const cur = raw[sym]?.currentPrice ?? s.avgPrice;
          pMap[sym] = cur;
          const cost = s.shares * s.avgPrice;
          const val  = s.shares * cur;
          principal += s.currency === 'USD' ? cost * usdKrw : cost;
          valueKrw  += s.currency === 'USD' ? val  * usdKrw : val;
        });
        setPriceMap(pMap);
      }

      const token = getAppToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['x-token'] = token;
      const saveRes = await fetch('/api/snapshots', {
        method: 'POST', headers,
        body: JSON.stringify({ principal, valueKrw, usdKrw }),
      });
      if (saveRes.ok) setLastSaved((await saveRes.json()).date);

      const histRes = await fetch('/api/snapshots');
      if (histRes.ok) setSnapshots(await histRes.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { saveAndLoad(); }, [saveAndLoad]);

  useEffect(() => {
    if (tab !== '배당' || divLoaded || divLoading) return;
    setDivLoading(true);
    fetch('/api/dividends')
      .then(r => r.json())
      .then(data => { setDivData(Array.isArray(data) ? data : []); setDivLoaded(true); })
      .catch(() => setDivLoaded(true))
      .finally(() => setDivLoading(false));
  }, [tab, divLoaded, divLoading]);

  const pieData = useMemo(() => {
    if (stocks.length === 0) return [];
    const toKrw = (s: Stock, price: number) => {
      const val = s.shares * price;
      return s.currency === 'USD' ? val * usdKrwRate : val;
    };

    let raw: { name: string; value: number }[] = [];

    if (pieView === '종목별') {
      raw = stocks
        .map(s => ({ name: s.name, value: Math.round(toKrw(s, priceMap[buildSymbol(s.ticker, s.market)] ?? s.avgPrice)) }))
        .filter(d => d.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 12);
    } else if (pieView === '계좌별') {
      const grp: Record<string, number> = {};
      stocks.forEach(s => {
        const val = toKrw(s, priceMap[buildSymbol(s.ticker, s.market)] ?? s.avgPrice);
        const key = accounts.find(a => a.id === s.accountId)?.name ?? '미분류';
        grp[key] = (grp[key] ?? 0) + val;
      });
      raw = Object.entries(grp).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);
    } else if (pieView === '통화별') {
      let krw = 0, usd = 0;
      stocks.forEach(s => {
        const val = toKrw(s, priceMap[buildSymbol(s.ticker, s.market)] ?? s.avgPrice);
        if (s.currency === 'USD') usd += val; else krw += val;
      });
      raw = [{ name: '원화 (KRW)', value: Math.round(krw) }, { name: '달러 (USD)', value: Math.round(usd) }].filter(d => d.value > 0);
    } else {
      let ko = 0, us = 0;
      stocks.forEach(s => {
        const val = toKrw(s, priceMap[buildSymbol(s.ticker, s.market)] ?? s.avgPrice);
        if (s.market === 'US') us += val; else ko += val;
      });
      raw = [{ name: '국내 (KS/KQ)', value: Math.round(ko) }, { name: '해외 (US)', value: Math.round(us) }].filter(d => d.value > 0);
    }

    const total = raw.reduce((s, d) => s + d.value, 0);
    return raw.map(d => ({ ...d, pct: total > 0 ? (d.value / total) * 100 : 0 }));
  }, [stocks, priceMap, accounts, usdKrwRate, pieView]);

  const divSummary = useMemo(() => {
    const withDiv = divData.filter(d => d.hasDividend);
    const totalKrw = withDiv.reduce((sum, d) => {
      return sum + (d.currency === 'USD' ? d.annualIncome * usdKrwRate : d.annualIncome);
    }, 0);
    const totalVal = divData.reduce((sum, d) => {
      const val = d.shares * d.currentPrice;
      return sum + (d.currency === 'USD' ? val * usdKrwRate : val);
    }, 0);
    return { totalKrw, avgYield: totalVal > 0 ? (totalKrw / totalVal) * 100 : 0, count: withDiv.length };
  }, [divData, usdKrwRate]);

  const monthlyKrw = useMemo(() => {
    const result = new Array(12).fill(0) as number[];
    divData.filter(d => d.hasDividend && d.monthlyIncome).forEach(d => {
      d.monthlyIncome.forEach((income, month) => {
        result[month] += d.currency === 'USD' ? income * usdKrwRate : income;
      });
    });
    return result;
  }, [divData, usdKrwRate]);

  const latest    = snapshots[snapshots.length - 1];
  const profit    = latest ? latest.valueKrw - latest.principal : 0;
  const profitPct = latest?.principal > 0 ? (profit / latest.principal) * 100 : 0;
  const pc        = profit >= 0 ? '#00C853' : '#FF1744';
  const lineData  = aggregate(snapshots, period).map(s => ({
    label: fmtLabel(s.date, period), 원금: Math.round(s.principal), 평가금액: Math.round(s.valueKrw),
  }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>📊 자산 분석</h1>
        {lastSaved && <span style={{ fontSize: 11, color: '#8B949E' }}>{lastSaved} 기준</span>}
      </div>

      {/* 메인 탭 */}
      <div style={{ display: 'flex', gap: 6, background: '#161B22', border: '1px solid #30363D', borderRadius: 10, padding: 4, marginBottom: 16 }}>
        {(['추이', '비중', '배당'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
              background: tab === t ? '#00C853' : 'transparent',
              color:      tab === t ? '#fff'    : '#8B949E' }}>
            {t === '추이' ? '📈 추이' : t === '비중' ? '🥧 비중' : '💰 배당'}
          </button>
        ))}
      </div>

      {/* ── 추이 탭 ── */}
      {tab === '추이' && (
        <>
          {latest && (
            <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 16, padding: 18, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#8B949E', marginBottom: 10 }}>현재 자산 현황 (원화 기준)</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div><div style={{ fontSize: 11, color: '#8B949E', marginBottom: 3 }}>총 원금</div><div style={{ fontSize: 16, fontWeight: 700 }}>{fmtKrw(latest.principal)}</div></div>
                <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, color: '#8B949E', marginBottom: 3 }}>총 평가금액</div><div style={{ fontSize: 16, fontWeight: 700, color: '#00C853' }}>{fmtKrw(latest.valueKrw)}</div></div>
              </div>
              <div style={{ borderTop: '1px solid #30363D', paddingTop: 12 }}>
                <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>수익금 / 수익률</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: pc }}>
                  {profit >= 0 ? '+' : ''}{fmtKrw(profit)}&nbsp;<span style={{ fontSize: 16 }}>({profit >= 0 ? '+' : ''}{profitPct.toFixed(2)}%)</span>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, background: '#161B22', border: '1px solid #30363D', borderRadius: 10, padding: 4, marginBottom: 16 }}>
            {(['일', '월', '년'] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700,
                  background: period === p ? '#00C853' : 'transparent',
                  color:      period === p ? '#fff'    : '#8B949E' }}>
                {p}
              </button>
            ))}
          </div>

          <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 16, padding: '16px 8px 16px 0', marginBottom: 16 }}>
            {loading ? (
              <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B949E', fontSize: 14 }}>데이터 로딩 중...</div>
            ) : lineData.length === 0 ? (
              <div style={{ height: 260, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#8B949E', gap: 8 }}>
                <span style={{ fontSize: 36 }}>📈</span>
                <span style={{ fontSize: 14 }}>아직 데이터가 없어요</span>
                <span style={{ fontSize: 12 }}>포트폴리오를 추가한 뒤 이 페이지를 방문할수록 그래프가 쌓입니다</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={lineData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21262D" />
                  <XAxis dataKey="label" tick={{ fill: '#8B949E', fontSize: 11 }} axisLine={{ stroke: '#30363D' }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#8B949E', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtBrief} width={52} />
                  <Tooltip content={<LineTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12, color: '#8B949E' }} />
                  <Line type="monotone" dataKey="원금" stroke="#8B949E" strokeWidth={2} strokeDasharray="5 3" dot={lineData.length <= 10 ? { r: 3, fill: '#8B949E' } : false} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="평가금액" stroke="#00C853" strokeWidth={2.5} dot={lineData.length <= 10 ? { r: 4, fill: '#00C853' } : false} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {!loading && lineData.length > 0 && (
            <div style={{ textAlign: 'center', fontSize: 11, color: '#8B949E', marginBottom: 12 }}>
              {lineData.length}개 데이터 · 매일 자동 기록됩니다
            </div>
          )}

          {!loading && snapshots.length > 1 && (
            <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #21262D', fontWeight: 700, fontSize: 14 }}>📋 전체 기록</div>
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {[...snapshots].reverse().map((s, i) => {
                  const p = s.valueKrw - s.principal;
                  const pct = s.principal > 0 ? (p / s.principal) * 100 : 0;
                  const c = p >= 0 ? '#00C853' : '#FF1744';
                  return (
                    <div key={s.date} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: i < snapshots.length - 1 ? '1px solid #21262D' : 'none' }}>
                      <span style={{ fontSize: 13, color: '#8B949E' }}>{s.date}</span>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtKrw(s.valueKrw)}</div>
                        <div style={{ fontSize: 11, color: c, marginTop: 2 }}>{p >= 0 ? '+' : ''}{fmtKrw(p)} ({p >= 0 ? '+' : ''}{pct.toFixed(2)}%)</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── 비중 탭 ── */}
      {tab === '비중' && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {(['종목별', '계좌별', '통화별', '시장별'] as PieView[]).map(v => (
              <button key={v} onClick={() => setPieView(v)}
                style={{ padding: '7px 16px', borderRadius: 20, border: `1px solid ${pieView === v ? '#00C853' : '#30363D'}`,
                  background: pieView === v ? 'rgba(0,200,83,0.1)' : 'transparent',
                  color: pieView === v ? '#00C853' : '#8B949E',
                  fontSize: 13, fontWeight: pieView === v ? 700 : 400, cursor: 'pointer' }}>
                {v}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#8B949E' }}>로딩 중...</div>
          ) : stocks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#8B949E' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
              <div>포트폴리오에 주식을 추가하면 비중을 볼 수 있어요</div>
            </div>
          ) : (
            <>
              <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 16, padding: '16px 8px', marginBottom: 16 }}>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={110} dataKey="value" paddingAngle={2}>
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 16, overflow: 'hidden' }}>
                {pieData.map((item, i) => (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < pieData.length - 1 ? '1px solid #21262D' : 'none' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#E6EDF3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{fmtKrw(item.value)}</div>
                      <div style={{ fontSize: 11, color: '#8B949E', marginTop: 2 }}>{item.pct.toFixed(1)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── 배당 탭 ── */}
      {tab === '배당' && (
        <>
          {divLoading && (
            <div style={{ textAlign: 'center', padding: 60, color: '#8B949E' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>💰</div>
              <div>배당 정보 불러오는 중...</div>
              <div style={{ fontSize: 12, marginTop: 8, color: '#6E7681' }}>종목이 많으면 1분 정도 걸릴 수 있어요</div>
            </div>
          )}

          {!divLoading && divLoaded && (
            <>
              <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 16, padding: 18, marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#8B949E', marginBottom: 8 }}>예상 연간 배당 수익 (원화 기준)</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#00C853', marginBottom: 14 }}>{fmtKrw(divSummary.totalKrw)}</div>
                <div style={{ display: 'flex', gap: 24 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 3 }}>포트폴리오 배당 수익률</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{divSummary.avgYield.toFixed(2)}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 3 }}>배당 종목 수</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{divSummary.count}개</div>
                  </div>
                </div>
              </div>

              {divSummary.count > 0 && monthlyKrw.some(m => m > 0) && (
                <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 16, padding: '16px 16px 12px', marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>📅 월별 예상 수령액</div>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 90, marginBottom: 10 }}>
                    {monthlyKrw.map((amount, i) => {
                      const maxVal = Math.max(...monthlyKrw, 1);
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: '100%', height: 70, display: 'flex', alignItems: 'flex-end' }}>
                            <div style={{ width: '100%', height: `${Math.max(Math.round((amount / maxVal) * 70), amount > 0 ? 3 : 2)}px`, background: amount > 0 ? '#00C853' : '#21262D', borderRadius: '3px 3px 0 0' }} />
                          </div>
                          <div style={{ fontSize: 9, color: amount > 0 ? '#8B949E' : '#3D444D' }}>{i + 1}월</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ borderTop: '1px solid #21262D', paddingTop: 10 }}>
                    {monthlyKrw.map((amount, i) => amount > 0 ? (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #21262D' }}>
                        <span style={{ fontSize: 12, color: '#8B949E' }}>{i + 1}월</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#00C853' }}>{fmtKrw(Math.round(amount))}</span>
                      </div>
                    ) : null)}
                  </div>
                </div>
              )}

              {divSummary.count === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#8B949E' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
                  <div>배당을 지급하는 종목이 없어요</div>
                </div>
              ) : (
                <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #21262D', fontWeight: 700, fontSize: 14 }}>💰 배당 종목</div>
                  {divData
                    .filter(d => d.hasDividend)
                    .sort((a, b) => {
                      const aKrw = a.currency === 'USD' ? a.annualIncome * usdKrwRate : a.annualIncome;
                      const bKrw = b.currency === 'USD' ? b.annualIncome * usdKrwRate : b.annualIncome;
                      return bKrw - aKrw;
                    })
                    .map((d, i, arr) => {
                      const incomeKrw = d.currency === 'USD' ? d.annualIncome * usdKrwRate : d.annualIncome;
                      return (
                        <div key={d.id} style={{ padding: '14px 16px', borderBottom: i < arr.length - 1 ? '1px solid #21262D' : 'none' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#E6EDF3' }}>{d.name}</div>
                              <div style={{ fontSize: 11, color: '#8B949E', marginTop: 2 }}>{d.ticker} · {d.shares}주</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#00C853' }}>
                                {fmtKrw(incomeKrw)}<span style={{ fontSize: 11, fontWeight: 400, color: '#8B949E' }}>/년</span>
                              </div>
                              <div style={{ fontSize: 11, color: '#8B949E', marginTop: 2 }}>수익률 {d.divYield.toFixed(2)}%</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#6E7681' }}>
                            <span>주당 {d.currency === 'USD' ? `$${d.annualDivPerShare.toFixed(2)}` : `₩${Math.round(d.annualDivPerShare).toLocaleString()}`}/년</span>
                            {d.lastDivDate && <span>최근 배당일 {d.lastDivDate}</span>}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
