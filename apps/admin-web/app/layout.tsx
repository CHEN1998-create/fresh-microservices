import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '鲜达生鲜 · 运营管理台',
  description: '商品 / 库存 / 订单管理',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gray-100 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
