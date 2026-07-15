import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import brandLogo from '@/assets/fyv-brand-logo.png';

const PUBLIC_NAV_ITEMS = [
  { label: 'Home', to: '/' },
  { label: 'About', to: '/about' },
  { label: 'Privacy', to: '/privacy' },
  { label: 'Terms', to: '/terms' },
  { label: 'Creator Sign In', to: '/auth/login' },
];

export function PublicLegalFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={compact ? 'mt-5 border-t border-white/10 pt-4' : 'border-t border-white/10 bg-surface/80'}>
      <div className={compact
        ? 'mx-auto flex w-full max-w-5xl flex-col gap-3 text-xs text-charcoal-2 sm:flex-row sm:items-center sm:justify-between'
        : 'mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-7 text-sm text-charcoal-2 sm:flex-row sm:items-center sm:justify-between'}
      >
        <p>
          Find Your Vertical is part of the{' '}
          <a
            href="https://www.maximisedai.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-charcoal transition-colors hover:text-accent"
          >
            Maximised AI
          </a>{' '}
          ecosystem.
        </p>
        <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Public footer">
          <Link to="/about" className="transition-colors hover:text-charcoal">About Us</Link>
          <Link to="/privacy" className="transition-colors hover:text-charcoal">Privacy Policy</Link>
          <Link to="/terms" className="transition-colors hover:text-charcoal">Terms of Service</Link>
          <Link to="/auth/login" className="transition-colors hover:text-charcoal">Creator Sign In</Link>
        </nav>
      </div>
    </footer>
  );
}

export function PublicSiteShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="fyv-public-shell min-h-screen text-charcoal">
      <header className="border-b border-white/10 bg-surface/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <Link to="/" className="flex items-center gap-3">
            <img src={brandLogo} alt="Find Your Vertical" className="h-10 w-auto object-contain" />
            <div>
              <div className="text-sm font-bold text-charcoal">Find Your Vertical</div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</div>
            </div>
          </Link>
          <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Public navigation">
            {PUBLIC_NAV_ITEMS.map(item => (
              <Link key={item.to} to={item.to} className="btn-subtle">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-10 sm:py-12">
        <section className="fyv-public-card rounded-3xl p-6 sm:p-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
          <h1 className="max-w-3xl text-4xl font-bold tracking-normal text-white sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-charcoal">{description}</p>
        </section>

        <div className="mt-8 space-y-6">{children}</div>
      </main>

      <PublicLegalFooter />
    </div>
  );
}
