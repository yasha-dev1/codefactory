import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { LayoutDashboard, Users, Webhook, ListTodo } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/workers', label: 'Workers', icon: Users },
  { to: '/webhooks', label: 'Webhooks', icon: Webhook },
  { to: '/jobs', label: 'Jobs', icon: ListTodo },
] as const;

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      <aside className="flex w-56 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-4">
          <h1 className="text-lg font-semibold tracking-tight">CodeFactory</h1>
          <p className="text-xs text-gray-500">Gateway Dashboard</p>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 [&.active]:bg-gray-100 [&.active]:text-gray-900"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
