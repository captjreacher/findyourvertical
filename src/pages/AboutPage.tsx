import { PublicSiteShell } from '@/components/public/PublicSiteShell';

const SECTIONS = [
  {
    title: 'What Find Your Vertical does',
    body:
      'FYV helps creators understand their positioning, identify the content directions most likely to perform, and move from assessment into a clearer plan for growth.',
  },
  {
    title: 'How the product works',
    body:
      'Creators complete an assessment, receive a report, and can continue into onboarding, persona planning, or creator services. Agency users have a separate cockpit for operational workflows.',
  },
  {
    title: 'How access works',
    body:
      'Creator access is invitation-based. Existing creators can sign in with Google, email/password, or a magic link. New creator access still requires an invitation or approved relationship.',
  },
];

export function AboutPage() {
  return (
    <PublicSiteShell
      eyebrow="About FYV"
      title="Built to help creators find the lane that fits."
      description="Find Your Vertical is the assessment and onboarding layer for creators and the teams who support them."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {SECTIONS.map(section => (
          <article key={section.title} className="fyv-report-card rounded-2xl p-5">
            <h2 className="font-display text-xl font-semibold text-charcoal">{section.title}</h2>
            <p className="mt-3 text-sm leading-6 text-charcoal-2">{section.body}</p>
          </article>
        ))}
      </div>

      <section className="fyv-report-card rounded-2xl p-5">
        <h2 className="font-display text-2xl font-semibold text-charcoal">What makes FYV different</h2>
        <p className="mt-3 text-sm leading-6 text-charcoal-2">
          FYV is designed around creator-specific decision support rather than generic content advice. The goal is to
          surface practical next steps, not just a score.
        </p>
      </section>
    </PublicSiteShell>
  );
}
