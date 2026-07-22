import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCreatorSession } from './CreatorGate';
import { getMyPersona } from '@/lib/creators-api';
import { RANK_LABEL, type PersonaRank } from '@/lib/persona-portfolio';
import type { CreatorPersona } from '@/types/creator';
import {
  ensureCharacterProfile,
  updateCharacterProfile,
  transitionCharacterStatus,
  deleteCharacterProfile,
  getCharacterVersionHistory,
  getContentIdeas,
  regenerateIdeaGroup,
  getMonetisationSuggestions,
  deriveGrowthOpportunities,
  type CharacterProfileSettings,
  type CharacterLifecycleStatus,
  type CharacterProfilePatch,
  type CharacterVersionEntry,
  type ContentIdeaGroup,
  type MonetisationSuggestion,
  type GrowthOpportunity,
} from '@/lib/character-service';
import { RecommendationEvidenceSection } from '@/components/recommendations/RecommendationEvidenceSection';
import {
  listMyLiveEvidence,
  STATUS_PRESENTATION,
  type RecommendationEvidence,
  type ValidationStatus,
} from '@/lib/recommendations';
import brandLogo from '@/assets/fyv-brand-logo.png';

// ── Constants ────────────────────────────────────────────────────────────────

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

type DetailTab = 'overview' | 'brand' | 'tone' | 'pillars' | 'visual' | 'ideas' | 'monetisation' | 'growth';

const TAB_LABELS: Record<DetailTab, string> = {
  overview: 'Overview',
  brand: 'Brand Identity',
  tone: 'Tone of Voice',
  pillars: 'Content Pillars',
  visual: 'Visual Identity',
  ideas: 'Content Ideas',
  monetisation: 'Monetisation',
  growth: 'Growth Opportunities',
};

const TAB_ORDER: DetailTab[] = ['overview', 'brand', 'tone', 'pillars', 'visual', 'ideas', 'monetisation', 'growth'];

const TONE_OPTIONS = [
  'Playful', 'Confident', 'Educational', 'Flirty', 'Luxury', 'Minimalist',
  'Warm', 'Edgy', 'Professional', 'Casual', 'Dramatic', 'Mysterious',
];

// ── Component ────────────────────────────────────────────────────────────────

export function PersonaDetail() {
  const { profile } = useCreatorSession();
  const navigate = useNavigate();
  const { personaId } = useParams<{ personaId: string }>();

  // Data state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [persona, setPersona] = useState<CreatorPersona | null>(null);
  const [charProfile, setCharProfile] = useState<CharacterProfileSettings | null>(null);
  const [evidence, setEvidence] = useState<RecommendationEvidence | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');

  // Edit state — tracks in-progress edits per section
  const [editDirty, setEditDirty] = useState(false);
  const [editPersonality, setEditPersonality] = useState('');
  const [editPositioning, setEditPositioning] = useState('');
  const [editAudience, setEditAudience] = useState('');
  const [editCorePromise, setEditCorePromise] = useState('');
  const [editDifferentiation, setEditDifferentiation] = useState('');
  const [editToneTags, setEditToneTags] = useState<string[]>([]);
  const [editToneNotes, setEditToneNotes] = useState('');
  const [editPillars, setEditPillars] = useState<string[]>([]);
  const [editColors, setEditColors] = useState<string[]>([]);
  const [editStyleKeywords, setEditStyleKeywords] = useState<string[]>([]);
  const [editPhotography, setEditPhotography] = useState('');
  const [editLighting, setEditLighting] = useState('');
  const [editEditing, setEditEditing] = useState('');
  const [editWardrobe, setEditWardrobe] = useState('');
  const [editHair, setEditHair] = useState('');
  const [editMakeup, setEditMakeup] = useState('');
  const [editProps, setEditProps] = useState<string[]>([]);

  // Version history
  const [versionHistory, setVersionHistory] = useState<CharacterVersionEntry[]>([]);
  const [showVersions, setShowVersions] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Content ideas
  const [contentIdeas, setContentIdeas] = useState<ContentIdeaGroup[]>(() => getContentIdeas());

  // Growth opportunities
  const growthOpportunities = useMemo<GrowthOpportunity[]>(() => {
    if (!persona) return [];
    return deriveGrowthOpportunities(persona, charProfile);
  }, [persona, charProfile]);

  // Monetisation
  const monetisationOptions = useMemo<MonetisationSuggestion[]>(() => getMonetisationSuggestions(), []);

  // Validation status derived from evidence
  const validationStatus: ValidationStatus = evidence
    ? (STATUS_PRESENTATION[evidence.validated_fit_score != null ? 'Early evidence' : 'Not tested']?.label as ValidationStatus ?? 'Not tested')
    : 'Not tested';

  // Load
  const load = useCallback(async () => {
    if (!personaId) return;
    setLoading(true);
    setError('');
    try {
      const [row, cProfile, evRows] = await Promise.all([
        getMyPersona(personaId),
        ensureCharacterProfile(personaId, profile.id).catch(() => null),
        listMyLiveEvidence(profile.id).then(rows => rows.find(
          e => e.recommended_entity_id === personaId && e.recommendation_type === 'creator_profile',
        ) ?? null).catch(() => null),
      ]);
      if (!row) {
        setError('This character could not be found.');
        return;
      }
      setPersona(row);
      setCharProfile(cProfile);
      setEvidence(evRows);

      // Seed edit state from profile settings
      if (cProfile) {
        setEditPersonality(cProfile.personality);
        setEditPositioning(cProfile.positioning);
        setEditAudience(cProfile.audience_description);
        setEditCorePromise(cProfile.core_promise);
        setEditDifferentiation(cProfile.differentiation);
        setEditToneTags([...cProfile.tone_of_voice]);
        setEditToneNotes(cProfile.tone_of_voice_notes);
        setEditPillars([...cProfile.content_pillars]);
        setEditColors([...cProfile.primary_colors]);
        setEditStyleKeywords([...cProfile.style_keywords]);
        setEditPhotography(cProfile.photography_direction);
        setEditLighting(cProfile.lighting_style);
        setEditEditing(cProfile.editing_style);
        setEditWardrobe(cProfile.wardrobe_direction);
        setEditHair(cProfile.hair_style);
        setEditMakeup(cProfile.makeup_style);
        setEditProps([...cProfile.props]);
      }
      setEditDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This character could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [personaId, profile.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Save edits
  const handleSave = async () => {
    if (!charProfile) return;
    setSaving(true);
    setSuccessMessage(null);
    setError('');
    try {
      const patches: CharacterProfilePatch = {
        personality: editPersonality,
        positioning: editPositioning,
        audience_description: editAudience,
        core_promise: editCorePromise,
        differentiation: editDifferentiation,
        tone_of_voice: editToneTags,
        tone_of_voice_notes: editToneNotes,
        content_pillars: editPillars,
        primary_colors: editColors,
        style_keywords: editStyleKeywords,
        photography_direction: editPhotography,
        lighting_style: editLighting,
        editing_style: editEditing,
        wardrobe_direction: editWardrobe,
        hair_style: editHair,
        makeup_style: editMakeup,
        props: editProps,
      };
      const updated = await updateCharacterProfile(charProfile.id, patches);
      setCharProfile(updated);
      setEditDirty(false);
      setSuccessMessage('Character saved. Version history updated.');
      window.setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  // Status transition
  const handleTransition = async (newStatus: CharacterLifecycleStatus) => {
    if (!charProfile) return;
    setSaving(true);
    setError('');
    try {
      const updated = await transitionCharacterStatus(charProfile.id, newStatus);
      setCharProfile(updated);
      setSuccessMessage(`Character is now ${STATUS_LABEL[newStatus].toLowerCase()}.`);
      window.setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status.');
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!charProfile) return;
    setDeleting(true);
    setError('');
    try {
      await deleteCharacterProfile(charProfile.id);
      navigate('/my/personas');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete character.');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  // Load version history
  const handleShowVersions = async () => {
    if (!charProfile) return;
    if (showVersions) {
      setShowVersions(false);
      return;
    }
    try {
      const versions = await getCharacterVersionHistory(charProfile.id);
      setVersionHistory(versions);
      setShowVersions(true);
    } catch {
      setVersionHistory([]);
      setShowVersions(true);
    }
  };

  // Regenerate a content idea group
  const handleRegenerate = (label: string) => {
    setContentIdeas(prev => prev.map(g =>
      g.label === label ? { ...g, ideas: regenerateIdeaGroup(label) } : g,
    ));
  };

  // Toggle array item helper
  const toggleArray = (arr: string[], item: string, setter: (v: string[]) => void) => {
    setter(arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item]);
    setEditDirty(true);
  };

  const addToArray = (arr: string[], item: string, setter: (v: string[]) => void) => {
    if (!item.trim()) return;
    setter([...arr, item.trim()]);
    setEditDirty(true);
  };

  const removeFromArray = (arr: string[], index: number, setter: (v: string[]) => void) => {
    setter(arr.filter((_, i) => i !== index));
    setEditDirty(true);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-2 text-charcoal">
        <Header persona={persona} personaId={personaId} charProfile={null} />
        <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="animate-pulse rounded-2xl border border-white/10 bg-surface p-6 text-sm text-charcoal-2">
            Loading this character…
          </div>
        </div>
      </div>
    );
  }

  if (error && !persona) {
    return (
      <div className="min-h-screen bg-surface-2 text-charcoal">
        <Header persona={null} personaId={personaId} charProfile={null} />
        <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-pink/30 bg-pink/10 p-5 text-sm text-pink" role="alert">
            {error}
            <div className="mt-4"><a href="#/my/personas" className="btn-primary text-sm">Back to portfolio</a></div>
          </div>
        </div>
      </div>
    );
  }

  if (!persona) return null;

  const currentStatus: CharacterLifecycleStatus = charProfile?.status ?? 'draft';
  const isDraft = currentStatus === 'draft';
  const isActive = currentStatus === 'active';
  const isArchived = currentStatus === 'archived';
  const nextStatus: CharacterLifecycleStatus | null = isDraft ? 'active' : isActive ? 'archived' : isArchived ? 'draft' : null;
  const nextLabel = isDraft ? 'Activate Character' : isActive ? 'Archive' : 'Unarchive';

  return (
    <div className="min-h-screen bg-surface-2 text-charcoal">
      <Header persona={persona} personaId={personaId} charProfile={charProfile} />

      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Success / Error banners */}
        {successMessage && (
          <p className="mb-4 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success" role="status">{successMessage}</p>
        )}
        {error && persona && (
          <p className="mb-4 rounded-lg border border-pink/30 bg-pink/10 p-3 text-sm text-pink" role="alert">{error}</p>
        )}

        {/* Hero section with character banner + primary actions */}
        <HeroSection
          persona={persona}
          charProfile={charProfile}
          status={currentStatus}
          statusStyle={STATUS_STYLE[currentStatus]}
          statusLabel={STATUS_LABEL[currentStatus]}
          rankBadge={RANK_BADGE[persona.archetype_rank]}
          rankLabel={RANK_LABEL[persona.archetype_rank]}
          saving={saving}
          onTransition={() => { if (nextStatus) void handleTransition(nextStatus); }}
          nextActionLabel={nextLabel}
          isDraft={isDraft}
          isActive={isActive}
          isArchived={isArchived}
          showDelete={showDeleteConfirm}
          onShowDelete={() => setShowDeleteConfirm(true)}
          onCancelDelete={() => setShowDeleteConfirm(false)}
          onConfirmDelete={() => void handleDelete()}
          deleting={deleting}
          editDirty={editDirty}
          onSave={() => void handleSave()}
        />

        {/* Tab navigation */}
        <nav aria-label="Character detail sections" className="mb-6 overflow-x-auto">
          <div className="flex gap-1 border-b border-white/10 pb-px sm:gap-2">
            {TAB_ORDER.map(tab => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`shrink-0 rounded-t-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-accent ${
                  activeTab === tab
                    ? 'border-b-2 border-accent bg-accent/10 text-accent'
                    : 'text-charcoal-2 hover:bg-white/5 hover:text-charcoal'
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        </nav>

        {/* Tab content */}
        <section role="tabpanel" aria-label={TAB_LABELS[activeTab]}>
          {activeTab === 'overview' && (
            <TabOverview
              persona={persona}
              charProfile={charProfile}
              status={currentStatus}
              evidence={evidence}
              validationStatus={validationStatus}
              versionHistory={versionHistory}
              showVersions={showVersions}
              onToggleVersions={() => void handleShowVersions()}
            />
          )}
          {activeTab === 'brand' && (
            <TabBrandIdentity
              personality={editPersonality}
              positioning={editPositioning}
              audience={editAudience}
              corePromise={editCorePromise}
              differentiation={editDifferentiation}
              onPersonalityChange={setEditPersonality}
              onPositioningChange={setEditPositioning}
              onAudienceChange={setEditAudience}
              onCorePromiseChange={setEditCorePromise}
              onDifferentiationChange={setEditDifferentiation}
              markDirty={() => setEditDirty(true)}
            />
          )}
          {activeTab === 'tone' && (
            <TabToneOfVoice
              tags={editToneTags}
              notes={editToneNotes}
              onToggleTag={(tag) => toggleArray(editToneTags, tag, setEditToneTags)}
              onNotesChange={(v) => { setEditToneNotes(v); setEditDirty(true); }}
            />
          )}
          {activeTab === 'pillars' && (
            <TabContentPillars
              pillars={editPillars}
              onAdd={(item) => addToArray(editPillars, item, setEditPillars)}
              onRemove={(idx) => removeFromArray(editPillars, idx, setEditPillars)}
            />
          )}
          {activeTab === 'visual' && (
            <TabVisualIdentity
              colors={editColors}
              styleKeywords={editStyleKeywords}
              photography={editPhotography}
              lighting={editLighting}
              editing={editEditing}
              wardrobe={editWardrobe}
              hair={editHair}
              makeup={editMakeup}
              props={editProps}
              onColorsChange={setEditColors}
              onStyleKeywordsChange={setEditStyleKeywords}
              onPropsChange={setEditProps}
              onPhotographyChange={(v) => { setEditPhotography(v); setEditDirty(true); }}
              onLightingChange={(v) => { setEditLighting(v); setEditDirty(true); }}
              onEditingChange={(v) => { setEditEditing(v); setEditDirty(true); }}
              onWardrobeChange={(v) => { setEditWardrobe(v); setEditDirty(true); }}
              onHairChange={(v) => { setEditHair(v); setEditDirty(true); }}
              onMakeupChange={(v) => { setEditMakeup(v); setEditDirty(true); }}
              markDirty={() => setEditDirty(true)}
              toggleArray={(arr, item, setter) => toggleArray(arr, item, setter)}
            />
          )}
          {activeTab === 'ideas' && (
            <TabContentIdeas
              groups={contentIdeas}
              onRegenerate={handleRegenerate}
            />
          )}
          {activeTab === 'monetisation' && (
            <TabMonetisation options={monetisationOptions} />
          )}
          {activeTab === 'growth' && (
            <TabGrowth
              opportunities={growthOpportunities}
              persona={persona}
              evidence={evidence}
            />
          )}
        </section>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Header({ persona, personaId, charProfile }: {
  persona: CreatorPersona | null;
  personaId: string | undefined;
  charProfile: CharacterProfileSettings | null;
}) {
  return (
    <header className="border-b border-white/10 bg-surface px-4 py-4">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-0 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <img src={brandLogo} alt="Find Your Vertical" className="h-12 w-auto object-contain" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
              {persona ? `Character: ${persona.display_name}` : 'Character detail'}
            </p>
            {charProfile && (
              <p className="text-[10px] text-charcoal-2">v{charProfile.version}</p>
            )}
          </div>
        </div>
        <a href="#/my/personas" className="btn-secondary text-xs">Back to portfolio</a>
      </div>
    </header>
  );
}

function HeroSection({
  persona, charProfile, status, statusStyle, statusLabel, rankBadge, rankLabel,
  saving, onTransition, nextActionLabel, isDraft, isActive, isArchived,
  showDelete, onShowDelete, onCancelDelete, onConfirmDelete, deleting, editDirty, onSave,
}: {
  persona: CreatorPersona;
  charProfile: CharacterProfileSettings | null;
  status: CharacterLifecycleStatus;
  statusStyle: string;
  statusLabel: string;
  rankBadge: string;
  rankLabel: string;
  saving: boolean;
  onTransition: () => void;
  nextActionLabel: string | null;
  isDraft: boolean;
  isActive: boolean;
  isArchived: boolean;
  showDelete: boolean;
  onShowDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  deleting: boolean;
  editDirty: boolean;
  onSave: () => void;
}) {
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-white/10 bg-surface">
      <div className="flex aspect-[16/9] w-full items-center justify-center border-b border-dashed border-white/15 bg-surface-3/60 text-xs text-charcoal-2">
        Photo coming soon
      </div>
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${rankBadge}`}>{rankLabel}</span>
          <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusStyle}`}>{statusLabel}</span>
          {charProfile && (
            <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] text-charcoal-2">v{charProfile.version}</span>
          )}
        </div>
        <h1 className="mt-3 text-2xl font-bold leading-tight text-charcoal">{persona.display_name}</h1>
        <p className="mt-1 text-base font-medium text-accent">{persona.persona_title}</p>
        <p className="mt-1 text-xs text-charcoal-2">Creative Direction: {persona.source_archetype}</p>
        <p className="mt-3 text-sm leading-6 text-charcoal">{persona.one_line_premise}</p>

        {/* Action buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          {nextActionLabel && (
            <button
              type="button"
              onClick={onTransition}
              disabled={saving}
              className={`text-sm ${isActive ? 'btn-secondary' : 'btn-primary'} disabled:opacity-50`}
            >
              {saving ? 'Updating…' : nextActionLabel}
            </button>
          )}
          {editDirty && (
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          )}
          {isDraft && !showDelete && (
            <button
              type="button"
              onClick={onShowDelete}
              className="btn-secondary text-xs text-pink"
            >
              Delete
            </button>
          )}
          {showDelete && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-pink">Are you sure?</span>
              <button
                type="button"
                onClick={() => void onConfirmDelete()}
                disabled={deleting}
                className="btn-primary bg-pink text-xs disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button
                type="button"
                onClick={onCancelDelete}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {isDraft && (
          <p className="mt-3 text-xs text-charcoal-2">
            Activate this character once you have finished personalising its settings. Only one character can be active initially.
          </p>
        )}
        {isActive && (
          <p className="mt-3 text-xs text-charcoal-2">
            This character is active and ready to inform your content strategy. Archive it if this direction is no longer a priority.
          </p>
        )}
        {isArchived && (
          <p className="mt-3 text-xs text-charcoal-2">
            This character is archived. Unarchive it to bring it back into your active portfolio.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Tab: Overview ────────────────────────────────────────────────────────────

function TabOverview({
  persona, charProfile, status, evidence, validationStatus, versionHistory, showVersions, onToggleVersions,
}: {
  persona: CreatorPersona;
  charProfile: CharacterProfileSettings | null;
  status: CharacterLifecycleStatus;
  evidence: RecommendationEvidence | null;
  validationStatus: ValidationStatus;
  versionHistory: CharacterVersionEntry[];
  showVersions: boolean;
  onToggleVersions: () => void;
}) {
  const profile = persona.profile;

  return (
    <div className="space-y-5">
      {/* Character info card */}
      <div className="rounded-2xl border border-white/10 bg-surface p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-accent">Character info</h3>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
          <DetailField label="Character Name" value={persona.display_name} />
          <DetailField label="Title" value={persona.persona_title} />
          <DetailField label="Creative Direction" value={persona.source_archetype} />
          <DetailField label="Variation" value={persona.source_variation_id} isSecondary />
          <DetailField label="Status" value={status} />
          <DetailField label="Created" value={new Date(persona.created_at).toLocaleDateString()} />
          <DetailField label="Last Updated" value={new Date(persona.updated_at).toLocaleDateString()} />
          {charProfile && <DetailField label="Version" value={`v${charProfile.version}`} />}
        </dl>
      </div>

      {/* Premise */}
      <div className="rounded-2xl border border-white/10 bg-surface p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-accent">One-line premise</h3>
        <p className="mt-2 text-sm leading-6 text-charcoal">{persona.one_line_premise}</p>
      </div>

      {/* Profile fields from generated persona */}
      {profile && (
        <div className="rounded-2xl border border-white/10 bg-surface p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-accent">Generated profile</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <DetailField label="Apparent age / life stage" value={profile.apparent_age_or_life_stage} />
            <DetailField label="Backstory" value={profile.backstory} />
            <DetailField label="Current situation" value={profile.current_situation} />
            <ListDetailField label="Personality traits" values={profile.personality_traits} />
            <DetailField label="What she wants" value={profile.what_she_wants} />
            <DetailField label="Audience relationship" value={profile.audience_relationship} />
            <DetailField label="Visual world" value={profile.visual_world} />
            <ListDetailField label="Typical locations" values={profile.typical_locations} />
            <DetailField label="Wardrobe direction" value={profile.wardrobe_direction} />
            <ListDetailField label="Recurring story hooks" values={profile.recurring_story_hooks} />
            <ListDetailField label="Content boundaries" values={profile.content_boundaries} />
            <DetailField label="Story progression" value={profile.story_progression} />
          </div>
        </div>
      )}

      {/* Recommendation evidence */}
      <RecommendationEvidenceSection
        recommendedEntityLabel={persona.display_name}
        subtitle={persona.persona_title}
        evidence={evidence}
        validationStatus={validationStatus}
        contentExperimentCount={0}
        nextAction={{ label: 'Create a 3-post experiment', reason: 'Test this direction with real content to validate predicted fit.' }}
        onPrimaryAction={null}
      />

      {/* Version history toggle */}
      <div className="rounded-2xl border border-white/10 bg-surface p-5">
        <button
          type="button"
          onClick={onToggleVersions}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">Version history</span>
          <span className="text-xs text-charcoal-2">{showVersions ? 'Hide' : 'Show'}</span>
        </button>
        {showVersions && (
          <ol className="mt-3 space-y-2">
            {versionHistory.length === 0 && (
              <p className="text-xs text-charcoal-2">No version history yet.</p>
            )}
            {versionHistory.map(entry => (
              <li key={entry.id} className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-charcoal-2">
                <span className="font-semibold text-charcoal">v{entry.version}</span>
                {' '}· {new Date(entry.created_at).toLocaleString()}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

// ── Tab: Brand Identity (editable) ───────────────────────────────────────────

function TabBrandIdentity({
  personality, positioning, audience, corePromise, differentiation,
  onPersonalityChange, onPositioningChange, onAudienceChange, onCorePromiseChange, onDifferentiationChange, markDirty,
}: {
  personality: string; positioning: string; audience: string; corePromise: string; differentiation: string;
  onPersonalityChange: (v: string) => void;
  onPositioningChange: (v: string) => void;
  onAudienceChange: (v: string) => void;
  onCorePromiseChange: (v: string) => void;
  onDifferentiationChange: (v: string) => void;
  markDirty: () => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Brand Identity</p>
      <p className="mt-1 text-xs text-charcoal-2">Editable fields below. Save from the top bar when you are done.</p>
      <div className="mt-4 space-y-4">
        <EditableField label="Personality" value={personality} onChange={v => { onPersonalityChange(v); markDirty(); }} placeholder="Long-form description of this character's personality…" />
        <EditableField label="Positioning" value={positioning} onChange={v => { onPositioningChange(v); markDirty(); }} placeholder="Who is this character? What space do they occupy?" />
        <EditableField label="Audience" value={audience} onChange={v => { onAudienceChange(v); markDirty(); }} placeholder="Who will enjoy this creator? Describe the target audience…" />
        <EditableField label="Core Promise" value={corePromise} onChange={v => { onCorePromiseChange(v); markDirty(); }} placeholder="What experience does this character consistently deliver?" />
        <EditableField label="Differentiation" value={differentiation} onChange={v => { onDifferentiationChange(v); markDirty(); }} placeholder="Why would someone follow this creator instead of another?" />
      </div>
    </div>
  );
}

// ── Tab: Tone of Voice (editable) ────────────────────────────────────────────

function TabToneOfVoice({
  tags, notes, onToggleTag, onNotesChange,
}: {
  tags: string[];
  notes: string;
  onToggleTag: (tag: string) => void;
  onNotesChange: (v: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Tone of Voice</p>
      <p className="mt-1 text-xs text-charcoal-2">Select tags that fit this character's voice. Add free-text notes below.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {TONE_OPTIONS.map(option => (
          <button
            key={option}
            type="button"
            onClick={() => onToggleTag(option)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              tags.includes(option)
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-white/10 text-charcoal-2 hover:bg-accent/10'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-charcoal-2">Free-text notes</label>
        <textarea
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-charcoal"
          placeholder="Describe the character's voice in more detail…"
        />
      </div>
    </div>
  );
}

// ── Tab: Content Pillars (editable, 5 slots) ────────────────────────────────

function TabContentPillars({
  pillars, onAdd, onRemove,
}: {
  pillars: string[];
  onAdd: (item: string) => void;
  onRemove: (idx: number) => void;
}) {
  const [newPillar, setNewPillar] = useState('');

  return (
    <div className="rounded-2xl border border-white/10 bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Content Pillars</p>
      <p className="mt-1 text-xs text-charcoal-2">Define the main content themes for this character. Add or remove as needed.</p>
      <ul className="mt-3 space-y-2">
        {pillars.length === 0 && (
          <li className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-charcoal-2">No pillars defined yet. Add one below.</li>
        )}
        {pillars.map((pillar, i) => (
          <li key={i} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
            <span className="text-sm text-charcoal">{pillar}</span>
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="text-xs text-pink hover:underline"
              aria-label={`Remove pillar: ${pillar}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {pillars.length < 5 && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={newPillar}
            onChange={e => setNewPillar(e.target.value)}
            placeholder="Add a content pillar…"
            className="flex-1 rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-charcoal"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onAdd(newPillar);
                setNewPillar('');
              }
            }}
          />
          <button
            type="button"
            onClick={() => { onAdd(newPillar); setNewPillar(''); }}
            disabled={!newPillar.trim()}
            className="btn-primary text-xs disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tab: Visual Identity (editable) ──────────────────────────────────────────

function TabVisualIdentity({
  colors, styleKeywords, photography, lighting, editing, wardrobe, hair, makeup, props,
  onColorsChange, onStyleKeywordsChange, onPropsChange,
  onPhotographyChange, onLightingChange, onEditingChange,
  onWardrobeChange, onHairChange, onMakeupChange,
  markDirty, toggleArray,
}: {
  colors: string[];
  styleKeywords: string[];
  photography: string;
  lighting: string;
  editing: string;
  wardrobe: string;
  hair: string;
  makeup: string;
  props: string[];
  onColorsChange: (v: string[]) => void;
  onStyleKeywordsChange: (v: string[]) => void;
  onPropsChange: (v: string[]) => void;
  onPhotographyChange: (v: string) => void;
  onLightingChange: (v: string) => void;
  onEditingChange: (v: string) => void;
  onWardrobeChange: (v: string) => void;
  onHairChange: (v: string) => void;
  onMakeupChange: (v: string) => void;
  markDirty: () => void;
  toggleArray: (arr: string[], item: string, setter: (v: string[]) => void) => void;
}) {
  const [newColor, setNewColor] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [newProp, setNewProp] = useState('');

  return (
    <div className="rounded-2xl border border-white/10 bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Visual Identity</p>
      <p className="mt-1 text-xs text-charcoal-2">Define the visual aesthetic for this character.</p>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <EditableField label="Photography direction" value={photography} onChange={onPhotographyChange} placeholder="e.g. Natural light, candid, editorial…" />
        <EditableField label="Lighting style" value={lighting} onChange={onLightingChange} placeholder="e.g. Soft, dramatic, natural…" />
        <EditableField label="Editing style" value={editing} onChange={onEditingChange} placeholder="e.g. Warm tones, high contrast, desaturated…" />
        <EditableField label="Wardrobe direction" value={wardrobe} onChange={onWardrobeChange} placeholder="e.g. Casual chic, edgy, feminine…" />
        <EditableField label="Hair style" value={hair} onChange={onHairChange} placeholder="e.g. Natural waves, sleek, messy bun…" />
        <EditableField label="Makeup style" value={makeup} onChange={onMakeupChange} placeholder="e.g. Natural glam, bold lips, no-makeup…" />
      </div>

      {/* Colors */}
      <TagArrayEditor
        label="Primary colours"
        items={colors}
        newItem={newColor}
        onNewItemChange={setNewColor}
        onAdd={item => { onColorsChange([...colors, item]); markDirty(); }}
        onRemove={idx => { onColorsChange(colors.filter((_, i) => i !== idx)); markDirty(); }}
        placeholder="e.g. #FF6B6B, Deep purple…"
      />

      {/* Style Keywords */}
      <TagArrayEditor
        label="Style keywords"
        items={styleKeywords}
        newItem={newKeyword}
        onNewItemChange={setNewKeyword}
        onAdd={item => { onStyleKeywordsChange([...styleKeywords, item]); markDirty(); }}
        onRemove={idx => { onStyleKeywordsChange(styleKeywords.filter((_, i) => i !== idx)); markDirty(); }}
        placeholder="e.g. Minimalist, Boho, Dark…"
      />

      {/* Props */}
      <TagArrayEditor
        label="Props"
        items={props}
        newItem={newProp}
        onNewItemChange={setNewProp}
        onAdd={item => { onPropsChange([...props, item]); markDirty(); }}
        onRemove={idx => { onPropsChange(props.filter((_, i) => i !== idx)); markDirty(); }}
        placeholder="e.g. Mirror, silk sheets, laptop…"
      />
    </div>
  );
}

// ── Tab: Content Ideas ───────────────────────────────────────────────────────

function TabContentIdeas({
  groups, onRegenerate,
}: {
  groups: ContentIdeaGroup[];
  onRegenerate: (label: string) => void;
}) {
  return (
    <div className="space-y-5">
      {groups.map(group => (
        <div key={group.label} className="rounded-2xl border border-white/10 bg-surface p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">{group.label}</p>
            <button
              type="button"
              onClick={() => onRegenerate(group.label)}
              className="btn-secondary text-[10px]"
            >
              Regenerate
            </button>
          </div>
          <p className="mt-1 text-xs text-charcoal-2">{group.ideas.length} ideas</p>
          <ul className="mt-3 space-y-1">
            {group.ideas.map((idea, i) => (
              <li key={i} className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-charcoal">
                {idea}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ── Tab: Monetisation ────────────────────────────────────────────────────────

function TabMonetisation({ options }: { options: MonetisationSuggestion[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Monetisation</p>
      <p className="mt-1 text-xs text-charcoal-2">Suggestions only. These are common revenue streams for creators in this space.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {options.map(option => (
          <div key={option.label} className="rounded-xl border border-white/10 bg-surface-2 p-4">
            <p className="text-sm font-semibold text-charcoal">{option.label}</p>
            <p className="mt-1 text-xs text-charcoal-2">{option.description}</p>
            <div className="mt-2 flex gap-2 text-[10px] text-charcoal-2">
              <span className="rounded-full bg-surface-3 px-2 py-0.5">Effort: {option.effort}</span>
              <span className="rounded-full bg-surface-3 px-2 py-0.5">Potential: {option.potential}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Growth Opportunities ────────────────────────────────────────────────

function TabGrowth({
  opportunities, persona, evidence,
}: {
  opportunities: GrowthOpportunity[];
  persona: CreatorPersona;
  evidence: RecommendationEvidence | null;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Growth Opportunities</p>
        <p className="mt-1 text-xs text-charcoal-2">Based on your character profile and recommendation engine.</p>
        <div className="mt-4 space-y-3">
          {opportunities.map((opp, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-surface-2 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                  {opp.category}
                </span>
                <p className="text-sm leading-6 text-charcoal">{opp.message}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendation evidence summary */}
      {evidence && (
        <div className="rounded-2xl border border-white/10 bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Recommendation evidence</p>
          <p className="mt-2 text-sm leading-6 text-charcoal-2">{evidence.explanation_summary}</p>
          {evidence.predicted_fit_score != null && (
            <p className="mt-2 text-xs text-charcoal-2">
              Predicted Fit: {evidence.predicted_fit_score}% · Confidence: {evidence.predicted_fit_confidence ?? '—'}%
            </p>
          )}
          {evidence.supporting_signals.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-charcoal-2">Signals</p>
              {evidence.supporting_signals.slice(0, 5).map(s => (
                <p key={s.source_reference} className="text-xs text-charcoal">
                  · {s.label}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cross-profile suggestion */}
      <div className="rounded-2xl border border-accent/30 bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Next recommended action</p>
        <p className="mt-1 text-sm font-semibold text-charcoal">
          {evidence?.validated_fit_score != null ? 'Compare this character with your other profiles' : 'Create a 3-post content experiment'}
        </p>
        <p className="mt-1 text-xs text-charcoal-2">
          {evidence?.validated_fit_score != null
            ? 'Contrast predicted vs validated fit across your portfolio to identify which directions are strongest.'
            : 'Test this direction with real content to see how it performs before investing more.'}
        </p>
      </div>
    </div>
  );
}

// ── Reusable field components ────────────────────────────────────────────────

function DetailField({ label, value, isSecondary }: { label: string; value?: string | null; isSecondary?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-charcoal-2">{label}</div>
      <p className="mt-0.5 text-sm leading-6 text-charcoal" style={{ wordBreak: 'break-word' }}>
        {isSecondary && value.length > 20 ? `${value.slice(0, 20)}…` : value}
      </p>
    </div>
  );
}

function ListDetailField({ label, values }: { label: string; values?: string[] | null }) {
  if (!values || values.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-charcoal-2">{label}</div>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {values.map((v, i) => (
          <li key={i} className="rounded-full bg-surface-3/70 px-2 py-0.5 text-xs text-charcoal">{v}</li>
        ))}
      </ul>
    </div>
  );
}

function EditableField({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="text-[10px] font-semibold uppercase tracking-wide text-charcoal-2">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className="mt-1 w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-charcoal"
        placeholder={placeholder}
      />
    </div>
  );
}

function TagArrayEditor({
  label, items, newItem, onNewItemChange, onAdd, onRemove, placeholder,
}: {
  label: string;
  items: string[];
  newItem: string;
  onNewItemChange: (v: string) => void;
  onAdd: (item: string) => void;
  onRemove: (idx: number) => void;
  placeholder: string;
}) {
  return (
    <div className="mt-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-charcoal-2">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span key={i} className="flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
            {item}
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="ml-0.5 text-[10px] text-charcoal-2 hover:text-pink"
              aria-label={`Remove ${item}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={newItem}
          onChange={e => onNewItemChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-white/10 bg-surface-2 px-3 py-1.5 text-xs text-charcoal"
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (newItem.trim()) {
                onAdd(newItem.trim());
                onNewItemChange('');
              }
            }
          }}
        />
        <button
          type="button"
          onClick={() => { if (newItem.trim()) { onAdd(newItem.trim()); onNewItemChange(''); } }}
          disabled={!newItem.trim()}
          className="btn-primary text-[10px] disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
