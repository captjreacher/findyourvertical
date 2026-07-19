import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PublicSiteShell } from '@/components/public/PublicSiteShell';

const CONTACT_EMAIL = 'privacy@maximisedai.com';

const TERMS_SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    body: [
      'By using Find Your Vertical, you accept these Terms of Service. If you do not agree, you should not use the service.',
    ],
  },
  {
    title: '2. Operator',
    body: [
      'Find Your Vertical is operated within the Maximised AI ecosystem. These terms apply to FYV and related creator services made available through the platform.',
    ],
  },
  {
    title: '3. Service Description',
    body: [
      'FYV provides creator assessments, reports, creator intelligence, vertical recommendations, persona or character planning, onboarding, creator-agency relationship workflows, and related support and operational tools.',
    ],
  },
  {
    title: '4. Eligibility',
    body: [
      'You must be legally able to enter into this agreement and provide accurate information. Creator access may be invitation-only, relationship-based, or subject to an approved onboarding state.',
    ],
  },
  {
    title: '5. Accounts and Authentication',
    body: [
      'Account credentials and access links are personal to you. You are responsible for protecting passwords, magic links, and Google sign-in access, and for activity under your account. Notify FYV if you suspect unauthorised access.',
      'FYV may support Google, magic-link, and password sign-in.',
    ],
  },
  {
    title: '6. Invitation-Only and Restricted Access',
    body: [
      'Authentication alone does not guarantee creator access. Creator access may require an invitation, accepted relationship, or approved onboarding state. FYV may refuse, limit, or revoke access where appropriate.',
    ],
  },
  {
    title: '7. Acceptable Use',
    body: [
      'You must not use FYV for unlawful activity, unauthorised access, impersonation, scraping or automated abuse, bypassing security, uploading infringing material, malware or harmful code, disrupting the platform, or using outputs to harass, exploit, or mislead others.',
    ],
  },
  {
    title: '8. User Content and Submitted Information',
    body: [
      'You retain ownership of the content and information you submit. You grant FYV a limited licence to process and use that information to provide, secure, support, and improve the service. You must have the right to submit the information and are responsible for its accuracy and legality.',
    ],
  },
  {
    title: '9. Assessments, Recommendations, and AI Outputs',
    body: [
      'FYV outputs are informational and based on available information. They may be incomplete, uncertain, or incorrect. They do not guarantee income, audience growth, platform acceptance, business success, or commercial outcomes. You remain responsible for your decisions and actions.',
    ],
  },
  {
    title: '10. Creator and Agency Relationships',
    body: [
      'FYV may facilitate creator relationships, onboarding, and operational workflows. FYV does not guarantee the conduct, performance, payment, or outcomes of creators, agencies, or third parties. Separate agreements may govern those relationships.',
    ],
  },
  {
    title: '11. Intellectual Property',
    body: [
      'The FYV platform, software, branding, methods, templates, generated presentation formats, and related materials belong to Maximised AI or its licensors. You may not copy, reverse engineer, resell, or reproduce the platform except where allowed by law or written permission.',
    ],
  },
  {
    title: '12. Third-Party Services',
    body: [
      'FYV may use or link to third-party services such as Supabase, Google, Cloudflare, and external websites. Third-party terms may also apply. FYV is not responsible for third-party availability, content, or conduct.',
    ],
  },
  {
    title: '14. Service Availability and Changes',
    body: [
      'Features may be added, removed, changed, suspended, or discontinued. FYV does not guarantee uninterrupted or error-free service, and maintenance may occur.',
    ],
  },
  {
    title: '15. Fees and Paid Services',
    body: [
      'Some FYV services may be paid. Pricing and commercial terms may be presented separately. Users remain responsible for fees they agree to pay.',
    ],
  },
  {
    title: '16. Suspension and Termination',
    body: [
      'FYV may suspend or terminate access for misuse, security concerns, non-payment, legal reasons, or operational risk. You may stop using the service at any time. Obligations that should reasonably survive termination will continue to apply.',
    ],
  },
  {
    title: '17. Disclaimers',
    body: [
      'FYV is provided on an as-available basis. Outputs are not legal, financial, tax, employment, or other professional advice. You should obtain professional advice where appropriate.',
    ],
  },
  {
    title: '18. Limitation of Liability',
    body: [
      'To the extent permitted by law, FYV and Maximised AI are not liable for indirect losses, lost profits, lost data, platform decisions, creator outcomes, or third-party conduct. Liability is limited in a reasonable way according to the nature of the service and applicable law.',
    ],
  },
  {
    title: '19. Indemnity',
    body: [
      'You agree to take responsibility for claims, losses, or costs that arise from your misuse of FYV, unlawful content you submit, or breach of these terms.',
    ],
  },
  {
    title: '20. Governing Law',
    body: [
      'These terms are governed by New Zealand law, unless a mandatory law requires otherwise.',
    ],
  },
  {
    title: '21. Changes to Terms',
    body: [
      'FYV may update these terms from time to time. Continued use after updates may constitute acceptance where legally permitted.',
    ],
  },
  {
    title: '22. Contact',
    body: [
      `Questions about these terms can be sent to ${CONTACT_EMAIL}.`,
    ],
  },
];

function usePageMeta() {
  useEffect(() => {
    document.title = 'Terms of Service | Find Your Vertical';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = 'Find Your Vertical Terms of Service for creator assessments, reports, onboarding, accounts, and creator-agency workflows.';
  }, []);
}

export function TermsPage() {
  usePageMeta();

  return (
    <PublicSiteShell
      eyebrow="Terms of Service"
      title="Clear terms for a creator-first product."
      description="These terms describe how FYV can be used, how invitation-based creator access works, and what to expect from assessments, reports, and creator workflows."
    >
      <div className="fyv-public-prose grid gap-4">
        {TERMS_SECTIONS.slice(0, 12).map(section => (
          <article key={section.title} className="fyv-public-card-muted rounded-2xl p-5">
            <h2 className="text-xl font-bold text-white">{section.title}</h2>
            <div className="mt-3 space-y-3 text-sm">
              {section.body.map(paragraph => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </article>
        ))}

        <article className="fyv-public-card-muted rounded-2xl p-5">
          <h2 className="text-xl font-bold text-white">13. Privacy</h2>
          <p className="mt-3 text-sm">
            FYV handles personal information according to the{' '}
            <Link to="/privacy">Privacy Policy</Link>.
          </p>
        </article>

        {TERMS_SECTIONS.slice(12).map(section => (
          <article key={section.title} className="fyv-public-card-muted rounded-2xl p-5">
            <h2 className="text-xl font-bold text-white">{section.title}</h2>
            <div className="mt-3 space-y-3 text-sm">
              {section.body.map(paragraph => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </article>
        ))}
      </div>

      <section className="fyv-public-card rounded-2xl p-6 fyv-public-prose">
        <h2 className="text-2xl font-bold text-white">23. Wider Maximised AI Terms</h2>
        <p className="mt-3 text-sm">
          FYV operates within the Maximised AI ecosystem. You can also review the wider Maximised AI service terms at{' '}
          <a href="https://www.maximisedai.com/services/terms/" target="_blank" rel="noopener noreferrer">
            maximisedai.com/services/terms
          </a>.
        </p>
      </section>
    </PublicSiteShell>
  );
}
