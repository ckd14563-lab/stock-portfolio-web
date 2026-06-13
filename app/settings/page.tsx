'use client';

import { useState, useEffect } from 'react';
import { getKisCredentials, saveKisCredentials, clearKisCredentials } from '@/lib/storage';
import type { KisCredentials } from '@/lib/types';

const BROKERAGES = [
  { name: '한국투자증권', color: '#FF6B00', support: 'api', note: 'REST API — 이 앱에서 자동 연동 지원 ✅' },
  { name: 'NH투자증권',   color: '#007B40', support: 'partial', note: '주문 API만 제공 — 잔고 조회 미지원, 수동 입력 ⚠️' },
  { name: '삼성증권',     color: '#1428A0', support: 'none', note: 'Windows 전용 API — 모바일 연동 불가, 수동 입력 ❌' },
  { name: '메리츠증권',   color: '#005BAC', support: 'none', note: '공개 API 없음 — 수동 입력 ❌' },
];

export default function SettingsPage() {
  const [appKey,     setAppKey]     = useState('');
  const [appSecret,  setAppSecret]  = useState('');
  const [cano,       setCano]       = useState('');
  const [acntPrdtCd, setAcntPrdtCd] = useState('01');
  const [isVirtual,  setIsVirtual]  = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [testing,    setTesting]    = useState(false);
  const [testMsg,    setTestMsg]    = useState('');

  useEffect(() => {
    const c = getKisCredentials();
    if (c) { setAppKey(c.appKey); setAppSecret(c.appSecret); setCano(c.cano); setAcntPrdtCd(c.acntPrdtCd); setIsVirtual(c.isVirtual); setSaved(true); }
  }, []);

  const handleSave = () => {
    if (!appKey || !appSecret || !cano) return alert('App Key, App Secret, 계좌번호를 모두 입력해주세요.');
    if (cano.replace(/-/g, '').length !== 8) return alert('계좌번호는 8자리여야 합니다.');
    saveKisCredentials({ appKey, appSecret, cano: cano.replace(/-/g, ''), acntPrdtCd: acntPrdtCd || '01', isVirtual });
    setSaved(true);
    alert('저장됐습니다! 포트폴리오 탭에서 KIS 동기화를 눌러주세요.');
  };

  const handleTest = async () => {
    if (!appKey || !appSecret) return alert('App Key와 App Secret을 입력해주세요.');
    setTesting(true); setTestMsg('');
    try {
      const res = await fetch(`/api/kis/sync?appKey=${encodeURIComponent(appKey)}&appSecret=${encodeURIComponent(appSecret)}&isVirtual=${isVirtual}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setTestMsg('✅ 연결 성공!');
    } catch (e) { setTestMsg(`❌ 실패: ${(e as Error).message}`); }
    finally { setTesting(false); }
  };

  const handleClear = () => {
    if (!confirm('KIS API 설정을 모두 지울까요?')) return;
    clearKisCredentials(); setSaved(false);
    setAppKey(''); setAppSecret(''); setCano(''); setAcntPrdtCd('01'); setIsVirtual(false);
  };

  const inputStyle: React.CSSProperties = { width: '100%', background: '#0D1117', border: '1px solid #30363D', borderRadius: 10, padding: '12px 14px', color: '#fff', fontSize: 15, outline: 'none', marginTop: 6 };
  const labelStyle: React.CSSProperties = { fontSize: 13, color: '#8B949E', marginTop: 18, display: 'block' };

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>⚙️ 설정</h1>

      {/* 증권사 현황 */}
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>증권사별 API 지원 현황</h2>
      <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 14, padding: 16, marginBottom: 24 }}>
        {BROKERAGES.map((b, i) => (
          <div key={b.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingTop: i > 0 ? 12 : 0, borderTop: i > 0 ? '1px solid #30363D' : 'none', padding: `${i > 0 ? 12 : 0}px 0 12px` }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: b.color, marginTop: 4, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{b.name}</div>
              <div style={{ fontSize: 12, color: '#8B949E', marginTop: 2 }}>{b.note}</div>
            </div>
          </div>
        ))}
      </div>

      {/* KIS 설정 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>한국투자증권 (KIS) API</h2>
        {saved && <span style={{ background: 'rgba(0,200,83,0.15)', color: '#00C853', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 12 }}>연동됨</span>}
      </div>

      <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 14, padding: 16, marginBottom: 24 }}>
        <a href="https://apiportal.koreainvestment.com/" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,200,83,0.08)', borderRadius: 8, padding: '10px 12px', textDecoration: 'none', marginBottom: 12 }}>
          <span style={{ color: '#00C853', fontSize: 13, fontWeight: 600 }}>🔗 KIS Developers 포털에서 App Key 발급</span>
        </a>
        <p style={{ fontSize: 12, color: '#8B949E', lineHeight: 1.8, marginBottom: 12 }}>
          1. 위 링크 → 로그인 → 앱 신청<br />
          2. 발급된 App Key / App Secret 복사<br />
          3. 계좌번호 8자리 입력<br />
          4. 처음엔 모의투자로 테스트 권장
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #30363D', paddingTop: 14, marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>모의투자 (테스트용)</div>
            <div style={{ fontSize: 11, color: '#8B949E', marginTop: 2 }}>실계좌 사용 시 OFF</div>
          </div>
          <input type="checkbox" checked={isVirtual} onChange={e => setIsVirtual(e.target.checked)} style={{ width: 20, height: 20, cursor: 'pointer', accentColor: '#FF6B00' }} />
        </div>

        <label style={labelStyle}>App Key</label>
        <input style={inputStyle} value={appKey} onChange={e => setAppKey(e.target.value)} placeholder="PSxxxxxxxxxxxxxxxxxx" />

        <label style={labelStyle}>App Secret</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <input style={{ ...inputStyle, flex: 1, marginTop: 0 }} value={appSecret} onChange={e => setAppSecret(e.target.value)} type={showSecret ? 'text' : 'password'} placeholder="App Secret 입력" />
          <button onClick={() => setShowSecret(v => !v)} style={{ padding: '0 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 10, color: '#8B949E', cursor: 'pointer', fontSize: 16 }}>{showSecret ? '🙈' : '👁️'}</button>
        </div>

        <label style={labelStyle}>계좌번호 (8자리)</label>
        <input style={inputStyle} value={cano} onChange={e => setCano(e.target.value)} placeholder="50123456" maxLength={10} />

        <label style={labelStyle}>계좌상품코드 (기본 01)</label>
        <input style={inputStyle} value={acntPrdtCd} onChange={e => setAcntPrdtCd(e.target.value)} placeholder="01" maxLength={2} />

        {testMsg && <p style={{ color: testMsg.startsWith('✅') ? '#00C853' : '#FF1744', marginTop: 12, fontSize: 13 }}>{testMsg}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={handleTest} disabled={testing} style={{ flex: 1, padding: 13, borderRadius: 12, border: '1.5px solid #FF6B00', background: 'transparent', color: '#FF6B00', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
            {testing ? '테스트 중...' : '연결 테스트'}
          </button>
          <button onClick={handleSave} style={{ flex: 2, padding: 13, borderRadius: 12, background: '#00C853', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, border: 'none' }}>저장</button>
        </div>
        {saved && <button onClick={handleClear} style={{ width: '100%', marginTop: 12, padding: 11, borderRadius: 12, border: '1px solid #FF1744', background: 'transparent', color: '#FF1744', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>연동 해제</button>}
      </div>

      {/* 수동 입력 안내 */}
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>메리츠 · 삼성 · NH 수동 입력 방법</h2>
      <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 14, padding: 16 }}>
        <p style={{ fontSize: 13, color: '#8B949E', lineHeight: 1.9 }}>
          각 증권사 앱에서 보유 종목 확인 후<br />
          포트폴리오 탭 → <strong style={{ color: '#E6EDF3' }}>+ 버튼</strong> → 증권사 선택<br /><br />
          <span style={{ color: '#FF9800' }}>종목코드 찾는 법</span><br />
          국내: 6자리 숫자 (예: 005930 = 삼성전자)<br />
          미국: 영문 티커 (예: AAPL, TSLA, NVDA)
        </p>
      </div>
    </div>
  );
}
