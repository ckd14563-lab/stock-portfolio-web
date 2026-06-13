export interface KoreanStock {
  code: string;
  name: string;
  market: 'KS' | 'KQ';
}

export const KOREAN_STOCKS: KoreanStock[] = [
  // KOSPI 대형주
  { code: '005930', name: '삼성전자', market: 'KS' },
  { code: '000660', name: 'SK하이닉스', market: 'KS' },
  { code: '373220', name: 'LG에너지솔루션', market: 'KS' },
  { code: '207940', name: '삼성바이오로직스', market: 'KS' },
  { code: '005380', name: '현대차', market: 'KS' },
  { code: '000270', name: '기아', market: 'KS' },
  { code: '068270', name: '셀트리온', market: 'KS' },
  { code: '035420', name: 'NAVER', market: 'KS' },
  { code: '051910', name: 'LG화학', market: 'KS' },
  { code: '003550', name: 'LG', market: 'KS' },
  { code: '096770', name: 'SK이노베이션', market: 'KS' },
  { code: '006400', name: '삼성SDI', market: 'KS' },
  { code: '028260', name: '삼성물산', market: 'KS' },
  { code: '066570', name: 'LG전자', market: 'KS' },
  { code: '012330', name: '현대모비스', market: 'KS' },
  { code: '017670', name: 'SK텔레콤', market: 'KS' },
  { code: '030200', name: 'KT', market: 'KS' },
  { code: '003490', name: '대한항공', market: 'KS' },
  { code: '032830', name: '삼성생명', market: 'KS' },
  { code: '105560', name: 'KB금융', market: 'KS' },
  { code: '055550', name: '신한지주', market: 'KS' },
  { code: '086790', name: '하나금융지주', market: 'KS' },
  { code: '316140', name: '우리금융지주', market: 'KS' },
  { code: '024110', name: '기업은행', market: 'KS' },
  { code: '018260', name: '삼성에스디에스', market: 'KS' },
  { code: '011200', name: 'HMM', market: 'KS' },
  { code: '009150', name: '삼성전기', market: 'KS' },
  { code: '000810', name: '삼성화재', market: 'KS' },
  { code: '034730', name: 'SK', market: 'KS' },
  { code: '015760', name: '한국전력', market: 'KS' },
  { code: '010130', name: '고려아연', market: 'KS' },
  { code: '009540', name: '한국조선해양', market: 'KS' },
  { code: '042660', name: '한화오션', market: 'KS' },
  { code: '010950', name: 'S-Oil', market: 'KS' },
  { code: '139480', name: '이마트', market: 'KS' },
  { code: '000100', name: '유한양행', market: 'KS' },
  { code: '352820', name: 'HYBE', market: 'KS' },
  { code: '003670', name: '포스코퓨처엠', market: 'KS' },
  { code: '012450', name: '한화에어로스페이스', market: 'KS' },
  { code: '005490', name: 'POSCO홀딩스', market: 'KS' },
  { code: '259960', name: '크래프톤', market: 'KS' },
  { code: '251270', name: '넷마블', market: 'KS' },
  { code: '036570', name: 'NC소프트', market: 'KS' },
  { code: '323410', name: '카카오뱅크', market: 'KS' },
  { code: '090430', name: '아모레퍼시픽', market: 'KS' },
  { code: '064350', name: '현대로템', market: 'KS' },
  { code: '078930', name: 'GS', market: 'KS' },
  { code: '267250', name: 'HD현대', market: 'KS' },
  { code: '329180', name: 'HD현대중공업', market: 'KS' },
  { code: '010140', name: '삼성중공업', market: 'KS' },
  { code: '028050', name: '삼성엔지니어링', market: 'KS' },
  { code: '006360', name: 'GS건설', market: 'KS' },
  { code: '021240', name: '코웨이', market: 'KS' },
  { code: '003230', name: '삼양식품', market: 'KS' },
  { code: '047050', name: '포스코인터내셔널', market: 'KS' },
  { code: '011790', name: 'SKC', market: 'KS' },
  { code: '000120', name: 'CJ대한통운', market: 'KS' },
  { code: '302440', name: 'SK바이오사이언스', market: 'KS' },
  { code: '030000', name: '제일기획', market: 'KS' },
  { code: '011210', name: '현대위아', market: 'KS' },
  { code: '010620', name: 'HD현대미포', market: 'KS' },
  { code: '007070', name: 'GS리테일', market: 'KS' },
  { code: '000060', name: '메리츠화재', market: 'KS' },
  { code: '138040', name: '메리츠금융지주', market: 'KS' },
  // KOSDAQ
  { code: '035720', name: '카카오', market: 'KQ' },
  { code: '247540', name: '에코프로비엠', market: 'KQ' },
  { code: '086520', name: '에코프로', market: 'KQ' },
  { code: '196170', name: '알테오젠', market: 'KQ' },
  { code: '293490', name: '카카오게임즈', market: 'KQ' },
  { code: '091990', name: '셀트리온헬스케어', market: 'KQ' },
  { code: '041510', name: 'SM엔터테인먼트', market: 'KQ' },
  { code: '035900', name: 'JYP Ent.', market: 'KQ' },
  { code: '122870', name: '와이지엔터테인먼트', market: 'KQ' },
  { code: '357780', name: '솔브레인', market: 'KQ' },
  { code: '145020', name: '휴젤', market: 'KQ' },
  { code: '112040', name: '위메이드', market: 'KQ' },
  { code: '263750', name: '펄어비스', market: 'KQ' },
  { code: '039030', name: '이오테크닉스', market: 'KQ' },
  { code: '066970', name: 'L&F', market: 'KQ' },
  { code: '240810', name: '원익IPS', market: 'KQ' },
  { code: '095340', name: 'ISC', market: 'KQ' },
  { code: '017800', name: '현인테크', market: 'KQ' },
  { code: '950130', name: '엑스페릭스', market: 'KQ' },
  { code: '236200', name: '슈프리마', market: 'KQ' },
];

export function searchKoreanStocks(query: string): KoreanStock[] {
  const q = query.trim();
  if (!q) return [];
  const lower = q.toLowerCase();
  return KOREAN_STOCKS.filter(s =>
    s.name.includes(q) ||
    s.code.startsWith(q) ||
    s.name.toLowerCase().includes(lower)
  ).slice(0, 8);
}

export function isKorean(s: string): boolean {
  return /[ㄱ-ㆎ가-힣]/.test(s);
}
