import type { Metadata } from 'next';
import './globals.css';
import Navbar from './navbar';

export const metadata: Metadata = {
  title: '鲜达生鲜 · 用户端',
  description: '生鲜电商微服务系统 — 商品浏览 / 加购 / 下单 / 订单查询',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <Navbar />
        <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-8 text-center text-xs text-gray-400">
          MVP 演示 · 微服务：API Gateway / Auth / Catalog / Inventory / Order（数据为内存 Mock）
        </footer>
      </body>
    </html>
  );
}
