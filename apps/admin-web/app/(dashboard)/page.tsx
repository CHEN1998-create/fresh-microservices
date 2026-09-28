'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, type InventoryItem, type Order, type Product } from '@/lib/api';
import { formatYuan } from '@/lib/format';

export default function DashboardPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[] | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    apiFetch<Product[]>('/catalog/products?all=true')
      .then(setProducts)
      .catch(() => null);
    apiFetch<InventoryItem[]>('/inventory')
      .then(setInventory)
      .catch(() => null);
    apiFetch<Order[]>('/admin/orders')
      .then(setOrders)
      .catch(() => null);
  }, []);

  const lowStockCount = inventory?.filter((i) => i.lowStock).length ?? null;
  const createdCount = orders?.filter((o) => o.status === 'created').length ?? null;
  const gmv = orders?.reduce((s, o) => s + o.totalAmountCents, 0) ?? null;

  const cards = [
    {
      label: '在售 / 全部商品',
      value: products ? `${products.filter((p) => p.status === 'on').length} / ${products.length}` : '—',
      icon: '🏷️',
      href: '/products',
      tone: 'bg-blue-50 text-blue-600',
    },
    {
      label: '库存预警（≤ 10 件）',
      value: lowStockCount ?? '—',
      icon: '⚠️',
      href: '/inventory',
      tone: 'bg-orange-50 text-orange-600',
    },
    {
      label: '待处理订单（已创建）',
      value: createdCount ?? '—',
      icon: '🧾',
      href: '/orders',
      tone: 'bg-green-50 text-green-600',
    },
    {
      label: '订单总额（内存数据）',
      value: gmv !== null ? formatYuan(gmv) : '—',
      icon: '💰',
      href: '/orders',
      tone: 'bg-purple-50 text-purple-600',
    },
  ];

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold">后台首页</h2>
      <p className="mb-6 text-sm text-gray-400">
        指标来自各微服务实时聚合；订单类指标需先以管理员身份
        <Link href="/login" className="text-brand">
          登录
        </Link>
        。
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-xl bg-white p-5 shadow-sm transition hover:shadow-md"
          >
            <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg text-xl ${c.tone}`}>
              {c.icon}
            </div>
            <p className="text-2xl font-bold">{c.value}</p>
            <p className="mt-1 text-xs text-gray-400">{c.label}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 rounded-xl bg-white p-5 text-sm text-gray-500 shadow-sm">
        <h3 className="mb-2 font-medium text-gray-800">服务状态速览</h3>
        <ul className="space-y-1.5 text-xs">
          <li>API Gateway：http://localhost:4000（统一入口 + JWT 鉴权）</li>
          <li>Auth / Catalog / Inventory / Order：4001 - 4004</li>
          <li>健康检查：GET <code className="rounded bg-gray-100 px-1">/health</code></li>
          <li>全链路冒烟：根目录执行 <code className="rounded bg-gray-100 px-1">npm run smoke</code></li>
        </ul>
      </div>
    </div>
  );
}
