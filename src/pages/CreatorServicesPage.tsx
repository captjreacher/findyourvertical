import { useSearchParams } from 'react-router-dom';

const SERVICES = [
  {
    title: 'Creator Strategy Session',
    description:
      'A focused strategy session to identify your highest-impact growth levers, assess your positioning, and prioritise your next 90 days.',
    price: 'From $297',
  },
  {
    title: 'Profile & Offer Setup',
    description:
      'Optimise your bio, pinned content, link-in-bio, and first paid offer so fans convert from casual viewer to subscriber.',
    price: 'From $497',
  },
  {
    title: 'Content Direction',
    description:
      'Define 3 repeatable content lanes matched to your archetype and audience strategy, with format specs and posting cadence.',
    price: 'From $397',
  },
  {
    title: 'Chat / Fan Engagement Automation',
    description:
      'Set up automated welcome sequences, FAQ responses, and engagement triggers that keep fans connected between posts.',
    price: 'From $597/mo',
  },
  {
    title: 'Growth & Monetisation Review',
    description:
      'Monthly review of your content performance, revenue metrics, and growth opportunities with actionable recommendations.',
    price: 'From $497/mo',
  },
];

const REPORT_CARD_CLASS = 'fyv-report-card rounded-xl p-5';
const REPORT_TEXT_CLASS = 'text-sm leading-6 text-charcoal-2';
const REPORT_HEADING_CLASS = 'font-display font-semibold text-charcoal';

export function CreatorServicesPage() {
  const [params] = useSearchParams();
  const profileId = params.get('profileId');
  const reportSlug = params.get('reportSlug');

  const onboardingParams = new URLSearchParams();
  if (profileId) onboardingParams.set('profileId', profileId);
  if (reportSlug) onboardingParams.set('reportSlug', reportSlug);
  const onboardingQs = onboardingParams.toString();
  const onboardingUrl = `/creator-services/onboarding${onboardingQs ? `?${onboardingQs}` : ''}`;

  return (
    <div className="fyv-report-shell min-h-screen text-charcoal">
      <div className="border-b border-white/10 bg-surface/80">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Creator Services
          </p>
          <h1 className="font-display text-4xl font-bold mb-3 text-charcoal">
            Creator Services
          </h1>
          <p className="max-w-xl text-base leading-7 text-charcoal-2">
            Services shaped around your Find Your Vertical assessment result. Each
            engagement starts with your report as the baseline so we build from
            what you already know about your positioning.
          </p>
          {profileId && reportSlug && (
            <p className="mt-3 text-xs text-charcoal-2">
              Assessment context: profile {profileId.slice(0, 8)}&hellip; &middot;{' '}
              report {reportSlug}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        <section>
          <h2 className={`${REPORT_HEADING_CLASS} mb-4 text-xl`}>
            Available Services
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {SERVICES.map((svc) => (
              <div key={svc.title} className={REPORT_CARD_CLASS}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-charcoal">{svc.title}</h3>
                  <span className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
                    {svc.price}
                  </span>
                </div>
                <p className={`${REPORT_TEXT_CLASS} mt-2`}>{svc.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          className={`${REPORT_CARD_CLASS} border border-amber-500/30 bg-amber-500/5`}
        >
          <h2 className={`${REPORT_HEADING_CLASS} mb-3 text-lg`}>
            Billing is not active yet
          </h2>
          <p className={REPORT_TEXT_CLASS}>
            These services are listed for transparency. Billing, scheduling, and
            fulfilment workflows are being built. No payment will be taken on
            this page — the Start Creator Onboarding button below registers your
            interest and reserves your place.
          </p>
        </section>

        <section className={`${REPORT_CARD_CLASS} border-accent/40 bg-accent/10`}>
          <h2 className={`${REPORT_HEADING_CLASS} mb-3 text-xl`}>
            Ready to get started?
          </h2>
          <p className={REPORT_TEXT_CLASS}>
            Click below to begin your creator onboarding. Your assessment context
            will be carried forward so your services workspace is set up around
            your result from day one.
          </p>
          <a
            href={`/#${onboardingUrl}`}
            className="mt-4 inline-flex rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-2"
          >
            Start Creator Onboarding
          </a>
        </section>
      </div>
    </div>
  );
}
