import { useEffect } from 'react';
import { PublicSiteShell } from '@/components/public/PublicSiteShell';

const SECTIONS = [
  {
    title: 'What Find My Vertical Does',
    body:
      'Find My Vertical gives creators a structured way to understand where they are strongest, what content directions fit them best, and which growth paths are worth prioritising. It turns assessment answers into creator intelligence that can guide positioning, vertical selection, and the next practical steps.',
  },
  {
    title: 'From Assessment to Action',
    body:
      'Creators can move from an invitation-based assessment into a personalised report, onboarding, persona or character planning, and clearer recommendations for what to build next. The goal is to make the path forward feel specific, useful, and grounded in what the creator has actually shared.',
  },
  {
    title: 'A Self-Service Digital Product',
    body:
      'Build your Personal Vertical Plan through guided steps and embedded AI assistance: vertical strategy, content schedule, scripts, experiments and next actions. Follow digital pricing and access status in your account.',
  },
  {
    title: 'What We Believe',
    body:
      'Sustainable creator growth is easier when creators understand their lane, their audience fit, and the kind of persona or character direction they can keep showing up for. FYV is designed to support better decisions, not generic content advice.',
  },
  {
    title: 'Part of the Maximised AI Ecosystem',
    body:
      'Find My Vertical operates within the Maximised AI ecosystem, connecting creator strategy, assessment intelligence, onboarding, and self-service planning into one coherent experience.',
  },
];

function usePageMeta() {
  useEffect(() => {
    document.title = 'About Us | Find My Vertical';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = 'Learn how Find My Vertical helps creators identify verticals, plan personas, and move from assessment to action.';
  }, []);
}

export function AboutPage() {
  usePageMeta();

  return (
    <PublicSiteShell
      eyebrow="About FYV"
      title="Creator intelligence for finding the right vertical."
      description="Find My Vertical helps creators turn structured assessment insight into clearer positioning, onboarding, and growth decisions."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.slice(0, 4).map(section => (
          <article key={section.title} className="fyv-public-card-muted rounded-2xl p-5">
            <h2 className="text-xl font-bold text-white">{section.title}</h2>
            <p className="mt-3 text-sm leading-7 text-charcoal">{section.body}</p>
          </article>
        ))}
      </div>

      <section className="fyv-public-card rounded-2xl p-6">
        <h2 className="text-2xl font-bold text-white">{SECTIONS[4].title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-charcoal">{SECTIONS[4].body}</p>
        <a
          href="https://www.maximisedai.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex text-sm font-semibold text-accent transition-colors hover:text-white"
        >
          Visit Maximised AI
        </a>
      </section>
    </PublicSiteShell>
  );
}
