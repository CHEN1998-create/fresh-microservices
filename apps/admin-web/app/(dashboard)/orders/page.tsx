'use client';

import { Fragment, useEffect, useState } from 'react';
import { apiFetch, type Order } from '@/lib/api';
import { formatTime, formatYuan, ORDER_STATUS_TEXT } from '@/lib/format';

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'created', label: '已创建' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
];

export default function OrdersAdminPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = () => {
    apiFetch<Order[]>('/admin/orders')
      .then(setOrders)
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败（需要管理员登录）'));
  };

  useEffect(() => {
    load();
  }, []);

  const actOnOrder = async (order: Order, action: 'cancel' | 'complete') => {
    const verb = action === 'cancel' ? '取消' : '标记完成';
    if (!window.confirm(`确认${verb}订单 ${order.id}？${action === 'cancel' ? ' 库存将回补。' : ''}`)) return;
    setError('');
    try {
      await apiFetch(`/admin/orders/${order.id}/${action}`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${verb}失败`);
    }
  };

  if (error) {
    return (
      <div>
        <h2 className="mb-4 text-lg font-bold">订单管理</h2>
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (!orders) return <p className="py-10 text-center text-sm text-gray-400">加载中…</p>;

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter);

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold">订单管理</h2>

      <div className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-sm ${
              filter === f.key
                ? 'bg-brand text-white'
                : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:ring-brand'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-400">
            <tr>
              <th className="px-4 py-3 font-medium">订单号</th>
              <th className="px-4 py-3 font-medium">用户</th>
              <th className="px-4 py-3 font-medium">金额</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">下单时间</th>
              <th className="px-4 py-3 font-medium">明细</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const status = ORDER_STATUS_TEXT[o.status];
              const open = expanded === o.id;
              return (
                <Fragment key={o.id}>
                  <tr className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium">{o.id}</td>
                    <td className="px-4 py-3 text-gray-500">{o.userId}</td>
                    <td className="px-4 py-3 text-orange-600">{formatYuan(o.totalAmountCents)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs ${status?.className}`}>
                        {status?.text || o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatTime(o.createdAt)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setExpanded(open ? null : o.id)}
                        className="text-xs text-brand hover:underline"
                      >
                        {open ? '收起' : '展开'}
                      </button>
                    </td>
                  </tr>
                  {open && (
                    <tr key={`${o.id}-detail`} className="border-t border-gray-100 bg-gray-50">
                      <td colSpan={6} className="px-4 py-3">
                        <ul className="space-y-1 text-xs text-gray-500">
                          {o.items.map((item) => (
                            <li key={item.productId}>
                              {item.name} × {item.quantity} — {formatYuan(item.priceCents * item.quantity)}
                            </li>
                          ))}
                        </ul>
                        {o.status === 'created' && (
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => actOnOrder(o, 'complete')}
                              className="rounded-lg bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-dark"
                            >
                              标记完成
                            </button>
                            <button
                              onClick={() => actOnOrder(o, 'cancel')}
                              className="rounded-lg border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                            >
                              取消订单
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  暂无订单
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
