'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [pin,     setPin]     = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        window.location.href = '/';
      } else {
        const j = await res.json();
        setError(j.error ?? '오류가 발생했습니다');
      }
    } catch {
      setError('네트워크 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#0D1117', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>📈</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#E6EDF3', margin: 0 }}>주식 포트폴리오</h1>
          <p style={{ color: '#8B949E', fontSize: 14, marginTop: 8, marginBottom: 0 }}>비공개 — 비밀번호를 입력하세요</p>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="비밀번호"
            autoFocus
            style={{
              width: '100%', padding: '14px 16px', fontSize: 16,
              background: '#161B22', border: `1px solid ${error ? '#FF1744' : '#30363D'}`,
              borderRadius: 12, color: '#E6EDF3', outline: 'none',
              boxSizing: 'border-box', marginBottom: 12,
            }}
          />
          {error && (
            <div style={{ color: '#FF1744', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading || !pin}
            style={{
              width: '100%', padding: '14px 0', fontSize: 16, fontWeight: 700,
              background: loading || !pin ? '#21262D' : '#00C853',
              color: loading || !pin ? '#8B949E' : '#fff',
              border: 'none', borderRadius: 12, cursor: loading || !pin ? 'default' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {loading ? '확인 중...' : '입장'}
          </button>
        </form>
      </div>
    </div>
  );
}
