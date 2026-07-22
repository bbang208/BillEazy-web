import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '빌리지 · Bill-eazy',
  description: '영수증만 던지세요. 청구서는 빌리지가 만들어요.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
