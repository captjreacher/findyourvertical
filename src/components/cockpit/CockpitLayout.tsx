import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { signOut } from '@/lib/supabase';

const NAV_ITEMS = [
  { label: 'Dashboard', to: '/cockpit', icon: 'D', end: true },
  { label: 'Creators', to: '/cockpit/creators', icon: 'C' },
  { label: 'Assessment Templates', to: '/cockpit/settings/assessment-templates', icon: 'T' },
  { label: 'Question Bank', to: '/cockpit/settings/question-bank', icon: 'Q' },
];

export function CockpitLayout() {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/cockpit');
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface-2 lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-white/10 bg-[#0a1020]/95 text-white backdrop-blur lg:w-64 lg:border-b-0 lg:border-r lg:border-white/10">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4 lg:block lg:p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-sm font-black tracking-wide text-white shadow-lg shadow-orange-950/40">
              FYV
            </div>
            <div>
              <h1 className="text-base font-bold tracking-normal text-white">Find Your Vertical</h1>
              <p className="mt-0.5 text-xs text-slate-400">Modelling Creator Talent</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm font-medium text-gray-200 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
          >
            Sign Out
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto p-3 lg:block lg:flex-1 lg:space-y-1.5 lg:p-3">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `relative flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white/10 text-white shadow-inner shadow-white/5 before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r-full before:bg-accent'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[11px] font-bold tracking-wide text-slate-100">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-white/10 p-4 lg:block">
          <button
            onClick={handleSignOut}
            className="w-full rounded-lg border border-white/10 px-3 py-2.5 text-left text-sm font-medium text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
