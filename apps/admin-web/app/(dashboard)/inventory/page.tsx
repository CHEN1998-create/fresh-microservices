'use client';

import { useEffect, useState } from 'react';
import { apiFetch, type InventoryItem, type Product } from '@/lib/api';

export default function InventoryAdminPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [inv, prods] = await Promise.all([
        apiFetch<InventoryItem[]>('/inventory'),
        apiFetch<Product[]>('/catalog/products?all=true'),
      ]);
      setInventory(inv);
      setProducts(prods);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const productName = (productId: string) =>
    products.find((p) => p.id === productId)?.name ?? productId;
  const productEmoji = (productId: string) => products.find((p) => p.id === productId)?.emoji ?? '📦';

  const adjust = async (productId: string) => {
    const adjustment = Number(drafts[productId]);
    if (!Number.isInteger(adjustment) || adjustment === 0) {
      setError('请输入非 0 整数调整量（正数入库 / 负数出库）');
      return;
    }
    setError('');
    try {
      await apiFetch(`/inventory/${productId}`, {
        method: 'PATCH',
        body: JSON.stringify({ adjustment }),
      });
      setDrafts((d) => ({ ...d, [productId]: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '调整失败（需要管理员登录）');
    }
  };

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold">库存管理</h2>
      <p className="mb-4 text-sm text-gray-400">
        库存模型：可用库存 / 预扣库存；下单时先预扣，订单确认后转为正式扣减。预警线：10 件。
      </p>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {loading && <p className="py-10 text-center text-sm text-gray-400">加载中…</p>}

      {!loading && (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-400">
              <tr>
                <th className="px-4 py-3 font-medium">商品</th>
                <th className="px-4 py-3 font-medium">可用库存</th>
                <th className="px-4 py-3 font-medium">预扣库存</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">库存调整</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => {
                const product = products.find((p) => p.id === item.productId);
                const deleted = product?.status === 'deleted';
                return (
                <tr
                  key={item.productId}
                  className={`border-t border-gray-100 ${item.lowStock ? 'bg-orange-50/50' : ''} ${deleted ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3">
                    <span className="mr-2">{productEmoji(item.productId)}</span>
                    {productName(item.productId)}
                    {deleted && (
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
                        已删除
                      </span>
                    )}
                    <span className="ml-2 text-xs text-gray-400">{item.productId}</span>
                  </td>
                  <td className="px-4 py-3 font-medium">{item.availableQuantity}</td>
                  <td className="px-4 py-3 text-gray-500">{item.reservedQuantity}</td>
                  <td className="px-4 py-3">
                    {item.lowStock ? (
                      <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs text-orange-700">
                        库存预警
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs text-green-700">
                        正常
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        value={drafts[item.productId] ?? ''}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [item.productId]: e.target.value }))
                        }
                        placeholder="±数量"
                        className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm outline-none focus:border-brand"
                      />
                      <button
                        onClick={() => adjust(item.productId)}
                        className="rounded-lg bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-dark"
                      >
                        确定
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
