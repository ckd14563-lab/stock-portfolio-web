'use client';

import type { Stock, PriceData } from '@/lib/types';
import { fmtCurrency, fmtPercent, fmtNumber } from '@/lib/format';

const BROKERAGE_COLORS: Record<string, string> = {
  '한국투자증권': '#FF6B00', '메리츠증권': '#005BAC', '삼성증권': '#1428A0', 'NH투자증권': '#007B40',
};

interface DividendInfo {
  annualDividend: number;
  dividendYield: number;
  exDate: string | null;
}

interface Props {
  stock: Stock;
  price?: PriceData;
  dividend?: DividendInfo;
  onEdit: (s: Stock) => void;
  onDelete: (id: string) => void;
}

export default function StockCard({ stock, price, dividend, onEdit, onDelete }: Props) {
  const { name, ticker, market, shares, avgPrice, currency, source, brokerage } = stock;
  const totalCost    = shares * avgPrice;
  const currentValue = price ? shares * price.currentPrice : null;
  const profitAmt    = currentValue != null ? currentValue - totalCost : null;
  const profitPct    = profitAmt != null && totalCost > 0 ? (profitAmt / totalCost) * 100 : null;
  const todayPct     = price?.changePercent ?? null;

  const gainC = '#00C853', lossC = '#FF1744', neutC = '#8B949E';
  const profitColor = profitAmt == null ? neutC : profitAmt > 0 ? gainC : profitAmt < 0 ? lossC : neutC;
  const todayColor  = todayPct == null ? neutC : todayPct > 0 ? gainC : todayPct < 0 ? lossC : neutC;
  const bColor = (brokerage && BROKERAGE_COLORS[brokerage]) || '#8B949E';
  const marketLabel = market === 'US' ? '🇺🇸 NYSE/NASDAQ' : market === 'KS' ? '🇰🇷 KOSPI' : '🇰🇷 KOSDAQ';

  // 배당
  const hasDividend = dividend && dividend.annualDividend > 0;
  const annualDivIncome = hasDividend ? dividend!.annualDividend * shares : 0;

  return (
    <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>
      {brokerage && (
        <div style={{ background: bColor + '22', borderLeft: `3px solid ${bColor}`, padding: '5px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: bColor, fontSize: 11, fontWeight: 700 }}>{source === 'kis' ? '🔗 ' : ''}{brokerage}</span>
          {source === 'kis' && <span style={{ color: bColor, fontSize: 10, fontWeight: 600 }}>KIS 연동</span>}
        </div>
      )}

      <div style={{ padding: '14px 16px' }}>
        {/* 종목명 + 현재가 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{name}</div>
            <div style={{ fontSize: 12, color: '#8B949E', marginTop: 2 }}>{ticker} · {marketLabel}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {todayPct != null && (
              <div style={{ color: todayColor, fontSize: 12, fontWeight: 600 }}>
                {todayPct >= 0 ? '▲' : '▼'} {fmtPercent(todayPct)} 오늘
              </div>
            )}
            {price && (
              <>
                <div style={{ fontSize: 11, color: '#8B949E', marginTop: 4 }}>현재가</div>
                <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>{fmtCurrency(price.currentPrice, currency)}</div>
              </>
            )}
            {!price && <div style={{ color: '#8B949E', fontSize: 12 }}>조회중...</div>}
          </div>
        </div>

        {/* 보유 요약 */}
        <div style={{ display: 'flex', justifyContent: 'space-around', borderTop: '1px solid #30363D', paddingTop: 12, marginBottom: 12 }}>
          {[
            ['보유수량', `${fmtNumber(shares)}주`],
            ['평단가', fmtCurrency(avgPrice, currency)],
            ['원금', fmtCurrency(totalCost, currency)],
          ].map(([l, v]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#8B949E', marginBottom: 4 }}>{l}</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* 평가금액 + 수익 */}
        {currentValue != null && (
          <div style={{ borderTop: '1px solid #30363D', paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: '#8B949E' }}>평가금액</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{fmtCurrency(currentValue, currency)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: '#8B949E' }}>수익금 / 수익률</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: profitColor }}>
                {profitAmt! >= 0 ? '+' : ''}{fmtCurrency(profitAmt!, currency)} ({fmtPercent(profitPct!)})
              </span>
            </div>
          </div>
        )}

        {/* 배당 정보 */}
        {hasDividend && (
          <div style={{ borderTop: '1px solid #30363D', paddingTop: 12, marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: '#8B949E' }}>배당수익률</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#FFD700' }}>{dividend!.dividendYield.toFixed(2)}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: dividend!.exDate ? 4 : 0 }}>
              <span style={{ fontSize: 12, color: '#8B949E' }}>연간 배당(예상)</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#FFD700' }}>+{fmtCurrency(annualDivIncome, currency)}</span>
            </div>
            {dividend!.exDate && (
              <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>배당기준일 {dividend!.exDate}</div>
            )}
          </div>
        )}

        {/* 수정/삭제 버튼 */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {source !== 'kis' && (
            <button onClick={() => onEdit(stock)}
              style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid #30363D', background: 'transparent', color: '#8B949E', cursor: 'pointer', fontSize: 13 }}>수정</button>
          )}
          <button onClick={() => { if (confirm(`${name}을(를) 삭제할까요?`)) onDelete(stock.id); }}
            style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid #FF1744', background: 'transparent', color: '#FF1744', cursor: 'pointer', fontSize: 13 }}>삭제</button>
        </div>
      </div>
    </div>
  );
}
