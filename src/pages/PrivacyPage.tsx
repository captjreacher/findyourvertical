import { useEffect } from 'react';
import { PublicSiteShell } from '@/components/public/PublicSiteShell';

const EFFECTIVE_DATE = '16 July 2026';
const SITE_URL = 'https://findyourvertical.online/';
const CONTACT_EMAIL = 'privacy@maximisedai.com';

const PRIVACY_SECTIONS = [
  {
    title: '1. Introduction',
    body: [
      `Find Your Vertical is operated within the Maximised AI ecosystem. This Privacy Policy explains how FYV handles information when you use ${SITE_URL}, creator assessments, onboarding, reports, creator accounts, and related services.`,
      `Effective date: ${EFFECTIVE_DATE}. Privacy questions can be sent to ${CONTACT_EMAIL}.`,
    ],
  },
  {
    title: '2. Scope',
    body: [
      'This policy applies to the public site, assessments, creator accounts, onboarding flows, reports, creator profiles, agency relationship workflows, invitation links, and related FYV services.',
    ],
  },
  {
    title: '3. Information We Collect',
    body: [
      'Depending on how you use FYV, we may collect name, email address, creator handle or public profile name, assessment responses, onboarding information, selected verticals, character or persona information, reports and recommendations, account and authentication details, relationship and invitation information, communications and support requests, and technical information such as device, browser, IP address, logs, timestamps, and usage events.',
    ],
  },
  {
    title: '4. Authentication',
    body: [
      'FYV may support email and password sign-in, magic links, and Google Sign-In through Supabase Auth. Google Sign-In is used for basic identity information only, which may include your name, verified email address, and profile image.',
      'FYV does not request access to Gmail, Drive, Calendar, Contacts, YouTube, or other Google product data.',
    ],
  },
  {
    title: '5. How Information Is Used',
    body: [
      'We use information to provide assessments, generate reports, recommend verticals, support character and persona planning, manage onboarding, manage creator-agency relationships, authenticate users, prevent fraud and misuse, maintain service reliability, provide support, improve the product, and comply with legal obligations.',
    ],
  },
  {
    title: '6. AI and Automated Outputs',
    body: [
      'FYV may use AI or automated systems to analyse submitted information and produce recommendations, assessments, reports, or suggested character directions. These outputs support decision-making and are not guaranteed outcomes. Human review may be involved where appropriate.',
    ],
  },
  {
    title: '7. Service Providers',
    body: [
      'FYV uses service providers where needed to operate the product. Current infrastructure and operational providers include Supabase for authentication and database services, Cloudflare for hosting and delivery, Google for Google Sign-In, and email delivery infrastructure used to send invitations or account messages.',
    ],
  },
  {
    title: '8. Sharing and Disclosure',
    body: [
      'FYV does not sell your information. Information may be shared with service providers, authorised agencies, or operational partners where you have a creator relationship with them. Information may also be disclosed where needed for legal, security, fraud-prevention, account, or operational reasons.',
    ],
  },
  {
    title: '9. Data Storage and Security',
    body: [
      'FYV uses reasonable technical and organisational safeguards to protect information. No system is completely secure, and authentication and platform infrastructure are provided through third-party services such as Supabase and Cloudflare.',
    ],
  },
  {
    title: '10. Data Retention',
    body: [
      'Information is retained while necessary to operate accounts and services. Some records may be retained for security, legal, dispute, audit, or operational reasons. Retention periods can vary by record type.',
    ],
  },
  {
    title: '11. User Rights and Choices',
    body: [
      'You may request access, correction, deletion, or a change to consent where applicable. You may also disconnect or stop using Google Sign-In. Requests can be sent to FYV using the contact details below, and we will handle them in line with applicable law and operational requirements.',
    ],
  },
  {
    title: '12. Cookies and Local Storage',
    body: [
      'FYV uses necessary technical storage, including authentication cookies or tokens and browser storage such as local storage or session storage, to keep users signed in, preserve redirect state, and maintain product workflows. FYV does not claim advertising-cookie use for this application.',
    ],
  },
  {
    title: '13. Children',
    body: [
      'FYV is not intended for children. The service should only be used by people who are legally able to use it and provide the information requested.',
    ],
  },
  {
    title: '14. International Processing',
    body: [
      'FYV and its providers may process information in jurisdictions outside your country. Those jurisdictions may have different privacy and data protection laws.',
    ],
  },
  {
    title: '15. Changes to This Policy',
    body: [
      'FYV may update this Privacy Policy from time to time. When it changes, the effective date on this page will be updated.',
    ],
  },
  {
    title: '16. Contact',
    body: [
      `For privacy questions or requests, contact ${CONTACT_EMAIL}.`,
    ],
  },
];

function usePageMeta() {
  useEffect(() => {
    document.title = 'Privacy Policy | Find Your Vertical';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = 'Find Your Vertical Privacy Policy for assessments, creator accounts, reports, onboarding, and Google Sign-In.';
  }, []);
}

export function PrivacyPage() {
  usePageMeta();

  return (
    <PublicSiteShell
      eyebrow="Privacy Policy"
      title="Privacy built for creator workflows."
      description="A plain-English summary of how FYV handles information across assessments, authentication, reports, onboarding, and creator operations."
    >
      <div className="fyv-public-prose grid gap-4">
        {PRIVACY_SECTIONS.map(section => (
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
        <h2 className="text-2xl font-bold text-white">17. Wider Maximised AI Policy</h2>
        <p className="mt-3 text-sm">
          FYV is part of the Maximised AI ecosystem. You can also review the wider Maximised AI privacy policy at{' '}
          <a href="https://www.maximisedai.com/privacy/" target="_blank" rel="noopener noreferrer">
            maximisedai.com/privacy
          </a>.
        </p>
      </section>
    </PublicSiteShell>
  );
}
