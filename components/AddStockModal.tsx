'use client';

import { useState, useEffect, useRef } from 'react';
import type { Stock, Account } from '@/lib/types';
import { searchKoreanStocks, isKorean } from '@/lib/korean-stocks';
import { getAccounts } from '@/lib/storage';

interface SearchResult {
  symbol: string;
  ticker: string;
  market: 'KS' | 'KQ' | 'US';
  name: string;
  price?: number;
  changePercent?: number;
}

interface Props {
  onClose: () => void;
  onSave: (data: Omit<Stock, 'id' | 'createdAt'>) => void;
  editData?: Stock | null;
  defaultAccountId?: string;
}

function fmtPrice(price: number, market: string) {
  if (market === 'US') return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `₩${price.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`;
}

export default function AddStockModal({ onClose, onSave, editData, defaultAccountId }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState(defaultAccountId ?? '');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [stockSelected, setStockSelected] = useState(false);

  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [market, setMarket] = useState<'KS' | 'KQ' | 'US'>('KS');
  const [shares, setShares] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getAccounts().then(setAccounts);
  }, []);

  useEffect(() => {
    if (editData) {
      setName(editData.name);
      setTicker(editData.ticker);
      setMarket(editData.market);
      setShares(String(editData.shares));
      setAvgPrice(String(editData.avgPrice));
      setAccountId(editData.accountId ?? '');
      setSearchQuery(editData.name);
      setStockSelected(true);
    } else {
      setAccountId(defaultAccountId ?? '');
    }
  }, [editData, defaultAccountId]);

  useEffect(() => {
    if (stockSelected || searchQuery.length < 1) { setSearchResults([]); return; }
    if (timerRef.current) clearTimeout(timerRef.current);

    if (isKorean(searchQuery)) {
      const local = searchKoreanStocks(searchQuery);
      if (local.length > 0) {
        const mapped: SearchResult[] = local.map(k => ({ symbol: `${k.code}.${k.market}`, ticker: k.code, market: k.market, name: k.name }));
        setSearchResults(mapped);
        const syms = local.map(k => `${k.code}.${k.market}`).join(',');
        fetch(`/api/prices?symbols=${encodeURIComponent(syms)}`)
          .then(r => r.json())
          .then((prices: Record<string, { currentPrice: number; changePercent: number }>) => {
            setSearchResults(prev => prev.map(r => { const p = prices[r.symbol]; return p ? { ...r, price: p.currentPrice, changePercent: p.changePercent } : r; }));
          }).catch(() => {});
        return;
      }
      // 로컬에 없으면 Yahoo Finance API로 fallback
    }

    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
        setSearchResults(await res.json());
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 400);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [searchQuery, stockSelected]);

  const selectStock = (r: SearchResult) => {
    setName(r.name); setTicker(r.ticker); setMarket(r.market);
    setCurrentPrice(r.price ?? null);
    setSearchQuery(r.name); setSearchResults([]); setStockSelected(true);
  };

  const resetSearch = () => {
    setSearchQuery(''); setName(''); setTicker(''); setMarket('KS');
    setCurrentPrice(null); setStockSelected(false);
  };

  const selectedAccount = accounts.find(a => a.id === accountId);
  const brokerage = selectedAccount?.brokerage ?? '';
  const currency = market === 'US' ? 'USD' : 'KRW';
  const marketLabel = (m: string) => m === 'KS' ? 'KOSPI' : m === 'KQ' ? 'KOSDAQ' : 'US';

  const avgNum = parseFloat(avgPrice);
  const sharesNum = parseFloat(shares);
  const showPreview = !!(currentPrice && avgNum > 0 && sharesNum > 0);
  const principal = avgNum * sharesNum;
  const currentVal = (currentPrice ?? 0) * sharesNum;
  const profitAmt = currentVal - principal;
  const profitPct = principal > 0 ? (profitAmt / principal) * 100 : 0;

  const handleSave = () => {
    if (!name || !ticker || !shares || !avgPrice) return alert('모든 항목을 입력해주세요.');
    const s = parseFloat(shares), p = parseFloat(avgPrice);
    if (isNaN(s) || isNaN(p) || s <= 0 || p <= 0) return alert('수량과 가격은 0보다 큰 숫자여야 합니다.');
    onSave({ name: name.trim(), ticker: ticker.trim().toUpperCase(), market, shares: s, avgPrice: p, currency, brokerage, accountId, source: 'manual' });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#0D1117', border: '1px solid #30363D', borderRadius: 10,
    padding: '12px 14px', color: '#fff', fontSize: 16, outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { fontSize: 13, color: '#8B949E', marginTop: 18, display: 'block', marginBottom: 6 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }} onClick={onClose}>
      <div style={{ background: '#161B22', borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxWidth: 600, margin: '0 auto', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, background: '#30363D', borderRadius: 2, margin: '0 auto 20px' }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{editData ? '주식 수정' : '주식 추가'}</h2>

        {/* ── 계좌 선택 ── */}
        <label style={labelStyle}>계좌 선택</label>
        {accounts.length === 0 ? (
          <div style={{ background: '#0D1117', border: '1px dashed #30363D', borderRadius: 10, padding: '14px', fontSize: 13, color: '#8B949E', textAlign: 'center' }}>
            설정 탭에서 계좌를 먼저 추가해주세요<br />
            <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>계좌 없이도 추가는 가능합니다</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              onClick={() => setAccountId('')}
              style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${accountId === '' ? '#8B949E' : '#30363D'}`, background: accountId === '' ? 'rgba(139,148,158,0.1)' : 'transparent', color: accountId === '' ? '#E6EDF3' : '#8B949E', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}
            >
              계좌 미지정
            </button>
            {accounts.map(a => (
              <button
                key={a.id}
                onClick={() => setAccountId(a.id)}
                style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${accountId === a.id ? a.color : '#30363D'}`, background: accountId === a.id ? a.color + '18' : 'transparent', color: accountId === a.id ? a.color : '#8B949E', cursor: 'pointer', fontSize: 13, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>{a.name}</span>
                {a.brokerage && <span style={{ fontSize: 11, opacity: 0.7 }}>{a.brokerage}</span>}
              </button>
            ))}
          </div>
        )}

        {/* ── 종목 검색 ── */}
        <label style={labelStyle}>종목 검색</label>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <input
              style={{ ...inputStyle, paddingRight: stockSelected ? 42 : 14 }}
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setStockSelected(false); }}
              placeholder="티커 또는 종목명 (예: 005930, AAPL, 삼성전자)"
              autoComplete="off"
            />
            {stockSelected && (
              <button onClick={resetSearch} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#8B949E', cursor: 'pointer', fontSize: 18, padding: 4, lineHeight: 1 }}>✕</button>
            )}
          </div>

          {!stockSelected && (searching || searchResults.length > 0) && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#0D1117', border: '1px solid #30363D', borderRadius: 10, zIndex: 200, maxHeight: 260, overflowY: 'auto', marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
              {searching && <div style={{ padding: 16, color: '#8B949E', fontSize: 13, textAlign: 'center' }}>검색중...</div>}
              {!searching && searchResults.map(r => {
                const pc = (r.changePercent ?? 0) >= 0 ? '#00C853' : '#FF1744';
                return (
                  <button key={r.symbol} onClick={() => selectStock(r)} style={{ width: '100%', background: 'none', border: 'none', padding: '12px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #21262D', textAlign: 'left' }}>
                    <div>
                      <div style={{ color: '#E6EDF3', fontSize: 14, fontWeight: 600 }}>{r.name}</div>
                      <div style={{ color: '#8B949E', fontSize: 11, marginTop: 2 }}>{r.ticker} · {marketLabel(r.market)}</div>
                    </div>
                    {r.price != null && (
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                        <div style={{ color: '#E6EDF3', fontSize: 14, fontWeight: 700 }}>{fmtPrice(r.price, r.market)}</div>
                        {r.changePercent != null && <div style={{ color: pc, fontSize: 11, marginTop: 2 }}>{r.changePercent >= 0 ? '+' : ''}{r.changePercent.toFixed(2)}%</div>}
                      </div>
                    )}
                  </button>
                );
              })}
              {!searching && searchResults.length === 0 && <div style={{ padding: 16, color: '#8B949E', fontSize: 13, textAlign: 'center' }}>검색 결과 없음</div>}
            </div>
          )}
        </div>

        {stockSelected && name && (
          <div style={{ background: 'rgba(0,200,83,0.07)', border: '1px solid rgba(0,200,83,0.25)', borderRadius: 10, padding: '12px 14px', marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{name}</div>
                <div style={{ fontSize: 12, color: '#8B949E', marginTop: 2 }}>{ticker} · {marketLabel(market)}</div>
              </div>
              {currentPrice != null && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 2 }}>현재가</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#00C853' }}>{fmtPrice(currentPrice, market)}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {!stockSelected && (
          <>
            <label style={labelStyle}>시장</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['KS', 'KQ', 'US'] as const).map(m => (
                <button key={m} onClick={() => setMarket(m)} style={{ flex: 1, padding: '10px 4px', borderRadius: 8, border: `1px solid ${market === m ? '#00C853' : '#30363D'}`, background: market === m ? 'rgba(0,200,83,0.1)' : 'transparent', color: market === m ? '#00C853' : '#8B949E', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{m === 'KS' ? 'KOSPI 🇰🇷' : m === 'KQ' ? 'KOSDAQ 🇰🇷' : 'USA 🇺🇸'}</button>
              ))}
            </div>
            <label style={labelStyle}>종목명</label>
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="예: 삼성전자" />
            <label style={labelStyle}>티커 / 종목코드</label>
            <input style={inputStyle} value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder={market === 'US' ? 'AAPL' : '005930'} />
          </>
        )}

        <label style={labelStyle}>보유 수량 (주)</label>
        <input style={inputStyle} value={shares} onChange={e => setShares(e.target.value)} type="number" placeholder="100" min="0" />

        <label style={labelStyle}>평균 매입가 ({currency === 'KRW' ? '원 ₩' : 'USD $'})</label>
        <input style={inputStyle} value={avgPrice} onChange={e => setAvgPrice(e.target.value)} type="number" placeholder={currency === 'KRW' ? '73000' : '150.00'} min="0" />

        {showPreview && (
          <div style={{ background: '#0D1117', border: '1px solid #30363D', borderRadius: 10, padding: '14px 16px', marginTop: 14 }}>
            <div style={{ fontSize: 12, color: '#8B949E', marginBottom: 10, fontWeight: 600 }}>📊 수익 미리보기 (현재가 기준)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div style={{ textAlign: 'center', background: '#161B22', borderRadius: 8, padding: '10px 4px' }}>
                <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>원금</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{fmtPrice(principal, market)}</div>
              </div>
              <div style={{ textAlign: 'center', background: '#161B22', borderRadius: 8, padding: '10px 4px' }}>
                <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>현재가치</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#00C853' }}>{fmtPrice(currentVal, market)}</div>
              </div>
              <div style={{ textAlign: 'center', background: '#161B22', borderRadius: 8, padding: '10px 4px' }}>
                <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>수익</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: profitAmt >= 0 ? '#00C853' : '#FF1744' }}>{profitAmt >= 0 ? '+' : ''}{fmtPrice(profitAmt, market)}</div>
                <div style={{ fontSize: 11, color: profitPct >= 0 ? '#00C853' : '#FF1744', marginTop: 2 }}>{profitPct >= 0 ? '+' : ''}{profitPct.toFixed(2)}%</div>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 14, borderRadius: 12, border: '1px solid #30363D', background: 'transparent', color: '#8B949E', cursor: 'pointer', fontSize: 16, fontWeight: 600 }}>취소</button>
          <button onClick={handleSave} style={{ flex: 2, padding: 14, borderRadius: 12, background: '#00C853', color: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700, border: 'none' }}>{editData ? '수정 완료' : '추가'}</button>
        </div>
      </div>
    </div>
  );
}
