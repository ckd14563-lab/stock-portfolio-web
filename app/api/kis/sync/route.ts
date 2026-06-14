import { NextRequest, NextResponse } from 'next/server';

const REAL_BASE = 'https://openapi.kis.co.kr';
const VIRT_BASE = 'https://openapivts.koreainvestment.com:29443';

async function getToken(appKey: string, appSecret: string, isVirtual: boolean) {
  const base = isVirtual ? VIRT_BASE : REAL_BASE;
  const res = await fetch(`${base}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ grant_type: 'client_credentials', appkey: appKey, appsecret: appSecret }),
  });
  const data = await res.json();
  if (data.rt_cd && data.rt_cd !== '0') throw new Error(data.msg1 || 'Token failed');
  return data.access_token as string;
}

async function fetchDomestic(token: string, appKey: string, appSecret: string, cano: string, acntPrdtCd: string, isVirtual: boolean) {
  const base = isVirtual ? VIRT_BASE : REAL_BASE;
  const trId = isVirtual ? 'VTTC8434R' : 'TTTC8434R';
  const params = new URLSearchParams({ CANO: cano, ACNT_PRDT_CD: acntPrdtCd, AFHR_FLPR_YN: 'N', OFL_YN: 'N', INQR_DVSN: '02', UNPR_DVSN: '01', FUND_STTL_ICLD_YN: 'N', FNCG_AMT_AUTO_RDPT_YN: 'N', PRCS_DVSN: '01', CTX_AREA_FK100: '', CTX_AREA_NK100: '' });
  const res = await fetch(`${base}/uapi/domestic-stock/v1/trading/inquire-balance?${params}`, {
    headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${token}`, appkey: appKey, appsecret: appSecret, tr_id: trId, custtype: 'P' },
  });
  const data = await res.json();
  if (data.rt_cd !== '0') throw new Error(data.msg1 || 'Domestic balance failed');
  return (data.output1 ?? []).filter((i: Record<string, string>) => parseInt(i.hldg_qty) > 0);
}

async function fetchOverseas(token: string, appKey: string, appSecret: string, cano: string, acntPrdtCd: string, isVirtual: boolean) {
  const base = isVirtual ? VIRT_BASE : REAL_BASE;
  const trId = isVirtual ? 'VTTS3012R' : 'TTTS3012R';
  const exchanges = ['NASD', 'NYSE', 'AMEX'];
  const all: Record<string, unknown>[] = [];
  await Promise.allSettled(exchanges.map(async (exg) => {
    const params = new URLSearchParams({ CANO: cano, ACNT_PRDT_CD: acntPrdtCd, OVRS_EXCG_CD: exg, TR_CRCY_CD: 'USD', CTX_AREA_FK200: '', CTX_AREA_NK200: '' });
    const res = await fetch(`${base}/uapi/overseas-stock/v1/trading/inquire-balance?${params}`, {
      headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${token}`, appkey: appKey, appsecret: appSecret, tr_id: trId, custtype: 'P' },
    });
    const data = await res.json();
    if (data.rt_cd === '0') {
      (data.output1 ?? []).filter((i: Record<string, string>) => parseFloat(i.ovrs_cblc_qty) > 0).forEach((i: Record<string, string>) => all.push(i));
    }
  }));
  return all;
}

export async function POST(req: NextRequest) {
  try {
    const { appKey, appSecret, cano, acntPrdtCd, isVirtual, testOnly } = await req.json();

    // 연결 테스트만 요청한 경우
    if (testOnly) {
      await getToken(appKey, appSecret, isVirtual);
      return NextResponse.json({ ok: true });
    }
    const token = await getToken(appKey, appSecret, isVirtual);
    const [domResult, ovrResult] = await Promise.allSettled([
      fetchDomestic(token, appKey, appSecret, cano, acntPrdtCd, isVirtual),
      fetchOverseas(token, appKey, appSecret, cano, acntPrdtCd, isVirtual),
    ]);

    const stocks = [];
    if (domResult.status === 'fulfilled') {
      for (const i of domResult.value as Record<string, string>[]) {
        stocks.push({ name: i.prdt_name.trim(), ticker: i.pdno, market: 'KS', shares: parseFloat(i.hldg_qty), avgPrice: parseFloat(i.pchs_avg_pric), currency: 'KRW', source: 'kis', brokerage: '한국투자증권' });
      }
    }
    if (ovrResult.status === 'fulfilled') {
      for (const i of ovrResult.value as Record<string, string>[]) {
        stocks.push({ name: i.ovrs_item_name.trim(), ticker: i.ovrs_pdno, market: 'US', shares: parseFloat(i.ovrs_cblc_qty), avgPrice: parseFloat(i.pchs_avg_pric), currency: i.tr_crcy_cd ?? 'USD', source: 'kis', brokerage: '한국투자증권' });
      }
    }
    return NextResponse.json({ stocks });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
