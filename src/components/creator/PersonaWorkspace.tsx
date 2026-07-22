import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreatorSession } from './CreatorGate';
import {
  getActivePersonaGeneration,
  getPersonasForGeneration,
  recordPersonaPortfolioViewed,
  generateMyPersonaPortfolio,
} from '@/lib/creators-api';
import { groupPersonasByRank, RANK_LABEL, type PersonaRank } from '@/lib/persona-portfolio';
import { listMyCharacterProfiles, type CharacterLifecycleStatus } from '@/lib/character-service';
import type { CreatorPersona, CreatorPersonaGeneration } from '@/types/creator';
import brandLogo from '@/assets/fyv-brand-logo.png';

const RANK_BADGE: Record<PersonaRank, string> = {
  primary: 'bg-accent/15 text-accent',
  secondary: 'bg-warn/10 text-warn',
  third: 'bg-success/15 text-success',
};

const STATUS_STYLE: Record<CharacterLifecycleStatus, string> = {
  draft: 'bg-white/5 text-charcoal-2',
  active: 'bg-success/15 text-success',
  archived: 'bg-surface-3 text-charcoal-2/70',
};

const STATUS_LABEL: Record<CharacterLifecycleStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
};

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

/** Map source_variation_id → variation name from the immutable input snapshot. */
function sourceNameMap(generation: CreatorPersonaGeneration | null): Map<string, string> {
  const map = new Map<string, string>();
  const sources = (generation?.input_snapshot as { source_set?: unknown })?.source_set;
  if (Array.isArray(sources)) {
    for (const entry of sources) {
      const s = entry as { variation_id?: unknown; name?: unknown };
      if (typeof s.variation_id === 'string' && typeof s.name === 'string') {
        map.set(s.variation_id, s.name);
      }
    }
  }
  return map;
}

export function PersonaWorkspace() {
  const { profile } = useCreatorSession();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generation, setGeneration] = useState<CreatorPersonaGeneration | null>(null);
  const [personas, setPersonas] = useState<CreatorPersona[]>([]);
  const [characterStatusMap, setCharacterStatusMap] = useState<Map<string, CharacterLifecycleStatus>>(new Map());
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [gen, cProfiles] = await Promise.all([
        getActivePersonaGeneration(profile.id),
        listMyCharacterProfiles(profile.id).catch(() => []),
      ]);
      setGeneration(gen);
      // Build status map: persona_id → lifecycle status
      const statusMap = new Map<string, CharacterLifecycleStatus>();
      for (const cp of cProfiles) {
        statusMap.set(cp.persona_id, cp.status);
      }
      setCharacterStatusMap(statusMap);
      if (gen?.status === 'completed') {
        const rows = await getPersonasForGeneration(gen.id);
        setPersonas(rows);
        // Best-effort audit; never blocks the view.
        void recordPersonaPortfolioViewed(gen.id).catch(() => undefined);
      } else {
        setPersonas([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not load your character portfolio.');
    } finally {
      setLoading(false);
    }
  }, [profile.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const variationNames = useMemo(() => sourceNameMap(generation), [generation]);
  const groups = useMemo(() => groupPersonasByRank(personas), [personas]);

  // Derive portfolio counters from status map.
  const portfolioSummary = useMemo(() => {
    const counts = { draft: 0, active: 0, archived: 0 };
    for (const persona of personas) {
      const status = characterStatusMap.get(persona.id) ?? 'draft';
      counts[status]++;
    }
    return counts;
  }, [personas, characterStatusMap]);

  const hasActiveCharacter = portfolioSummary.active > 0;
  const statusForPersona = useCallback(
    (personaId: string): CharacterLifecycleStatus => characterStatusMap.get(personaId) ?? 'draft',
    [characterStatusMap],
  );

  const handleRetry = async () => {
    if (!generation) return;
    setRetrying(true);
    setRetryError(null);
    try {
      await generateMyPersonaPortfolio(generation.snapshot_id);
      await load();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'We could not rebuild your portfolio. Please try again.');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-2 text-charcoal">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={brandLogo} alt="Find Your Vertical" className="h-14 w-auto object-contain" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">Your Character Portfolio</p>
              <h1 className="text-2xl font-bold leading-tight text-charcoal">
                {personas.length} Character{personas.length === 1 ? '' : 's'}
              </h1>
            </div>
          </div>
          <a href="#/my" className="btn-secondary text-xs">Back to My Vertical</a>
        </header>

        <p className="mb-6 max-w-2xl text-sm leading-6 text-charcoal-2">
          These six draft characters were created from your assessment and the creative directions you selected. Each is
          a distinct facet of you — not six different people. You'll personalise and activate them in the next step.
        </p>

        {loading && (
          <div className="animate-pulse rounded-2xl border border-white/10 bg-surface p-6 text-sm text-charcoal-2">
            Loading your character portfolio…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-pink/30 bg-pink/10 p-5 text-sm text-pink" role="alert">{error}</div>
        )}

        {!loading && !error && !generation && (
          <div className="rounded-2xl border border-white/10 bg-surface p-6">
            <h2 className="text-lg font-bold text-charcoal">No character portfolio yet</h2>
            <p className="mt-2 text-sm text-charcoal-2">
              Finish choosing your character possibilities, then create your portfolio to see six draft characters here.
            </p>
            <a href="#/my/characters" className="btn-primary mt-4 text-sm">Go to Build Your Character Possibilities</a>
          </div>
        )}

        {!loading && !error && generation && generation.status !== 'completed' && (
          <div className="rounded-2xl border border-white/10 bg-surface p-6">
            {generation.status === 'generating' || generation.status === 'pending' ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                  <h2 className="text-lg font-bold text-charcoal">Building your characters…</h2>
                </div>
                <p className="mt-2 text-sm text-charcoal-2">
                  We're turning your selected creative directions into six distinct characters. This usually takes under a
                  minute. Refresh to check progress.
                </p>
                <button onClick={() => void load()} className="btn-secondary mt-4 text-sm">Refresh</button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-charcoal">That generation didn't finish</h2>
                <p className="mt-2 text-sm text-charcoal-2">
                  Something went wrong while building your portfolio and no characters were saved. You can try again.
                </p>
                {retryError && <p className="mt-3 text-sm text-pink" role="alert">{retryError}</p>}
                <button onClick={() => void handleRetry()} disabled={retrying} className="btn-primary mt-4 text-sm">
                  {retrying ? 'Rebuilding…' : 'Try again'}
                </button>
              </>
            )}
          </div>
        )}

        {!loading && !error && generation && generation.status === 'completed' && (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-surface px-5 py-3">
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-charcoal-2">
                Created {formatDate(generation.completed_at ?? generation.created_at)}
              </span>
              <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                {portfolioSummary.active} Active
              </span>
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-charcoal-2">
                {portfolioSummary.draft} Draft
              </span>
              {portfolioSummary.archived > 0 && (
                <span className="rounded-full bg-surface-3 px-3 py-1 text-xs font-semibold text-charcoal-2/70">
                  {portfolioSummary.archived} Archived
                </span>
              )}
              <span className="text-xs text-charcoal-2">· {personas.length} total</span>
            </div>

            <div className="space-y-6">
              {groups.map(group => (
                <section key={group.rank}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${RANK_BADGE[group.rank]}`}>
                      {RANK_LABEL[group.rank]}
                    </span>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-charcoal-2">
                      {group.items.length} of {group.expected}
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {group.items.map(persona => (
                      <button
                        key={persona.id}
                        type="button"
                        onClick={() => navigate(`/my/personas/${persona.id}`)}
                        className="fyv-persona-card group flex flex-col rounded-2xl border border-white/10 bg-surface text-left shadow-lg shadow-black/10 transition-colors hover:border-accent/70"
                      >
                        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-t-2xl border-b border-dashed border-white/15 bg-surface-3/60 text-xs text-charcoal-2">
                          Photo coming soon
                        </div>
                        <div className="flex flex-1 flex-col p-4">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-base font-bold leading-tight text-charcoal">{persona.display_name}</h3>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLE[statusForPersona(persona.id)]}`}>
                              {STATUS_LABEL[statusForPersona(persona.id)]}
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm font-medium text-accent">{persona.persona_title}</p>
                          <p className="mt-2 text-xs text-charcoal-2">
                            {persona.source_archetype}
                            {variationNames.get(persona.source_variation_id)
                              ? ` · ${variationNames.get(persona.source_variation_id)}`
                              : ''}
                          </p>
                          <p className="mt-2 line-clamp-3 text-sm leading-6 text-charcoal-2">{persona.one_line_premise}</p>
                          {persona.profile?.backstory && (
                            <p className="mt-2 line-clamp-2 text-xs leading-5 text-charcoal-2/80">{persona.profile.backstory}</p>
                          )}
                          <span className="mt-3 text-xs font-semibold text-accent group-hover:underline">View character →</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <p className="mt-6 text-xs text-charcoal-2">
              {hasActiveCharacter
                ? 'Active characters are ready to brief. You can continue editing, archiving completed directions, or activating more drafts.'
                : 'These are drafts, not active public profiles. Nothing here is connected to any platform. Open a character to personalise and activate it.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
