'use client';

import { useEffect, useState } from 'react';
import { apiFetch, type Product } from '@/lib/api';
import { formatYuan } from '@/lib/format';

export default function ProductsAdminPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', category: '', priceYuan: '' });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setProducts(await apiFetch<Product[]>('/catalog/products?all=true'));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleStatus = async (p: Product) => {
    setError('');
    try {
      await apiFetch(`/admin/products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: p.status === 'on' ? 'off' : 'on' }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败（需要管理员登录）');
    }
  };

  // 软删除：仅对已下架商品启用，二次确认后调用 DELETE
  const deleteProduct = async (p: Product) => {
    if (!window.confirm(`确认删除商品「${p.name}」？\n删除后对用户不可见，订单历史引用不受影响；可通过"恢复"重新上架。`)) {
      return;
    }
    setError('');
    try {
      await apiFetch(`/admin/products/${p.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败（需要管理员登录）');
    }
  };

  // 恢复已删除商品
  const restoreProduct = async (p: Product) => {
    setError('');
    try {
      await apiFetch(`/admin/products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'on' }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败（需要管理员登录）');
    }
  };

  const savePrice = async (p: Product, priceYuan: string) => {
    const priceCents = Math.round(Number(priceYuan) * 100);
    if (!Number.isInteger(priceCents) || priceCents <= 0) {
      setError('价格必须为正数');
      return;
    }
    setError('');
    try {
      await apiFetch(`/admin/products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ priceCents }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败（需要管理员登录）');
    }
  };

  const createProduct = async () => {
    const priceCents = Math.round(Number(form.priceYuan) * 100);
    if (!form.name || !form.category || !form.priceYuan) {
      setError('名称、分类、价格必填');
      return;
    }
    setError('');
    try {
      await apiFetch('/admin/products', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, category: form.category, priceCents }),
      });
      setForm({ name: '', category: '', priceYuan: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败（需要管理员登录）');
    }
  };

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold">商品管理</h2>

      {/* 新增商品 */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="商品名称"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-brand"
        />
        <input
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          placeholder="分类"
          className="w-28 rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-brand"
        />
        <input
          value={form.priceYuan}
          onChange={(e) => setForm({ ...form, priceYuan: e.target.value })}
          placeholder="价格（元）"
          type="number"
          className="w-32 rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-brand"
        />
        <button
          onClick={createProduct}
          className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + 新增商品
        </button>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {loading && <p className="py-10 text-center text-sm text-gray-400">加载中…</p>}

      {!loading && (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-400">
              <tr>
                <th className="px-4 py-3 font-medium">商品</th>
                <th className="px-4 py-3 font-medium">分类</th>
                <th className="px-4 py-3 font-medium">价格</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const deleted = p.status === 'deleted';
                return (
                <tr key={p.id} className={`border-t border-gray-100 ${deleted ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <span className="mr-2">{p.emoji}</span>
                    {p.name}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.category}</td>
                  <td className="px-4 py-3">
                    {deleted ? (
                      <span className="text-xs text-gray-400">¥{formatYuan(p.priceCents).slice(1)}</span>
                    ) : (
                      <PriceInput initial={formatYuan(p.priceCents).slice(1)} onSave={(v) => savePrice(p, v)} />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs ${
                        p.status === 'on'
                          ? 'bg-green-100 text-green-700'
                          : p.status === 'off'
                            ? 'bg-gray-200 text-gray-500'
                            : 'bg-red-100 text-red-600'
                      }`}
                    >
                      {p.status === 'on' ? '在售' : p.status === 'off' ? '已下架' : '已删除'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {p.status === 'on' && (
                        <button
                          onClick={() => toggleStatus(p)}
                          className="rounded-lg border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
                        >
                          下架
                        </button>
                      )}
                      {p.status === 'off' && (
                        <>
                          <button
                            onClick={() => toggleStatus(p)}
                            className="rounded-lg border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
                          >
                            上架
                          </button>
                          <button
                            onClick={() => deleteProduct(p)}
                            className="rounded-lg border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            删除
                          </button>
                        </>
                      )}
                      {deleted && (
                        <button
                          onClick={() => restoreProduct(p)}
                          className="rounded-lg border border-brand px-3 py-1 text-xs text-brand hover:bg-brand-light"
                        >
                          恢复
                        </button>
                      )}
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

function PriceInput({ initial, onSave }: { initial: string; onSave: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-orange-600 hover:underline">
        ¥{value}
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <span className="text-xs text-gray-400">¥</span>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (value !== initial) onSave(value);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="w-20 rounded border border-brand px-2 py-0.5 text-sm outline-none"
      />
    </span>
  );
}
