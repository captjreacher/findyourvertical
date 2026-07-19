import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import brandLogo from '@/assets/fyv-brand-logo.png';
import { PublicLegalFooter } from '@/components/public/PublicSiteShell';

const PAGE_TITLE = 'Find Your Vertical | Creator Assessment and Vertical Discovery';
const PAGE_DESCRIPTION =
  'Find Your Vertical is a creator assessment and planning application that helps invited creators understand their strengths, discover suitable content verticals and turn their results into practical next steps.';

const HOW_IT_WORKS = [
  'Complete your creator assessment.',
  'Explore content verticals matched to your strengths and goals.',
  'Turn your results into creator profiles and practical next steps.',
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
    setMetaByName('application-name', 'Find Your Vertical');
    setMetaByProperty('og:site_name', 'Find Your Vertical');
    setMetaByProperty('og:title', 'Find Your Vertical');
  }, []);
}

export function PublicHomePage() {
  usePublicHomeMeta();

  return (
    <div className="fyv-public-shell flex min-h-screen flex-col bg-surface-2 text-charcoal">
      <header className="border-b border-white/10 bg-black/85 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
          <Link to="/" aria-label="Find Your Vertical home" className="flex items-center gap-3">
            <img src={brandLogo} alt="Find Your Vertical" className="fyv-logo-mark h-16 w-auto object-contain sm:h-20" />
            <span className="hidden font-display text-base font-bold leading-tight text-charcoal sm:block">
              Find the Creator in You
            </span>
          </Link>
          <Link to="/auth/login" className="btn-primary min-h-11 px-5">Creator Login</Link>
        </div>
      </header>

      <main aria-labelledby="public-home-title" className="flex-1 px-4 py-6 sm:px-6 lg:py-8">
        <section className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.06fr_0.94fr] lg:items-center">
          <div className="py-3 sm:py-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Creator Assessment</p>
            <h1 id="public-home-title" className="mt-4 max-w-3xl font-display text-4xl font-bold leading-tight text-charcoal sm:text-5xl lg:text-6xl">
              Find Your Vertical
            </h1>
            <p className="mt-3 font-display text-2xl font-bold text-charcoal sm:text-3xl">
              Find the Creator in You
            </p>

            <section className="mt-5 max-w-3xl rounded-2xl border border-white/10 bg-surface/80 p-5 shadow-xl shadow-black/20" aria-labelledby="homepage-purpose-title">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-success">Purpose</p>
              <h2 id="homepage-purpose-title" className="mt-2 text-xl font-bold text-charcoal">
                Creator assessment and vertical discovery
              </h2>
              <p className="mt-3 text-sm leading-7 text-charcoal-2 sm:text-base">
                Find Your Vertical is a creator assessment and planning application for invited creators. It helps creators understand their strengths, discover content verticals suited to their interests and goals, and turn their assessment results into character profiles, reports and practical next steps.
              </p>
              <div className="mt-5 border-t border-white/10 pt-5">
                <h3 className="text-base font-bold text-charcoal">How Find Your Vertical works</h3>
                <ol className="mt-3 grid gap-3">
                  {HOW_IT_WORKS.map((step, index) => (
                    <li key={step} className="flex gap-3 text-sm font-semibold leading-6 text-charcoal">
                      <span className="font-display text-xl font-bold leading-6 text-accent" aria-hidden="true">{index + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </section>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link to="/auth/login" className="btn-primary min-h-12 px-6 text-base">Creator Sign In</Link>
              <Link to="/about" className="btn-secondary min-h-12 px-6 text-base">Learn About FYV</Link>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-surface/92 p-5 shadow-2xl shadow-black/25 sm:p-6">
            <img src={brandLogo} alt="Find Your Vertical" className="fyv-logo-mark mx-auto h-28 w-auto object-contain sm:h-36" />
            <div className="mt-6 grid gap-3">
              {['Strength discovery', 'Vertical matching', 'Reports and next steps'].map(item => (
                <div key={item} className="rounded-xl border border-white/10 bg-surface-3/80 px-4 py-3 text-sm font-semibold text-charcoal">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto mt-8 w-full max-w-6xl rounded-2xl border border-white/10 bg-surface/80 p-5 shadow-xl shadow-black/20 sm:p-6 lg:mt-10" aria-labelledby="planning-title">
          <div className="flex flex-col gap-2 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-success">Planning outputs</p>
              <h2 id="planning-title" className="mt-2 text-2xl font-bold text-charcoal">
                From assessment to next steps
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-charcoal-2">
              A compact path from assessment answers to creator planning.
            </p>
          </div>
          <ol className="grid gap-0 md:grid-cols-3">
            {['Strength discovery', 'Content vertical matching', 'Reports, profiles and actions'].map((step, index) => (
              <li key={step} className="flex gap-4 border-b border-white/10 py-5 last:border-b-0 md:border-b-0 md:border-r md:px-5 md:first:pl-0 md:last:border-r-0 md:last:pr-0">
                <span className="font-display text-3xl font-bold leading-none text-accent" aria-hidden="true">{index + 1}</span>
                <p className="text-sm font-semibold leading-6 text-charcoal">{step}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <PublicLegalFooter />
    </div>
  );
}
