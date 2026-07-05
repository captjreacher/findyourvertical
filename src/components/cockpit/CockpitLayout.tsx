import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { signOut } from '@/lib/supabase';
import brandLogo from '@/assets/find-your-vertical-logo.png';

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
      <aside className="flex w-full shrink-0 flex-col border-b border-white/10 bg-surface/95 text-charcoal backdrop-blur lg:w-64 lg:border-b-0 lg:border-r lg:border-white/10">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4 lg:flex-col lg:items-start lg:p-5">
          <div className="flex min-w-0 flex-col items-start gap-2">
            <img
              src={brandLogo}
              alt="Find Your Vertical"
              className="fyv-logo-mark block h-auto w-full max-w-[208px] shrink-0 object-contain"
            />
            <p className="max-w-[208px] text-[12px] font-medium leading-snug tracking-[0.02em] text-charcoal-2">
              Finding the Creator in you
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm font-medium text-charcoal transition-colors hover:bg-surface-3 hover:text-charcoal lg:hidden"
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
                    ? 'bg-surface-3 text-charcoal shadow-inner shadow-black/15 before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r-full before:bg-accent'
                    : 'text-charcoal-2 hover:bg-surface-3/70 hover:text-charcoal'
              }`
            }
          >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-surface-3 text-[11px] font-bold tracking-wide text-charcoal">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-white/10 p-4 lg:block">
          <button
            onClick={handleSignOut}
            className="w-full rounded-lg border border-white/10 px-3 py-2.5 text-left text-sm font-medium text-charcoal transition-colors hover:bg-surface-3/70 hover:text-charcoal"
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
