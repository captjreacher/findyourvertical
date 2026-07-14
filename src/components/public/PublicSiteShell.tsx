import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import brandLogo from '@/assets/fyv-brand-logo.png';

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
    <div className="fyv-report-shell min-h-screen text-charcoal">
      <header className="border-b border-white/10 bg-surface/80">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-4 px-6 py-6">
          <Link to="/#" className="flex items-center gap-3">
            <img src={brandLogo} alt="Find Your Vertical" className="h-10 w-auto object-contain" />
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</div>
              <div className="text-sm text-charcoal-2">Creator Growth Framework</div>
            </div>
          </Link>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <Link to="/#/about" className="btn-subtle">About</Link>
            <Link to="/#/privacy" className="btn-subtle">Privacy</Link>
            <Link to="/#/terms" className="btn-subtle">Terms</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <section className="fyv-report-card rounded-3xl p-6 sm:p-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
          <h1 className="font-display text-4xl font-bold text-charcoal sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-charcoal-2">{description}</p>
        </section>

        <div className="mt-8 space-y-6">{children}</div>
      </main>

      <footer className="border-t border-white/10 bg-surface/80">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-sm text-charcoal-2">
          <p>Find Your Vertical</p>
          <nav className="flex flex-wrap gap-4">
            <Link to="/#/about" className="hover:text-charcoal">About</Link>
            <Link to="/#/privacy" className="hover:text-charcoal">Privacy</Link>
            <Link to="/#/terms" className="hover:text-charcoal">Terms</Link>
            <Link to="/#/auth/login" className="hover:text-charcoal">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
