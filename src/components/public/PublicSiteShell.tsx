import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import brandLogo from '@/assets/fyv-brand-logo.png';

const PUBLIC_NAV_ITEMS = [
  { label: 'Home', to: '/' },
  { label: 'About', to: '/about' },
  { label: 'Privacy', to: '/privacy' },
  { label: 'Terms', to: '/terms' },
];

const BENEFITS = [
  ['✦', 'Discover your strengths', 'Understand your creator potential'],
  ['◎', 'Get personalised insights', 'Receive data-driven recommendations'],
  ['↗', 'Take action and grow', 'Build your creator future with confidence'],
];

export function PublicLegalFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={`border-t border-accent/45 ${compact ? 'mt-6' : ''}`}>
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-5 py-7 text-xs text-white/55 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
        <p>Find Your Vertical is part of the <strong className="text-white">Maximised AI</strong> ecosystem.</p>
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Public footer">
          <Link to="/about" className="text-accent transition-colors hover:text-white">About Us</Link>
          <Link to="/privacy" className="text-accent transition-colors hover:text-white">Privacy Policy</Link>
          <Link to="/terms" className="text-accent transition-colors hover:text-white">Terms of Service</Link>
          <Link to="/auth/login" className="text-accent transition-colors hover:text-white">Creator Sign In</Link>
          <a href="https://www.maximisedai.com/" target="_blank" rel="noopener noreferrer" className="font-semibold text-white transition-colors hover:text-accent">Part of&nbsp; Maximised <span className="text-accent">AI</span> ↗</a>
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
  heroTitle,
  heroDescription,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  heroTitle?: string;
  heroDescription?: string;
}) {
  return (
    <div className="fyv-public-shell flex min-h-screen flex-col text-charcoal">
      <header className="border-b border-accent/55 bg-black/75 backdrop-blur-xl">
        <div className="mx-auto flex min-h-20 w-full max-w-[1440px] items-center justify-between gap-5 px-5 sm:px-8">
          <Link to="/" aria-label="Find Your Vertical home">
            <img src={brandLogo} alt="Find Your Vertical" className="h-12 w-auto object-contain sm:h-14" />
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-semibold md:flex" aria-label="Public navigation">
            {PUBLIC_NAV_ITEMS.map(item => <Link key={item.to} to={item.to} className="transition-colors hover:text-accent">{item.label}</Link>)}
          </nav>
          <Link to="/auth/login" className="btn-secondary border-accent/80 px-5 text-white hover:bg-accent/10">Creator Sign In</Link>
        </div>
        <nav className="flex justify-center gap-6 border-t border-white/5 px-4 py-3 text-xs font-semibold md:hidden" aria-label="Mobile public navigation">
          {PUBLIC_NAV_ITEMS.map(item => <Link key={item.to} to={item.to} className="hover:text-accent">{item.label}</Link>)}
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-[1360px] flex-1 px-4 py-8 sm:px-8 lg:py-10">
        <section className="fyv-public-frame grid w-full overflow-hidden rounded-[1.75rem] lg:grid-cols-[0.92fr_1.08fr]">
          <aside className="fyv-public-hero relative flex min-h-[410px] flex-col justify-center overflow-hidden border-b border-white/10 p-7 sm:p-10 lg:min-h-[650px] lg:border-b-0 lg:border-r lg:p-14">
            <img src={brandLogo} alt="" className="relative z-10 h-20 w-auto self-start object-contain sm:h-24" />
            <p className="relative z-10 mt-7 text-xs font-bold uppercase tracking-[0.22em] text-accent">{eyebrow}</p>
            <h1 className="relative z-10 mt-3 max-w-xl text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">{heroTitle ?? title}</h1>
            <p className="relative z-10 mt-4 max-w-xl text-sm leading-7 text-white/65 sm:text-base">{heroDescription ?? description}</p>
            <div className="relative z-10 mt-8 hidden space-y-5 sm:block">
              {BENEFITS.map(([icon, heading, copy]) => (
                <div key={heading} className="flex items-center gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-accent/45 text-xl text-accent">{icon}</span>
                  <div><p className="text-sm font-semibold text-white">{heading}</p><p className="mt-1 text-xs text-white/50">{copy}</p></div>
                </div>
              ))}
            </div>
          </aside>

          <div className="flex min-w-0 flex-col justify-center bg-black/25 p-5 sm:p-8 lg:p-10">
            <div className="fyv-public-content rounded-3xl p-5 sm:p-7 lg:p-9">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
              <h2 className="mt-3 text-2xl font-bold text-white sm:text-3xl">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-white/60">{description}</p>
              <div className="mt-7 space-y-6">{children}</div>
            </div>
          </div>
        </section>
      </main>
      <PublicLegalFooter />
    </div>
  );
}
