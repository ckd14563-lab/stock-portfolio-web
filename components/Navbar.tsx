'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/',        label: '포트폴리오', icon: '📈' },
  { href: '/news',    label: '뉴스',      icon: '📰' },
  { href: '/market',  label: '시장',      icon: '🌐' },
  { href: '/settings',label: '설정',      icon: '⚙️' },
];

export default function Navbar() {
  const path = usePathname();
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#161B22', borderTop: '1px solid #30363D',
      display: 'flex', zIndex: 50,
    }}>
      {tabs.map(t => {
        const active = t.href === '/' ? path === '/' : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', padding: '8px 0', gap: 2, textDecoration: 'none',
            color: active ? '#00C853' : '#8B949E',
            touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
          }}>
            <span style={{ fontSize: 18 }}>{t.icon}</span>
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 400 }}>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
