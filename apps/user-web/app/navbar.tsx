'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cartCount, getCart } from '@/lib/cart';
import { clearSession, getUser, type User } from '@/lib/api';
import { useRouter, usePathname } from 'next/navigation';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setUser(getUser());
      setCount(cartCount());
    };
    refresh();
    window.addEventListener('fresh:cart-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('fresh:cart-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [pathname]);

  const handleLogout = () => {
    clearSession();
    setUser(null);
    router.push('/');
    router.refresh();
  };

  const navLink = (href: string, label: string) => (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
        pathname === href ? 'bg-brand-light text-brand-dark' : 'text-gray-600 hover:text-brand'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-brand">
          <span>🥬</span>
          <span>鲜达生鲜</span>
        </Link>
        <nav className="flex items-center gap-1">
          {navLink('/', '商品')}
          {navLink('/cart', `购物车${count ? ` (${count})` : ''}`)}
          {navLink('/orders', '我的订单')}
          {user ? (
            <div className="ml-2 flex items-center gap-2">
              <span className="hidden text-xs text-gray-500 sm:inline">{user.email}</span>
              <button
                onClick={handleLogout}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                退出
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="ml-2 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
            >
              登录
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
