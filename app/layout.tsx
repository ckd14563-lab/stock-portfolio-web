import type { Metadata, Viewport } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: '주식 포트폴리오',
  description: '내 주식 포트폴리오 관리',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0D1117',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full flex flex-col" style={{ background: '#0D1117' }}>
        <Navbar />
        <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 pb-24">
          {children}
        </main>
      </body>
    </html>
  );
}
