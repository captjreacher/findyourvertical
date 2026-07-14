import { PublicSiteShell } from '@/components/public/PublicSiteShell';

const ITEMS = [
  {
    title: 'Information we use',
    body:
      'We use the information you provide during assessment, onboarding, account management, and support interactions to deliver the product and maintain access control.',
  },
  {
    title: 'Authentication data',
    body:
      'Sign-in credentials are handled by Supabase Auth. FYV does not store passwords in application tables, logs, or browser storage.',
  },
  {
    title: 'Product analytics and events',
    body:
      'We record limited product events needed to support creator workflows, reporting, and operational integrity. Sensitive tokens and secrets are not logged.',
  },
];

export function PrivacyPage() {
  return (
    <PublicSiteShell
      eyebrow="Privacy"
      title="Privacy built for creator workflows."
      description="This page summarises how FYV handles information across assessments, authentication, and creator operations."
    >
      <div className="grid gap-4">
        {ITEMS.map(item => (
          <article key={item.title} className="fyv-report-card rounded-2xl p-5">
            <h2 className="font-display text-2xl font-semibold text-charcoal">{item.title}</h2>
            <p className="mt-3 text-sm leading-6 text-charcoal-2">{item.body}</p>
          </article>
        ))}
      </div>

      <section className="fyv-report-card rounded-2xl p-5">
        <h2 className="font-display text-2xl font-semibold text-charcoal">Need a deeper review?</h2>
        <p className="mt-3 text-sm leading-6 text-charcoal-2">
          If you need a formal privacy assessment, security review, or data request, contact the FYV team through the
          support channel used for your account or invitation.
        </p>
      </section>
    </PublicSiteShell>
  );
}
