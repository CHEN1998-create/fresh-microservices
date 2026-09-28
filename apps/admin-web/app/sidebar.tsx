'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { clearSession, getUser, type User } from '@/lib/api';

const MENU = [
  { href: '/', label: '后台首页', icon: '📊' },
  { href: '/products', label: '商品管理', icon: '🏷️' },
  { href: '/inventory', label: '库存管理', icon: '📦' },
  { href: '/orders', label: '订单管理', icon: '🧾' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setUser(getUser());
  }, [pathname]);

  const handleLogout = () => {
    clearSession();
    router.push('/login');
    router.refresh();
  };

  return (
    <aside className="flex w-56 flex-col bg-gray-900 text-gray-300">
      <div className="flex h-14 items-center gap-2 px-5 text-base font-bold text-white">
        <span>🥬</span>
        <span>鲜达后台</span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {MENU.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                active ? 'bg-brand text-white' : 'hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-gray-800 p-4">
        <p className="truncate text-xs text-gray-400">{user?.email || '未登录'}</p>
        {user ? (
          <button onClick={handleLogout} className="mt-2 text-xs text-gray-400 hover:text-white">
            退出登录
          </button>
        ) : (
          <Link href="/login" className="mt-2 inline-block text-xs text-brand-light">
            去登录
          </Link>
        )}
      </div>
    </aside>
  );
}
