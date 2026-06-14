export interface Account {
  id: string;
  name: string;
  brokerage: string;
  color: string;
  createdAt: number;
}

export interface Stock {
  id: string;
  name: string;
  ticker: string;
  market: 'KS' | 'KQ' | 'US';
  shares: number;
  avgPrice: number;
  currency: 'KRW' | 'USD';
  source: 'manual' | 'kis';
  brokerage: string;
  accountId: string;
  createdAt: number;
}

export interface PriceData {
  symbol: string;
  currentPrice: number;
  previousClose: number;
  changeAmount: number;
  changePercent: number;
  currency: string;
}

export interface NewsItem {
  uuid: string;
  title: string;
  link: string;
  providerPublishTime: number;
  publisher: string;
  stockName: string;
  stockTicker: string;
}

export interface KisCredentials {
  appKey: string;
  appSecret: string;
  cano: string;
  acntPrdtCd: string;
  isVirtual: boolean;
}
