'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell,
} from 'recharts';
import AddStockModal from '@/components/AddStockModal';
import { getStocks, addStock, updateStock, deleteStock, syncKisStocks, getKisCredentials, getKisLastSync, setKisLastSync, getAccounts } from '@/lib/storage';
import { fmtCurrency, fmtPercent, fmtNumber } from '@/lib/format';
import type { Stock, Account, PriceData } from '@/lib/types';

type ChartRange = '5d' | '1mo' | '3mo' | '6mo' | '1y' | '5y' | 'max';
interface ChartPoint { date: string; close: number | null; }
interface StockChartState { symbol: string; name: string; currency: string; ticker: string; market: string; }
type SortKey = 'custom' | 'value' | 'cost' | 'profit' | 'profitPct' | 'daily' | 'dailyPct';
type MetricKey = 'profit' | 'daily';
type ValueTab = 'eval' | 'price';
type Sheet = 'profit' | 'tax' | 'dividend' | 'weight' | 'trend' | null;
type Period = '일' | '월' | '년';
type PieView = '종목별' | '계좌별' | '통화별' | '시장별';

interface Snapshot { date: string; principal: number; valueKrw: number; usdKrw: number; }
interface DivItem {
  id: string; name: string; ticker: string; market: string;
  currency: string; shares: number; accountId: string;
  currentPrice: number; annualDivPerShare: number; divYield: number;
  annualIncome: number; lastDivDate: string | null; hasDividend: boolean;
  monthlyIncome: number[];
}

const BRAND = '#00C896';
const UP = '#F04452';
const DOWN = '#3182F6';
const WARN = '#FF9500';
const PROFIT_DRAWDOWN_ALERT_PCT = -30;
const NEUTRAL = '#8B95A1';
const BORDER = '#F2F4F6';
const TEXT = '#191F28';
const PIE_COLORS = ['#00C896', '#3182F6', '#F04452', '#FFB800', '#8B5CF6', '#00B8D9', '#FF6B35', '#795548'];

const SORT_LABELS: Record<SortKey, string> = {
  custom: '직접설정순', value: '평가액순', cost: '매입금액순',
  profit: '총수익순', profitPct: '총수익률순', daily: '일간수익순', dailyPct: '일간수익률순',
};
const METRIC_LABELS: Record<MetricKey, string> = { profit: '총 수익', daily: '일간 수익' };
const AVATAR_COLORS = ['#3182F6', '#00C896', '#F04452', '#FFB800', '#8B5CF6', '#00B8D9'];

function avatarColor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = key.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function buildSymbol(ticker: string, market: string) {
  if (market === 'US') return ticker.toUpperCase();
  if (market === 'KS') return `${ticker}.KS`;
  return `${ticker}.KQ`;
}

function fmtKrw(n: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(n);
}

function fmtBrief(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000)      return `${Math.round(n / 10_000)}만`;
  return n.toLocaleString('ko-KR');
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

function changeColor(v: number | null) {
  if (v == null || v === 0) return NEUTRAL;
  return v > 0 ? UP : DOWN;
}

function LineTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const principal = payload.find(p => p.name === '원금')?.value ?? 0;
  const value     = payload.find(p => p.name === '평가금액')?.value ?? 0;
  const profit = value - principal;
  const pct = principal > 0 ? (profit / principal) * 100 : 0;
  const c = changeColor(profit);
  return (
    <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', fontSize: 12, boxShadow: '0 4px 16px rgba(25,31,40,0.1)' }}>
      <div style={{ color: NEUTRAL, marginBottom: 6 }}>{label}</div>
      <div style={{ color: NEUTRAL }}>원금 <span style={{ color: TEXT, fontWeight: 700 }}>{fmtKrw(principal)}</span></div>
      <div style={{ color: NEUTRAL, marginTop: 3 }}>평가금액 <span style={{ color: TEXT, fontWeight: 700 }}>{fmtKrw(value)}</span></div>
      {principal > 0 && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${BORDER}`, color: c, fontWeight: 700 }}>
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
    <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 16px rgba(25,31,40,0.1)' }}>
      <div style={{ color: TEXT, fontWeight: 700, marginBottom: 3 }}>{item.name}</div>
      <div style={{ color: BRAND }}>{fmtKrw(item.value)}</div>
      <div style={{ color: NEUTRAL, marginTop: 2 }}>{item.payload.pct.toFixed(1)}%</div>
    </div>
  );
}

export default function PortfolioPage() {
  const [stocks,    setStocks]    = useState<Stock[]>([]);
  const [accounts,  setAccounts]  = useState<Account[]>([]);
  const [prices,    setPrices]    = useState<Record<string, PriceData>>({});
  const [loading,   setLoading]   = useState(false);
  const [syncing,   setSyncing]   = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editData,  setEditData]  = useState<Stock | null>(null);
  const [defaultAccountId, setDefaultAccountId] = useState('');
  const [, setLastSyncState] = useState<string | null>(null);
  const [kisConnected, setKisConnected] = useState(false);
  const [usdKrw,    setUsdKrw]   = useState<number>(1380);
  const [stockChart, setStockChart] = useState<StockChartState | null>(null);
  const [stockChartRange, setStockChartRange] = useState<ChartRange>('1y');
  const [stockChartData, setStockChartData] = useState<ChartPoint[]>([]);
  const [stockChartLoading, setStockChartLoading] = useState(false);

  // ── 도미노 스타일 UI 상태 ──
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bigMetricMode, setBigMetricMode] = useState<'daily' | 'total'>('daily');
  const [valueTab, setValueTab] = useState<ValueTab>('eval');
  const [showUsd, setShowUsd] = useState(false);
  const [metricMode, setMetricMode] = useState<MetricKey>('profit');
  const [metricMenuOpen, setMetricMenuOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('custom');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);

  // ── 추이 시트 상태 ──
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [period, setPeriod] = useState<Period>('일');

  // ── 비중 시트 상태 ──
  const [pieView, setPieView] = useState<PieView>('종목별');

  // ── 배당 시트 상태 ──
  const [divData, setDivData] = useState<DivItem[]>([]);
  const [divLoading, setDivLoading] = useState(false);
  const [divLoaded, setDivLoaded] = useState(false);

  const load = useCallback(async () => {
    const [data, accts] = await Promise.all([getStocks(), getAccounts()]);
    setStocks(data);
    setAccounts(accts);
    setKisConnected(!!getKisCredentials());
    setLastSyncState(getKisLastSync());
    if (data.length === 0) return;
    setLoading(true);
    try {
      const stockSymbols = data.map(s => buildSymbol(s.ticker, s.market)).join(',');
      const allSymbols = stockSymbols ? `${stockSymbols},USDKRW=X` : 'USDKRW=X';
      const priceRes = await fetch(`/api/prices?symbols=${encodeURIComponent(allSymbols)}`).catch(() => null);
      if (priceRes) {
        const json: Record<string, PriceData> = await priceRes.json();
        let rate = 1380;
        if ((json['USDKRW=X'] as { currentPrice?: number })?.currentPrice) {
          rate = (json['USDKRW=X'] as { currentPrice: number }).currentPrice;
          setUsdKrw(rate);
        }
        const byId: Record<string, PriceData> = {};
        data.forEach(s => { const sym = buildSymbol(s.ticker, s.market); if (json[sym]) byId[s.id] = json[sym]; });
        setPrices(byId);

        // 오늘 스냅샷 저장 (포트폴리오 탭 열 때마다 upsert — PC 꺼져도 방문 시 자동 기록)
        // 화면 로딩을 막지 않도록 백그라운드로 처리
        (async () => {
          try {
            let principal = 0, valueKrw = 0;
            data.forEach(s => {
              const cur = json[buildSymbol(s.ticker, s.market)]?.currentPrice ?? s.avgPrice;
              const cost = s.shares * s.avgPrice, val = s.shares * (cur as number);
              principal += s.currency === 'USD' ? cost * rate : cost;
              valueKrw  += s.currency === 'USD' ? val  * rate : val;
            });
            await fetch('/api/snapshots', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ principal, valueKrw, usdKrw: rate }) });
            const histRes = await fetch('/api/snapshots');
            if (histRes.ok) setSnapshots(await histRes.json());
          } catch { /* ignore */ }
        })();
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 스냅샷 기록은 종목이 없어도 과거 데이터가 있을 수 있어 별도로 한 번 가져옴
  useEffect(() => {
    fetch('/api/snapshots').then(r => r.json()).then(d => setSnapshots(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // 배당 시트를 처음 열 때만 지연 로딩 (종목이 많으면 느릴 수 있음)
  useEffect(() => {
    if (sheet !== 'dividend' || divLoaded || divLoading) return;
    setDivLoading(true);
    fetch('/api/dividends')
      .then(r => r.json())
      .then(data => { setDivData(Array.isArray(data) ? data : []); setDivLoaded(true); })
      .catch(() => setDivLoaded(true))
      .finally(() => setDivLoading(false));
  }, [sheet, divLoaded, divLoading]);

  // 60초마다 가격 자동 갱신 (스냅샷 저장 없이 가격만 업데이트)
  useEffect(() => {
    if (stocks.length === 0) return;
    const refresh = async () => {
      try {
        const stockSymbols = stocks.map(s => buildSymbol(s.ticker, s.market)).join(',');
        const res = await fetch(`/api/prices?symbols=${encodeURIComponent(`${stockSymbols},USDKRW=X`)}`, { cache: 'no-store' });
        if (!res.ok) return;
        const json: Record<string, PriceData> = await res.json();
        if ((json['USDKRW=X'] as unknown as { currentPrice?: number })?.currentPrice) {
          setUsdKrw((json['USDKRW=X'] as unknown as { currentPrice: number }).currentPrice);
        }
        const byId: Record<string, PriceData> = {};
        stocks.forEach(s => { const sym = buildSymbol(s.ticker, s.market); if (json[sym]) byId[s.id] = json[sym]; });
        setPrices(byId);
      } catch { /* ignore */ }
    };
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [stocks]);

  useEffect(() => {
    if (!stockChart) return;
    setStockChartLoading(true);
    setStockChartData([]);
    fetch(`/api/chart?symbol=${encodeURIComponent(stockChart.symbol)}&range=${stockChartRange}`)
      .then(r => r.json())
      .then(d => setStockChartData(d.data ?? []))
      .catch(() => {})
      .finally(() => setStockChartLoading(false));
  }, [stockChart, stockChartRange]);

  const handleSave = async (data: Omit<Stock, 'id' | 'createdAt'>) => {
    try {
      if (editData) await updateStock(editData.id, data);
      else await addStock(data);
    } catch (e) {
      alert((e as Error).message);
      return;
    }
    setModalOpen(false); setEditData(null); setDefaultAccountId('');
    load();
  };

  const handleEdit = (s: Stock) => { setEditData(s); setModalOpen(true); };
  const handleDelete = async (id: string) => {
    try { await deleteStock(id); } catch (e) { alert((e as Error).message); return; }
    load();
  };

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

  const openAdd = (acctId = '') => { setEditData(null); setDefaultAccountId(acctId); setModalOpen(true); };
  const closeMenus = () => { setMetricMenuOpen(false); setSortMenuOpen(false); };

  // ── KRW 환산 헬퍼 ──
  const toKrw = (amount: number, currency: string) =>
    currency === 'USD' ? amount * usdKrw : amount;

  // 평가 탭에서 "달러로 보기"가 켜져 있으면 USD 종목은 원화 환산 없이 달러로 표시
  const displayMoney = (nativeAmount: number, currency: string) =>
    (showUsd && currency === 'USD') ? fmtCurrency(nativeAmount, 'USD') : fmtKrw(toKrw(nativeAmount, currency));

  // ── 선택된 계좌로 필터링된 종목 ──
  const filteredStocks = useMemo(() => (
    selectedAccountId == null ? stocks : stocks.filter(s => (s.accountId || '__none__') === selectedAccountId)
  ), [stocks, selectedAccountId]);

  const hasUsdHoldings = useMemo(() => filteredStocks.some(s => s.currency === 'USD'), [filteredStocks]);

  // ── 상단 총자산 요약 (원화 기준, 선택된 계좌 범위) ──
  const combined = useMemo(() => {
    let totalCost = 0, totalValue = 0, dailyKrw = 0;
    filteredStocks.forEach(s => {
      const p = prices[s.id];
      const cost  = s.shares * s.avgPrice;
      const value = s.shares * (p?.currentPrice ?? s.avgPrice);
      totalCost  += toKrw(cost,  s.currency);
      totalValue += toKrw(value, s.currency);
      if (p) dailyKrw += toKrw(s.shares * p.changeAmount, s.currency);
    });
    const profit    = totalValue - totalCost;
    const profitPct = totalCost > 0 ? (profit / totalCost) * 100 : 0;
    const dailyPct  = (totalValue - dailyKrw) > 0 ? (dailyKrw / (totalValue - dailyKrw)) * 100 : 0;
    return { totalCost, totalValue, profit, profitPct, dailyKrw, dailyPct };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredStocks, prices, usdKrw]);

  // ── 계좌 필터와 무관한, 전체 포트폴리오 기준 실시간 수익 (역대 최고 수익 대비 하락폭 계산용) ──
  const allProfit = useMemo(() => {
    let totalCost = 0, totalValue = 0;
    stocks.forEach(s => {
      const p = prices[s.id];
      const cost  = s.shares * s.avgPrice;
      const value = s.shares * (p?.currentPrice ?? s.avgPrice);
      totalCost  += toKrw(cost,  s.currency);
      totalValue += toKrw(value, s.currency);
    });
    return totalValue - totalCost;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks, prices, usdKrw]);

  // ── 역대 최고 수익 대비 현재 수익이 몇 % 빠졌는지 ──
  const profitDrawdownPct = useMemo(() => {
    const peak = Math.max(...snapshots.map(s => s.valueKrw - s.principal), allProfit);
    return peak > 0 ? ((allProfit - peak) / peak) * 100 : null;
  }, [snapshots, allProfit]);

  // ── 통화별 요약 (수익 시트) ──
  const summary = useMemo(() => {
    const byCur: Record<string, { cost: number; value: number }> = {};
    filteredStocks.forEach(s => {
      if (!byCur[s.currency]) byCur[s.currency] = { cost: 0, value: 0 };
      byCur[s.currency].cost += s.shares * s.avgPrice;
      const p = prices[s.id];
      byCur[s.currency].value += p ? s.shares * p.currentPrice : s.shares * s.avgPrice;
    });
    return Object.entries(byCur).map(([cur, d]) => ({ currency: cur, cost: d.cost, value: d.value, profit: d.value - d.cost, profitPct: d.cost > 0 ? ((d.value - d.cost) / d.cost) * 100 : 0 }));
  }, [filteredStocks, prices]);

  // ── 계좌 선택 옵션 (왼쪽 사이드바) ──
  const accountOptions = useMemo(() => {
    const present = new Set(stocks.map(s => s.accountId || '__none__'));
    const opts: { id: string; label: string; color: string }[] = accounts
      .filter(a => present.has(a.id))
      .map(a => ({ id: a.id, label: a.name, color: a.color }));
    if (present.has('__none__')) opts.push({ id: '__none__', label: '계좌 미지정', color: NEUTRAL });
    return opts;
  }, [stocks, accounts]);

  const headerLabel = selectedAccountId == null ? '총 자산' : (accountOptions.find(o => o.id === selectedAccountId)?.label ?? '총 자산');

  // ── 종목별 손익 요약 (동일 티커 합산, 선택된 계좌 범위) ──
  const stocksSummary = useMemo(() => {
    const groups: Record<string, { ticker: string; market: string; name: string; currency: string; totalShares: number; totalCost: number }> = {};
    filteredStocks.forEach(s => {
      const key = `${s.ticker}_${s.market}`;
      if (!groups[key]) groups[key] = { ticker: s.ticker, market: s.market, name: s.name, currency: s.currency, totalShares: 0, totalCost: 0 };
      groups[key].totalShares += s.shares;
      groups[key].totalCost   += s.shares * s.avgPrice;
    });
    return Object.values(groups).map(g => {
      const avgPrice = g.totalCost / g.totalShares;
      const sample = filteredStocks.find(s => s.ticker === g.ticker && s.market === g.market);
      const priceData = sample ? prices[sample.id] : null;
      const cur = priceData?.currentPrice ?? null;
      const cost = g.totalCost;
      const costKrw = toKrw(cost, g.currency);
      const value = cur != null ? g.totalShares * cur : null;
      const profitAmt = value != null ? value - cost : null;
      const profitPct = profitAmt != null && cost > 0 ? (profitAmt / cost) * 100 : null;
      const valueKrw  = value     != null ? toKrw(value,     g.currency) : null;
      const profitKrw = profitAmt != null ? toKrw(profitAmt, g.currency) : null;
      const dailyChangePerShare = priceData?.changeAmount ?? null;
      const dailyChangePct      = priceData?.changePercent ?? null;
      const dailyChangeAmt      = dailyChangePerShare != null ? g.totalShares * dailyChangePerShare : null;
      const dailyChangeKrw      = dailyChangeAmt != null ? toKrw(dailyChangeAmt, g.currency) : null;
      return {
        id: `${g.ticker}_${g.market}`, ticker: g.ticker, market: g.market, name: g.name, currency: g.currency,
        shares: g.totalShares, avgPrice, cost, costKrw, value, currentPrice: cur,
        profitAmt, profitPct, valueKrw, profitKrw,
        dailyChangePerShare, dailyChangeAmt, dailyChangePct, dailyChangeKrw,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredStocks, prices, usdKrw]);

  const sortedStocksSummary = useMemo(() => {
    const arr = [...stocksSummary];
    const byNum = (fn: (x: typeof arr[number]) => number | null) => arr.sort((a, b) => (fn(b) ?? -Infinity) - (fn(a) ?? -Infinity));
    switch (sortKey) {
      case 'value':     return byNum(x => x.valueKrw);
      case 'cost':      return byNum(x => x.costKrw);
      case 'profit':    return byNum(x => x.profitKrw);
      case 'profitPct': return byNum(x => x.profitPct);
      case 'daily':     return byNum(x => x.dailyChangeKrw);
      case 'dailyPct':  return byNum(x => x.dailyChangePct);
      default: return arr;
    }
  }, [stocksSummary, sortKey]);

  // ── 비중 시트: 종목별/계좌별/통화별/시장별 파이 데이터 (항상 전체 종목 기준) ──
  const pieData = useMemo(() => {
    if (stocks.length === 0) return [];
    const valKrw = (s: Stock, price: number) => toKrw(s.shares * price, s.currency);
    let raw: { name: string; value: number }[] = [];

    if (pieView === '종목별') {
      const merged: Record<string, { name: string; value: number }> = {};
      stocks.forEach(s => {
        const key = `${s.ticker}_${s.market}`;
        const price = prices[s.id]?.currentPrice ?? s.avgPrice;
        if (!merged[key]) merged[key] = { name: s.name, value: 0 };
        merged[key].value += valKrw(s, price);
      });
      raw = Object.values(merged).map(d => ({ ...d, value: Math.round(d.value) })).filter(d => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 12);
    } else if (pieView === '계좌별') {
      const grp: Record<string, number> = {};
      stocks.forEach(s => {
        const val = valKrw(s, prices[s.id]?.currentPrice ?? s.avgPrice);
        const key = accounts.find(a => a.id === s.accountId)?.name ?? '미분류';
        grp[key] = (grp[key] ?? 0) + val;
      });
      raw = Object.entries(grp).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);
    } else if (pieView === '통화별') {
      let krw = 0, usd = 0;
      stocks.forEach(s => { const val = valKrw(s, prices[s.id]?.currentPrice ?? s.avgPrice); if (s.currency === 'USD') usd += val; else krw += val; });
      raw = [{ name: '원화 (KRW)', value: Math.round(krw) }, { name: '달러 (USD)', value: Math.round(usd) }].filter(d => d.value > 0);
    } else {
      let ko = 0, us = 0;
      stocks.forEach(s => { const val = valKrw(s, prices[s.id]?.currentPrice ?? s.avgPrice); if (s.market === 'US') us += val; else ko += val; });
      raw = [{ name: '국내 (KS/KQ)', value: Math.round(ko) }, { name: '해외 (US)', value: Math.round(us) }].filter(d => d.value > 0);
    }

    const total = raw.reduce((s, d) => s + d.value, 0);
    return raw.map(d => ({ ...d, pct: total > 0 ? (d.value / total) * 100 : 0 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks, prices, accounts, usdKrw, pieView]);

  // ── 배당 시트: 연간 배당/월별 수령액 요약 ──
  const divSummary = useMemo(() => {
    const withDiv = divData.filter(d => d.hasDividend);
    const totalKrw = withDiv.reduce((sum, d) => sum + (d.currency === 'USD' ? d.annualIncome * usdKrw : d.annualIncome), 0);
    const totalVal = divData.reduce((sum, d) => { const val = d.shares * d.currentPrice; return sum + (d.currency === 'USD' ? val * usdKrw : val); }, 0);
    return { totalKrw, avgYield: totalVal > 0 ? (totalKrw / totalVal) * 100 : 0, count: withDiv.length };
  }, [divData, usdKrw]);

  const monthlyDivKrw = useMemo(() => {
    const result = new Array(12).fill(0) as number[];
    divData.filter(d => d.hasDividend && d.monthlyIncome).forEach(d => {
      d.monthlyIncome.forEach((income, month) => { result[month] += d.currency === 'USD' ? income * usdKrw : income; });
    });
    return result;
  }, [divData, usdKrw]);

  const hasStocks = stocks.length > 0;

  return (
    <div style={{ background: '#fff', margin: '-24px -16px -96px', padding: '20px 16px 96px', minHeight: 'calc(100vh - 130px)', color: TEXT }} onClick={closeMenus}>

      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: BRAND, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>D</span>
          </div>
          <span style={{ fontSize: 19, fontWeight: 800 }}>{headerLabel}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={syncKis} disabled={syncing}
            style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${BRAND}`, background: 'rgba(0,200,150,0.08)', color: BRAND, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {syncing ? '동기화 중…' : '동기화'}
          </button>
          <button onClick={load} disabled={loading} aria-label="새로고침"
            style={{ background: 'none', border: 'none', color: TEXT, fontSize: 18, cursor: 'pointer', padding: 4, opacity: loading ? 0.4 : 1 }}>⟳</button>
          <Link href="/settings" aria-label="메뉴" style={{ color: TEXT, fontSize: 18, padding: 4, display: 'flex' }}>☰</Link>
        </div>
      </div>

      {hasStocks ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: sidebarOpen ? 14 : 8 }}>

          {/* ── 왼쪽 계좌 사이드바 (숨김 가능) ── */}
          {sidebarOpen ? (
            <div style={{ width: 62, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
              <button onClick={() => setSidebarOpen(false)} style={{ width: '100%', background: 'none', border: 'none', color: NEUTRAL, fontSize: 12, cursor: 'pointer', padding: '0 0 12px', textAlign: 'center' }}>
                ‹ 숨기기
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
                <button onClick={() => setSelectedAccountId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 0, width: 58 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: selectedAccountId == null ? BRAND : '#F7F8FA', display: 'flex', alignItems: 'center', justifyContent: 'center', border: selectedAccountId == null ? 'none' : `1px solid ${BORDER}` }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: selectedAccountId == null ? '#fff' : NEUTRAL }}>전체</span>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: selectedAccountId == null ? 700 : 500, color: selectedAccountId == null ? TEXT : NEUTRAL }}>전체</span>
                </button>
                {accountOptions.map(o => (
                  <button key={o.id} onClick={() => setSelectedAccountId(o.id)} title={o.label}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 0, width: 58 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: selectedAccountId === o.id ? o.color : '#F7F8FA', display: 'flex', alignItems: 'center', justifyContent: 'center', border: selectedAccountId === o.id ? 'none' : `1px solid ${BORDER}` }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: selectedAccountId === o.id ? '#fff' : o.color }}>{o.label.slice(0, 1)}</span>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: selectedAccountId === o.id ? 700 : 500, color: selectedAccountId === o.id ? TEXT : NEUTRAL, maxWidth: 58, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button onClick={() => setSidebarOpen(true)} aria-label="계좌 목록 펼치기"
              style={{ width: 16, flexShrink: 0, alignSelf: 'stretch', minHeight: 200, background: '#F7F8FA', border: 'none', borderRadius: 8, color: NEUTRAL, cursor: 'pointer', fontSize: 11 }}>
              ›
            </button>
          )}

          {/* ── 메인 콘텐츠 ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* ── 총자산 큰 숫자 ── */}
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.5, marginBottom: 6 }}>
              {fmtKrw(combined.totalValue)}
            </div>
            <div
              onClick={() => setBigMetricMode(m => (m === 'daily' ? 'total' : 'daily'))}
              style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', marginBottom: 20 }}
            >
              {(() => {
                const isDaily = bigMetricMode === 'daily';
                const amt = isDaily ? combined.dailyKrw : combined.profit;
                const pct = isDaily ? combined.dailyPct : combined.profitPct;
                const c = changeColor(amt);
                return (
                  <span style={{ fontSize: 14, fontWeight: 700, color: c }}>
                    {amt >= 0 ? '+' : ''}{fmtKrw(amt)} ({fmtPercent(pct)})
                    <span style={{ color: NEUTRAL, fontWeight: 500, marginLeft: 6 }}>{isDaily ? '일간 수익' : '누적 수익'}</span>
                  </span>
                );
              })()}
              <span style={{ fontSize: 11, color: NEUTRAL, border: `1px solid ${BORDER}`, borderRadius: '50%', width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>i</span>
            </div>

            {profitDrawdownPct != null && profitDrawdownPct <= PROFIT_DRAWDOWN_ALERT_PCT && (
              <button onClick={() => setSheet('trend')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FFF4E5', color: WARN, fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 20, marginBottom: 20, border: 'none', cursor: 'pointer' }}>
                ⚠️ 역대 최고 수익 대비 {Math.abs(profitDrawdownPct).toFixed(0)}% 하락 — 자세히 보기
              </button>
            )}

            {/* ── 아이콘 메뉴 ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 28 }}>
              {[
                { key: 'profit' as const, label: '수익', icon: '%' },
                { key: 'tax' as const, label: '세금', icon: '🧾' },
                { key: 'dividend' as const, label: '배당', icon: '📊' },
                { key: 'trend' as const, label: '추이', icon: '📈' },
                { key: 'weight' as const, label: '비중', icon: '◔' },
              ].map(item => (
                <button key={item.key} onClick={() => setSheet(item.key)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: TEXT }}>
                  <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#F7F8FA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                    {item.icon}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</span>
                </button>
              ))}
            </div>

            {/* ── 투자 섹션 ── */}
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>투자</div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {(['price', 'eval'] as ValueTab[]).map(t => (
                <button key={t} onClick={() => setValueTab(t)}
                  style={{ padding: '6px 16px', borderRadius: 20, border: 'none', background: valueTab === t ? TEXT : '#F7F8FA', color: valueTab === t ? '#fff' : NEUTRAL, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {t === 'price' ? '시세' : '평가'}
                </button>
              ))}
            </div>

            {hasUsdHoldings && (
              <label onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: NEUTRAL, marginBottom: 12, cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={showUsd} onChange={e => setShowUsd(e.target.checked)} style={{ accentColor: BRAND, width: 14, height: 14, cursor: 'pointer' }} />
                달러로 보기 (해외 종목)
              </label>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              {valueTab === 'eval' ? (
                <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => { setMetricMenuOpen(v => !v); setSortMenuOpen(false); }}
                    style={{ background: 'none', border: 'none', color: NEUTRAL, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                    {METRIC_LABELS[metricMode]} ▾
                  </button>
                  {metricMenuOpen && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(25,31,40,0.12)', zIndex: 120, minWidth: 110, overflow: 'hidden' }}>
                      {(Object.keys(METRIC_LABELS) as MetricKey[]).map(k => (
                        <button key={k} onClick={() => { setMetricMode(k); setMetricMenuOpen(false); }}
                          style={{ width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', background: metricMode === k ? '#F0FBF7' : 'transparent', color: TEXT, fontSize: 13, cursor: 'pointer' }}>
                          {METRIC_LABELS[k]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : <span />}
              <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                <button onClick={() => { setSortMenuOpen(v => !v); setMetricMenuOpen(false); }}
                  style={{ background: 'none', border: 'none', color: NEUTRAL, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                  {SORT_LABELS[sortKey]} ▾
                </button>
                {sortMenuOpen && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(25,31,40,0.12)', zIndex: 120, minWidth: 130, overflow: 'hidden' }}>
                    {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
                      <button key={k} onClick={() => { setSortKey(k); setSortMenuOpen(false); }}
                        style={{ width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', background: sortKey === k ? '#F0FBF7' : 'transparent', color: TEXT, fontSize: 13, cursor: 'pointer' }}>
                        {SORT_LABELS[k]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {loading && (
              <div style={{ fontSize: 12, color: NEUTRAL, marginBottom: 8 }}>실시간 가격 조회중…</div>
            )}

            {/* ── 종목 리스트 ── */}
            <div>
              {sortedStocksSummary.map(s => {
                const isEval = valueTab === 'eval';
                const primary = isEval
                  ? (s.value != null ? displayMoney(s.value, s.currency) : '조회중…')
                  : (s.currentPrice != null ? fmtCurrency(s.currentPrice, s.currency) : '조회중…');
                const secondaryNative = isEval
                  ? (metricMode === 'profit' ? s.profitAmt : s.dailyChangeAmt)
                  : s.dailyChangePerShare;
                const secondaryPct = isEval
                  ? (metricMode === 'profit' ? s.profitPct : s.dailyChangePct)
                  : s.dailyChangePct;
                const c = changeColor(secondaryNative);
                return (
                  <div key={s.id} onClick={() => { setStockChart({ symbol: buildSymbol(s.ticker, s.market), name: s.name, currency: s.currency, ticker: s.ticker, market: s.market }); setStockChartRange('1y'); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: avatarColor(`${s.ticker}_${s.market}`), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ color: '#fff', fontSize: 14, fontWeight: 800 }}>{s.name.slice(0, 1)}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: NEUTRAL, marginTop: 2 }}>{fmtNumber(s.shares)}주 · 평단 {displayMoney(s.avgPrice, s.currency)}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{primary}</div>
                      {secondaryNative != null && (
                        <div style={{ fontSize: 12, fontWeight: 600, color: c, marginTop: 2 }}>
                          {isEval
                            ? `${secondaryNative >= 0 ? '+' : ''}${displayMoney(secondaryNative, s.currency)}`
                            : `${secondaryNative >= 0 ? '+' : ''}${fmtCurrency(secondaryNative, s.currency)}`}
                          {secondaryPct != null && <span> ({fmtPercent(secondaryPct)})</span>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '60px 0', color: NEUTRAL }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, color: TEXT }}>포트폴리오가 비어있어요</div>
          <div style={{ fontSize: 14, marginBottom: 20 }}>동기화 또는 + 버튼으로 추가해보세요</div>
          {kisConnected && (
            <button onClick={syncKis} disabled={syncing} style={{ padding: '10px 20px', borderRadius: 10, border: `1px solid ${BRAND}`, background: 'transparent', color: BRAND, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
              {syncing ? '동기화 중...' : '동기화'}
            </button>
          )}
        </div>
      )}

      {/* ── 아이콘 메뉴 바텀시트 ── */}
      {sheet && (
        <div onClick={() => setSheet(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(25,31,40,0.4)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 600, margin: '0 auto', background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 20px 36px', maxHeight: '85vh', overflowY: 'auto', color: TEXT }}>
            <div style={{ width: 36, height: 4, background: BORDER, borderRadius: 2, margin: '0 auto 18px' }} />

            {sheet === 'profit' && (
              <>
                <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 16 }}>수익 현황</div>
                {summary.length === 0 && <div style={{ color: NEUTRAL, fontSize: 13 }}>데이터가 없어요.</div>}
                {summary.map(s => {
                  const c = changeColor(s.profit);
                  return (
                    <div key={s.currency} style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
                      <div style={{ fontSize: 12, color: NEUTRAL, marginBottom: 10 }}>{s.currency === 'KRW' ? '국내' : '해외'}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, color: NEUTRAL }}>매입 {fmtCurrency(s.cost, s.currency)}</span>
                        <span style={{ fontSize: 12, color: NEUTRAL }}>평가 {fmtCurrency(s.value, s.currency)}</span>
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: c }}>{s.profit >= 0 ? '+' : ''}{fmtCurrency(s.profit, s.currency)} ({fmtPercent(s.profitPct)})</div>
                    </div>
                  );
                })}
              </>
            )}

            {sheet === 'tax' && (
              <>
                <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>세금</div>
                <div style={{ color: NEUTRAL, fontSize: 14, padding: '20px 0' }}>세금 계산 기능은 아직 준비 중이에요.</div>
              </>
            )}

            {sheet === 'dividend' && (
              <>
                <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 16 }}>배당 현황</div>
                {divLoading && (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: NEUTRAL, fontSize: 13 }}>
                    배당 정보 불러오는 중…<br />종목이 많으면 1분 정도 걸릴 수 있어요
                  </div>
                )}
                {!divLoading && divLoaded && (
                  <>
                    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: NEUTRAL, marginBottom: 6 }}>예상 연간 배당 수익</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: BRAND, marginBottom: 10 }}>{fmtKrw(divSummary.totalKrw)}</div>
                      <div style={{ display: 'flex', gap: 24 }}>
                        <div><div style={{ fontSize: 11, color: NEUTRAL, marginBottom: 2 }}>배당 수익률</div><div style={{ fontSize: 14, fontWeight: 700 }}>{divSummary.avgYield.toFixed(2)}%</div></div>
                        <div><div style={{ fontSize: 11, color: NEUTRAL, marginBottom: 2 }}>배당 종목 수</div><div style={{ fontSize: 14, fontWeight: 700 }}>{divSummary.count}개</div></div>
                      </div>
                    </div>

                    {divSummary.count > 0 && monthlyDivKrw.some(m => m > 0) && (
                      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 14px 10px', marginBottom: 12 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>월별 예상 수령액</div>
                        <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 70, marginBottom: 8 }}>
                          {monthlyDivKrw.map((amount, i) => {
                            const maxVal = Math.max(...monthlyDivKrw, 1);
                            return (
                              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                <div style={{ width: '100%', height: 54, display: 'flex', alignItems: 'flex-end' }}>
                                  <div style={{ width: '100%', height: `${Math.max(Math.round((amount / maxVal) * 54), amount > 0 ? 3 : 2)}px`, background: amount > 0 ? BRAND : BORDER, borderRadius: '3px 3px 0 0' }} />
                                </div>
                                <div style={{ fontSize: 9, color: amount > 0 ? NEUTRAL : '#D1D6DB' }}>{i + 1}월</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {divSummary.count === 0 ? (
                      <div style={{ textAlign: 'center', padding: '24px 0', color: NEUTRAL, fontSize: 13 }}>배당을 지급하는 종목이 없어요.</div>
                    ) : (
                      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
                        {divData.filter(d => d.hasDividend).sort((a, b) => {
                          const aKrw = a.currency === 'USD' ? a.annualIncome * usdKrw : a.annualIncome;
                          const bKrw = b.currency === 'USD' ? b.annualIncome * usdKrw : b.annualIncome;
                          return bKrw - aKrw;
                        }).map((d, i, arr) => {
                          const incomeKrw = d.currency === 'USD' ? d.annualIncome * usdKrw : d.annualIncome;
                          return (
                            <div key={d.id} style={{ padding: '12px 14px', borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 700 }}>{d.name}</div>
                                  <div style={{ fontSize: 11, color: NEUTRAL, marginTop: 2 }}>{d.ticker} · {d.shares}주</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: BRAND }}>{fmtKrw(incomeKrw)}<span style={{ fontSize: 10, fontWeight: 400, color: NEUTRAL }}>/년</span></div>
                                  <div style={{ fontSize: 11, color: NEUTRAL, marginTop: 2 }}>수익률 {d.divYield.toFixed(2)}%</div>
                                </div>
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

            {sheet === 'trend' && (() => {
              const latestSnap = snapshots[snapshots.length - 1];
              const totalProfit = latestSnap ? latestSnap.valueKrw - latestSnap.principal : 0;
              const totalProfitPct = latestSnap && latestSnap.principal > 0 ? (totalProfit / latestSnap.principal) * 100 : 0;
              const dailyKrwAll = stocks.reduce((sum, s) => { const p = prices[s.id]; if (!p) return sum; return sum + toKrw(s.shares * p.changeAmount, s.currency); }, 0);
              const periodChange = (() => {
                if (!latestSnap) return null;
                if (period === '일') {
                  const prevValue = latestSnap.valueKrw - dailyKrwAll;
                  const pct = prevValue > 0 ? (dailyKrwAll / prevValue) * 100 : null;
                  return { krw: dailyKrwAll, pct, label: '오늘' };
                }
                if (period === '월') {
                  const thisMonth = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);
                  const baseSnap = [...snapshots].reverse().find(s => s.date.slice(0, 7) < thisMonth);
                  if (!baseSnap) return null;
                  const change = latestSnap.valueKrw - baseSnap.valueKrw;
                  const pct = baseSnap.valueKrw > 0 ? (change / baseSnap.valueKrw) * 100 : null;
                  return { krw: change, pct, label: '이번달' };
                }
                const thisYear = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 4);
                const baseSnap = [...snapshots].reverse().find(s => s.date.slice(0, 4) < thisYear);
                if (!baseSnap) return null;
                const change = latestSnap.valueKrw - baseSnap.valueKrw;
                const pct = baseSnap.valueKrw > 0 ? (change / baseSnap.valueKrw) * 100 : null;
                return { krw: change, pct, label: '올해' };
              })();
              const lineData = aggregate(snapshots, period).map(s => ({ label: fmtLabel(s.date, period), 원금: Math.round(s.principal), 평가금액: Math.round(s.valueKrw) }));

              // 역대 최고 수익 대비 현재 수익이 몇 % 빠졌는지 (헤더 경고 배지와 동일한 기준 사용)
              const peakProfit = Math.max(...snapshots.map(s => s.valueKrw - s.principal), allProfit);
              const drawdownPct = profitDrawdownPct;

              return (
                <>
                  <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 16 }}>자산 추이</div>
                  {latestSnap && (
                    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div><div style={{ fontSize: 11, color: NEUTRAL, marginBottom: 3 }}>총 원금</div><div style={{ fontSize: 14, fontWeight: 700 }}>{fmtKrw(latestSnap.principal)}</div></div>
                        <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, color: NEUTRAL, marginBottom: 3 }}>총 평가금액</div><div style={{ fontSize: 14, fontWeight: 700 }}>{fmtKrw(latestSnap.valueKrw)}</div></div>
                      </div>
                      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 120 }}>
                          <div style={{ fontSize: 11, color: NEUTRAL, marginBottom: 3 }}>누적 수익</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: changeColor(totalProfit) }}>{totalProfit >= 0 ? '+' : ''}{fmtKrw(totalProfit)}</div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: changeColor(totalProfit), marginTop: 2 }}>{fmtPercent(totalProfitPct)}</div>
                        </div>
                        {periodChange && (
                          <div style={{ flex: 1, minWidth: 120, borderLeft: `1px solid ${BORDER}`, paddingLeft: 12 }}>
                            <div style={{ fontSize: 11, color: NEUTRAL, marginBottom: 3 }}>{periodChange.label} 수익</div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: changeColor(periodChange.krw) }}>{periodChange.krw >= 0 ? '+' : ''}{fmtKrw(periodChange.krw)}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: changeColor(periodChange.krw), marginTop: 2 }}>{periodChange.pct != null ? fmtPercent(periodChange.pct) : ''}</div>
                          </div>
                        )}
                      </div>
                      {drawdownPct != null && (
                        <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 10, paddingTop: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: 11, color: NEUTRAL, marginBottom: 2 }}>역대 최고 수익 대비</div>
                              <div style={{ fontSize: 11, color: NEUTRAL }}>최고 {fmtKrw(peakProfit)}</div>
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: drawdownPct === 0 ? BRAND : drawdownPct <= PROFIT_DRAWDOWN_ALERT_PCT ? WARN : DOWN }}>
                              {drawdownPct === 0 ? '최고치 경신' : `${drawdownPct.toFixed(1)}%`}
                            </div>
                          </div>
                          {drawdownPct <= PROFIT_DRAWDOWN_ALERT_PCT && (
                            <div style={{ marginTop: 8, padding: '8px 10px', background: '#FFF4E5', borderRadius: 8, fontSize: 12, fontWeight: 700, color: WARN }}>
                              ⚠️ 최고 수익 대비 {Math.abs(PROFIT_DRAWDOWN_ALERT_PCT)}% 이상 줄었어요
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                    {(['일', '월', '년'] as Period[]).map(p => (
                      <button key={p} onClick={() => setPeriod(p)}
                        style={{ padding: '6px 16px', borderRadius: 20, border: 'none', background: period === p ? TEXT : '#F7F8FA', color: period === p ? '#fff' : NEUTRAL, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                        {p}
                      </button>
                    ))}
                  </div>

                  {lineData.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: NEUTRAL, fontSize: 13 }}>아직 쌓인 데이터가 없어요.<br />방문할 때마다 자동으로 기록돼요.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={lineData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                        <XAxis dataKey="label" tick={{ fill: NEUTRAL, fontSize: 10 }} axisLine={{ stroke: BORDER }} tickLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: NEUTRAL, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtBrief} width={48} />
                        <Tooltip content={<LineTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8, color: NEUTRAL }} />
                        <Line type="monotone" dataKey="원금" stroke={NEUTRAL} strokeWidth={2} strokeDasharray="5 3" dot={lineData.length <= 10 ? { r: 3, fill: NEUTRAL } : false} activeDot={{ r: 5 }} />
                        <Line type="monotone" dataKey="평가금액" stroke={BRAND} strokeWidth={2.5} dot={lineData.length <= 10 ? { r: 4, fill: BRAND } : false} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}

                  {snapshots.length > 1 && (
                    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', marginTop: 14 }}>
                      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BORDER}`, fontWeight: 700, fontSize: 13 }}>
                        {period === '일' ? '일별' : period === '월' ? '월별' : '연도별'} 기록
                      </div>
                      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                        {aggregate(snapshots, period).reverse().map((s, i, arr) => {
                          const p = s.valueKrw - s.principal;
                          const pct = s.principal > 0 ? (p / s.principal) * 100 : 0;
                          const c = changeColor(p);
                          const prevSnap = arr[i + 1];
                          const periodDiff = prevSnap != null ? s.valueKrw - prevSnap.valueKrw : null;
                          const dc = changeColor(periodDiff);
                          return (
                            <div key={s.date} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                              <div>
                                <div style={{ fontSize: 12, color: NEUTRAL }}>{period === '년' ? s.date.slice(0, 4) : period === '월' ? s.date.slice(0, 7) : s.date}</div>
                                {periodDiff != null && <div style={{ fontSize: 11, color: dc, marginTop: 2 }}>{periodDiff >= 0 ? '+' : ''}{fmtKrw(periodDiff)}</div>}
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: c }}>{p >= 0 ? '+' : ''}{fmtKrw(p)}</div>
                                <div style={{ fontSize: 11, color: c, marginTop: 1 }}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {sheet === 'weight' && (
              <>
                <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>비중</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                  {(['종목별', '계좌별', '통화별', '시장별'] as PieView[]).map(v => (
                    <button key={v} onClick={() => setPieView(v)}
                      style={{ padding: '6px 14px', borderRadius: 20, border: 'none', background: pieView === v ? TEXT : '#F7F8FA', color: pieView === v ? '#fff' : NEUTRAL, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      {v}
                    </button>
                  ))}
                </div>
                {pieData.length === 0 ? (
                  <div style={{ color: NEUTRAL, fontSize: 13, padding: '20px 0', textAlign: 'center' }}>데이터가 없어요.</div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={58} outerRadius={96} dataKey="value" paddingAngle={2}>
                          {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', marginTop: 10 }}>
                      {pieData.map((item, i) => (
                        <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < pieData.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                          <div style={{ width: 9, height: 9, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                          <div style={{ flex: 1, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700 }}>{fmtKrw(item.value)}</div>
                            <div style={{ fontSize: 11, color: NEUTRAL, marginTop: 1 }}>{item.pct.toFixed(1)}%</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            <button onClick={() => setSheet(null)} style={{ width: '100%', marginTop: 16, padding: '12px', background: '#F7F8FA', border: 'none', borderRadius: 12, color: NEUTRAL, fontSize: 14, cursor: 'pointer' }}>닫기</button>
          </div>
        </div>
      )}

      {/* ── 종목 상세 모달 ── */}
      {stockChart && (
        <div onClick={() => setStockChart(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(25,31,40,0.4)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 600, margin: '0 auto', background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 16px 40px', maxHeight: '88vh', overflowY: 'auto', color: TEXT }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 17 }}>{stockChart.name}</div>
                <div style={{ fontSize: 12, color: NEUTRAL, marginTop: 2 }}>{stockChart.symbol}</div>
              </div>
              <button onClick={() => setStockChart(null)} style={{ background: 'transparent', border: 'none', color: NEUTRAL, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>

            {/* ── 계좌별 보유 현황 (수정/삭제) ── */}
            {(() => {
              const rows = stocks
                .filter(s => s.ticker === stockChart.ticker && s.market === stockChart.market)
                .map(s => {
                  const acct = accounts.find(a => a.id === s.accountId);
                  const curPrice = prices[s.id]?.currentPrice ?? s.avgPrice;
                  const cost = s.shares * s.avgPrice;
                  const value = s.shares * curPrice;
                  const profitAmt = value - cost;
                  const profitPct = cost > 0 ? (profitAmt / cost) * 100 : 0;
                  return { stock: s, acctName: acct?.name ?? '미분류', color: acct?.color ?? NEUTRAL, profitAmt, profitPct, currency: s.currency };
                });
              if (rows.length === 0) return null;
              return (
                <div style={{ background: '#F7F8FA', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: NEUTRAL, marginBottom: 8 }}>계좌별 보유 현황</div>
                  {rows.map((r, i) => {
                    const c = changeColor(r.profitAmt);
                    return (
                      <div key={r.stock.id} style={{ paddingBottom: i < rows.length - 1 ? 10 : 0, marginBottom: i < rows.length - 1 ? 10 : 0, borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 4, height: 22, background: r.color, borderRadius: 2, flexShrink: 0 }} />
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700 }}>{r.acctName}</div>
                              <div style={{ fontSize: 11, color: NEUTRAL, marginTop: 2 }}>
                                {r.stock.shares}주 &nbsp;·&nbsp; 평단 {displayMoney(r.stock.avgPrice, r.currency)}
                              </div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: c }}>
                              {r.profitAmt >= 0 ? '+' : ''}{displayMoney(r.profitAmt, r.currency)}
                            </div>
                            <div style={{ fontSize: 11, color: c, marginTop: 1 }}>{r.profitPct >= 0 ? '+' : ''}{r.profitPct.toFixed(2)}%</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          {r.stock.source !== 'kis' && (
                            <button onClick={() => { setStockChart(null); handleEdit(r.stock); }}
                              style={{ flex: 1, padding: '6px', borderRadius: 8, border: `1px solid ${BORDER}`, background: '#fff', color: NEUTRAL, cursor: 'pointer', fontSize: 12 }}>수정</button>
                          )}
                          <button onClick={() => { if (confirm(`${r.acctName} 보유분을 삭제할까요?`)) { handleDelete(r.stock.id); setStockChart(null); } }}
                            style={{ flex: 1, padding: '6px', borderRadius: 8, border: `1px solid ${UP}44`, background: '#fff', color: UP, cursor: 'pointer', fontSize: 12 }}>삭제</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto' }}>
              {(['5d', '1mo', '3mo', '6mo', '1y', '5y', 'max'] as ChartRange[]).map(r => {
                const labels: Record<ChartRange, string> = { '5d': '5일', '1mo': '1달', '3mo': '3달', '6mo': '6달', '1y': '1년', '5y': '5년', 'max': '전체' };
                return (
                  <button key={r} onClick={() => setStockChartRange(r)}
                    style={{ padding: '5px 12px', borderRadius: 20, border: 'none',
                      background: stockChartRange === r ? TEXT : '#F7F8FA',
                      color: stockChartRange === r ? '#fff' : NEUTRAL,
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {labels[r]}
                  </button>
                );
              })}
            </div>
            {stockChartLoading ? (
              <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: NEUTRAL }}>로딩 중...</div>
            ) : stockChartData.length === 0 ? (
              <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: NEUTRAL }}>데이터 없음</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={stockChartData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="date" tick={{ fill: NEUTRAL, fontSize: 10 }} axisLine={{ stroke: BORDER }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: NEUTRAL, fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={(v: number) => stockChart.currency === 'KRW' ? `${Math.round(v / 1000)}k` : `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`} width={52} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 12 }}
                    labelStyle={{ color: NEUTRAL }}
                    formatter={(value) => {
                      const v = typeof value === 'number' ? value : 0;
                      return [stockChart.currency === 'KRW' ? `₩${Math.round(v).toLocaleString()}` : `$${v.toFixed(2)}`, '종가'];
                    }}
                  />
                  <Line type="monotone" dataKey="close" stroke={BRAND} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: BRAND }} />
                </LineChart>
              </ResponsiveContainer>
            )}
            <button onClick={() => setStockChart(null)} style={{ width: '100%', marginTop: 16, padding: '12px', background: '#F7F8FA', border: 'none', borderRadius: 12, color: NEUTRAL, fontSize: 14, cursor: 'pointer' }}>닫기</button>
          </div>
        </div>
      )}

      {/* FAB */}
      <button onClick={() => openAdd()} style={{ position: 'fixed', bottom: 80, right: 24, width: 58, height: 58, borderRadius: '50%', background: BRAND, color: '#fff', fontSize: 28, border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,200,150,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}>+</button>

      {modalOpen && (
        <AddStockModal
          onClose={() => { setModalOpen(false); setEditData(null); setDefaultAccountId(''); }}
          onSave={handleSave}
          editData={editData}
          defaultAccountId={defaultAccountId}
        />
      )}
    </div>
  );
}
