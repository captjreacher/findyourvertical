import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCreatorSession } from './CreatorGate';
import { getMyPersona } from '@/lib/creators-api';
import { RANK_LABEL, type PersonaRank } from '@/lib/persona-portfolio';
import type { CreatorPersona } from '@/types/creator';
import brandLogo from '@/assets/fyv-brand-logo.png';

const RANK_BADGE: Record<PersonaRank, string> = {
  primary: 'bg-accent/15 text-accent',
  secondary: 'bg-warn/10 text-warn',
  third: 'bg-success/15 text-success',
};

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-charcoal-2">{label}</div>
      <p className="mt-1 text-sm leading-6 text-charcoal">{value}</p>
    </div>
  );
}

function ListField({ label, values }: { label: string; values?: string[] | null }) {
  if (!values || values.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-charcoal-2">{label}</div>
      <ul className="mt-1 flex flex-wrap gap-2">
        {values.map((value, index) => (
          <li key={index} className="rounded-full bg-surface-3/70 px-3 py-1 text-xs text-charcoal">{value}</li>
        ))}
      </ul>
    </div>
  );
}

export function PersonaDetail() {
  // Establish the creator session (RLS scope) even though we read by id.
  useCreatorSession();
  const { personaId } = useParams<{ personaId: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [persona, setPersona] = useState<CreatorPersona | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    (async () => {
      try {
        if (!personaId) throw new Error('This character could not be found.');
        const row = await getMyPersona(personaId);
        if (!mounted) return;
        if (!row) {
          setError('This character could not be found.');
          return;
        }
        setPersona(row);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'This character could not be loaded.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [personaId]);

  const profile = persona?.profile;

  return (
    <div className="min-h-screen bg-surface-2 text-charcoal">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={brandLogo} alt="Find Your Vertical" className="h-12 w-auto object-contain" />
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">Character detail</p>
          </div>
          <a href="#/my/personas" className="btn-secondary text-xs">Back to portfolio</a>
        </header>

        {loading && (
          <div className="animate-pulse rounded-2xl border border-white/10 bg-surface p-6 text-sm text-charcoal-2">
            Loading this character…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-pink/30 bg-pink/10 p-5 text-sm text-pink" role="alert">
            {error}
            <div className="mt-4"><a href="#/my/personas" className="btn-primary text-sm">Back to portfolio</a></div>
          </div>
        )}

        {!loading && !error && persona && (
          <article className="space-y-6">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-surface">
              <div className="flex aspect-[16/9] w-full items-center justify-center border-b border-dashed border-white/15 bg-surface-3/60 text-xs text-charcoal-2">
                Photo coming soon
              </div>
              <div className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${RANK_BADGE[persona.archetype_rank]}`}>
                    {RANK_LABEL[persona.archetype_rank]}
                  </span>
                  <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-charcoal-2">Draft</span>
                </div>
                <h1 className="mt-3 text-2xl font-bold leading-tight text-charcoal">{persona.display_name}</h1>
                <p className="mt-1 text-base font-medium text-accent">{persona.persona_title}</p>
                <p className="mt-1 text-xs text-charcoal-2">Based on the {persona.source_archetype} archetype</p>
                <p className="mt-3 text-sm leading-6 text-charcoal">{persona.one_line_premise}</p>
              </div>
            </div>

            <section className="grid gap-5 rounded-2xl border border-white/10 bg-surface p-5">
              <Field label="Apparent age / life stage" value={profile?.apparent_age_or_life_stage} />
              <Field label="Backstory" value={profile?.backstory} />
              <Field label="Current situation" value={profile?.current_situation} />
              <ListField label="Personality traits" values={profile?.personality_traits} />
              <Field label="What she wants" value={profile?.what_she_wants} />
              <Field label="Audience relationship" value={profile?.audience_relationship} />
              <Field label="Visual world" value={profile?.visual_world} />
              <ListField label="Typical locations" values={profile?.typical_locations} />
              <Field label="Wardrobe direction" value={profile?.wardrobe_direction} />
              <ListField label="Recurring story hooks" values={profile?.recurring_story_hooks} />
              <ListField label="Content boundaries" values={profile?.content_boundaries} />
              <Field label="Story progression" value={profile?.story_progression} />
            </section>

            <p className="text-xs text-charcoal-2">
              This is a read-only draft. Editing, personalising and activating characters comes in a later step.
            </p>
          </article>
        )}
      </div>
    </div>
  );
}
