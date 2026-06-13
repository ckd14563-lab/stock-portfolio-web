export const fmtCurrency = (amount: number, currency = 'KRW') => {
  if (isNaN(amount)) return '-';
  return currency === 'KRW'
    ? new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(amount)
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);
};

export const fmtPercent = (value: number) => {
  if (isNaN(value)) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
};

export const fmtNumber = (n: number) =>
  new Intl.NumberFormat('ko-KR').format(n);

export const fmtDate = (ts: number) => {
  const d = new Date(ts * 1000);
  const diff = Date.now() - d.getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
};
