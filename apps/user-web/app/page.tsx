'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { addToCart } from '@/lib/cart';
import { apiFetch, type Product } from '@/lib/api';
import { mockProducts } from '@/lib/mock-data';
import { formatYuan } from '@/lib/format';

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [source, setSource] = useState<'api' | 'mock'>('mock');
  const [category, setCategory] = useState<string>('全部');
  const [keyword, setKeyword] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    apiFetch<Product[]>('/catalog/products')
      .then((data) => {
        setProducts(data);
        setSource('api');
      })
      .catch(() => {
        // 后端未启动时使用兜底数据
        setProducts(mockProducts);
        setSource('mock');
      });
  }, []);

  const categories = useMemo(
    () => ['全部'].concat(Array.from(new Set(mockProducts.map((p) => p.category)))),
    []
  );

  const filtered = products.filter((p) => {
    const matchCategory = category === '全部' || p.category === category;
    const matchKeyword = !keyword || p.name.includes(keyword);
    return matchCategory && matchKeyword;
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  };

  return (
    <div>
      {/* 活动横幅：对应 PRD 官网首页「品类入口 / 活动区」 */}
      <section className="mb-6 rounded-2xl bg-gradient-to-r from-brand to-green-500 p-6 text-white">
        <h1 className="text-2xl font-bold">今日鲜达，最快 30 分钟送达 🚚</h1>
        <p className="mt-1 text-sm text-green-50">
          产地直采 · 冷链配送 · 不满意包退（MVP 演示数据，支付能力暂未接入）
        </p>
      </section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-3 py-1 text-sm ${
                category === c
                  ? 'bg-brand text-white'
                  : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:ring-brand'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索商品名称"
          className="w-48 rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-brand"
        />
      </div>

      <p className="mb-3 text-xs text-gray-400">
        数据来源：{source === 'api' ? 'Catalog 服务（经 API Gateway）' : '本地 Mock（后端未启动）'} · 共{' '}
        {filtered.length} 件商品
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="flex flex-col rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition hover:shadow-md"
          >
            <Link href={`/products/${p.id}`} className="flex flex-1 flex-col">
              <div className="mb-3 flex h-24 items-center justify-center rounded-lg bg-gray-50 text-5xl">
                {p.emoji}
              </div>
              <span className="text-xs text-gray-400">{p.category}</span>
              <h3 className="mt-0.5 text-sm font-medium text-gray-900">{p.name}</h3>
              <p className="mt-1 line-clamp-1 text-xs text-gray-400">{p.description}</p>
            </Link>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-base font-bold text-orange-600">{formatYuan(p.priceCents)}</span>
              <button
                onClick={() => {
                  addToCart(p, 1);
                  showToast(`已加入购物车：${p.name}`);
                }}
                className="rounded-lg bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-dark"
              >
                加入购物车
              </button>
            </div>
          </div>
        ))}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
