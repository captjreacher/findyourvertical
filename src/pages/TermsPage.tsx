import { PublicSiteShell } from '@/components/public/PublicSiteShell';

const TERMS = [
  {
    title: 'Invitation-only access',
    body:
      'Creator accounts are provisioned through invitation or approved relationship. FYV does not offer open public creator signup.',
  },
  {
    title: 'Acceptable use',
    body:
      'Use the product lawfully and do not attempt to access other accounts, bypass access controls, or submit content that would compromise the service.',
  },
  {
    title: 'Service changes',
    body:
      'Product features, pricing, and workflows can change over time as the system evolves. FYV may update these terms to reflect those changes.',
  },
];

export function TermsPage() {
  return (
    <PublicSiteShell
      eyebrow="Terms"
      title="Clear terms for a creator-first product."
      description="These terms describe how you can use FYV and what to expect from invitation-based creator access."
    >
      <div className="grid gap-4">
        {TERMS.map(term => (
          <article key={term.title} className="fyv-report-card rounded-2xl p-5">
            <h2 className="font-display text-2xl font-semibold text-charcoal">{term.title}</h2>
            <p className="mt-3 text-sm leading-6 text-charcoal-2">{term.body}</p>
          </article>
        ))}
      </div>

      <section className="fyv-report-card rounded-2xl p-5">
        <h2 className="font-display text-2xl font-semibold text-charcoal">Questions</h2>
        <p className="mt-3 text-sm leading-6 text-charcoal-2">
          If you have questions about these terms, ask the FYV team through your normal support or account channel.
        </p>
      </section>
    </PublicSiteShell>
  );
}
