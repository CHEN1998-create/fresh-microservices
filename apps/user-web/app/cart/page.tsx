'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearCart, getCart, setQuantity, type CartLine } from '@/lib/cart';
import { apiFetch, getToken, type Order } from '@/lib/api';
import { formatYuan } from '@/lib/format';

export default function CartPage() {
  const router = useRouter();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const refresh = () => setLines(getCart());
    refresh();
    window.addEventListener('fresh:cart-changed', refresh);
    return () => window.removeEventListener('fresh:cart-changed', refresh);
  }, []);

  const total = lines.reduce((sum, l) => sum + l.priceCents * l.quantity, 0);

  const submitOrder = async () => {
    setError('');
    if (!getToken()) {
      router.push('/login?redirect=/cart');
      return;
    }
    setSubmitting(true);
    try {
      const order = await apiFetch<Order>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        }),
      });
      clearCart();
      router.push('/orders?created=' + order.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '下单失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (lines.length === 0) {
    return (
      <div className="rounded-2xl bg-white py-20 text-center">
        <div className="text-5xl">🛒</div>
        <p className="mt-4 text-gray-500">购物车还是空的</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-brand px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          去逛逛
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">购物车</h1>
      <div className="space-y-3">
        {lines.map((l) => (
          <div
            key={l.productId}
            className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gray-50 text-3xl">
              {l.emoji}
            </div>
            <div className="flex-1">
              <p className="font-medium">{l.name}</p>
              <p className="text-sm text-gray-400">
                单价 {formatYuan(l.priceCents)} · 小计{' '}
                <span className="text-orange-600">{formatYuan(l.priceCents * l.quantity)}</span>
              </p>
            </div>
            <div className="flex items-center rounded-lg border border-gray-300">
              <button
                onClick={() => setQuantity(l.productId, l.quantity - 1)}
                className="px-3 py-1 text-lg text-gray-500"
              >
                −
              </button>
              <span className="w-10 text-center text-sm">{l.quantity}</span>
              <button
                onClick={() => setQuantity(l.productId, l.quantity + 1)}
                className="px-3 py-1 text-lg text-gray-500"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
        <div>
          <p className="text-sm text-gray-400">
            共 {lines.reduce((s, l) => s + l.quantity, 0)} 件商品
          </p>
          <p className="text-lg font-bold text-orange-600">合计 {formatYuan(total)}</p>
        </div>
        <button
          onClick={submitOrder}
          disabled={submitting}
          className="rounded-xl bg-brand px-8 py-3 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {submitting ? '提交中…' : '提交订单'}
        </button>
      </div>

      {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
      <p className="mt-3 text-center text-xs text-gray-400">
        MVP 未接入真实支付，提交即创建订单并扣减库存
      </p>
    </div>
  );
}
