import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  archiveQuestion,
  createAssessmentTemplate,
  createQuestion,
  deleteQuestion,
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
const EMPTY_TEMPLATE = { name: '', description: '', duplicateFromTemplateId: '' };

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
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
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [questionForm, setQuestionForm] = useState(EMPTY_QUESTION);
  const [editingQuestion, setEditingQuestion] = useState<CreatorQuestion | null>(null);
  const [templateForm, setTemplateForm] = useState(EMPTY_TEMPLATE);
  const [deleteEligibility, setDeleteEligibility] = useState<Record<string, DeleteEligibility>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selectedTemplate = templates.find(template => template.id === selectedTemplateId) ?? templates[0] ?? null;
  const existingItemIds = useMemo(() => new Set(selectedTemplate?.items?.map(item => item.id) ?? []), [selectedTemplate]);
  const includedItems = draftItems.filter(item => item.is_included);
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
  }), [templateName, templateDescription, draftItems]);

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
    const [bank, loadedTemplates] = await Promise.all([getQuestionBank(), getAssessmentTemplates()]);
    setQuestions(bank);
    setTemplates(loadedTemplates);
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
      setTemplateDescription('');
      setDraftItems([]);
      return;
    }
    setTemplateName(selectedTemplate.name);
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

  if (loading) return <p className="text-sm text-gray-500">Loading assessment templates...</p>;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-500">Settings</p>
        <h1 className="font-display text-2xl font-bold text-gray-100">Assessment Templates</h1>
      </div>

      {error && <div className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">{error}</div>}
      {success && <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{success}</div>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-gray-800 bg-surface">
            <div className="border-b border-gray-800 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-100">Template Editor</h2>
                  <p className="text-xs text-gray-500">Templates contain ordered section headings and questions.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select value={selectedTemplate?.id ?? ''} onChange={e => selectTemplate(e.target.value)} className="rounded-lg border border-gray-700 bg-surface-2 px-3 py-2 text-sm text-gray-100">
                    {templates.map(template => (
                      <option key={template.id} value={template.id}>{template.name}{template.is_default ? ' (default)' : ''}{template.is_active ? '' : ' (archived)'}</option>
                    ))}
                  </select>
                  <button type="button" onClick={saveTemplate} disabled={Boolean(saveDisabledReason)} title={saveDisabledReason || undefined} className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-gray-950 disabled:opacity-50">Save Template Changes</button>
                </div>
              </div>
              {saveDisabledReason && <p className="mt-2 text-xs text-gray-500">Save: {saveDisabledReason}</p>}
            </div>

            {!selectedTemplate ? (
              <p className="p-6 text-sm text-gray-500">No templates yet.</p>
            ) : (
              <div className="space-y-5 p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.5fr]">
                  <input value={templateName} onChange={e => setTemplateName(e.target.value)} className="rounded-lg border border-gray-700 bg-surface-2 px-3 py-2 text-sm text-gray-100" />
                  <input value={templateDescription} onChange={e => setTemplateDescription(e.target.value)} placeholder="Description" className="rounded-lg border border-gray-700 bg-surface-2 px-3 py-2 text-sm text-gray-100" />
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${selectedTemplate.is_active ? 'bg-success/10 text-success' : 'bg-warn/10 text-warn'}`}>{selectedTemplate.is_active ? 'Active' : 'Archived'}</span>
                  {selectedTemplate.is_default && <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">Default</span>}
                  <button type="button" onClick={addHeading} disabled={!selectedTemplate || saving} title={!selectedTemplate ? 'Select or create a template before adding a heading.' : saving ? 'Template update already in progress.' : undefined} className="rounded-lg border border-accent/40 px-3 py-1.5 text-sm text-accent disabled:opacity-50">Add Section Heading</button>
                  {selectedTemplate.is_active ? (
                    <button type="button" onClick={() => setTemplateStatus(false)} disabled={Boolean(archiveDisabledReason)} title={archiveDisabledReason || undefined} className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 disabled:opacity-50">Archive Template</button>
                  ) : (
                    <button type="button" onClick={() => setTemplateStatus(true)} disabled={saving} title={saving ? 'Template update already in progress.' : undefined} className="rounded-lg border border-accent/40 px-3 py-1.5 text-sm text-accent disabled:opacity-50">Restore Template</button>
                  )}
                  <button type="button" onClick={makeDefault} disabled={Boolean(defaultDisabledReason)} title={defaultDisabledReason || undefined} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-gray-950 disabled:opacity-50">Set as Default</button>
                </div>
                {(archiveDisabledReason || defaultDisabledReason) && (
                  <div className="space-y-1 text-xs text-gray-500">
                    {archiveDisabledReason && <p>Archive: {archiveDisabledReason}</p>}
                    {defaultDisabledReason && <p>Default: {defaultDisabledReason}</p>}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                  <div className="rounded-lg border border-gray-800">
                    <div className="border-b border-gray-800 px-4 py-3">
                      <h3 className="font-semibold text-gray-100">Template Items</h3>
                      <p className="text-xs text-gray-500">Questions sit under the preceding heading. Remove a heading without deleting questions by unchecking/removing the heading row.</p>
                    </div>
                    <div className="divide-y divide-gray-800">
                      {includedItems.length === 0 && <p className="p-4 text-sm text-gray-500">No selected questions or headings yet.</p>}
                      {includedItems.map(item => item.item_type === 'section_heading' ? (
                        <div key={item.id} className="bg-accent/5 p-4">
                          <div className="flex items-start gap-3">
                            <input type="checkbox" checked={item.is_included} onChange={() => toggleItem(item)} className="mt-2 accent-accent" />
                            <div className="min-w-0 flex-1 space-y-2">
                              <input value={item.title ?? ''} onChange={e => updateItem(item.id, { title: e.target.value })} className="w-full rounded-lg border border-accent/30 bg-surface-2 px-3 py-2 font-semibold text-gray-100" />
                              <textarea value={item.description ?? ''} onChange={e => updateItem(item.id, { description: e.target.value })} rows={2} placeholder="Heading description / help text" className="w-full resize-none rounded-lg border border-gray-700 bg-surface-2 px-3 py-2 text-sm text-gray-300" />
                              <p className="text-xs uppercase tracking-wide text-accent">Section Heading</p>
                            </div>
                            <div className="flex shrink-0 flex-col gap-1">
                              <button type="button" onClick={() => moveItem(item, -1)} className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300">Up</button>
                              <button type="button" onClick={() => moveItem(item, 1)} className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300">Down</button>
                              <button type="button" onClick={() => toggleItem(item)} className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300">Remove</button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div key={item.id} className={`p-4 ${item.question?.is_active ? '' : 'bg-warn/5'}`}>
                          <div className="flex items-start gap-3">
                            <input type="checkbox" checked={item.is_included} onChange={() => toggleItem(item)} className="mt-1 accent-accent" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-gray-100">{item.question?.question_text ?? 'Missing question'}</p>
                              <p className="mt-1 text-xs text-gray-500">{item.question?.section} · {item.question?.question_type}</p>
                              {item.question && !item.question.is_active && <p className="mt-2 text-xs text-warn">Archived question. Remove it or restore it from the bank.</p>}
                            </div>
                            <div className="flex shrink-0 flex-col gap-1">
                              <button type="button" onClick={() => moveItem(item, -1)} className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300">Up</button>
                              <button type="button" onClick={() => moveItem(item, 1)} className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300">Down</button>
                              <button type="button" onClick={() => toggleItem(item)} className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300">Remove</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-800">
                    <div className="border-b border-gray-800 px-4 py-3">
                      <h3 className="font-semibold text-gray-100">Available Active Questions</h3>
                      <p className="text-xs text-gray-500">Archived questions are not selectable for new inclusion unless restored.</p>
                    </div>
                    <div className="divide-y divide-gray-800">
                      {activeQuestions.length === 0 && <p className="p-4 text-sm text-gray-500">No active questions available.</p>}
                      {draftItems.filter(item => item.item_type === 'question' && item.question?.is_active && !item.is_included).map(item => (
                        <label key={item.id} className="flex cursor-pointer items-start gap-3 p-4">
                          <input type="checkbox" checked={item.is_included} onChange={() => toggleItem(item)} className="mt-1 accent-accent" />
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium text-gray-100">{item.question?.question_text}</span>
                            <span className="mt-1 block text-xs text-gray-500">{item.question?.section} · {item.question?.question_type}</span>
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

          <div className="overflow-hidden rounded-lg border border-gray-800 bg-surface">
            <div className="border-b border-gray-800 p-4">
              <h2 className="font-semibold text-gray-100">Create New Template</h2>
              <p className="text-xs text-gray-500">New templates start archived/non-default. Restore them when ready, then set default after at least one active question is included.</p>
            </div>
            <form onSubmit={createTemplate} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[1fr_1fr_220px_auto]">
              <input value={templateForm.name} onChange={e => setTemplateForm(current => ({ ...current, name: e.target.value }))} placeholder="Template name" required className="rounded-lg border border-gray-700 bg-surface-2 px-3 py-2 text-sm text-gray-100" />
              <input value={templateForm.description} onChange={e => setTemplateForm(current => ({ ...current, description: e.target.value }))} placeholder="Description" className="rounded-lg border border-gray-700 bg-surface-2 px-3 py-2 text-sm text-gray-100" />
              <select value={templateForm.duplicateFromTemplateId} onChange={e => setTemplateForm(current => ({ ...current, duplicateFromTemplateId: e.target.value }))} className="rounded-lg border border-gray-700 bg-surface-2 px-3 py-2 text-sm text-gray-100">
                <option value="">Start blank</option>
                {templates.map(template => <option key={template.id} value={template.id}>Duplicate {template.name}</option>)}
              </select>
              <button type="button" onClick={() => createTemplate()} disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-gray-950 disabled:opacity-50">Create Template</button>
            </form>
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-800 bg-surface">
            <div className="border-b border-gray-800 p-4">
              <h2 className="font-semibold text-gray-100">Question Bank</h2>
              <p className="text-xs text-gray-500">Archived questions stay in history and are not available for new templates unless restored.</p>
            </div>
            <div className="divide-y divide-gray-800">
              {[...activeQuestions, ...archivedQuestions].map(question => {
                const eligibility = deleteEligibility[question.id] ?? { canDelete: false, reason: 'Checking delete safety...' };
                return (
                  <div key={question.id} className={`p-4 ${question.is_active ? '' : 'bg-warn/5'}`}>
                    <p className="font-medium text-gray-100">{question.question_text}</p>
                    <p className="mb-3 mt-1 text-xs text-gray-500">{question.question_key} · {question.section} · {question.question_type}{question.is_active ? '' : ' · archived'}</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => editQuestion(question)} className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-200">Edit Question</button>
                      {question.is_active ? (
                        <button type="button" onClick={() => questionAction(question, 'archive')} className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300">Archive Question</button>
                      ) : (
                        <button type="button" onClick={() => questionAction(question, 'restore')} className="rounded-lg border border-accent/40 px-3 py-1.5 text-sm text-accent">Restore Question</button>
                      )}
                      <button type="button" onClick={() => questionAction(question, 'delete')} disabled={!eligibility.canDelete} title={eligibility.reason} className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 disabled:opacity-50">Delete Question</button>
                      {!eligibility.canDelete && <span className="text-xs text-gray-500">{eligibility.reason}</span>}
                    </div>
                  </div>
                );
              })}
              {questions.length === 0 && <p className="p-4 text-sm text-gray-500">No question bank questions yet.</p>}
            </div>
          </div>
        </section>

        <aside className="h-fit rounded-lg border border-gray-800 bg-surface p-4">
          <h2 className="font-semibold text-gray-100">{editingQuestion ? 'Edit Question' : 'Add Question'}</h2>
          <form onSubmit={submitQuestion} className="mt-4 space-y-3">
            <input value={questionForm.question_text} onChange={e => {
              const question_text = e.target.value;
              setQuestionForm(current => {
                const key = !editingQuestion ? normalizeKey(question_text) : current.question_key;
                return { ...current, question_text, question_key: key, response_key: !editingQuestion ? key : current.response_key };
              });
            }} placeholder="Question text" required className="w-full rounded-lg border border-gray-700 bg-surface-2 px-3 py-2 text-sm text-gray-100" />
            <textarea value={questionForm.help_text} onChange={e => setQuestionForm(current => ({ ...current, help_text: e.target.value }))} placeholder="Help text" rows={3} className="w-full resize-none rounded-lg border border-gray-700 bg-surface-2 px-3 py-2 text-sm text-gray-100" />
            <div className="grid grid-cols-2 gap-2">
              <input value={questionForm.question_key} onChange={e => setQuestionForm(current => ({ ...current, question_key: normalizeKey(e.target.value) }))} disabled={Boolean(editingQuestion)} placeholder="question_key" required className="rounded-lg border border-gray-700 bg-surface-2 px-3 py-2 text-sm text-gray-100 disabled:opacity-60" />
              <input value={questionForm.response_key} onChange={e => setQuestionForm(current => ({ ...current, response_key: normalizeKey(e.target.value) }))} disabled={Boolean(editingQuestion)} placeholder="response_key" required className="rounded-lg border border-gray-700 bg-surface-2 px-3 py-2 text-sm text-gray-100 disabled:opacity-60" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={questionForm.section} onChange={e => setQuestionForm(current => ({ ...current, section: e.target.value }))} disabled={Boolean(editingQuestion)} placeholder="Section" className="rounded-lg border border-gray-700 bg-surface-2 px-3 py-2 text-sm text-gray-100 disabled:opacity-60" />
              <select value={questionForm.question_type} onChange={e => setQuestionForm(current => ({ ...current, question_type: e.target.value as AssessmentQuestionType }))} disabled={Boolean(editingQuestion)} className="rounded-lg border border-gray-700 bg-surface-2 px-3 py-2 text-sm text-gray-100 disabled:opacity-60">
                {QUESTION_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <input value={questionForm.scoring_dimension} onChange={e => setQuestionForm(current => ({ ...current, scoring_dimension: e.target.value }))} disabled={Boolean(editingQuestion)} placeholder="Scoring dimension" className="w-full rounded-lg border border-gray-700 bg-surface-2 px-3 py-2 text-sm text-gray-100 disabled:opacity-60" />
            <div className="flex gap-2">
              <button type="button" onClick={() => submitQuestion()} disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-gray-950 disabled:opacity-50">{saving ? 'Saving...' : editingQuestion ? 'Save Question' : 'Add Question'}</button>
              {editingQuestion && <button type="button" onClick={() => { setEditingQuestion(null); setQuestionForm(EMPTY_QUESTION); }} className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300">Cancel</button>}
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}
