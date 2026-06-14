'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import StockCard from '@/components/StockCard';
import AddStockModal from '@/components/AddStockModal';
import { getStocks, addStock, updateStock, deleteStock, syncKisStocks, getKisCredentials, getKisLastSync, setKisLastSync, getAccounts } from '@/lib/storage';
import { fmtCurrency, fmtPercent } from '@/lib/format';
import type { Stock, Account, PriceData } from '@/lib/types';

interface DividendInfo { annualDividend: number; dividendYield: number; exDate: string | null; }

function buildSymbol(ticker: string, market: string) {
  if (market === 'US') return ticker.toUpperCase();
  if (market === 'KS') return `${ticker}.KS`;
  return `${ticker}.KQ`;
}

function fmtKrw(n: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(n);
}

export default function PortfolioPage() {
  const [stocks,    setStocks]    = useState<Stock[]>([]);
  const [accounts,  setAccounts]  = useState<Account[]>([]);
  const [prices,    setPrices]    = useState<Record<string, PriceData>>({});
  const [dividends, setDividends] = useState<Record<string, DividendInfo>>({});
  const [loading,   setLoading]   = useState(false);
  const [syncing,   setSyncing]   = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editData,  setEditData]  = useState<Stock | null>(null);
  const [defaultAccountId, setDefaultAccountId] = useState('');
  const [lastSync,  setLastSyncState] = useState<string | null>(null);
  const [kisConnected, setKisConnected] = useState(false);
  const [usdKrw,    setUsdKrw]   = useState<number>(1380);
  const [showKrw,   setShowKrw]  = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [stocksOpen, setStocksOpen] = useState(true);

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
      const [priceRes, divRes] = await Promise.allSettled([
        fetch(`/api/prices?symbols=${encodeURIComponent(allSymbols)}`),
        fetch(`/api/dividends?symbols=${encodeURIComponent(stockSymbols)}`),
      ]);
      if (priceRes.status === 'fulfilled') {
        const json: Record<string, PriceData> = await priceRes.value.json();
        let rate = 1380;
        if ((json['USDKRW=X'] as { currentPrice?: number })?.currentPrice) {
          rate = (json['USDKRW=X'] as { currentPrice: number }).currentPrice;
          setUsdKrw(rate);
        }
        const byId: Record<string, PriceData> = {};
        data.forEach(s => { const sym = buildSymbol(s.ticker, s.market); if (json[sym]) byId[s.id] = json[sym]; });
        setPrices(byId);

        // 오늘 스냅샷 저장 (포트폴리오 탭 열 때마다 upsert — PC 꺼져도 방문 시 자동 기록)
        try {
          let principal = 0, valueKrw = 0;
          data.forEach(s => {
            const cur = json[buildSymbol(s.ticker, s.market)]?.currentPrice ?? s.avgPrice;
            const cost = s.shares * s.avgPrice, val = s.shares * (cur as number);
            principal += s.currency === 'USD' ? cost * rate : cost;
            valueKrw  += s.currency === 'USD' ? val  * rate : val;
          });
          const token = getAppToken();
          const hdrs: Record<string, string> = { 'Content-Type': 'application/json' };
          if (token) hdrs['x-token'] = token;
          fetch('/api/snapshots', { method: 'POST', headers: hdrs, body: JSON.stringify({ principal, valueKrw, usdKrw: rate }) }).catch(() => {});
        } catch { /* ignore */ }
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
  const toggleCollapse = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  // ── KRW 환산 헬퍼 ──
  const toKrw = (amount: number, currency: string) =>
    currency === 'USD' ? amount * usdKrw : amount;

  // ── 통합 요약 (원화 기준) ──
  const combined = useMemo(() => {
    let totalCost = 0, totalValue = 0;
    stocks.forEach(s => {
      const cost = s.shares * s.avgPrice;
      const value = s.shares * (prices[s.id]?.currentPrice ?? s.avgPrice);
      totalCost += toKrw(cost, s.currency);
      totalValue += toKrw(value, s.currency);
    });
    const profit = totalValue - totalCost;
    const profitPct = totalCost > 0 ? (profit / totalCost) * 100 : 0;
    return { totalCost, totalValue, profit, profitPct };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks, prices, usdKrw]);

  // ── 통화별 요약 ──
  const summary = useMemo(() => {
    const byCur: Record<string, { cost: number; value: number }> = {};
    stocks.forEach(s => {
      if (!byCur[s.currency]) byCur[s.currency] = { cost: 0, value: 0 };
      byCur[s.currency].cost += s.shares * s.avgPrice;
      const p = prices[s.id];
      byCur[s.currency].value += p ? s.shares * p.currentPrice : s.shares * s.avgPrice;
    });
    return Object.entries(byCur).map(([cur, d]) => ({ currency: cur, cost: d.cost, value: d.value, profit: d.value - d.cost, profitPct: d.cost > 0 ? ((d.value - d.cost) / d.cost) * 100 : 0 }));
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
    return Object.entries(byCur).map(([cur, d]) => ({ currency: cur, annual: d.total, monthly: d.total / 12, yield: d.totalCost > 0 ? (d.total / d.totalCost) * 100 : 0 }));
  }, [stocks, dividends]);

  // ── 계좌별 그룹 ──
  const grouped = useMemo(() => {
    const acctMap = new Map(accounts.map(a => [a.id, a]));
    const map: Record<string, { account: Account | null; stocks: Stock[] }> = {};
    stocks.forEach(s => {
      const key = s.accountId || '__none__';
      if (!map[key]) map[key] = { account: acctMap.get(s.accountId) ?? null, stocks: [] };
      map[key].stocks.push(s);
    });
    const order = [...accounts.map(a => a.id), '__none__'];
    return Object.entries(map).sort(([a], [b]) => {
      const ai = order.indexOf(a), bi = order.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [stocks, accounts]);

  // ── 종목별 손익 요약 ──
  const stocksSummary = useMemo(() => {
    return stocks.map(s => {
      const cost = s.shares * s.avgPrice;
      const cur = prices[s.id]?.currentPrice ?? null;
      const value = cur != null ? s.shares * cur : null;
      const profitAmt = value != null ? value - cost : null;
      const profitPct = profitAmt != null && cost > 0 ? (profitAmt / cost) * 100 : null;
      const valueKrw = value != null ? toKrw(value, s.currency) : null;
      const profitKrw = profitAmt != null ? toKrw(profitAmt, s.currency) : null;
      return { ...s, cost, value, profitAmt, profitPct, valueKrw, profitKrw };
    }).sort((a, b) => (b.valueKrw ?? 0) - (a.valueKrw ?? 0));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks, prices, usdKrw]);

  const hasUsd = stocks.some(s => s.currency === 'USD');

  return (
    <div>

      {/* ── 환율 + 원화 환산 토글 ── */}
      {hasUsd && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#8B949E' }}>
            💱 환율 <span style={{ color: '#E6EDF3', fontWeight: 600 }}>${'1'} = {fmtKrw(usdKrw)}</span>
            <span style={{ marginLeft: 6, fontSize: 11, color: '#8B949E' }}>(Yahoo Finance 실시간)</span>
          </div>
          <button
            onClick={() => setShowKrw(v => !v)}
            style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${showKrw ? '#00C853' : '#30363D'}`, background: showKrw ? 'rgba(0,200,83,0.1)' : 'transparent', color: showKrw ? '#00C853' : '#8B949E', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            {showKrw ? '✅ 원화 환산 ON' : '원화 환산'}
          </button>
        </div>
      )}

      {/* ── 통합 총액 카드 ── */}
      {stocks.length > 0 && hasUsd && (
        <div style={{ background: 'linear-gradient(135deg, #1a2332 0%, #161B22 100%)', border: '1px solid #30363D', borderRadius: 16, padding: 18, marginBottom: 12 }}>
          <div style={{ color: '#8B949E', fontSize: 13, marginBottom: 14 }}>🌐 전체 통합 (원화 기준)</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>총 매입금액</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{fmtKrw(combined.totalCost)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>총 평가금액</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{fmtKrw(combined.totalValue)}</div>
            </div>
          </div>
          <div style={{ borderTop: '1px solid #30363D', paddingTop: 14 }}>
            <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>수익금 / 수익률</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: combined.profit > 0 ? '#00C853' : combined.profit < 0 ? '#FF1744' : '#8B949E' }}>
              {combined.profit >= 0 ? '+' : ''}{fmtKrw(combined.profit)} {fmtPercent(combined.profitPct)}
            </div>
          </div>
          {/* 계좌별 비중 */}
          {grouped.length > 1 && combined.totalValue > 0 && (
            <div style={{ marginTop: 14, borderTop: '1px solid #21262D', paddingTop: 12 }}>
              <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 8 }}>계좌별 비중</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {grouped.map(([key, { account, stocks: gs }]) => {
                  const valKrw = gs.reduce((s, x) => {
                    const v = (prices[x.id]?.currentPrice ?? x.avgPrice) * x.shares;
                    return s + toKrw(v, x.currency);
                  }, 0);
                  const pct = combined.totalValue > 0 ? (valKrw / combined.totalValue) * 100 : 0;
                  const color = account?.color ?? '#8B949E';
                  const label = account?.name ?? '계좌 미지정';
                  return (
                    <div key={key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: '#E6EDF3' }}>{label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color }}>{pct.toFixed(1)}%</span>
                      </div>
                      <div style={{ height: 4, background: '#21262D', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 종목별 손익 현황 ── */}
      {stocksSummary.length > 0 && (
        <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 16, marginBottom: 12, overflow: 'hidden' }}>
          <div
            onClick={() => setStocksOpen(v => !v)}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', cursor: 'pointer', userSelect: 'none' }}
          >
            <span style={{ fontWeight: 700, fontSize: 15 }}>📋 종목별 손익 현황</span>
            <span style={{ fontSize: 14, color: '#8B949E' }}>{stocksOpen ? '▼' : '▶'}</span>
          </div>
          {stocksOpen && (
            <div style={{ borderTop: '1px solid #21262D' }}>
              {stocksSummary.map((s, i) => {
                const isUsd = s.currency === 'USD';
                const pc = s.profitAmt == null ? '#8B949E' : s.profitAmt > 0 ? '#00C853' : s.profitAmt < 0 ? '#FF1744' : '#8B949E';
                const displayValue = (showKrw && isUsd && s.valueKrw != null) ? fmtKrw(s.valueKrw) : (s.value != null ? fmtCurrency(s.value, s.currency) : '-');
                const displayProfit = (showKrw && isUsd && s.profitKrw != null)
                  ? `${s.profitKrw >= 0 ? '+' : ''}${fmtKrw(s.profitKrw)}`
                  : s.profitAmt != null ? `${s.profitAmt >= 0 ? '+' : ''}${fmtCurrency(s.profitAmt, s.currency)}` : null;
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', padding: '11px 16px', borderBottom: i < stocksSummary.length - 1 ? '1px solid #21262D' : 'none', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: '#8B949E', marginTop: 2 }}>
                        {s.ticker} · {s.currency === 'USD' ? '🇺🇸' : '🇰🇷'} {s.shares}주
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{displayValue}</div>
                      {displayProfit && (
                        <div style={{ fontSize: 12, color: pc, marginTop: 2 }}>
                          {displayProfit}
                          {s.profitPct != null && <span style={{ marginLeft: 4, fontSize: 11 }}>({fmtPercent(s.profitPct)})</span>}
                        </div>
                      )}
                      {showKrw && isUsd && s.value != null && (
                        <div style={{ fontSize: 11, color: '#8B949E', marginTop: 1 }}>{fmtCurrency(s.value, 'USD')}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 통화별 요약 ── */}
      {summary.map(s => {
        const pc = s.profit > 0 ? '#00C853' : s.profit < 0 ? '#FF1744' : '#8B949E';
        return (
          <div key={s.currency} style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 16, padding: 18, marginBottom: 12 }}>
            <div style={{ color: '#8B949E', fontSize: 13, marginBottom: 14 }}>{s.currency === 'KRW' ? '🇰🇷 국내 전체' : '🇺🇸 해외 전체'}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>총 매입금액</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{fmtCurrency(s.cost, s.currency)}</div>
                {showKrw && s.currency === 'USD' && (
                  <div style={{ fontSize: 12, color: '#8B949E', marginTop: 2 }}>≈ {fmtKrw(s.cost * usdKrw)}</div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>총 평가금액</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{fmtCurrency(s.value, s.currency)}</div>
                {showKrw && s.currency === 'USD' && (
                  <div style={{ fontSize: 12, color: '#8B949E', marginTop: 2 }}>≈ {fmtKrw(s.value * usdKrw)}</div>
                )}
              </div>
            </div>
            <div style={{ borderTop: '1px solid #30363D', paddingTop: 14 }}>
              <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>수익금 / 수익률</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: pc }}>{s.profit >= 0 ? '+' : ''}{fmtCurrency(s.profit, s.currency)} {fmtPercent(s.profitPct)}</div>
              {showKrw && s.currency === 'USD' && (
                <div style={{ fontSize: 14, color: pc, marginTop: 4 }}>≈ {s.profit >= 0 ? '+' : ''}{fmtKrw(s.profit * usdKrw)}</div>
              )}
            </div>
          </div>
        );
      })}

      {/* ── 배당 요약 ── */}
      {divSummary.length > 0 && (
        <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 16, padding: 18, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>💰 배당 현황</div>
          {divSummary.map(d => (
            <div key={d.currency} style={{ marginBottom: divSummary.length > 1 ? 14 : 0 }}>
              <div style={{ fontSize: 12, color: '#8B949E', marginBottom: 10 }}>{d.currency === 'KRW' ? '🇰🇷 국내' : '🇺🇸 해외'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[['배당수익률', `${d.yield.toFixed(2)}%`], ['연간 배당', fmtCurrency(d.annual, d.currency)], ['월 환산', fmtCurrency(d.monthly, d.currency)]].map(([label, val]) => (
                  <div key={label} style={{ background: '#0D1117', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 6 }}>{label}</div>
                    <div style={{ fontSize: label === '배당수익률' ? 16 : 13, fontWeight: 700, color: '#FFD700' }}>{val}</div>
                  </div>
                ))}
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

      {/* ── 계좌별 섹션 ── */}
      {grouped.map(([key, { account, stocks: gStocks }]) => {
        const color = account?.color ?? '#8B949E';
        const label = account?.name ?? '계좌 미지정';
        const isKis = account?.brokerage === '한국투자증권' || (!account && gStocks.some(s => s.brokerage === '한국투자증권'));
        const isCollapsed = collapsed[key] ?? false;

        const krwStocks = gStocks.filter(s => s.currency === 'KRW');
        const usdStocks = gStocks.filter(s => s.currency === 'USD');
        const krwCost  = krwStocks.reduce((s, x) => s + x.shares * x.avgPrice, 0);
        const krwValue = krwStocks.reduce((s, x) => s + x.shares * (prices[x.id]?.currentPrice ?? x.avgPrice), 0);
        const usdCost  = usdStocks.reduce((s, x) => s + x.shares * x.avgPrice, 0);
        const usdValue = usdStocks.reduce((s, x) => s + x.shares * (prices[x.id]?.currentPrice ?? x.avgPrice), 0);

        // ── 계좌 합산 수치 ──
        const acctCostKrw  = toKrw(krwCost, 'KRW') + toKrw(usdCost, 'USD');
        const acctValueKrw = toKrw(krwValue, 'KRW') + toKrw(usdValue, 'USD');
        const acctProfit   = acctValueKrw - acctCostKrw;
        const acctPct      = acctCostKrw > 0 ? (acctProfit / acctCostKrw) * 100 : 0;
        const acctPc       = acctProfit > 0 ? '#00C853' : acctProfit < 0 ? '#FF1744' : '#8B949E';
        const hasBoth      = krwCost > 0 && usdCost > 0;

        return (
          <div key={key} style={{ marginBottom: 28 }}>
            {/* 계좌 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isCollapsed ? 0 : 10 }}>
              {/* 왼쪽: 계좌명 — 클릭 시 접기 */}
              <div
                onClick={() => toggleCollapse(key)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ width: 4, height: 18, background: color, borderRadius: 2 }} />
                <span style={{ fontWeight: 700, fontSize: 15 }}>{label}</span>
                {account?.brokerage && (
                  <span style={{ fontSize: 11, color: '#8B949E', background: '#21262D', padding: '2px 8px', borderRadius: 10 }}>{account.brokerage}</span>
                )}
                <span style={{ fontSize: 12, color: '#8B949E' }}>({gStocks.length}종목)</span>
                <span style={{ fontSize: 14, color: '#8B949E' }}>{isCollapsed ? '▶' : '▼'}</span>
              </div>
              {/* 오른쪽: 버튼들 — 별도 클릭 영역 */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {isKis && key !== '__none__' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                    <button onClick={syncKis} disabled={syncing} style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${color}`, background: 'transparent', color, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                      {syncing ? '동기화 중...' : '🔄 동기화'}
                    </button>
                    {lastSync && <span style={{ fontSize: 10, color: '#8B949E' }}>{lastSync}</span>}
                  </div>
                )}
                <button onClick={() => openAdd(account?.id ?? '')} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #30363D', background: 'transparent', color: '#8B949E', cursor: 'pointer', fontSize: 12 }}>
                  + 추가
                </button>
              </div>
            </div>

            {!isCollapsed && (
              <>
                {/* ── 계좌 요약 ── */}
                {(krwCost > 0 || usdCost > 0) && (
                  <div style={{ background: color + '11', border: `1px solid ${color}33`, borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
                    {/* 통합 KRW 합계 (원화 환산 ON이거나 두 통화 모두 있을 때) */}
                    {(showKrw || hasBoth) && (
                      <div style={{ marginBottom: (krwCost > 0 || usdCost > 0) ? 10 : 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 2 }}>총 매입 (원화 기준)</div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtKrw(acctCostKrw)}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 2 }}>총 평가 (원화 기준)</div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtKrw(acctValueKrw)}</div>
                          </div>
                        </div>
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${color}33`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, color: '#8B949E' }}>수익금 / 수익률</span>
                          <span style={{ fontSize: 15, fontWeight: 800, color: acctPc }}>
                            {acctProfit >= 0 ? '+' : ''}{fmtKrw(acctProfit)} {fmtPercent(acctPct)}
                          </span>
                        </div>
                      </div>
                    )}
                    {/* KRW 종목 상세 */}
                    {krwCost > 0 && (() => {
                      const profit = krwValue - krwCost;
                      const pct = krwCost > 0 ? profit / krwCost * 100 : 0;
                      const c = profit > 0 ? '#00C853' : profit < 0 ? '#FF1744' : '#8B949E';
                      return (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: (showKrw || hasBoth) ? `1px solid ${color}22` : 'none', paddingTop: (showKrw || hasBoth) ? 8 : 0 }}>
                          <span style={{ fontSize: 12, color: '#8B949E' }}>🇰🇷 매입 {fmtCurrency(krwCost, 'KRW')} · 평가 {fmtCurrency(krwValue, 'KRW')}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: c }}>{profit >= 0 ? '+' : ''}{fmtPercent(pct)}</span>
                        </div>
                      );
                    })()}
                    {/* USD 종목 상세 */}
                    {usdCost > 0 && (() => {
                      const profit = usdValue - usdCost;
                      const pct = usdCost > 0 ? profit / usdCost * 100 : 0;
                      const c = profit > 0 ? '#00C853' : profit < 0 ? '#FF1744' : '#8B949E';
                      return (
                        <div style={{ marginTop: krwCost > 0 ? 6 : 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: '#8B949E' }}>🇺🇸 매입 {fmtCurrency(usdCost, 'USD')} · 평가 {fmtCurrency(usdValue, 'USD')}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: c }}>{profit >= 0 ? '+' : ''}{fmtPercent(pct)}</span>
                          </div>
                          {showKrw && (
                            <div style={{ fontSize: 11, color: '#8B949E', marginTop: 3 }}>
                              ≈ 평가 {fmtKrw(usdValue * usdKrw)} / 수익 <span style={{ color: c }}>{profit >= 0 ? '+' : ''}{fmtKrw(profit * usdKrw)}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {gStocks.map(s => (
                  <StockCard key={s.id} stock={s} price={prices[s.id]} dividend={dividends[s.id]} onEdit={handleEdit} onDelete={handleDelete} showKrw={showKrw} usdKrw={usdKrw} />
                ))}
              </>
            )}
          </div>
        );
      })}

      {/* FAB */}
      <button onClick={() => openAdd()} style={{ position: 'fixed', bottom: 80, right: 24, width: 58, height: 58, borderRadius: '50%', background: '#00C853', color: '#fff', fontSize: 28, border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,200,83,0.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}>+</button>

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
