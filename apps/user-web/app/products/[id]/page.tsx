'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { addToCart } from '@/lib/cart';
import { apiFetch, type InventoryItem, type Product } from '@/lib/api';
import { mockProducts } from '@/lib/mock-data';
import { formatYuan } from '@/lib/format';

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [inventory, setInventory] = useState<InventoryItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch<Product>(`/catalog/products/${params.id}`)
      .then(setProduct)
      .catch(() => setProduct(mockProducts.find((p) => p.id === params.id) ?? null))
      .finally(() => setLoading(false));

    apiFetch<InventoryItem>(`/inventory/${params.id}`)
      .then(setInventory)
      .catch(() => null);
  }, [params.id]);

  if (loading) {
    return <div className="py-20 text-center text-gray-400">商品加载中…</div>;
  }

  if (!product) {
    return (
      <div className="py-20 text-center text-gray-400">
        商品不存在或已下架
        <div className="mt-4">
          <Link href="/" className="text-brand">
            返回商品列表
          </Link>
        </div>
      </div>
    );
  }

  const available = inventory?.availableQuantity;
  const stockText =
    available === undefined
      ? '库存状态暂不可用'
      : available <= 0
        ? '暂时缺货'
        : available <= 10
          ? `仅剩 ${available} 份，抓紧下单`
          : '现货充足';

  return (
    <div>
      <Link href="/" className="mb-4 inline-block text-sm text-gray-400 hover:text-brand">
        ← 返回商品列表
      </Link>
      <div className="grid gap-8 rounded-2xl bg-white p-6 sm:grid-cols-2">
        <div className="flex h-72 items-center justify-center rounded-xl bg-gray-50 text-[10rem]">
          {product.emoji}
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-gray-400">{product.category}</span>
          <h1 className="mt-1 text-2xl font-bold">{product.name}</h1>
          <p className="mt-3 text-sm leading-6 text-gray-500">{product.description}</p>

          <div className="mt-4 flex items-center gap-2">
            <span className="text-3xl font-bold text-orange-600">
              {formatYuan(product.priceCents)}
            </span>
            <span className="text-xs text-gray-400">/ 份</span>
          </div>

          <p
            className={`mt-2 text-sm ${
              available !== undefined && available <= 10 ? 'text-orange-600' : 'text-brand'
            }`}
          >
            {stockText}
          </p>

          <div className="mt-6 flex items-center gap-3">
            <span className="text-sm text-gray-500">数量</span>
            <div className="flex items-center rounded-lg border border-gray-300">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="px-3 py-1.5 text-lg text-gray-500"
              >
                −
              </button>
              <span className="w-10 text-center text-sm">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => q + 1)}
                className="px-3 py-1.5 text-lg text-gray-500"
              >
                +
              </button>
            </div>
          </div>

          <div className="mt-auto flex gap-3 pt-8">
            <button
              onClick={() => {
                addToCart(product, quantity);
                setToast('已加入购物车');
                setTimeout(() => setToast(''), 1800);
              }}
              className="flex-1 rounded-xl border border-brand py-3 text-sm font-medium text-brand hover:bg-brand-light"
            >
              加入购物车
            </button>
            <button
              onClick={() => {
                addToCart(product, quantity);
                router.push('/cart');
              }}
              className="flex-1 rounded-xl bg-brand py-3 text-sm font-medium text-white hover:bg-brand-dark"
            >
              立即购买
            </button>
          </div>
          {toast && <p className="mt-3 text-center text-sm text-brand">{toast}</p>}
        </div>
      </div>
    </div>
  );
}
