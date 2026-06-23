import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  archiveQuestion,
  createAssessmentInviteLink,
  createAssessmentTemplate,
  createQuestion,
  deleteQuestion,
  getAssessmentInviteLinks,
  getAssessmentTemplates,
  getQuestionBank,
  getQuestionDeleteEligibility,
  restoreQuestion,
  saveTemplateItems,
  setDefaultTemplate,
  setTemplateActive,
  updateAssessmentTemplate,
  updateQuestion,
} from '@/lib/creators-api';
import type {
  AssessmentQuestionType,
  CreatorAssessmentInviteLink,
  CreatorAssessmentTemplateItem,
  CreatorAssessmentRuntimeTemplate,
  CreatorQuestion,
} from '@/types/creator';

type DraftItem = CreatorAssessmentTemplateItem;
type DeleteEligibility = { canDelete: boolean; reason?: string };

const QUESTION_TYPES: AssessmentQuestionType[] = ['short_text', 'long_text', 'single_choice', 'multi_choice', 'boolean', 'scale'];
const EMPTY_QUESTION = {
  question_key: '',
  response_key: '',
  question_text: '',
  help_text: '',
  section: 'About You',
  question_type: 'long_text' as AssessmentQuestionType,
  scoring_dimension: '',
};
const EMPTY_TEMPLATE = { name: '', slug: '', description: '', duplicateFromTemplateId: '' };
const EMPTY_INVITE = { creatorName: '', creatorEmail: '', notes: '' };
const PUBLIC_ASSESSMENT_ORIGIN = 'https://findyourvertical.online';

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function buildInviteUrl(templateSlug: string, invite: CreatorAssessmentInviteLink): string {
  const params = new URLSearchParams({ ref: invite.invite_code });
  if (invite.creator_email) params.set('email', invite.creator_email);
  return `${PUBLIC_ASSESSMENT_ORIGIN}/a/${templateSlug}?${params.toString()}`;
}

function ordered<T extends { is_included: boolean; sort_order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.is_included !== b.is_included) return a.is_included ? -1 : 1;
    return a.sort_order - b.sort_order;
  });
}

function draftItemsFor(template: CreatorAssessmentRuntimeTemplate | null, bank: CreatorQuestion[]): DraftItem[] {
  if (!template) return [];
  const items = [...(template.items ?? [])] as DraftItem[];
  const questionIds = new Set(items.filter(item => item.item_type === 'question').map(item => item.question_id));
  const maxOrder = Math.max(0, ...items.map(item => item.sort_order));

  bank.forEach((question, index) => {
    if (!question.is_active || questionIds.has(question.id)) return;
    items.push({
      id: `available:${template.id}:${question.id}`,
      template_id: template.id,
      item_type: 'question',
      question_id: question.id,
      title: null,
      description: null,
      is_included: false,
      sort_order: maxOrder + ((index + 1) * 10),
      created_at: question.created_at,
      updated_at: question.updated_at,
      question,
    });
  });

  return ordered(items);
}

export function AssessmentTemplates() {
  const [questions, setQuestions] = useState<CreatorQuestion[]>([]);
  const [templates, setTemplates] = useState<CreatorAssessmentRuntimeTemplate[]>([]);
  const [inviteLinks, setInviteLinks] = useState<CreatorAssessmentInviteLink[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateSlug, setTemplateSlug] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [questionForm, setQuestionForm] = useState(EMPTY_QUESTION);
  const [editingQuestion, setEditingQuestion] = useState<CreatorQuestion | null>(null);
  const [templateForm, setTemplateForm] = useState(EMPTY_TEMPLATE);
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState('');
  const [deleteEligibility, setDeleteEligibility] = useState<Record<string, DeleteEligibility>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [collapsedHeadings, setCollapsedHeadings] = useState<Record<string, boolean>>({});

  const selectedTemplate = templates.find(template => template.id === selectedTemplateId) ?? templates[0] ?? null;
  const selectedInviteLinks = inviteLinks.filter(link => link.template_id === selectedTemplate?.id);
  const existingItemIds = useMemo(() => new Set(selectedTemplate?.items?.map(item => item.id) ?? []), [selectedTemplate]);
  const includedItems = draftItems.filter(item => item.is_included);
  const editorItems = useMemo(() => {
    let collapsed = false;
    return [...includedItems]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(item => {
        if (item.item_type === 'section_heading') {
          collapsed = Boolean(collapsedHeadings[item.id]);
          return { item, hiddenByCollapse: false };
        }

        return { item, hiddenByCollapse: collapsed };
      });
  }, [includedItems, collapsedHeadings]);
  const previewSections = useMemo(() => {
    const sections: Array<{ id: string; title: string; description: string; questions: DraftItem[] }> = [];
    let current: { id: string; title: string; description: string; questions: DraftItem[] } | null = null;

    for (const item of [...includedItems].sort((a, b) => a.sort_order - b.sort_order)) {
      if (item.item_type === 'section_heading') {
        current = {
          id: item.id,
          title: item.title?.trim() || 'Untitled Section',
          description: item.description ?? '',
          questions: [],
        };
        sections.push(current);
        continue;
      }

      if (!item.question?.is_active) continue;
      if (!current) {
        current = {
          id: 'unsectioned',
          title: 'Unsectioned Questions',
          description: '',
          questions: [],
        };
        sections.push(current);
      }
      current.questions.push(item);
    }

    return sections.filter(section => section.questions.length > 0 || section.id !== 'unsectioned');
  }, [includedItems]);
  const activeQuestions = questions.filter(question => question.is_active);
  const archivedQuestions = questions.filter(question => !question.is_active);
  const canSetDefault = Boolean(
    selectedTemplate?.is_active
    && includedItems.some(item => item.item_type === 'question' && item.question?.is_active)
  );

  const initialState = useMemo(() => {
    if (!selectedTemplate) return '';
    return JSON.stringify({
      name: selectedTemplate.name,
      slug: selectedTemplate.slug,
      description: selectedTemplate.description ?? '',
      items: draftItemsFor(selectedTemplate, questions).map(item => ({
        id: item.id,
        item_type: item.item_type,
        question_id: item.question_id,
        title: item.title,
        description: item.description,
        is_included: item.is_included,
        sort_order: item.sort_order,
      })),
    });
  }, [selectedTemplate, questions]);

  const currentState = useMemo(() => JSON.stringify({
    name: templateName,
    slug: templateSlug,
    description: templateDescription,
    items: draftItems.map(item => ({
      id: item.id,
      item_type: item.item_type,
      question_id: item.question_id,
      title: item.title,
      description: item.description,
      is_included: item.is_included,
      sort_order: item.sort_order,
    })),
  }), [templateName, templateSlug, templateDescription, draftItems]);

  const isDirty = Boolean(selectedTemplate) && initialState !== currentState;
  const saveDisabledReason = !selectedTemplate
    ? 'No template selected.'
    : saving
      ? 'Save already in progress.'
      : !isDirty
        ? 'No unsaved changes.'
        : '';
  const archiveDisabledReason = selectedTemplate?.is_default
    ? 'Set another active template as default before archiving this one.'
    : saving
      ? 'Template update already in progress.'
      : '';
  const defaultDisabledReason = !selectedTemplate?.is_active
    ? 'Restore this template before setting it as default.'
    : selectedTemplate?.is_default
      ? 'This template is already the default.'
      : !canSetDefault
        ? 'Template must include at least one active question.'
        : saving
          ? 'Template update already in progress.'
          : '';

  const load = async (preferredTemplateId?: string) => {
    const [bank, loadedTemplates, loadedInviteLinks] = await Promise.all([
      getQuestionBank(),
      getAssessmentTemplates(),
      getAssessmentInviteLinks(),
    ]);
    setQuestions(bank);
    setTemplates(loadedTemplates);
    setInviteLinks(loadedInviteLinks);
    setSelectedTemplateId(current => preferredTemplateId || current || loadedTemplates[0]?.id || '');
    const entries = await Promise.all(bank.map(async question => [question.id, await getQuestionDeleteEligibility(question.id)] as const));
    setDeleteEligibility(Object.fromEntries(entries));
  };

  useEffect(() => {
    load()
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load assessment templates'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedTemplate) {
      setTemplateName('');
      setTemplateSlug('');
      setTemplateDescription('');
      setDraftItems([]);
      return;
    }
    setTemplateName(selectedTemplate.name);
    setTemplateSlug(selectedTemplate.slug);
    setTemplateDescription(selectedTemplate.description ?? '');
    setDraftItems(draftItemsFor(selectedTemplate, questions));
  }, [selectedTemplateId, templates, questions]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const selectTemplate = (templateId: string) => {
    if (isDirty && !window.confirm('Discard unsaved template changes?')) return;
    setError('');
    setSuccess('');
    setSelectedTemplateId(templateId);
  };

  const saveTemplate = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await updateAssessmentTemplate(selectedTemplate.id, {
        name: templateName,
        slug: templateSlug,
        description: templateDescription || null,
      });
      await saveTemplateItems(
        selectedTemplate.id,
        draftItems.filter(item => item.is_included || existingItemIds.has(item.id))
      );
      await load(selectedTemplate.id);
      setSuccess('Template changes saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save template changes');
    } finally {
      setSaving(false);
    }
  };

  const addHeading = () => {
    if (!selectedTemplate) {
      setError('Select or create a template before adding a heading.');
      return;
    }
    setError('');
    setSuccess('');
    const nextOrder = Math.max(0, ...includedItems.map(item => item.sort_order)) + 10;
    setDraftItems(current => ordered([
      ...current,
      {
        id: `new-heading-${Date.now()}`,
        template_id: selectedTemplateId,
        item_type: 'section_heading',
        question_id: null,
        title: 'New Section Heading',
        description: '',
        is_included: true,
        sort_order: nextOrder,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        question: null,
      },
    ]));
  };

  const updateItem = (id: string, changes: Partial<DraftItem>) => {
    setDraftItems(current => current.map(item => item.id === id ? { ...item, ...changes } : item));
  };

  const toggleItem = (item: DraftItem) => {
    if (item.item_type === 'question' && !item.question?.is_active && !item.is_included) return;
    updateItem(item.id, { is_included: !item.is_included });
  };

  const moveItem = (item: DraftItem, direction: -1 | 1) => {
    const visible = [...includedItems].sort((a, b) => a.sort_order - b.sort_order);
    const index = visible.findIndex(current => current.id === item.id);
    const target = index + direction;
    if (target < 0 || target >= visible.length) return;
    [visible[index], visible[target]] = [visible[target], visible[index]];
    const order = new Map(visible.map((current, orderIndex) => [current.id, (orderIndex + 1) * 10]));
    setDraftItems(current => ordered(current.map(row => order.has(row.id) ? { ...row, sort_order: order.get(row.id)! } : row)));
  };

  const duplicateQuestionPlacement = (item: DraftItem) => {
    if (item.item_type !== 'question' || !item.question) return;
    const visible = [...includedItems].sort((a, b) => a.sort_order - b.sort_order);
    const index = visible.findIndex(current => current.id === item.id);
    const clone: DraftItem = {
      ...item,
      id: `new-question-placement-${Date.now()}`,
      sort_order: item.sort_order + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const nextVisible = [...visible.slice(0, index + 1), clone, ...visible.slice(index + 1)];
    const order = new Map(nextVisible.map((current, orderIndex) => [current.id, (orderIndex + 1) * 10]));
    setDraftItems(current => ordered([
      ...current.map(row => order.has(row.id) ? { ...row, sort_order: order.get(row.id)! } : row),
      { ...clone, sort_order: order.get(clone.id)! },
    ]));
  };

  const duplicateSection = (heading: DraftItem) => {
    if (heading.item_type !== 'section_heading') return;
    const includeQuestions = window.confirm('Duplicate the questions under this section too? Choose Cancel to duplicate only the heading.');
    const visible = [...includedItems].sort((a, b) => a.sort_order - b.sort_order);
    const headingIndex = visible.findIndex(item => item.id === heading.id);
    const nextHeadingIndex = visible.findIndex((item, index) => index > headingIndex && item.item_type === 'section_heading');
    const sectionQuestions = nextHeadingIndex === -1
      ? visible.slice(headingIndex + 1)
      : visible.slice(headingIndex + 1, nextHeadingIndex);
    const now = Date.now();
    const clones: DraftItem[] = [
      {
        ...heading,
        id: `new-heading-${now}`,
        title: `${heading.title ?? 'Section Heading'} Copy`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      ...(includeQuestions ? sectionQuestions.map((item, index) => ({
        ...item,
        id: `new-section-question-placement-${now}-${index}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })) : []),
    ];
    const insertIndex = nextHeadingIndex === -1 ? visible.length : nextHeadingIndex;
    const nextVisible = [...visible.slice(0, insertIndex), ...clones, ...visible.slice(insertIndex)];
    const order = new Map(nextVisible.map((item, index) => [item.id, (index + 1) * 10]));
    setDraftItems(current => ordered([
      ...current.map(row => order.has(row.id) ? { ...row, sort_order: order.get(row.id)! } : row),
      ...clones.map(clone => ({ ...clone, sort_order: order.get(clone.id)! })),
    ]));
  };

  const toggleHeadingCollapsed = (id: string) => {
    setCollapsedHeadings(current => ({ ...current, [id]: !current[id] }));
  };

  const submitQuestion = async (event?: FormEvent) => {
    event?.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (editingQuestion) {
        await updateQuestion(editingQuestion.id, {
          question_text: questionForm.question_text,
          help_text: questionForm.help_text || null,
          options: editingQuestion.options,
        });
        setSuccess('Question updated.');
      } else {
        await createQuestion({
          question_key: questionForm.question_key,
          response_key: questionForm.response_key,
          question_text: questionForm.question_text,
          help_text: questionForm.help_text || null,
          section: questionForm.section,
          question_type: questionForm.question_type,
          scoring_dimension: questionForm.scoring_dimension || null,
          options: [],
        });
        setSuccess('Question created.');
      }
      setEditingQuestion(null);
      setQuestionForm(EMPTY_QUESTION);
      await load(selectedTemplateId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save question');
    } finally {
      setSaving(false);
    }
  };

  const editQuestion = (question: CreatorQuestion) => {
    setEditingQuestion(question);
    setQuestionForm({
      question_key: question.question_key,
      response_key: question.response_key,
      question_text: question.question_text,
      help_text: question.help_text ?? '',
      section: question.section,
      question_type: question.question_type,
      scoring_dimension: question.scoring_dimension ?? '',
    });
  };

  const createTemplate = async (event?: FormEvent) => {
    event?.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const template = await createAssessmentTemplate({
        name: templateForm.name,
        slug: templateForm.slug || null,
        description: templateForm.description || null,
        duplicateFromTemplateId: templateForm.duplicateFromTemplateId || null,
      });
      setTemplateForm(EMPTY_TEMPLATE);
      await load(template.id);
      setSuccess('Template created. It starts inactive until restored.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create template');
    } finally {
      setSaving(false);
    }
  };

  const openInviteModal = () => {
    if (!selectedTemplate) return;
    setInviteForm(EMPTY_INVITE);
    setGeneratedInviteUrl('');
    setInviteModalOpen(true);
  };

  const createInviteLink = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!selectedTemplate || !inviteForm.creatorName.trim()) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const invite = await createAssessmentInviteLink({
        templateId: selectedTemplate.id,
        creatorName: inviteForm.creatorName,
        creatorEmail: inviteForm.creatorEmail || null,
        notes: inviteForm.notes || null,
      });
      const url = buildInviteUrl(selectedTemplate.slug, invite);
      setGeneratedInviteUrl(url);
      await load(selectedTemplate.id);
      setSuccess('Invite link generated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate invite link');
    } finally {
      setSaving(false);
    }
  };

  const copyInviteUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setSuccess('Invite URL copied.');
  };

  const setTemplateStatus = async (isActive: boolean) => {
    if (!selectedTemplate) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await setTemplateActive(selectedTemplate.id, isActive);
      await load(selectedTemplate.id);
      setSuccess(isActive ? 'Template restored.' : 'Template archived.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update template status');
    } finally {
      setSaving(false);
    }
  };

  const makeDefault = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (isDirty) {
        await updateAssessmentTemplate(selectedTemplate.id, {
          name: templateName,
          slug: templateSlug,
          description: templateDescription || null,
        });
        await saveTemplateItems(
          selectedTemplate.id,
          draftItems.filter(item => item.is_included || existingItemIds.has(item.id))
        );
      }
      await setDefaultTemplate(selectedTemplate.id);
      await load(selectedTemplate.id);
      setSuccess('Default template updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set default template');
    } finally {
      setSaving(false);
    }
  };

  const questionAction = async (question: CreatorQuestion, action: 'archive' | 'restore' | 'delete') => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (action === 'archive') await archiveQuestion(question.id);
      if (action === 'restore') await restoreQuestion(question.id);
      if (action === 'delete') {
        if (!window.confirm(`Delete "${question.question_text}" permanently?`)) return;
        await deleteQuestion(question.id);
      }
      await load(selectedTemplateId);
      setSuccess(action === 'archive' ? 'Question archived.' : action === 'restore' ? 'Question restored.' : 'Question deleted.');
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action} question`);
    } finally {
      setSaving(false);
    }
  };

  const renderPreviewInput = (item: DraftItem) => {
    const question = item.question;
    if (!question) return null;

    if (question.question_type === 'long_text' || question.question_type === 'textarea') {
      return <textarea disabled rows={Number(question.config.rows ?? 3)} className="mt-2 w-full resize-none rounded-lg border border-gray-300 bg-surface-2 px-4 py-3 text-sm text-gray-500" placeholder="Preview response" />;
    }

    if (question.question_type === 'short_text') {
      return <input disabled className="mt-2 w-full rounded-lg border border-gray-300 bg-surface-2 px-4 py-3 text-sm text-gray-500" placeholder="Preview response" />;
    }

    if (question.question_type === 'scale') {
      return <input disabled type="range" min={Number(question.config.min ?? 1)} max={Number(question.config.max ?? 10)} className="mt-3 w-full accent-accent" />;
    }

    if (question.question_type === 'boolean') {
      return (
        <div className="mt-3 flex gap-2">
          <button type="button" disabled className="rounded-full border border-gray-300 px-5 py-2 text-sm text-gray-500">{String(question.config.trueLabel ?? 'Yes')}</button>
          <button type="button" disabled className="rounded-full border border-gray-300 px-5 py-2 text-sm text-gray-500">{String(question.config.falseLabel ?? 'No')}</button>
        </div>
      );
    }

    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {question.options.map((option, index) => {
          const label = typeof option === 'string' ? option : option.label;
          return <button type="button" disabled key={`${label}-${index}`} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-500">{label}</button>;
        })}
        {question.options.length === 0 && <span className="text-xs text-gray-600">No options configured.</span>}
      </div>
    );
  };

  if (loading) return <p className="text-sm text-gray-500">Loading Assessment Templates…</p>;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-500">Settings</p>
        <h1 className="font-display text-2xl font-bold text-gray-900">Assessment Templates</h1>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{success}</div>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
            <div className="border-b border-gray-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-900">Template Editor</h2>
                  <p className="text-xs text-gray-500">Templates contain ordered section headings and questions.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select value={selectedTemplate?.id ?? ''} onChange={e => selectTemplate(e.target.value)} className="rounded-lg border border-gray-300 bg-surface-2 px-3 py-2 text-sm text-gray-900">
                    {templates.map(template => (
                      <option key={template.id} value={template.id}>{template.name}{template.is_default ? ' (default)' : ''}{template.is_active ? '' : ' (archived)'}</option>
                    ))}
                  </select>
                  <button type="button" onClick={saveTemplate} disabled={Boolean(saveDisabledReason)} title={saveDisabledReason || undefined} className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Save Template Changes</button>
                  <button type="button" onClick={() => setPreviewOpen(true)} disabled={!selectedTemplate} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 disabled:opacity-50">Preview Assessment</button>
                  <button type="button" onClick={openInviteModal} disabled={!selectedTemplate} className="rounded-lg border border-accent/40 px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50">Generate Invite Link</button>
                </div>
              </div>
              {saveDisabledReason && <p className="mt-2 text-xs text-gray-500">Save: {saveDisabledReason}</p>}
            </div>

            {!selectedTemplate ? (
              <p className="p-6 text-sm text-gray-500">No templates yet.</p>
            ) : (
              <div className="space-y-5 p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_1.5fr]">
                  <input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Template name" className="rounded-lg border border-gray-300 bg-surface-2 px-3 py-2 text-sm text-gray-900" />
                  <input value={templateSlug} onChange={e => setTemplateSlug(normalizeKey(e.target.value).replace(/_/g, '-'))} placeholder="URL slug" className="rounded-lg border border-gray-300 bg-surface-2 px-3 py-2 text-sm text-gray-900" />
                  <input value={templateDescription} onChange={e => setTemplateDescription(e.target.value)} placeholder="Description" className="rounded-lg border border-gray-300 bg-surface-2 px-3 py-2 text-sm text-gray-900" />
                </div>
                <p className="text-xs text-gray-500">Invite URL base: /a/{templateSlug || selectedTemplate.slug}. Share generated invite links only.</p>

                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${selectedTemplate.is_active ? 'bg-success/10 text-success' : 'bg-warn/10 text-warn'}`}>{selectedTemplate.is_active ? 'Active' : 'Archived'}</span>
                  {selectedTemplate.is_default && <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">Current Default</span>}
                  {isDirty && <span className="rounded-full bg-warn/10 px-3 py-1 text-xs font-semibold text-warn">Draft changes unsaved</span>}
                  <button type="button" onClick={addHeading} disabled={!selectedTemplate || saving} title={!selectedTemplate ? 'Select or create a template before adding a heading.' : saving ? 'Template update already in progress.' : undefined} className="rounded-lg border border-accent/40 px-3 py-1.5 text-sm text-accent disabled:opacity-50">Add Section Heading</button>
                  {selectedTemplate.is_active ? (
                    <button type="button" onClick={() => setTemplateStatus(false)} disabled={Boolean(archiveDisabledReason)} title={archiveDisabledReason || undefined} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 disabled:opacity-50">Archive Template</button>
                  ) : (
                    <button type="button" onClick={() => setTemplateStatus(true)} disabled={saving} title={saving ? 'Template update already in progress.' : undefined} className="rounded-lg border border-accent/40 px-3 py-1.5 text-sm text-accent disabled:opacity-50">Restore Template</button>
                  )}
                  <button type="button" onClick={makeDefault} disabled={Boolean(defaultDisabledReason)} title={defaultDisabledReason || undefined} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Set as Default</button>
                </div>
                {(archiveDisabledReason || defaultDisabledReason) && (
                  <div className="space-y-1 text-xs text-gray-500">
                    {archiveDisabledReason && <p>Archive: {archiveDisabledReason}</p>}
                    {defaultDisabledReason && <p>Default: {defaultDisabledReason}</p>}
                  </div>
                )}

                {selectedInviteLinks.length > 0 && (
                  <div className="rounded-lg border border-gray-200">
                    <div className="border-b border-gray-200 px-4 py-3">
                      <h3 className="font-semibold text-gray-900">Invite Links</h3>
                    </div>
                    <div className="divide-y divide-gray-200">
                      {selectedInviteLinks.slice(0, 5).map(link => {
                        const url = buildInviteUrl(selectedTemplate.slug, link);
                        return (
                          <div key={link.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                            <div>
                              <p className="text-sm font-medium text-gray-800">{link.creator_name}</p>
                              <p className="text-xs text-gray-500">{link.invite_code}{link.creator_email ? ` - ${link.creator_email}` : ''}</p>
                            </div>
                            <button type="button" onClick={() => copyInviteUrl(url)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700">Copy URL</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                  <div className="rounded-lg border border-gray-200">
                    <div className="border-b border-gray-200 px-4 py-3">
                      <h3 className="font-semibold text-gray-900">Template Items</h3>
                      <p className="text-xs text-gray-500">Questions sit under the preceding heading. Remove a heading without deleting questions by unchecking/removing the heading row.</p>
                    </div>
                    <div className="divide-y divide-gray-200">
                      {includedItems.length === 0 && <p className="p-4 text-sm text-gray-500">No selected questions or headings yet.</p>}
                      {editorItems.map(({ item, hiddenByCollapse }) => item.item_type === 'section_heading' ? (
                        <div key={item.id} className="bg-accent/5 p-4">
                          <div className="flex items-start gap-3">
                            <input type="checkbox" checked={item.is_included} onChange={() => toggleItem(item)} className="mt-2 accent-accent" />
                            <div className="min-w-0 flex-1 space-y-2">
                              <input value={item.title ?? ''} onChange={e => updateItem(item.id, { title: e.target.value })} className="w-full rounded-lg border border-accent/30 bg-surface-2 px-3 py-2 font-semibold text-gray-900" />
                              <textarea value={item.description ?? ''} onChange={e => updateItem(item.id, { description: e.target.value })} rows={2} placeholder="Heading description / help text" className="w-full resize-none rounded-lg border border-gray-300 bg-surface-2 px-3 py-2 text-sm text-gray-700" />
                              <p className="text-xs uppercase tracking-wide text-accent">Section Heading</p>
                            </div>
                            <div className="flex shrink-0 flex-col gap-1">
                              <button type="button" onClick={() => toggleHeadingCollapsed(item.id)} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700">{collapsedHeadings[item.id] ? 'Expand' : 'Collapse'}</button>
                              <button type="button" onClick={() => moveItem(item, -1)} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700">Up</button>
                              <button type="button" onClick={() => moveItem(item, 1)} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700">Down</button>
                              <button type="button" onClick={() => duplicateSection(item)} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700">Duplicate</button>
                              <button type="button" onClick={() => toggleItem(item)} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700">Remove</button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div key={item.id} className={`p-4 ${item.question?.is_active ? '' : 'bg-warn/5'} ${hiddenByCollapse ? 'hidden' : ''}`}>
                          <div className="flex items-start gap-3">
                            <input type="checkbox" checked={item.is_included} onChange={() => toggleItem(item)} className="mt-1 accent-accent" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-gray-900">{item.question?.question_text ?? 'Missing question'}</p>
                              <p className="mt-1 text-xs text-gray-500">{item.question?.section} Â· {item.question?.question_type}</p>
                              {item.question && !item.question.is_active && <p className="mt-2 text-xs text-warn">Archived question. Remove it or restore it from the bank.</p>}
                            </div>
                            <div className="flex shrink-0 flex-col gap-1">
                              <button type="button" onClick={() => moveItem(item, -1)} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700">Up</button>
                              <button type="button" onClick={() => moveItem(item, 1)} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700">Down</button>
                              <button type="button" onClick={() => duplicateQuestionPlacement(item)} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700">Duplicate</button>
                              <button type="button" onClick={() => toggleItem(item)} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700">Remove</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-200">
                    <div className="border-b border-gray-200 px-4 py-3">
                      <h3 className="font-semibold text-gray-900">Available Active Questions</h3>
                      <p className="text-xs text-gray-500">Archived questions are not selectable for new inclusion unless restored.</p>
                    </div>
                    <div className="divide-y divide-gray-200">
                      {activeQuestions.length === 0 && <p className="p-4 text-sm text-gray-500">No active questions available.</p>}
                      {draftItems.filter(item => item.item_type === 'question' && item.question?.is_active && !item.is_included).map(item => (
                        <label key={item.id} className="flex cursor-pointer items-start gap-3 p-4">
                          <input type="checkbox" checked={item.is_included} onChange={() => toggleItem(item)} className="mt-1 accent-accent" />
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium text-gray-900">{item.question?.question_text}</span>
                            <span className="mt-1 block text-xs text-gray-500">{item.question?.section} Â· {item.question?.question_type}</span>
                          </span>
                        </label>
                      ))}
                      {activeQuestions.length > 0 && draftItems.filter(item => item.item_type === 'question' && item.question?.is_active && !item.is_included).length === 0 && (
                        <p className="p-4 text-sm text-gray-500">All active bank questions are selected in this template.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
            <div className="border-b border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900">Create New Template</h2>
              <p className="text-xs text-gray-500">New templates start archived/non-default. Restore them when ready, then set default after at least one active question is included.</p>
            </div>
            <form onSubmit={createTemplate} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[1fr_1fr_1fr_220px_auto]">
              <input value={templateForm.name} onChange={e => setTemplateForm(current => ({ ...current, name: e.target.value }))} placeholder="Template name" required className="rounded-lg border border-gray-300 bg-surface-2 px-3 py-2 text-sm text-gray-900" />
              <input value={templateForm.slug} onChange={e => setTemplateForm(current => ({ ...current, slug: normalizeKey(e.target.value).replace(/_/g, '-') }))} placeholder="URL slug" className="rounded-lg border border-gray-300 bg-surface-2 px-3 py-2 text-sm text-gray-900" />
              <input value={templateForm.description} onChange={e => setTemplateForm(current => ({ ...current, description: e.target.value }))} placeholder="Description" className="rounded-lg border border-gray-300 bg-surface-2 px-3 py-2 text-sm text-gray-900" />
              <select value={templateForm.duplicateFromTemplateId} onChange={e => setTemplateForm(current => ({ ...current, duplicateFromTemplateId: e.target.value }))} className="rounded-lg border border-gray-300 bg-surface-2 px-3 py-2 text-sm text-gray-900">
                <option value="">Start blank</option>
                {templates.map(template => <option key={template.id} value={template.id}>Duplicate {template.name}</option>)}
              </select>
              <button type="button" onClick={() => createTemplate()} disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Create Template</button>
            </form>
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
            <div className="border-b border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900">Question Bank</h2>
              <p className="text-xs text-gray-500">Archived questions stay in history and are not available for new templates unless restored.</p>
            </div>
            <div className="divide-y divide-gray-200">
              {[...activeQuestions, ...archivedQuestions].map(question => {
                const eligibility = deleteEligibility[question.id] ?? { canDelete: false, reason: 'Checking delete safety…' };
                return (
                  <div key={question.id} className={`p-4 ${question.is_active ? '' : 'bg-warn/5'}`}>
                    <p className="font-medium text-gray-900">{question.question_text}</p>
                    <p className="mb-3 mt-1 text-xs text-gray-500">{question.question_key} Â· {question.section} Â· {question.question_type}{question.is_active ? '' : ' Â· archived'}</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => editQuestion(question)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-800">Edit Question</button>
                      {question.is_active ? (
                        <button type="button" onClick={() => questionAction(question, 'archive')} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700">Archive Question</button>
                      ) : (
                        <button type="button" onClick={() => questionAction(question, 'restore')} className="rounded-lg border border-accent/40 px-3 py-1.5 text-sm text-accent">Restore Question</button>
                      )}
                      <button type="button" onClick={() => questionAction(question, 'delete')} disabled={!eligibility.canDelete} title={eligibility.reason} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 disabled:opacity-50">Delete Question</button>
                      {!eligibility.canDelete && <span className="text-xs text-gray-500">{eligibility.reason}</span>}
                    </div>
                  </div>
                );
              })}
              {questions.length === 0 && <p className="p-4 text-sm text-gray-500">No question bank questions yet.</p>}
            </div>
          </div>
        </section>

        <aside className="h-fit rounded-lg border border-gray-200 bg-surface p-4">
          <h2 className="font-semibold text-gray-900">{editingQuestion ? 'Edit Question' : 'Add Question'}</h2>
          <form onSubmit={submitQuestion} className="mt-4 space-y-3">
            <input value={questionForm.question_text} onChange={e => {
              const question_text = e.target.value;
              setQuestionForm(current => {
                const key = !editingQuestion ? normalizeKey(question_text) : current.question_key;
                return { ...current, question_text, question_key: key, response_key: !editingQuestion ? key : current.response_key };
              });
            }} placeholder="Question text" required className="w-full rounded-lg border border-gray-300 bg-surface-2 px-3 py-2 text-sm text-gray-900" />
            <textarea value={questionForm.help_text} onChange={e => setQuestionForm(current => ({ ...current, help_text: e.target.value }))} placeholder="Help text" rows={3} className="w-full resize-none rounded-lg border border-gray-300 bg-surface-2 px-3 py-2 text-sm text-gray-900" />
            <div className="grid grid-cols-2 gap-2">
              <input value={questionForm.question_key} onChange={e => setQuestionForm(current => ({ ...current, question_key: normalizeKey(e.target.value) }))} disabled={Boolean(editingQuestion)} placeholder="question_key" required className="rounded-lg border border-gray-300 bg-surface-2 px-3 py-2 text-sm text-gray-900 disabled:opacity-60" />
              <input value={questionForm.response_key} onChange={e => setQuestionForm(current => ({ ...current, response_key: normalizeKey(e.target.value) }))} disabled={Boolean(editingQuestion)} placeholder="response_key" required className="rounded-lg border border-gray-300 bg-surface-2 px-3 py-2 text-sm text-gray-900 disabled:opacity-60" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={questionForm.section} onChange={e => setQuestionForm(current => ({ ...current, section: e.target.value }))} disabled={Boolean(editingQuestion)} placeholder="Section" className="rounded-lg border border-gray-300 bg-surface-2 px-3 py-2 text-sm text-gray-900 disabled:opacity-60" />
              <select value={questionForm.question_type} onChange={e => setQuestionForm(current => ({ ...current, question_type: e.target.value as AssessmentQuestionType }))} disabled={Boolean(editingQuestion)} className="rounded-lg border border-gray-300 bg-surface-2 px-3 py-2 text-sm text-gray-900 disabled:opacity-60">
                {QUESTION_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <input value={questionForm.scoring_dimension} onChange={e => setQuestionForm(current => ({ ...current, scoring_dimension: e.target.value }))} disabled={Boolean(editingQuestion)} placeholder="Scoring dimension" className="w-full rounded-lg border border-gray-300 bg-surface-2 px-3 py-2 text-sm text-gray-900 disabled:opacity-60" />
            <div className="flex gap-2">
              <button type="button" onClick={() => submitQuestion()} disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : editingQuestion ? 'Save Question' : 'Add Question'}</button>
              {editingQuestion && <button type="button" onClick={() => { setEditingQuestion(null); setQuestionForm(EMPTY_QUESTION); }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700">Cancel</button>}
            </div>
          </form>
        </aside>
      </div>

      {inviteModalOpen && selectedTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 px-4">
          <div className="w-full max-w-lg rounded-lg border border-gray-200 bg-surface p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold text-gray-900">Generate Invite Link</h2>
                <p className="mt-1 text-xs text-gray-500">Template: {selectedTemplate.name}</p>
              </div>
              <button type="button" onClick={() => setInviteModalOpen(false)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700">Close</button>
            </div>
            <form onSubmit={createInviteLink} className="space-y-3">
              <input value={inviteForm.creatorName} onChange={e => setInviteForm(current => ({ ...current, creatorName: e.target.value }))} placeholder="Creator name" required className="w-full rounded-lg border border-gray-300 bg-surface-2 px-3 py-2 text-sm text-gray-900" />
              <input type="email" value={inviteForm.creatorEmail} onChange={e => setInviteForm(current => ({ ...current, creatorEmail: e.target.value }))} placeholder="Email optional" className="w-full rounded-lg border border-gray-300 bg-surface-2 px-3 py-2 text-sm text-gray-900" />
              <textarea value={inviteForm.notes} onChange={e => setInviteForm(current => ({ ...current, notes: e.target.value }))} rows={3} placeholder="Notes" className="w-full resize-none rounded-lg border border-gray-300 bg-surface-2 px-3 py-2 text-sm text-gray-900" />
              <button type="submit" disabled={saving || !inviteForm.creatorName.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Create Invite</button>
            </form>
            {generatedInviteUrl && (
              <div className="mt-4 rounded-lg border border-accent/30 bg-accent/10 p-3">
                <p className="break-all text-sm text-gray-900">{generatedInviteUrl}</p>
                <button type="button" onClick={() => copyInviteUrl(generatedInviteUrl)} className="mt-3 rounded-lg border border-accent/40 px-3 py-1.5 text-sm text-accent">Copy</button>
              </div>
            )}
          </div>
        </div>
      )}

      {previewOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-white/85 px-4 py-8">
          <div className="mx-auto max-w-3xl rounded-lg border border-gray-200 bg-gray-50 shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-200 bg-gray-50 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-warn">Preview Only</p>
                <h2 className="font-display text-xl font-semibold text-gray-900">{templateName || selectedTemplate?.name || 'Assessment Template'}</h2>
                <p className="mt-1 text-sm text-gray-500">This preview uses unsaved draft changes and cannot submit assessment data.</p>
              </div>
              <button type="button" onClick={() => setPreviewOpen(false)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700">Close</button>
            </div>

            <div className="space-y-8 px-5 py-6">
              {previewSections.length === 0 && (
                <p className="rounded-lg border border-gray-200 bg-surface p-4 text-sm text-gray-500">No active included questions to preview.</p>
              )}
              {previewSections.map(section => (
                <section key={section.id} className="space-y-5">
                  <div>
                    <h3 className="font-display text-xl font-semibold text-gray-900">{section.title}</h3>
                    {section.description && <p className="mt-2 text-sm leading-6 text-gray-500">{section.description}</p>}
                  </div>
                  <div className="space-y-5">
                    {section.questions.map(item => (
                      <div key={item.id} className="rounded-lg border border-gray-200 bg-surface p-4">
                        <label className="block text-sm font-medium text-gray-700">{item.question?.question_text}</label>
                        {item.question?.help_text && <p className="mt-1 text-xs text-gray-500">{item.question.help_text}</p>}
                        {renderPreviewInput(item)}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              <div className="rounded-lg border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
                Preview mode only. The public wizard opens from generated invite links only.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



