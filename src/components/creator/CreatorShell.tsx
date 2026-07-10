import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useCreatorSession } from './CreatorGate';
import { signOut } from '@/lib/supabase';
import { CREATOR_NAV } from '@/lib/onboarding';
import brandLogo from '@/assets/fyv-brand-logo.png';

// Standard authenticated creator navigation. Desktop: persistent left sidebar.
// Mobile: collapsible drawer. Reuses the existing dark FYV dashboard styling and
// Tailwind utilities — no new UI framework.

const LINK_BASE = 'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors';
const LINK_IDLE = 'text-charcoal-2 hover:bg-white/5 hover:text-charcoal';
const LINK_ACTIVE = 'bg-accent/15 text-accent';

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {CREATOR_NAV.map(item => (
        <NavLink
          key={item.id}
          to={item.to}
          end={item.to === '/my'}
          onClick={onNavigate}
          className={({ isActive }) => `${LINK_BASE} ${isActive ? LINK_ACTIVE : LINK_IDLE}`}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function CreatorShell({ children }: { children: ReactNode }) {
  const { profile } = useCreatorSession();
  const [open, setOpen] = useState(false);
  const displayName = profile.model_name || profile.first_name || profile.full_name || 'Creator';

  return (
    <div className="min-h-screen bg-surface-2 text-charcoal">
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-white/10 bg-surface px-4 py-3 lg:hidden">
        <img src={brandLogo} alt="Find Your Vertical" className="h-9 w-auto object-contain" />
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="btn-secondary text-xs"
          aria-expanded={open}
          aria-controls="creator-nav-drawer"
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-7xl">
        {/* Desktop persistent sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-surface px-4 py-6 lg:flex">
          <img src={brandLogo} alt="Find Your Vertical" className="mb-6 h-12 w-auto object-contain" />
          <NavLinks />
          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="px-3 text-xs uppercase tracking-wide text-charcoal-2">Signed in as</p>
            <p className="truncate px-3 text-sm font-semibold text-charcoal">{displayName}</p>
            <button onClick={() => void signOut()} className={`${LINK_BASE} ${LINK_IDLE} mt-2 w-full text-left`}>
              Sign out
            </button>
          </div>
        </aside>

        {/* Mobile drawer */}
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} aria-hidden="true" />
            <div
              id="creator-nav-drawer"
              className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-white/10 bg-surface px-4 py-6"
            >
              <img src={brandLogo} alt="Find Your Vertical" className="mb-6 h-11 w-auto object-contain" />
              <NavLinks onNavigate={() => setOpen(false)} />
              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="truncate px-3 text-sm font-semibold text-charcoal">{displayName}</p>
                <button
                  onClick={() => void signOut()}
                  className={`${LINK_BASE} ${LINK_IDLE} mt-1 w-full text-left`}
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
