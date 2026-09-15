import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { ReportTemplateEditor } from './ReportTemplateEditor';

type AssessmentTemplateOption = {
  id: string;
  name: string;
  slug: string;
  active_report_template_version_id: string | null;
};

type ReportTemplateVersionSummary = {
  id: string;
  version_number: number;
  status: 'draft' | 'published' | 'superseded';
  created_at: string;
  published_at: string | null;
};

type ReportTemplateSummary = {
  id: string;
  assessment_template_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  creator_assessment_templates?: AssessmentTemplateOption | AssessmentTemplateOption[] | null;
  creator_report_template_versions?: ReportTemplateVersionSummary[] | null;
};

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

export function ReportTemplates() {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const [templates, setTemplates] = useState<ReportTemplateSummary[]>([]);
  const [assessmentTemplates, setAssessmentTemplates] = useState<AssessmentTemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ assessmentTemplateId: '', name: '', description: '' });

  const selectedTemplate = useMemo(
    () => templates.find(template => template.id === templateId) ?? null,
    [templateId, templates],
  );

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [{ data: templateRows, error: templateError }, { data: assessmentRows, error: assessmentError }] = await Promise.all([
        supabase
        .from('creator_report_templates')
        .select(`
          *,
          creator_assessment_templates(id, name, slug, active_report_template_version_id),
          creator_report_template_versions(id, version_number, status, created_at, published_at)
        `)
          .order('created_at', { ascending: false }),
        supabase
          .from('creator_assessment_templates')
          .select('id, name, slug, active_report_template_version_id')
          .order('name', { ascending: true }),
      ]);

      if (templateError) throw templateError;
      if (assessmentError) throw assessmentError;

      setTemplates((templateRows ?? []) as ReportTemplateSummary[]);
      setAssessmentTemplates((assessmentRows ?? []) as AssessmentTemplateOption[]);
      setCreateForm(form => ({
        ...form,
        assessmentTemplateId: form.assessmentTemplateId || assessmentRows?.[0]?.id || '',
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load report templates.';
      setError(message);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createForm.assessmentTemplateId || !createForm.name.trim()) return;

    setCreating(true);
    setError(null);
    try {
      const { data: template, error: templateError } = await supabase
        .from('creator_report_templates')
        .insert({
          assessment_template_id: createForm.assessmentTemplateId,
          name: createForm.name.trim(),
          description: createForm.description.trim() || null,
        })
        .select('id')
        .single();

      if (templateError) throw templateError;

      const { error: versionError } = await supabase
        .from('creator_report_template_versions')
        .insert({
          report_template_id: template.id,
          version_number: 1,
          status: 'draft',
          schema_version: 'fyv-report-template.v1',
        });

      if (versionError) throw versionError;

      await load();
      navigate(`/cockpit/settings/report-templates/${template.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create report template.');
    } finally {
      setCreating(false);
    }
  }

  if (templateId && templateId !== 'new') {
    return <ReportTemplateEditor templateId={templateId} initialTemplate={selectedTemplate} onReload={load} />;
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-surface/95 p-6">
        <p className="text-sm text-charcoal-2" role="status">Loading report templates...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Cockpit Settings</p>
          <h1 className="mt-2 text-2xl font-semibold text-charcoal">Report Templates</h1>
          <p className="mt-2 max-w-2xl text-sm text-charcoal-2">
            Design versioned report templates against assessment templates. This admin surface does not change the legacy creator report path.
          </p>
        </div>
        <Link className="btn-primary inline-flex justify-center" to="/cockpit/settings/report-templates/new">
          New report template
        </Link>
      </header>

      {error && (
        <div className="rounded-xl border border-pink/30 bg-pink/10 p-4 text-sm text-pink" role="alert">
          {error}
        </div>
      )}

      {templateId === 'new' && (
        <form onSubmit={createTemplate} className="rounded-2xl border border-white/10 bg-surface/95 p-5 shadow-xl shadow-black/10">
          <h2 className="text-lg font-semibold text-charcoal">Create Report Template</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-charcoal">
              Assessment template
              <select
                className="mt-1 w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm"
                value={createForm.assessmentTemplateId}
                onChange={event => setCreateForm(form => ({ ...form, assessmentTemplateId: event.target.value }))}
                required
              >
                {assessmentTemplates.map(template => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-charcoal">
              Name
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm"
                value={createForm.name}
                onChange={event => setCreateForm(form => ({ ...form, name: event.target.value }))}
                required
              />
            </label>
          </div>
          <label className="mt-4 block text-sm font-medium text-charcoal">
            Description
            <textarea
              className="mt-1 min-h-24 w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm"
              value={createForm.description}
              onChange={event => setCreateForm(form => ({ ...form, description: event.target.value }))}
            />
          </label>
          <div className="mt-4 flex gap-2">
            <button className="btn-primary" disabled={creating}>{creating ? 'Creating...' : 'Create draft'}</button>
            <Link className="btn-secondary" to="/cockpit/settings/report-templates">Cancel</Link>
          </div>
        </form>
      )}

      {templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-surface/80 p-8 text-center">
          <h2 className="text-lg font-semibold text-charcoal">No report templates yet</h2>
          <p className="mt-2 text-sm text-charcoal-2">Create a draft template to start configuring deterministic report sections and blocks.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {templates.map(template => {
            const assessment = relatedOne(template.creator_assessment_templates);
            const versions = [...(template.creator_report_template_versions ?? [])]
              .sort((a, b) => b.version_number - a.version_number);
            const draft = versions.find(version => version.status === 'draft');
            const latestPublished = versions.find(version => version.status === 'published');
            const activeVersionId = assessment?.active_report_template_version_id ?? null;

            return (
              <Link
                key={template.id}
                to={`/cockpit/settings/report-templates/${template.id}`}
                className="rounded-2xl border border-white/10 bg-surface/95 p-5 shadow-xl shadow-black/10 transition hover:border-accent/50 hover:bg-surface"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-charcoal">{template.name}</h2>
                    <p className="mt-1 text-sm text-charcoal-2">{assessment?.name ?? 'Unknown assessment template'}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${template.is_active ? 'bg-green-500/15 text-green-700' : 'bg-white/10 text-charcoal-2'}`}>
                    {template.is_active ? 'Active' : 'Archived'}
                  </span>
                </div>
                {template.description && <p className="mt-3 line-clamp-2 text-sm text-charcoal-2">{template.description}</p>}
                <div className="mt-4 grid gap-2 text-sm text-charcoal-2 sm:grid-cols-3">
                  <span>Versions: {versions.length}</span>
                  <span>Draft: {draft ? `v${draft.version_number}` : '-'}</span>
                  <span>Published: {latestPublished ? `v${latestPublished.version_number}` : '-'}</span>
                </div>
                <p className="mt-3 text-xs text-charcoal-2">Active report version: {activeVersionId ?? 'not activated'}</p>
                <p className="mt-2 text-xs text-charcoal-2">Updated {formatDate(template.updated_at)}</p>
              </Link>
            );
          })}
        </div>
        )}
    </div>
  );
}
