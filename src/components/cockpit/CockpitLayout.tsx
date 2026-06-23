import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { signOut } from '@/lib/supabase';

const NAV_ITEMS = [
  { label: 'Dashboard', to: '/cockpit', icon: '📊', end: true },
  { label: 'Creators', to: '/cockpit/creators', icon: '🎬' },
  { label: 'Assessment Templates', to: '/cockpit/settings/assessment-templates', icon: '⚙' },
];

export function CockpitLayout() {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/cockpit');
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-gray-200 bg-surface lg:w-64 lg:border-b-0 lg:border-r">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4 lg:block lg:p-5">
          <div>
            <h1 className="font-display font-bold text-lg text-accent">Creators Cockpit</h1>
            <p className="text-xs text-gray-500 mt-1">Agency Control Plane</p>
          </div>
          <button
            onClick={handleSignOut}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-surface-2 hover:text-gray-900 lg:hidden"
          >
            Sign Out
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto p-3 lg:block lg:flex-1 lg:space-y-1">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-surface-3 text-accent font-medium'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-surface-2'
                }`
              }
            >
              <span className="w-5 text-center">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden p-3 border-t border-gray-200 lg:block">
          <button
            onClick={handleSignOut}
            className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-gray-700 hover:bg-surface-2 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl p-4 sm:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

