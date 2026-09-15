import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { evaluateReportTemplate } from '@/lib/report-generation';
import type {
  JsonValue,
  ReportBlockType,
  ReportRuleConfig,
  ReportRuleOperator,
  ReportSourcePurpose,
  ReportSourceType,
  ReportTemplateDefinition,
  ReportTemplateEvaluationResult,
} from '@/lib/report-generation';
import {
  REPORT_BLOCK_TYPES,
  REPORT_RULE_OPERATORS,
  REPORT_SOURCE_PURPOSES,
  REPORT_SOURCE_TYPES,
  SOURCE_VOCABULARY,
  activatePublishedReportTemplateVersion,
  ensureRuleConfig,
  normalizeReportKey,
  parseExpectedValue,
  publishReportTemplateVersionWithValidation,
  reorderById,
  sourceLabel,
  sourceValueKind,
  uniqueKey,
  validOperatorsForKind,
  validateReportTemplateDraft,
} from '@/lib/report-template-authoring';
import type { QuestionSourceOption, ReportTemplateValidationError } from '@/lib/report-template-authoring';

type VersionStatus = 'draft' | 'published' | 'superseded';

type ReportTemplateVersionSummary = {
  id: string;
  version_number: number;
  status: VersionStatus;
  schema_version: string;
  configuration_digest: string | null;
  created_at: string;
  published_at: string | null;
};

type ReportBlockSource = {
  id: string;
  block_id: string;
  source_type: ReportSourceType;
  question_id: string | null;
  source_key: string;
  purpose: ReportSourcePurpose;
  sort_order: number;
};

type ReportBlock = {
  id: string;
  section_id: string;
  block_key: string;
  block_type: ReportBlockType;
  heading: string | null;
  static_content: string | null;
  content_template: string | null;
  rule_config: Record<string, unknown> | null;
  ai_config: Record<string, unknown> | null;
  fallback_text: string | null;
  ai_required: boolean;
  sort_order: number;
  is_active: boolean;
  creator_report_block_sources?: ReportBlockSource[] | null;
};

type ReportSection = {
  id: string;
  report_template_version_id: string;
  section_key: string;
  title: string;
  internal_purpose: string | null;
  sort_order: number;
  is_active: boolean;
  creator_report_blocks?: ReportBlock[] | null;
};

type PreviewRun = {
  id: string;
  assessment_id: string;
  creator_profile_id: string;
  started_at: string;
  generation_context: Record<string, unknown>;
  creator_profiles?: { full_name: string | null } | { full_name: string | null }[] | null;
  creator_assessments?: { creator_name: string | null; template_slug: string | null; created_at: string } | { creator_name: string | null; template_slug: string | null; created_at: string }[] | null;
};

type ReportTemplateSummary = {
  id: string;
  assessment_template_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  creator_report_template_versions?: Array<{
    id: string;
    version_number: number;
    status: VersionStatus;
    created_at: string;
    published_at: string | null;
  }> | null;
};

type Props = {
  templateId: string;
  initialTemplate: ReportTemplateSummary | null;
  onReload: () => Promise<void>;
};

const OPERATOR_LABELS: Record<ReportRuleOperator, string> = {
  equals: '=',
  not_equals: '!=',
  greater_than: '>',
  greater_than_or_equal: '>=',
  less_than: '<',
  less_than_or_equal: '<=',
  contains: 'contains',
  any_of: 'any of',
  all_of: 'all of',
};

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function jsonInputValue(value: JsonValue): string {
  if (Array.isArray(value)) return value.map(item => String(item)).join(', ');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value ?? '');
}

function questionOptionValue(option: string | { value: string; label: string }): string {
  return typeof option === 'string' ? option : option.value;
}

function questionOptionLabel(option: string | { value: string; label: string }): string {
  return typeof option === 'string' ? option : option.label || option.value;
}

export function ReportTemplateEditor({ templateId, initialTemplate, onReload }: Props) {
  const [versions, setVersions] = useState<ReportTemplateVersionSummary[]>([]);
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [questions, setQuestions] = useState<QuestionSourceOption[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ReportTemplateValidationError[]>([]);
  const [previewRuns, setPreviewRuns] = useState<PreviewRun[]>([]);
  const [selectedCreatorId, setSelectedCreatorId] = useState('');
  const [selectedPreviewRunId, setSelectedPreviewRunId] = useState('');
  const [previewResult, setPreviewResult] = useState<ReportTemplateEvaluationResult | null>(null);
  const [sectionForm, setSectionForm] = useState({ title: '', internalPurpose: '' });
  const [blockForm, setBlockForm] = useState({ sectionId: '', heading: '', blockType: 'static' as ReportBlockType });

  const selectedVersion = useMemo(
    () => versions.find(version => version.id === selectedVersionId) ?? null,
    [selectedVersionId, versions],
  );
  const draftVersion = versions.find(version => version.status === 'draft') ?? null;
  const canEditSelectedVersion = selectedVersion?.status === 'draft';
  const selectedPreviewRun = previewRuns.find(run => run.id === selectedPreviewRunId) ?? null;
  const previewCreators = useMemo(() => {
    const rows = new Map<string, string>();
    for (const run of previewRuns) {
      const profile = relatedOne(run.creator_profiles);
      rows.set(run.creator_profile_id, profile?.full_name || 'Creator');
    }
    return [...rows.entries()].map(([id, name]) => ({ id, name }));
  }, [previewRuns]);
  const filteredPreviewRuns = previewRuns.filter(run => !selectedCreatorId || run.creator_profile_id === selectedCreatorId);

  useEffect(() => {
    void loadVersions();
    void loadQuestionBank();
    void loadPreviewRuns();
  }, [templateId]);

  useEffect(() => {
    if (selectedVersionId) void loadSections(selectedVersionId);
  }, [selectedVersionId]);

  useEffect(() => {
    if (!selectedCreatorId && previewCreators[0]) setSelectedCreatorId(previewCreators[0].id);
  }, [previewCreators, selectedCreatorId]);

  useEffect(() => {
    const firstRun = filteredPreviewRuns[0]?.id ?? '';
    if (!filteredPreviewRuns.some(run => run.id === selectedPreviewRunId)) setSelectedPreviewRunId(firstRun);
  }, [filteredPreviewRuns, selectedPreviewRunId]);

  async function loadVersions() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: versionError } = await supabase
        .from('creator_report_template_versions')
        .select('id, version_number, status, schema_version, configuration_digest, created_at, published_at')
        .eq('report_template_id', templateId)
        .order('version_number', { ascending: false });

      if (versionError) throw versionError;
      const rows = (data ?? []) as ReportTemplateVersionSummary[];
      setVersions(rows);
      setSelectedVersionId(current => current || rows[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report template versions.');
    } finally {
      setLoading(false);
    }
  }

  async function loadQuestionBank() {
    const { data, error: questionError } = await supabase
      .from('creator_question_bank')
      .select('id, question_key, response_key, question_text, question_type, options')
      .eq('is_active', true)
      .order('section', { ascending: true })
      .order('question_text', { ascending: true });

    if (questionError) {
      setError(questionError.message);
      return;
    }

    setQuestions((data ?? []).map((question: any) => ({
      id: question.id,
      questionKey: question.question_key,
      responseKey: question.response_key,
      questionText: question.question_text,
      questionType: question.question_type,
      options: Array.isArray(question.options) ? question.options : [],
    })));
  }

  async function loadSections(versionId: string) {
    setError(null);
    const { data, error: sectionError } = await supabase
      .from('creator_report_sections')
      .select(`
        id,
        report_template_version_id,
        section_key,
        title,
        internal_purpose,
        sort_order,
        is_active,
        creator_report_blocks(
          id,
          section_id,
          block_key,
          block_type,
          heading,
          static_content,
          content_template,
          rule_config,
          ai_config,
          fallback_text,
          ai_required,
          sort_order,
          is_active,
          creator_report_block_sources(id, block_id, source_type, question_id, source_key, purpose, sort_order)
        )
      `)
      .eq('report_template_version_id', versionId)
      .order('sort_order', { ascending: true });

    if (sectionError) {
      setError(sectionError.message);
      return;
    }

    const rows = ((data ?? []) as ReportSection[]).map(section => ({
      ...section,
      creator_report_blocks: [...(section.creator_report_blocks ?? [])]
        .sort((left, right) => left.sort_order - right.sort_order)
        .map(block => ({
          ...block,
          creator_report_block_sources: [...(block.creator_report_block_sources ?? [])]
            .sort((left, right) => left.sort_order - right.sort_order),
        })),
    }));
    setSections(rows);
    setBlockForm(form => ({ ...form, sectionId: form.sectionId || rows[0]?.id || '' }));
    setValidationErrors([]);
    setPreviewResult(null);
  }

  async function loadPreviewRuns() {
    const { data, error: previewError } = await supabase
      .from('creator_report_generation_runs')
      .select('id, assessment_id, creator_profile_id, started_at, generation_context, creator_profiles(full_name), creator_assessments(creator_name, template_slug, created_at)')
      .eq('generation_mode', 'legacy')
      .eq('status', 'completed')
      .order('started_at', { ascending: false })
      .limit(100);

    if (previewError) {
      setError(previewError.message);
      return;
    }

    setPreviewRuns((data ?? []) as PreviewRun[]);
  }

  function toDefinition(): ReportTemplateDefinition | null {
    if (!selectedVersion) return null;
    return {
      templateId,
      versionId: selectedVersion.id,
      versionNumber: selectedVersion.version_number,
      status: selectedVersion.status,
      schemaVersion: selectedVersion.schema_version,
      sections: sections.map(section => ({
        id: section.id,
        sectionKey: section.section_key,
        title: section.title,
        internalPurpose: section.internal_purpose,
        sortOrder: section.sort_order,
        isActive: section.is_active,
        blocks: [...(section.creator_report_blocks ?? [])].sort((a, b) => a.sort_order - b.sort_order).map(block => ({
          id: block.id,
          blockKey: block.block_key,
          blockType: block.block_type,
          heading: block.heading,
          staticContent: block.static_content,
          contentTemplate: block.content_template,
          ruleConfig: (block.rule_config ?? {}) as never,
          aiConfig: (block.ai_config ?? {}) as never,
          fallbackText: block.fallback_text,
          aiRequired: block.ai_required,
          sortOrder: block.sort_order,
          isActive: block.is_active,
          sources: [...(block.creator_report_block_sources ?? [])].sort((a, b) => a.sort_order - b.sort_order).map(source => ({
            id: source.id,
            sourceType: source.source_type,
            questionId: source.question_id,
            sourceKey: source.source_key,
            purpose: source.purpose,
            sortOrder: source.sort_order,
          })),
        })),
      })),
    };
  }

  async function refreshSelected() {
    if (selectedVersionId) await loadSections(selectedVersionId);
  }

  async function createDraftVersion() {
    const nextVersionNumber = Math.max(0, ...versions.map(version => version.version_number)) + 1;
    setError(null);
    const { data, error: insertError } = await supabase
      .from('creator_report_template_versions')
      .insert({ report_template_id: templateId, version_number: nextVersionNumber, status: 'draft', schema_version: 'fyv-report-template.v1' })
      .select('id')
      .single();

    if (insertError) {
      setError(insertError.message);
      return;
    }

    await Promise.all([loadVersions(), onReload()]);
    setSelectedVersionId(data.id);
  }

  async function publishDraftVersion() {
    const definition = toDefinition();
    if (!definition) return;
    const errors = validateReportTemplateDraft(definition, questions);
    setValidationErrors(errors);
    if (errors.length > 0) return;

    setSaving(true);
    setError(null);
    try {
      await publishReportTemplateVersionWithValidation(definition, questions);
      await Promise.all([loadVersions(), onReload()]);
      setSelectedVersionId(definition.versionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish report template version.');
    } finally {
      setSaving(false);
    }
  }

  async function activateVersion(versionId: string) {
    if (!initialTemplate?.assessment_template_id) return;
    setSaving(true);
    setError(null);
    try {
      await activatePublishedReportTemplateVersion({
        assessmentTemplateId: initialTemplate.assessment_template_id,
        reportTemplateId: templateId,
        versionId,
        versions,
      });
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate report template version.');
    } finally {
      setSaving(false);
    }
  }

  async function createSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVersion || !sectionForm.title.trim() || !canEditSelectedVersion) return;

    setSaving(true);
    const sectionKey = uniqueKey(sectionForm.title, sections.map(section => section.section_key));
    const { error: insertError } = await supabase
      .from('creator_report_sections')
      .insert({
        report_template_version_id: selectedVersion.id,
        section_key: sectionKey,
        title: sectionForm.title.trim(),
        internal_purpose: sectionForm.internalPurpose.trim() || null,
        sort_order: sections.length,
      });

    if (insertError) setError(insertError.message);
    else {
      setSectionForm({ title: '', internalPurpose: '' });
      await refreshSelected();
    }
    setSaving(false);
  }

  async function updateSection(sectionId: string, updates: Partial<ReportSection>) {
    if (!canEditSelectedVersion) return;
    setSaving(true);
    const { error: updateError } = await supabase.from('creator_report_sections').update(updates).eq('id', sectionId);
    if (updateError) setError(updateError.message);
    else await refreshSelected();
    setSaving(false);
  }

  async function removeSection(section: ReportSection) {
    if (!canEditSelectedVersion || !confirm(`Remove section "${section.title}"?`)) return;
    setSaving(true);
    const { error: deleteError } = await supabase.from('creator_report_sections').delete().eq('id', section.id);
    if (deleteError) setError(deleteError.message);
    else await refreshSelected();
    setSaving(false);
  }

  async function duplicateSection(section: ReportSection) {
    if (!canEditSelectedVersion || !selectedVersion) return;
    setSaving(true);
    const { data: newSection, error: sectionError } = await supabase
      .from('creator_report_sections')
      .insert({
        report_template_version_id: selectedVersion.id,
        section_key: uniqueKey(`${section.section_key}_copy`, sections.map(item => item.section_key)),
        title: `${section.title} Copy`,
        internal_purpose: section.internal_purpose,
        sort_order: sections.length,
        is_active: section.is_active,
      })
      .select('id')
      .single();

    if (sectionError) {
      setError(sectionError.message);
      setSaving(false);
      return;
    }

    const blocks = [...(section.creator_report_blocks ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    for (const block of blocks) await duplicateBlock(block, newSection.id, false);
    await refreshSelected();
    setSaving(false);
  }

  async function createBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!blockForm.sectionId || !blockForm.heading.trim() || !canEditSelectedVersion) return;
    const section = sections.find(item => item.id === blockForm.sectionId);
    const existingKeys = sections.flatMap(item => item.creator_report_blocks ?? []).map(block => block.block_key);

    setSaving(true);
    const { error: insertError } = await supabase.from('creator_report_blocks').insert({
      section_id: blockForm.sectionId,
      block_key: uniqueKey(blockForm.heading, existingKeys),
      block_type: blockForm.blockType,
      heading: blockForm.heading.trim(),
      rule_config: blockForm.blockType === 'rule' || blockForm.blockType === 'hybrid' ? { combinator: 'and', conditions: [] } : {},
      ai_config: blockForm.blockType === 'ai' || blockForm.blockType === 'hybrid' ? { instruction: '', evidenceSourceIds: [], maxOutputLength: 600, outputFormat: 'paragraph' } : {},
      ai_required: blockForm.blockType === 'ai' || blockForm.blockType === 'hybrid',
      sort_order: section?.creator_report_blocks?.length ?? 0,
    });

    if (insertError) setError(insertError.message);
    else {
      setBlockForm(form => ({ ...form, heading: '' }));
      await refreshSelected();
    }
    setSaving(false);
  }

  async function updateBlock(blockId: string, updates: Partial<ReportBlock>) {
    if (!canEditSelectedVersion) return;
    setSaving(true);
    const { error: updateError } = await supabase.from('creator_report_blocks').update(updates).eq('id', blockId);
    if (updateError) setError(updateError.message);
    else await refreshSelected();
    setSaving(false);
  }

  async function removeBlock(block: ReportBlock) {
    if (!canEditSelectedVersion || !confirm(`Remove block "${block.heading || block.block_key}"?`)) return;
    setSaving(true);
    const { error: deleteError } = await supabase.from('creator_report_blocks').delete().eq('id', block.id);
    if (deleteError) setError(deleteError.message);
    else await refreshSelected();
    setSaving(false);
  }

  async function duplicateBlock(block: ReportBlock, targetSectionId = block.section_id, refresh = true) {
    if (!canEditSelectedVersion) return;
    const targetSection = sections.find(section => section.id === targetSectionId);
    const existingKeys = sections.flatMap(item => item.creator_report_blocks ?? []).map(item => item.block_key);
    const { data: newBlock, error: blockError } = await supabase
      .from('creator_report_blocks')
      .insert({
        section_id: targetSectionId,
        block_key: uniqueKey(`${block.block_key}_copy`, existingKeys),
        block_type: block.block_type,
        heading: `${block.heading || block.block_key} Copy`,
        static_content: block.static_content,
        content_template: block.content_template,
        rule_config: block.rule_config ?? {},
        ai_config: block.ai_config ?? {},
        fallback_text: block.fallback_text,
        ai_required: block.ai_required,
        is_active: block.is_active,
        sort_order: targetSection?.creator_report_blocks?.length ?? 0,
      })
      .select('id')
      .single();

    if (blockError) {
      setError(blockError.message);
      return;
    }

    const sources = [...(block.creator_report_block_sources ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    if (sources.length > 0) {
      const { error: sourceError } = await supabase.from('creator_report_block_sources').insert(sources.map(source => ({
        block_id: newBlock.id,
        source_type: source.source_type,
        question_id: source.question_id,
        source_key: source.source_key,
        purpose: source.purpose,
        sort_order: source.sort_order,
      })));
      if (sourceError) setError(sourceError.message);
    }
    if (refresh) await refreshSelected();
  }

  async function addSource(block: ReportBlock) {
    if (!canEditSelectedVersion) return;
    const question = questions[0];
    const canonical = SOURCE_VOCABULARY[0];
    const isQuestion = Boolean(question);
    setSaving(true);
    const { error: insertError } = await supabase.from('creator_report_block_sources').insert({
      block_id: block.id,
      source_type: isQuestion ? 'question' : canonical.sourceType,
      question_id: isQuestion ? question.id : null,
      source_key: isQuestion ? question.questionKey : canonical.sourceKey,
      purpose: 'evidence',
      sort_order: block.creator_report_block_sources?.length ?? 0,
    });
    if (insertError) setError(insertError.message);
    else await refreshSelected();
    setSaving(false);
  }

  async function updateSource(sourceId: string, updates: Partial<ReportBlockSource>) {
    if (!canEditSelectedVersion) return;
    setSaving(true);
    const { error: updateError } = await supabase.from('creator_report_block_sources').update(updates).eq('id', sourceId);
    if (updateError) setError(updateError.message);
    else await refreshSelected();
    setSaving(false);
  }

  async function removeSource(sourceId: string) {
    if (!canEditSelectedVersion) return;
    setSaving(true);
    const { error: deleteError } = await supabase.from('creator_report_block_sources').delete().eq('id', sourceId);
    if (deleteError) setError(deleteError.message);
    else await refreshSelected();
    setSaving(false);
  }

  async function persistSort(table: 'creator_report_sections' | 'creator_report_blocks' | 'creator_report_block_sources', items: Array<{ id: string; sort_order: number }>) {
    setSaving(true);
    for (const item of items) {
      const { error: updateError } = await supabase.from(table).update({ sort_order: item.sort_order }).eq('id', item.id);
      if (updateError) {
        setError(updateError.message);
        break;
      }
    }
    await refreshSelected();
    setSaving(false);
  }

  function runValidation() {
    const definition = toDefinition();
    if (!definition) return;
    setValidationErrors(validateReportTemplateDraft(definition, questions));
  }

  function previewSelectedVersion() {
    const definition = toDefinition();
    if (!definition || !selectedPreviewRun) return;
    setPreviewResult(evaluateReportTemplate(definition, selectedPreviewRun.generation_context as never));
  }

  function updateRule(block: ReportBlock, rule: ReportRuleConfig) {
    void updateBlock(block.id, { rule_config: rule as unknown as Record<string, unknown> });
  }

  function updateRuleCondition(block: ReportBlock, index: number, updates: Partial<ReportRuleConfig['conditions'][number]>) {
    const rule = ensureRuleConfig(block.rule_config);
    const conditions = rule.conditions.map((condition, conditionIndex) => conditionIndex === index ? { ...condition, ...updates } : condition);
    updateRule(block, { ...rule, conditions });
  }

  if (loading) return <p className="text-sm text-charcoal-2" role="status">Loading report template...</p>;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link className="text-sm font-medium text-accent hover:underline" to="/cockpit/settings/report-templates">Back to report templates</Link>
          <h1 className="mt-2 text-2xl font-semibold text-charcoal">{initialTemplate?.name ?? 'Report Template'}</h1>
          <p className="mt-2 max-w-2xl text-sm text-charcoal-2">Draft edits autosave. Publishing validates structure but does not activate the version.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={runValidation}>Validate</button>
          {!draftVersion && <button className="btn-primary" onClick={createDraftVersion} disabled={saving}>Create draft version</button>}
          {draftVersion && <button className="btn-primary" onClick={publishDraftVersion} disabled={saving || !canEditSelectedVersion}>Publish selected draft</button>}
        </div>
      </header>

      {saving && <p className="text-xs font-medium text-charcoal-2" role="status">Saving draft changes...</p>}
      {error && <div className="rounded-xl border border-pink/30 bg-pink/10 p-4 text-sm text-pink" role="alert">{error}</div>}
      {validationErrors.length > 0 && (
        <section className="rounded-2xl border border-pink/30 bg-pink/10 p-5 text-sm text-pink">
          <h2 className="font-semibold">Validation errors</h2>
          <div className="mt-3 space-y-1">
            {validationErrors.map((item, index) => (
              <p key={`${item.sectionKey}-${item.blockKey}-${item.field}-${index}`}>
                {[item.sectionKey, item.blockKey, item.field].filter(Boolean).join(' / ')}: {item.message}
              </p>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-white/10 bg-surface/95 p-5 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-charcoal">Versions</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {versions.map(version => (
            <div key={version.id} className="flex items-center gap-2">
              <button className={`rounded-full border px-3 py-1.5 text-sm ${selectedVersionId === version.id ? 'border-accent bg-accent/15 text-charcoal' : 'border-white/10 bg-surface-2 text-charcoal-2'}`} onClick={() => setSelectedVersionId(version.id)}>
                v{version.version_number} · {version.status}
              </button>
              {version.status === 'published' && <button className="text-xs font-medium text-accent hover:underline" onClick={() => activateVersion(version.id)} disabled={saving}>Activate</button>}
            </div>
          ))}
        </div>
        {selectedVersion && <p className="mt-4 text-sm text-charcoal-2">Schema {selectedVersion.schema_version} · Created {formatDate(selectedVersion.created_at)} · Published {formatDate(selectedVersion.published_at)}</p>}
      </section>

      <section className="rounded-2xl border border-white/10 bg-surface/95 p-5 shadow-xl shadow-black/10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-charcoal">Sections and Blocks</h2>
          <span className="text-xs font-medium text-charcoal-2">{canEditSelectedVersion ? 'Draft editable' : selectedVersion ? 'Published/superseded versions are read-only' : 'Select a version'}</span>
        </div>

        {canEditSelectedVersion && (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <form onSubmit={createSection} className="rounded-xl border border-white/10 bg-surface-2 p-4">
              <h3 className="font-semibold text-charcoal">Add section</h3>
              <input className="mt-3 w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm" placeholder="Section title" value={sectionForm.title} onChange={event => setSectionForm(form => ({ ...form, title: event.target.value }))} required />
              <textarea className="mt-3 min-h-20 w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm" placeholder="Internal purpose" value={sectionForm.internalPurpose} onChange={event => setSectionForm(form => ({ ...form, internalPurpose: event.target.value }))} />
              <button className="btn-secondary mt-3" disabled={saving}>Add section</button>
            </form>

            <form onSubmit={createBlock} className="rounded-xl border border-white/10 bg-surface-2 p-4">
              <h3 className="font-semibold text-charcoal">Add block</h3>
              <select className="mt-3 w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm" value={blockForm.sectionId} onChange={event => setBlockForm(form => ({ ...form, sectionId: event.target.value }))} required>
                {sections.map(section => <option key={section.id} value={section.id}>{section.title}</option>)}
              </select>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input className="rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm" placeholder="Block heading" value={blockForm.heading} onChange={event => setBlockForm(form => ({ ...form, heading: event.target.value }))} required />
                <select className="rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm" value={blockForm.blockType} onChange={event => setBlockForm(form => ({ ...form, blockType: event.target.value as ReportBlockType }))}>
                  {REPORT_BLOCK_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <button className="btn-secondary mt-3" disabled={saving || sections.length === 0}>Add block</button>
            </form>
          </div>
        )}

        <div className="mt-5 space-y-4">
          {sections.map((section, sectionIndex) => {
            const blocks = [...(section.creator_report_blocks ?? [])].sort((a, b) => a.sort_order - b.sort_order);
            return (
              <article key={section.id} className="rounded-xl border border-white/10 bg-surface-2 p-4">
                <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input className="rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm font-semibold text-charcoal" value={section.title} disabled={!canEditSelectedVersion} onChange={event => updateSection(section.id, { title: event.target.value, section_key: uniqueKey(event.target.value, sections.filter(item => item.id !== section.id).map(item => item.section_key)) })} />
                    <input className="rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-charcoal-2" value={section.internal_purpose ?? ''} placeholder="Internal purpose" disabled={!canEditSelectedVersion} onChange={event => updateSection(section.id, { internal_purpose: event.target.value || null })} />
                  </div>
                  {canEditSelectedVersion && (
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-secondary" onClick={() => persistSort('creator_report_sections', reorderById(sections, section.id, 'up'))} disabled={sectionIndex === 0}>Up</button>
                      <button className="btn-secondary" onClick={() => persistSort('creator_report_sections', reorderById(sections, section.id, 'down'))} disabled={sectionIndex === sections.length - 1}>Down</button>
                      <button className="btn-secondary" onClick={() => duplicateSection(section)}>Duplicate</button>
                      <button className="btn-secondary" onClick={() => removeSection(section)}>Remove</button>
                    </div>
                  )}
                </div>
                <label className="mt-3 inline-flex items-center gap-2 text-sm text-charcoal-2">
                  <input type="checkbox" checked={section.is_active} disabled={!canEditSelectedVersion} onChange={event => updateSection(section.id, { is_active: event.target.checked })} /> Active section
                </label>

                <div className="mt-4 space-y-3">
                  {blocks.map((block, blockIndex) => <BlockEditor
                    key={block.id}
                    block={block}
                    blockIndex={blockIndex}
                    blocks={blocks}
                    canEdit={canEditSelectedVersion}
                    questions={questions}
                    saving={saving}
                    onUpdateBlock={updateBlock}
                    onRemoveBlock={removeBlock}
                    onDuplicateBlock={duplicateBlock}
                    onAddSource={addSource}
                    onUpdateSource={updateSource}
                    onRemoveSource={removeSource}
                    onReorderBlocks={items => persistSort('creator_report_blocks', items)}
                    onReorderSources={items => persistSort('creator_report_block_sources', items)}
                    onUpdateRuleCondition={updateRuleCondition}
                    onUpdateRule={updateRule}
                  />)}
                </div>
              </article>
            );
          })}
          {sections.length === 0 && <p className="text-sm text-charcoal-2">This version does not have any sections yet.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-surface/95 p-5 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-charcoal">Preview</h2>
        <p className="mt-2 text-sm text-charcoal-2">Choose a creator and completed assessment. Preview uses the persisted normalized generation context and does not mutate creator profiles, assessments, reports, or activation settings.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto]">
          <select className="rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm" value={selectedCreatorId} onChange={event => setSelectedCreatorId(event.target.value)}>
            {previewCreators.map(creator => <option key={creator.id} value={creator.id}>{creator.name}</option>)}
          </select>
          <select className="rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm" value={selectedPreviewRunId} onChange={event => setSelectedPreviewRunId(event.target.value)}>
            {filteredPreviewRuns.length === 0 ? <option value="">No completed assessments found</option> : filteredPreviewRuns.map(run => {
              const assessment = relatedOne(run.creator_assessments);
              return <option key={run.id} value={run.id}>{assessment?.template_slug || 'assessment'} · {formatDate(assessment?.created_at ?? run.started_at)}</option>;
            })}
          </select>
          <button className="btn-primary" onClick={previewSelectedVersion} disabled={!selectedVersion || !selectedPreviewRunId}>Run preview</button>
        </div>

        {previewResult && <PreviewResultView result={previewResult} questions={questions} />}
      </section>
    </div>
  );
}

function BlockEditor(props: {
  block: ReportBlock;
  blockIndex: number;
  blocks: ReportBlock[];
  canEdit: boolean;
  questions: QuestionSourceOption[];
  saving: boolean;
  onUpdateBlock: (blockId: string, updates: Partial<ReportBlock>) => Promise<void>;
  onRemoveBlock: (block: ReportBlock) => Promise<void>;
  onDuplicateBlock: (block: ReportBlock) => Promise<void>;
  onAddSource: (block: ReportBlock) => Promise<void>;
  onUpdateSource: (sourceId: string, updates: Partial<ReportBlockSource>) => Promise<void>;
  onRemoveSource: (sourceId: string) => Promise<void>;
  onReorderBlocks: (items: Array<{ id: string; sort_order: number }>) => Promise<void>;
  onReorderSources: (items: Array<{ id: string; sort_order: number }>) => Promise<void>;
  onUpdateRule: (block: ReportBlock, rule: ReportRuleConfig) => void;
  onUpdateRuleCondition: (block: ReportBlock, index: number, updates: Partial<ReportRuleConfig['conditions'][number]>) => void;
}) {
  const { block, canEdit, questions } = props;
  const sources = [...(block.creator_report_block_sources ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const rule = ensureRuleConfig(block.rule_config);
  const aiConfig = block.ai_config ?? {};

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <input className="rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm font-medium text-charcoal" value={block.heading ?? ''} placeholder="Heading" disabled={!canEdit} onChange={event => props.onUpdateBlock(block.id, { heading: event.target.value || null, block_key: uniqueKey(event.target.value || block.block_key, props.blocks.filter(item => item.id !== block.id).map(item => item.block_key)) })} />
          <select className="rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm" value={block.block_type} disabled={!canEdit} onChange={event => props.onUpdateBlock(block.id, { block_type: event.target.value as ReportBlockType })}>
            {REPORT_BLOCK_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
        {canEdit && <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => props.onReorderBlocks(reorderById(props.blocks, block.id, 'up'))} disabled={props.blockIndex === 0}>Up</button>
          <button className="btn-secondary" onClick={() => props.onReorderBlocks(reorderById(props.blocks, block.id, 'down'))} disabled={props.blockIndex === props.blocks.length - 1}>Down</button>
          <button className="btn-secondary" onClick={() => props.onDuplicateBlock(block)}>Duplicate</button>
          <button className="btn-secondary" onClick={() => props.onRemoveBlock(block)}>Remove</button>
        </div>}
      </div>
      <label className="mt-3 inline-flex items-center gap-2 text-sm text-charcoal-2"><input type="checkbox" checked={block.is_active} disabled={!canEdit} onChange={event => props.onUpdateBlock(block.id, { is_active: event.target.checked })} /> Active block</label>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <textarea className="min-h-24 rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm" placeholder="Static content" value={block.static_content ?? ''} disabled={!canEdit} onChange={event => props.onUpdateBlock(block.id, { static_content: event.target.value || null })} />
        <textarea className="min-h-24 rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm" placeholder="Content template, e.g. {{score.report_creator_dna}}" value={block.content_template ?? ''} disabled={!canEdit} onChange={event => props.onUpdateBlock(block.id, { content_template: event.target.value || null })} />
        <textarea className="min-h-24 rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm" placeholder="Fallback text" value={block.fallback_text ?? ''} disabled={!canEdit} onChange={event => props.onUpdateBlock(block.id, { fallback_text: event.target.value || null })} />
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-surface-2 p-3">
        <div className="flex items-center justify-between gap-2"><h4 className="font-semibold text-charcoal">Sources</h4>{canEdit && <button className="btn-secondary" onClick={() => props.onAddSource(block)}>Add source</button>}</div>
        <div className="mt-3 space-y-2">
          {sources.map((source, sourceIndex) => <SourceEditor key={source.id} source={source} sourceIndex={sourceIndex} sources={sources} questions={questions} canEdit={canEdit} onUpdateSource={props.onUpdateSource} onRemoveSource={props.onRemoveSource} onReorderSources={props.onReorderSources} />)}
          {sources.length === 0 && <p className="text-sm text-charcoal-2">No sources configured.</p>}
        </div>
      </div>

      {(block.block_type === 'rule' || block.block_type === 'hybrid') && (
        <div className="mt-4 rounded-lg border border-white/10 bg-surface-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold text-charcoal">Rule builder</h4>
            <select className="rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm" value={rule.combinator} disabled={!canEdit} onChange={event => props.onUpdateRule(block, { ...rule, combinator: event.target.value as 'and' | 'or' })}>
              <option value="and">AND</option>
              <option value="or">OR</option>
            </select>
          </div>
          <div className="mt-3 space-y-2">
            {rule.conditions.map((condition, index) => <RuleConditionEditor key={index} block={block} condition={condition} index={index} sources={sources} questions={questions} canEdit={canEdit} onUpdateRuleCondition={props.onUpdateRuleCondition} onUpdateRule={props.onUpdateRule} />)}
          </div>
          {canEdit && <button className="btn-secondary mt-3" onClick={() => props.onUpdateRule(block, { ...rule, conditions: [...rule.conditions, { sourceType: sources[0]?.source_type ?? 'score', sourceKey: sources[0]?.source_key ?? 'report_creator_dna', operator: 'equals', value: '' }] })}>Add condition</button>}
        </div>
      )}

      {(block.block_type === 'ai' || block.block_type === 'hybrid') && (
        <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
          <h4 className="font-semibold text-charcoal">AI configuration</h4>
          <p className="mt-1 text-sm text-charcoal-2">AI generation is not enabled yet. Preview uses deterministic fallback behaviour.</p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <textarea className="min-h-24 rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm" placeholder="AI instruction" value={String(aiConfig.instruction ?? '')} disabled={!canEdit} onChange={event => props.onUpdateBlock(block.id, { ai_config: { ...aiConfig, instruction: event.target.value } })} />
            <div className="space-y-3">
              <input className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm" type="number" min="50" max="4000" value={Number(aiConfig.maxOutputLength ?? 600)} disabled={!canEdit} onChange={event => props.onUpdateBlock(block.id, { ai_config: { ...aiConfig, maxOutputLength: Number(event.target.value) } })} />
              <select className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm" value={String(aiConfig.outputFormat ?? 'paragraph')} disabled={!canEdit} onChange={event => props.onUpdateBlock(block.id, { ai_config: { ...aiConfig, outputFormat: event.target.value } })}>
                <option value="paragraph">Paragraph</option>
                <option value="bullets">Bullets</option>
                <option value="json">JSON</option>
              </select>
              <label className="inline-flex items-center gap-2 text-sm text-charcoal-2"><input type="checkbox" checked={block.ai_required} disabled={!canEdit} onChange={event => props.onUpdateBlock(block.id, { ai_required: event.target.checked })} /> Required</label>
            </div>
          </div>
          <label className="mt-3 block text-sm font-medium text-charcoal">Selected evidence sources</label>
          <select multiple className="mt-1 min-h-28 w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm" value={Array.isArray(aiConfig.evidenceSourceIds) ? aiConfig.evidenceSourceIds.map(String) : []} disabled={!canEdit} onChange={event => props.onUpdateBlock(block.id, { ai_config: { ...aiConfig, evidenceSourceIds: [...event.target.selectedOptions].map(option => option.value) } })}>
            {sources.map(source => <option key={source.id} value={source.id}>{sourceLabel(source.source_type, source.source_key, questions)} · {source.purpose}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

function SourceEditor(props: { source: ReportBlockSource; sourceIndex: number; sources: ReportBlockSource[]; questions: QuestionSourceOption[]; canEdit: boolean; onUpdateSource: (sourceId: string, updates: Partial<ReportBlockSource>) => Promise<void>; onRemoveSource: (sourceId: string) => Promise<void>; onReorderSources: (items: Array<{ id: string; sort_order: number }>) => Promise<void> }) {
  const { source, questions, canEdit } = props;
  const canonicalSources = SOURCE_VOCABULARY.filter(item => item.sourceType === source.source_type);
  return <div className="grid gap-2 rounded-lg bg-surface p-3 text-sm lg:grid-cols-[120px_minmax(0,1fr)_120px_auto]">
    <select className="rounded-lg border border-white/10 bg-surface-2 px-2 py-1" value={source.source_type} disabled={!canEdit} onChange={event => {
      const sourceType = event.target.value as ReportSourceType;
      const question = questions[0];
      const canonical = SOURCE_VOCABULARY.find(item => item.sourceType === sourceType);
      void props.onUpdateSource(source.id, { source_type: sourceType, question_id: sourceType === 'question' ? question?.id ?? null : null, source_key: sourceType === 'question' ? question?.questionKey ?? '' : canonical?.sourceKey ?? '' });
    }}>{REPORT_SOURCE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select>
    {source.source_type === 'question' ? <select className="rounded-lg border border-white/10 bg-surface-2 px-2 py-1" value={source.question_id ?? ''} disabled={!canEdit} onChange={event => {
      const question = questions.find(item => item.id === event.target.value);
      if (question) void props.onUpdateSource(source.id, { question_id: question.id, source_key: question.questionKey });
    }}>{questions.map(question => <option key={question.id} value={question.id}>{question.questionText}</option>)}</select> : <select className="rounded-lg border border-white/10 bg-surface-2 px-2 py-1" value={source.source_key} disabled={!canEdit} onChange={event => props.onUpdateSource(source.id, { source_key: event.target.value })}>{canonicalSources.map(item => <option key={item.sourceKey} value={item.sourceKey}>{item.label}</option>)}</select>}
    <select className="rounded-lg border border-white/10 bg-surface-2 px-2 py-1" value={source.purpose} disabled={!canEdit} onChange={event => props.onUpdateSource(source.id, { purpose: event.target.value as ReportSourcePurpose })}>{REPORT_SOURCE_PURPOSES.map(purpose => <option key={purpose} value={purpose}>{purpose}</option>)}</select>
    {canEdit && <div className="flex gap-1"><button className="btn-secondary" onClick={() => props.onReorderSources(reorderById(props.sources, source.id, 'up'))} disabled={props.sourceIndex === 0}>Up</button><button className="btn-secondary" onClick={() => props.onReorderSources(reorderById(props.sources, source.id, 'down'))} disabled={props.sourceIndex === props.sources.length - 1}>Down</button><button className="btn-secondary" onClick={() => props.onRemoveSource(source.id)}>Remove</button></div>}
  </div>;
}

function RuleConditionEditor(props: { block: ReportBlock; condition: ReportRuleConfig['conditions'][number]; index: number; sources: ReportBlockSource[]; questions: QuestionSourceOption[]; canEdit: boolean; onUpdateRuleCondition: (block: ReportBlock, index: number, updates: Partial<ReportRuleConfig['conditions'][number]>) => void; onUpdateRule: (block: ReportBlock, rule: ReportRuleConfig) => void }) {
  const { block, condition, sources, questions, canEdit } = props;
  const rule = ensureRuleConfig(block.rule_config);
  const kind = sourceValueKind(condition.sourceType, condition.sourceKey, questions);
  const operators = validOperatorsForKind(kind);
  const question = condition.sourceType === 'question' ? questions.find(item => item.questionKey === condition.sourceKey) ?? null : null;
  return <div className="grid gap-2 rounded-lg bg-surface p-3 text-sm lg:grid-cols-[minmax(0,1fr)_140px_minmax(160px,0.5fr)_auto]">
    <select className="rounded-lg border border-white/10 bg-surface-2 px-2 py-1" value={`${condition.sourceType}:${condition.sourceKey}`} disabled={!canEdit} onChange={event => {
      const [sourceType, sourceKey] = event.target.value.split(':') as [ReportSourceType, string];
      const nextKind = sourceValueKind(sourceType, sourceKey, questions);
      props.onUpdateRuleCondition(block, props.index, { sourceType, sourceKey, operator: validOperatorsForKind(nextKind)[0], value: nextKind === 'boolean' ? true : nextKind === 'number' ? 0 : '' });
    }}>{sources.map(source => <option key={source.id} value={`${source.source_type}:${source.source_key}`}>{sourceLabel(source.source_type, source.source_key, questions)}</option>)}</select>
    <select className="rounded-lg border border-white/10 bg-surface-2 px-2 py-1" value={operators.includes(condition.operator) ? condition.operator : operators[0]} disabled={!canEdit} onChange={event => props.onUpdateRuleCondition(block, props.index, { operator: event.target.value as ReportRuleOperator })}>{operators.map(operator => <option key={operator} value={operator}>{OPERATOR_LABELS[operator]}</option>)}</select>
    <ExpectedValueEditor kind={kind} question={question} value={condition.value} disabled={!canEdit} onChange={value => props.onUpdateRuleCondition(block, props.index, { value })} />
    {canEdit && <button className="btn-secondary" onClick={() => props.onUpdateRule(block, { ...rule, conditions: rule.conditions.filter((_, index) => index !== props.index) })}>Delete</button>}
  </div>;
}

function ExpectedValueEditor(props: { kind: 'text' | 'number' | 'boolean' | 'array' | 'object'; question: QuestionSourceOption | null; value: JsonValue; disabled: boolean; onChange: (value: JsonValue) => void }) {
  if (props.kind === 'boolean') return <select className="rounded-lg border border-white/10 bg-surface-2 px-2 py-1" value={String(props.value)} disabled={props.disabled} onChange={event => props.onChange(event.target.value === 'true')}><option value="true">true</option><option value="false">false</option></select>;
  if (props.question?.options && props.question.options.length > 0) return <select className="rounded-lg border border-white/10 bg-surface-2 px-2 py-1" value={jsonInputValue(props.value)} disabled={props.disabled} onChange={event => props.onChange(event.target.value)}>{props.question.options.map(option => <option key={questionOptionValue(option)} value={questionOptionValue(option)}>{questionOptionLabel(option)}</option>)}</select>;
  if (props.kind === 'number') return <input className="rounded-lg border border-white/10 bg-surface-2 px-2 py-1" type="number" value={jsonInputValue(props.value)} disabled={props.disabled} onChange={event => props.onChange(parseExpectedValue(event.target.value, 'number'))} />;
  return <input className="rounded-lg border border-white/10 bg-surface-2 px-2 py-1" value={jsonInputValue(props.value)} disabled={props.disabled} placeholder={props.kind === 'array' ? 'Comma-separated values' : 'Expected value'} onChange={event => props.onChange(parseExpectedValue(event.target.value, props.kind))} />;
}

function PreviewResultView({ result, questions }: { result: ReportTemplateEvaluationResult; questions: QuestionSourceOption[] }) {
  return <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
    <div className="rounded-xl border border-white/10 bg-surface-2 p-4"><h3 className="font-semibold text-charcoal">Rendered report blocks</h3><div className="mt-3 space-y-4">{result.renderedSections.map(section => <article key={section.sectionId}><h4 className="text-sm font-semibold text-charcoal">{section.title}</h4><div className="mt-2 space-y-2">{section.blocks.length === 0 ? <p className="text-sm text-charcoal-2">No rendered blocks.</p> : section.blocks.map(block => <div key={block.blockId} className="rounded-lg bg-surface p-3 text-sm text-charcoal-2">{block.heading && <p className="font-medium text-charcoal">{block.heading}</p>}<p className="mt-1 whitespace-pre-wrap">{block.content}</p></div>)}</div></article>)}</div></div>
    <div className="rounded-xl border border-white/10 bg-surface-2 p-4"><h3 className="font-semibold text-charcoal">Derivation trace</h3><div className="mt-3 max-h-[640px] space-y-2 overflow-auto pr-1">{result.executionTrace.map(trace => <div key={trace.blockId} className="rounded-lg bg-surface p-3 text-xs text-charcoal-2"><p className="font-semibold text-charcoal">{trace.blockKey}</p><p>Status: {trace.status}</p><p>Block type: {trace.blockType}</p><p>Included: {trace.included ? 'yes' : 'no'}</p><p>Rule: {trace.ruleEvaluation ? (trace.ruleEvaluation.matched ? 'matched' : 'not matched') : '-'}</p><p>Fallback used: {trace.fallbackUsed ? 'yes' : 'no'}</p>{trace.missingEvidence.length > 0 && <p>Missing evidence: {trace.missingEvidence.join(', ')}</p>}{trace.ruleEvaluation?.conditions.map((condition, index) => <div key={index} className="mt-2 rounded bg-surface-2 p-2"><p className="font-medium text-charcoal">{sourceLabel(condition.sourceType, condition.sourceKey, questions)}</p><p>Actual: {jsonInputValue(condition.actualValue)}</p><p>Operator: {OPERATOR_LABELS[condition.operator]}</p><p>Expected: {jsonInputValue(condition.expectedValue)}</p><p>Result: {condition.matched ? 'matched' : 'not matched'}</p></div>)}{trace.evidenceSnapshot.length > 0 && <div className="mt-2"><p className="font-medium text-charcoal">Evidence</p>{trace.evidenceSnapshot.map((evidence, index) => <p key={index}>{sourceLabel(evidence.sourceType, evidence.sourceKey, questions)}: {jsonInputValue(evidence.value)}{evidence.missing ? ' (missing)' : ''}</p>)}</div>}</div>)}</div></div>
  </div>;
}
