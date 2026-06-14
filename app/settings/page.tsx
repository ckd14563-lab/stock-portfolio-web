'use client';

import { useState, useEffect } from 'react';
import { getKisCredentials, saveKisCredentials, clearKisCredentials, getAccounts, addAccount, updateAccount, deleteAccount } from '@/lib/storage';
import type { KisCredentials, Account } from '@/lib/types';

const BROKERAGES = [
  { name: '한국투자증권', color: '#FF6B00', support: 'api', note: 'REST API — 이 앱에서 자동 연동 지원 ✅' },
  { name: 'NH투자증권',   color: '#007B40', support: 'partial', note: '주문 API만 제공 — 잔고 조회 미지원, 수동 입력 ⚠️' },
  { name: '삼성증권',     color: '#1428A0', support: 'none', note: 'Windows 전용 API — 모바일 연동 불가, 수동 입력 ❌' },
  { name: '메리츠증권',   color: '#005BAC', support: 'none', note: '공개 API 없음 — 수동 입력 ❌' },
];

const ACCOUNT_COLORS = ['#00C853','#2196F3','#FF6B35','#9C27B0','#FF9800','#00BCD4','#E91E63','#FF1744'];

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
  const [accounts,   setAccounts]   = useState<Account[]>([]);
  const [showAddAcct, setShowAddAcct] = useState(false);
  const [newAcctName, setNewAcctName] = useState('');
  const [newAcctBrokerage, setNewAcctBrokerage] = useState('');
  const [newAcctColor, setNewAcctColor] = useState(ACCOUNT_COLORS[0]);
  const [addingAcct, setAddingAcct] = useState(false);
  const [editingAcctId, setEditingAcctId] = useState<string | null>(null);
  const [editAcctName, setEditAcctName] = useState('');
  const [editAcctBrokerage, setEditAcctBrokerage] = useState('');
  const [editAcctColor, setEditAcctColor] = useState(ACCOUNT_COLORS[0]);
  const [savingAcct, setSavingAcct] = useState(false);

  // 비밀번호 변경
  const [newPw,       setNewPw]       = useState('');
  const [newPwConfirm,setNewPwConfirm]= useState('');
  const [pwMsg,       setPwMsg]       = useState('');
  const [savingPw,    setSavingPw]    = useState(false);

  const loadAccounts = () => getAccounts().then(setAccounts);

  useEffect(() => {
    const c = getKisCredentials();
    if (c) { setAppKey(c.appKey); setAppSecret(c.appSecret); setCano(c.cano); setAcntPrdtCd(c.acntPrdtCd); setIsVirtual(c.isVirtual); setSaved(true); }
    loadAccounts();
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
      const res = await fetch('/api/kis/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appKey, appSecret, isVirtual, testOnly: true }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setTestMsg('✅ 연결 성공!');
    } catch (e) { setTestMsg(`❌ 실패: ${(e as Error).message}`); }
    finally { setTesting(false); }
  };

  const handleAddAccount = async () => {
    if (!newAcctName.trim()) return alert('계좌 이름을 입력해주세요.');
    setAddingAcct(true);
    try {
      await addAccount({ name: newAcctName.trim(), brokerage: newAcctBrokerage, color: newAcctColor });
      setNewAcctName(''); setNewAcctBrokerage(''); setNewAcctColor(ACCOUNT_COLORS[0]);
      setShowAddAcct(false);
      loadAccounts();
    } catch (e) { alert((e as Error).message); }
    finally { setAddingAcct(false); }
  };

  const startEditAccount = (a: Account) => {
    setEditingAcctId(a.id);
    setEditAcctName(a.name);
    setEditAcctBrokerage(a.brokerage);
    setEditAcctColor(a.color);
  };

  const handleUpdateAccount = async () => {
    if (!editAcctName.trim() || !editingAcctId) return;
    setSavingAcct(true);
    try {
      await updateAccount(editingAcctId, { name: editAcctName.trim(), brokerage: editAcctBrokerage, color: editAcctColor });
      setEditingAcctId(null);
      loadAccounts();
    } catch (e) { alert((e as Error).message); }
    finally { setSavingAcct(false); }
  };

  const handleDeleteAccount = async (id: string, name: string) => {
    if (!confirm(`"${name}" 계좌를 삭제할까요?\n해당 계좌의 종목들은 계좌 미지정으로 변경됩니다.`)) return;
    try {
      await deleteAccount(id);
      loadAccounts();
    } catch (e) { alert((e as Error).message); }
  };

  const handleClear = () => {
    if (!confirm('KIS API 설정을 모두 지울까요?')) return;
    clearKisCredentials(); setSaved(false);
    setAppKey(''); setAppSecret(''); setCano(''); setAcntPrdtCd('01'); setIsVirtual(false);
  };

  const handleChangePw = async () => {
    if (!newPw.trim()) return setPwMsg('❌ 비밀번호를 입력해주세요');
    if (newPw.trim().length < 4) return setPwMsg('❌ 4자 이상 입력해주세요');
    if (newPw !== newPwConfirm) return setPwMsg('❌ 비밀번호가 일치하지 않습니다');
    setSavingPw(true); setPwMsg('');
    try {
      const res = await fetch('/api/config/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: newPw.trim() }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setPwMsg('✅ 변경됐습니다. 다음 로그인부터 새 비밀번호를 사용하세요');
      setNewPw(''); setNewPwConfirm('');
    } catch (e) { setPwMsg(`❌ ${(e as Error).message}`); }
    finally { setSavingPw(false); }
  };

  const inputStyle: React.CSSProperties = { width: '100%', background: '#0D1117', border: '1px solid #30363D', borderRadius: 10, padding: '12px 14px', color: '#fff', fontSize: 15, outline: 'none', marginTop: 6 };
  const labelStyle: React.CSSProperties = { fontSize: 13, color: '#8B949E', marginTop: 18, display: 'block' };

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>⚙️ 설정</h1>

      {/* ── 계좌 관리 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>🏦 계좌 관리</h2>
        <button onClick={() => setShowAddAcct(v => !v)} style={{ padding: '5px 14px', borderRadius: 20, border: '1px solid #00C853', background: 'transparent', color: '#00C853', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          {showAddAcct ? '취소' : '+ 계좌 추가'}
        </button>
      </div>

      {showAddAcct && (
        <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 14, padding: 16, marginBottom: 12 }}>
          <label style={labelStyle}>계좌 이름</label>
          <input style={inputStyle} value={newAcctName} onChange={e => setNewAcctName(e.target.value)} placeholder="예: CMA 계좌, ISA, 메인 계좌" />
          <label style={labelStyle}>증권사 (선택)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            <button onClick={() => setNewAcctBrokerage('')} style={{ padding: '6px 12px', borderRadius: 20, border: `1px solid ${newAcctBrokerage === '' ? '#00C853' : '#30363D'}`, background: newAcctBrokerage === '' ? 'rgba(0,200,83,0.1)' : 'transparent', color: newAcctBrokerage === '' ? '#00C853' : '#8B949E', cursor: 'pointer', fontSize: 12 }}>미선택</button>
            {['한국투자증권','NH투자증권','삼성증권','메리츠증권','기타'].map(b => (
              <button key={b} onClick={() => setNewAcctBrokerage(b)} style={{ padding: '6px 12px', borderRadius: 20, border: `1px solid ${newAcctBrokerage === b ? '#00C853' : '#30363D'}`, background: newAcctBrokerage === b ? 'rgba(0,200,83,0.1)' : 'transparent', color: newAcctBrokerage === b ? '#00C853' : '#8B949E', cursor: 'pointer', fontSize: 12 }}>{b}</button>
            ))}
          </div>
          <label style={labelStyle}>색상</label>
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            {ACCOUNT_COLORS.map(c => (
              <button key={c} onClick={() => setNewAcctColor(c)} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: newAcctColor === c ? '3px solid #fff' : '3px solid transparent', cursor: 'pointer', padding: 0 }} />
            ))}
          </div>
          <button onClick={handleAddAccount} disabled={addingAcct} style={{ width: '100%', marginTop: 16, padding: 12, borderRadius: 12, background: '#00C853', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, border: 'none' }}>
            {addingAcct ? '추가 중...' : '계좌 추가'}
          </button>
        </div>
      )}

      {accounts.length > 0 && (
        <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 14, padding: 16, marginBottom: 24 }}>
          {accounts.map((a, i) => (
            <div key={a.id} style={{ padding: `${i > 0 ? 12 : 0}px 0 ${i < accounts.length - 1 ? 12 : 0}px`, borderBottom: i < accounts.length - 1 ? '1px solid #21262D' : 'none' }}>
              {editingAcctId === a.id ? (
                <div>
                  <input
                    style={{ ...inputStyle, marginTop: 0 }}
                    value={editAcctName}
                    onChange={e => setEditAcctName(e.target.value)}
                    placeholder="계좌 이름"
                    autoFocus
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    <button onClick={() => setEditAcctBrokerage('')} style={{ padding: '5px 10px', borderRadius: 20, border: `1px solid ${editAcctBrokerage === '' ? '#00C853' : '#30363D'}`, background: editAcctBrokerage === '' ? 'rgba(0,200,83,0.1)' : 'transparent', color: editAcctBrokerage === '' ? '#00C853' : '#8B949E', cursor: 'pointer', fontSize: 11 }}>미선택</button>
                    {['한국투자증권','NH투자증권','삼성증권','메리츠증권','기타'].map(b => (
                      <button key={b} onClick={() => setEditAcctBrokerage(b)} style={{ padding: '5px 10px', borderRadius: 20, border: `1px solid ${editAcctBrokerage === b ? '#00C853' : '#30363D'}`, background: editAcctBrokerage === b ? 'rgba(0,200,83,0.1)' : 'transparent', color: editAcctBrokerage === b ? '#00C853' : '#8B949E', cursor: 'pointer', fontSize: 11 }}>{b}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {ACCOUNT_COLORS.map(c => (
                      <button key={c} onClick={() => setEditAcctColor(c)} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: editAcctColor === c ? '3px solid #fff' : '3px solid transparent', cursor: 'pointer', padding: 0 }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={() => setEditingAcctId(null)} style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: '1px solid #30363D', background: 'transparent', color: '#8B949E', cursor: 'pointer', fontSize: 13 }}>취소</button>
                    <button onClick={handleUpdateAccount} disabled={savingAcct} style={{ flex: 2, padding: '8px 0', borderRadius: 10, background: '#00C853', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, border: 'none' }}>{savingAcct ? '저장 중...' : '저장'}</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</div>
                    {a.brokerage && <div style={{ fontSize: 12, color: '#8B949E', marginTop: 2 }}>{a.brokerage}</div>}
                  </div>
                  <button onClick={() => startEditAccount(a)} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #30363D', background: 'transparent', color: '#8B949E', cursor: 'pointer', fontSize: 12 }}>수정</button>
                  <button onClick={() => handleDeleteAccount(a.id, a.name)} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #FF1744', background: 'transparent', color: '#FF1744', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {accounts.length === 0 && !showAddAcct && (
        <div style={{ background: '#161B22', border: '1px dashed #30363D', borderRadius: 14, padding: 24, marginBottom: 24, textAlign: 'center', color: '#8B949E', fontSize: 13 }}>
          아직 계좌가 없어요.<br />+ 계좌 추가 버튼으로 만들어보세요
        </div>
      )}

      {/* 증권사 현황 */}
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>증권사별 API 지원 현황</h2>
      <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 14, padding: 16, marginBottom: 24 }}>
        {BROKERAGES.map((b, i) => (
          <div key={b.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingTop: i > 0 ? 12 : 0, borderTop: i > 0 ? '1px solid #30363D' : 'none', padding: `${i > 0 ? 12 : 0}px 0 12px` }}>
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

      {/* 앱 비밀번호 변경 */}
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, marginTop: 24 }}>🔐 앱 비밀번호 변경</h2>
      <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <p style={{ fontSize: 12, color: '#8B949E', marginBottom: 12, lineHeight: 1.7 }}>
          로그인 화면에서 사용하는 비밀번호를 변경합니다.<br />
          현재 기본값: <strong style={{ color: '#E6EDF3' }}>7014</strong>
        </p>
        <label style={labelStyle}>새 비밀번호</label>
        <input
          type="password"
          style={inputStyle}
          value={newPw}
          onChange={e => setNewPw(e.target.value)}
          placeholder="4자 이상"
        />
        <label style={labelStyle}>새 비밀번호 확인</label>
        <input
          type="password"
          style={inputStyle}
          value={newPwConfirm}
          onChange={e => setNewPwConfirm(e.target.value)}
          placeholder="동일하게 입력"
        />
        {pwMsg && (
          <p style={{ color: pwMsg.startsWith('✅') ? '#00C853' : '#FF1744', fontSize: 13, marginTop: 10 }}>{pwMsg}</p>
        )}
        <button
          onClick={handleChangePw}
          disabled={savingPw}
          style={{ width: '100%', marginTop: 16, padding: 13, borderRadius: 12, background: '#00C853', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, border: 'none' }}
        >
          {savingPw ? '변경 중...' : '비밀번호 변경'}
        </button>
      </div>

      {/* 로그아웃 */}
      <button
        onClick={async () => {
          await fetch('/api/login', { method: 'DELETE' });
          window.location.href = '/login';
        }}
        style={{ width: '100%', padding: '14px 0', borderRadius: 12, border: '1px solid #30363D', background: 'transparent', color: '#FF1744', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}
      >
        🚪 로그아웃
      </button>
    </div>
  );
}
