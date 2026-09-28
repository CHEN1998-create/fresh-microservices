import Sidebar from '../sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1">
        <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
          <h1 className="text-sm text-gray-400">运营管理台</h1>
          <a
            href="http://localhost:3000"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-brand hover:underline"
          >
            前往用户端 ↗
          </a>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
