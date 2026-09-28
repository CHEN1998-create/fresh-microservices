import type { Product } from './api';

// MVP：购物车仅存浏览器 localStorage（PRD 待确认项：是否做购物车持久化）
export interface CartLine {
  productId: string;
  name: string;
  priceCents: number;
  emoji: string;
  quantity: number;
}

const CART_KEY = 'fresh_cart';

export function getCart(): CartLine[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]') as CartLine[];
  } catch {
    return [];
  }
}

export function saveCart(lines: CartLine[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(lines));
  window.dispatchEvent(new Event('fresh:cart-changed'));
}

export function addToCart(product: Product, quantity = 1) {
  const lines = getCart();
  const existing = lines.find((l) => l.productId === product.id);
  if (existing) {
    existing.quantity += quantity;
  } else {
    lines.push({
      productId: product.id,
      name: product.name,
      priceCents: product.priceCents,
      emoji: product.emoji,
      quantity,
    });
  }
  saveCart(lines);
}

export function setQuantity(productId: string, quantity: number) {
  let lines = getCart();
  if (quantity <= 0) {
    lines = lines.filter((l) => l.productId !== productId);
  } else {
    lines = lines.map((l) => (l.productId === productId ? { ...l, quantity } : l));
  }
  saveCart(lines);
}

export function clearCart() {
  saveCart([]);
}

export function cartCount(): number {
  return getCart().reduce((sum, l) => sum + l.quantity, 0);
}
