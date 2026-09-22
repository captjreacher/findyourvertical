import { useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import brandLogo from '@/assets/fyv-brand-logo.png';
import { PublicAssessmentStart, PUBLIC_ASSESSMENT_START_ID } from '@/components/public/PublicAssessmentStart';
import { PublicLegalFooter } from '@/components/public/PublicSiteShell';

const PAGE_TITLE = 'Find My Vertical | Creator Assessment and Vertical Discovery';
const PAGE_DESCRIPTION =
  'Find My Vertical is a creator assessment and planning application. Complete the creator assessment, discover the verticals that best fit you, get your personalised starter report, and build a Personal Vertical Plan in a guided self-service workspace with AI assistance.';

// Single source of truth for the anchor the primary CTA targets.
const ASSESSMENT_START_SECTION_ID = PUBLIC_ASSESSMENT_START_ID;

const CREATOR_JOURNEY = [
  {
    title: 'Complete the creator assessment',
    description: 'Answer questions about your interests, strengths, experience and goals.',
  },
  {
    title: 'Discover the verticals that fit you',
    description: 'See the content verticals most strongly supported by your own responses.',
  },
  {
    title: 'Receive your personalised starter report',
    description: 'Your free report brings your direction, strengths and next steps together.',
  },
  {
    title: 'Continue in the Creator Portal',
    description: 'Sign in to review your assessment, reports and character possibilities.',
  },
  {
    title: 'Build your Personal Vertical Plan',
    description: 'Turn your report into strategy, schedule, scripts, experiments and next actions at your own pace.',
  },
];

const PUBLIC_LINKS = [
  { to: '/about', label: 'About' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms of Service' },
];

function setMetaByName(name: string, content: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function setMetaByProperty(property: string, content: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('property', property);
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function usePublicHomeMeta() {
  useEffect(() => {
    document.title = PAGE_TITLE;
    setMetaByName('description', PAGE_DESCRIPTION);
    setMetaByName('application-name', 'Find My Vertical');
    setMetaByProperty('og:site_name', 'Find My Vertical');
    setMetaByProperty('og:title', 'Find My Vertical');
  }, []);
}

export function PublicHomePage() {
  usePublicHomeMeta();

  // The primary CTA is an in-page move (the site runs under a HashRouter, so a
  // plain "#start-assessment" href would be read as a route change).
  const revealAssessmentStart = useCallback(() => {
    const target = document.getElementById(ASSESSMENT_START_SECTION_ID);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => target.querySelector<HTMLInputElement>('input[name="name"]')?.focus(), 250);
  }, []);

  return (
    <div className="fyv-public-shell flex min-h-screen flex-col bg-surface-2 text-charcoal">
      <header className="border-b border-white/10 bg-black/85 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
          <Link to="/" aria-label="Find My Vertical home" className="flex items-center gap-3">
            <img src={brandLogo} alt="Find My Vertical" className="fyv-logo-mark h-16 w-auto object-contain sm:h-20" />
            <span className="hidden font-display text-base font-bold leading-tight text-charcoal sm:block">
              Find the Creator in You
            </span>
          </Link>
          {/* Returning creators: always available, deliberately secondary to the
              assessment CTA below. */}
          <Link to="/auth/login" className="btn-secondary min-h-11 px-5">
            Creator Login
          </Link>
        </div>
      </header>

      <main aria-labelledby="public-home-title" className="flex-1 px-4 py-6 sm:px-6 lg:py-8">
        <section className="mx-auto w-full max-w-6xl">
          <div className="py-3 sm:py-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Creator Assessment</p>
            <h1 id="public-home-title" className="mt-4 max-w-3xl font-display text-4xl font-bold leading-tight text-charcoal sm:text-5xl lg:text-6xl">
              Find My Vertical
            </h1>
            <p className="mt-3 font-display text-2xl font-bold text-charcoal sm:text-3xl">
              Find the Creator in You
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
            <section className="flex h-full flex-col rounded-2xl border border-white/10 bg-surface/80 p-5 shadow-xl shadow-black/20 sm:p-6" aria-labelledby="homepage-purpose-title">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-success">How it works</p>
              <h2 id="homepage-purpose-title" className="mt-2 text-xl font-bold text-charcoal">
                Assessment, report, then your Personal Vertical Plan
              </h2>
              <p className="mt-3 text-sm leading-7 text-charcoal-2 sm:text-base">
                Find My Vertical helps creators discover the verticals that best fit them. Complete the creator
                assessment, receive a personalised starter report, and continue in the Creator Portal where your
                assessment and reports stay available to you.
              </p>
              <p className="mt-3 text-sm leading-7 text-charcoal-2 sm:text-base">
                When you're ready to go further, the Personal Vertical Plan turns your report into strategy, schedule,
                scripts, experiments and next actions in a guided self-service workspace with AI assistance.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={revealAssessmentStart} className="btn-primary min-h-12 px-6 text-base">
                  Complete My Assessment
                </button>
                <Link to="/about" className="btn-secondary min-h-12 px-6 text-base">Learn About FYV</Link>
              </div>

              <p className="mt-4 text-sm text-charcoal-2">
                Already completed your assessment?{' '}
                <Link to="/auth/login" className="font-semibold text-accent underline underline-offset-4">
                  Sign in to your Creator Portal
                </Link>
                .
              </p>

              <nav className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-5 lg:mt-auto" aria-label="Public homepage links">
                {PUBLIC_LINKS.map(link => (
                  <Link key={link.to} to={link.to} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-charcoal transition-colors hover:border-accent/50 hover:text-accent">
                    {link.label}
                  </Link>
                ))}
              </nav>
            </section>

            {/* Primary acquisition: the existing self-service assessment-start flow. */}
            <PublicAssessmentStart id={ASSESSMENT_START_SECTION_ID} className="h-full" />
          </div>
        </section>

        <section className="mx-auto mt-8 w-full max-w-6xl rounded-2xl border border-white/10 bg-surface/80 p-5 shadow-xl shadow-black/20 sm:p-6 lg:mt-10" aria-labelledby="journey-title">
          <div className="flex flex-col gap-2 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-success">Your route</p>
              <h2 id="journey-title" className="mt-2 text-2xl font-bold text-charcoal">
                From assessment to next steps
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-charcoal-2">
              Self-service from start to finish — no waiting on anyone else.
            </p>
          </div>
          <ol className="grid gap-6 pt-5 md:grid-cols-2 lg:grid-cols-3">
            {CREATOR_JOURNEY.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="font-display text-3xl font-bold leading-none text-accent" aria-hidden="true">{index + 1}</span>
                <div>
                  <h3 className="text-sm font-semibold leading-6 text-charcoal">{step.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-charcoal-2">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <PublicLegalFooter />
    </div>
  );
}
