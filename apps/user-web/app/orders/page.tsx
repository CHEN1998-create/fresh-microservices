'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiFetch, getToken, type Order } from '@/lib/api';
import { formatTime, formatYuan, ORDER_STATUS_TEXT } from '@/lib/format';

function OrdersContent() {
  const searchParams = useSearchParams();
  const createdId = searchParams.get('created');
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    if (!getToken()) {
      setError('请先登录后查看订单');
      setOrders([]);
      return;
    }
    apiFetch<Order[]>('/orders/my')
      .then(setOrders)
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'));
  };

  useEffect(() => {
    load();
  }, []);

  const cancelOrder = async (order: Order) => {
    if (!window.confirm(`确认取消订单 ${order.id}？库存将回补。`)) return;
    setError('');
    try {
      await apiFetch(`/orders/${order.id}/cancel`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消失败');
    }
  };

  if (error) {
    return (
      <div className="rounded-2xl bg-white py-20 text-center text-gray-500">
        <div className="text-5xl">📦</div>
        <p className="mt-4">{error}</p>
        <Link
          href="/login?redirect=/orders"
          className="mt-6 inline-block rounded-xl bg-brand px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          去登录
        </Link>
      </div>
    );
  }

  if (!orders) return <p className="py-20 text-center text-gray-400">加载中…</p>;

  if (orders.length === 0) {
    return (
      <div className="rounded-2xl bg-white py-20 text-center text-gray-500">
        <p>还没有订单</p>
        <Link href="/" className="mt-4 inline-block text-brand">
          去下单
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">我的订单</h1>
      {createdId && (
        <div className="mb-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">
          🎉 订单 {createdId} 创建成功，库存已扣减
        </div>
      )}
      <div className="space-y-4">
        {orders.map((order) => {
          const status = ORDER_STATUS_TEXT[order.status];
          return (
            <div key={order.id} className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <p className="text-sm font-medium">订单号：{order.id}</p>
                  <p className="mt-0.5 text-xs text-gray-400">{formatTime(order.createdAt)}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${status?.className}`}>
                  {status?.text || order.status}
                </span>
              </div>
              <div className="py-3">
                {order.items.map((item) => (
                  <div key={item.productId} className="flex justify-between py-0.5 text-sm">
                    <span className="text-gray-600">
                      {item.name} × {item.quantity}
                    </span>
                    <span className="text-gray-400">{formatYuan(item.priceCents * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-sm">
                <button
                  onClick={() => cancelOrder(order)}
                  className={`rounded-lg px-3 py-1 text-xs ${
                    order.status === 'created'
                      ? 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                      : 'border border-gray-200 text-gray-300'
                  }`}
                  disabled={order.status !== 'created'}
                >
                  取消订单
                </button>
                合计：<span className="ml-2 font-bold text-orange-600">{formatYuan(order.totalAmountCents)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-gray-400">加载中…</p>}>
      <OrdersContent />
    </Suspense>
  );
}
