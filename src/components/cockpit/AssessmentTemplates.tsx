import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  archiveQuestion,
  createQuestion,
  getAssessmentTemplates,
  getQuestionBank,
  setDefaultTemplate,
  updateQuestion,
  upsertTemplateQuestion,
} from '@/lib/creators-api';
import type {
  AssessmentQuestionType,
  CreatorAssessmentQuestion,
  CreatorAssessmentRuntimeTemplate,
  CreatorQuestion,
} from '@/types/creator';

const QUESTION_TYPES: AssessmentQuestionType[] = [
  'short_text',
  'long_text',
  'single_choice',
  'multi_choice',
  'boolean',
  'scale',
];

const EMPTY_FORM = {
  question_key: '',
  response_key: '',
  question_text: '',
  help_text: '',
  section: 'Strengths',
  question_type: 'long_text' as AssessmentQuestionType,
  scoring_dimension: '',
  parent_question_key: '',
  show_when_value: '',
  show_when_operator: 'equals' as 'equals' | 'includes',
  options_text: '',
};

type QuestionForm = typeof EMPTY_FORM;

const QUESTION_LIFECYCLE_TOOLTIP = 'Question wording may be edited. If you need to change the meaning, answer type, scoring purpose, branching behaviour, or dimension, archive this question and create a new one.';

function toForm(question: CreatorQuestion): QuestionForm {
  return {
    question_key: question.question_key,
    response_key: question.response_key,
    question_text: question.question_text,
    help_text: question.help_text ?? '',
    section: question.section,
    question_type: question.question_type,
    scoring_dimension: question.scoring_dimension ?? '',
    parent_question_key: question.parent_question_key ?? '',
    show_when_value: question.show_when_value ?? '',
    show_when_operator: question.show_when_operator,
    options_text: question.options.map(option => typeof option === 'string' ? option : option.label).join('\n'),
  };
}

function parseOptions(text: string): string[] {
  return text
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean);
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function AssessmentTemplates() {
  const [questions, setQuestions] = useState<CreatorQuestion[]>([]);
  const [templates, setTemplates] = useState<CreatorAssessmentRuntimeTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [editingQuestion, setEditingQuestion] = useState<CreatorQuestion | null>(null);
  const [form, setForm] = useState<QuestionForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    const [questionBank, assessmentTemplates] = await Promise.all([
      getQuestionBank(),
      getAssessmentTemplates(),
    ]);
    setQuestions(questionBank);
    setTemplates(assessmentTemplates);
    setSelectedTemplateId(current => current || assessmentTemplates[0]?.id || '');
  };

  useEffect(() => {
    load()
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load assessment templates'))
      .finally(() => setLoading(false));
  }, []);

  const selectedTemplate = templates.find(template => template.id === selectedTemplateId) ?? templates[0] ?? null;

  const templateQuestions = useMemo<CreatorAssessmentQuestion[]>(() => {
    if (!selectedTemplate) return [];
    const mapped = new Map(selectedTemplate.questions.map(question => [question.id, question]));
    const maxOrder = Math.max(0, ...selectedTemplate.questions.map(question => question.sort_order));

    return questions
      .map((question, index) => {
        const existing = mapped.get(question.id);
        return existing ?? {
          ...question,
          template_id: selectedTemplate.id,
          is_included: false,
          sort_order: maxOrder + ((index + 1) * 10),
        };
      })
      .sort((a, b) => a.sort_order - b.sort_order || a.question_text.localeCompare(b.question_text));
  }, [questions, selectedTemplate]);

  const orderedTemplateQuestions = useMemo(() => {
    const childrenByParent = new Map<string, CreatorAssessmentQuestion[]>();
    const topLevel: CreatorAssessmentQuestion[] = [];
    const seen = new Set<string>();

    for (const question of templateQuestions) {
      if (question.parent_question_key) {
        childrenByParent.set(question.parent_question_key, [
          ...(childrenByParent.get(question.parent_question_key) ?? []),
          question,
        ]);
      } else {
        topLevel.push(question);
      }
    }

    const ordered: CreatorAssessmentQuestion[] = [];
    for (const question of topLevel) {
      ordered.push(question);
      seen.add(question.id);
      for (const child of childrenByParent.get(question.question_key) ?? []) {
        ordered.push(child);
        seen.add(child.id);
      }
    }

    for (const question of templateQuestions) {
      if (!seen.has(question.id)) ordered.push(question);
    }

    return ordered;
  }, [templateQuestions]);

  const activeQuestions = questions.filter(question => question.is_active);
  const archivedQuestions = questions.filter(question => !question.is_active);

  const conditionText = (question: CreatorAssessmentQuestion | CreatorQuestion): string | null => {
    if (!question.parent_question_key || !question.show_when_value) return null;
    const parent = questions.find(item => item.question_key === question.parent_question_key);
    return `Shows when ${parent?.question_text ?? question.parent_question_key} ${question.show_when_operator} ${question.show_when_value}`;
  };

  const updateForm = (key: keyof QuestionForm, value: string) => {
    setForm(current => {
      const next = { ...current, [key]: value };
      if (key === 'question_text' && !editingQuestion) {
        const normalized = normalizeKey(value);
        next.question_key = normalized;
        next.response_key = normalized;
      }
      return next;
    });
  };

  const resetForm = () => {
    setEditingQuestion(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmitQuestion = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingQuestion) {
        await updateQuestion(editingQuestion.id, {
          question_text: form.question_text,
          help_text: form.help_text || null,
        });
      } else {
        await createQuestion({
          question_key: form.question_key,
          response_key: form.response_key,
          question_text: form.question_text,
          help_text: form.help_text || null,
          section: form.section,
          question_type: form.question_type,
          scoring_dimension: form.scoring_dimension || null,
          parent_question_key: form.parent_question_key || null,
          show_when_value: form.show_when_value || null,
          show_when_operator: form.show_when_operator,
          options: parseOptions(form.options_text),
        });
      }

      resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save question');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (questionId: string) => {
    setSaving(true);
    setError('');
    try {
      await archiveQuestion(questionId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to archive question');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleIncluded = async (question: CreatorAssessmentQuestion) => {
    if (!selectedTemplate) return;
    setSaving(true);
    setError('');
    try {
      await upsertTemplateQuestion(selectedTemplate.id, question, { is_included: !question.is_included });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update template');
    } finally {
      setSaving(false);
    }
  };

  const handleMove = async (question: CreatorAssessmentQuestion, direction: -1 | 1) => {
    if (!selectedTemplate) return;
    const included = templateQuestions.filter(item => item.is_included);
    const index = included.findIndex(item => item.id === question.id);
    const swap = included[index + direction];
    if (!swap) return;

    setSaving(true);
    setError('');
    try {
      await Promise.all([
        upsertTemplateQuestion(selectedTemplate.id, question, { sort_order: swap.sort_order }),
        upsertTemplateQuestion(selectedTemplate.id, swap, { sort_order: question.sort_order }),
      ]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reorder question');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    setError('');
    try {
      await setDefaultTemplate(selectedTemplate.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set default template');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-gray-500">Loading assessment templates...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-500">Settings</p>
        <h1 className="font-display text-2xl font-bold text-gray-100">Assessment Templates</h1>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-300 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
        <section className="space-y-4">
          <div className="bg-surface border border-gray-800 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-100">Template Editor</h2>
                <p className="text-xs text-gray-500">Include, exclude, and reorder active questions.</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedTemplateId}
                  onChange={e => setSelectedTemplateId(e.target.value)}
                  className="bg-surface-2 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-accent"
                >
                  {templates.map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name}{template.is_default ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleSetDefault}
                  disabled={!selectedTemplate || selectedTemplate.is_default || saving}
                  className="px-3 py-2 rounded-lg bg-accent text-gray-950 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Set Default
                </button>
              </div>
            </div>

            <div className="divide-y divide-gray-800">
              {orderedTemplateQuestions.map(question => {
                const isChild = Boolean(question.parent_question_key);
                return (
                <div key={question.id} className={`p-4 flex items-start gap-3 ${question.is_active ? '' : 'opacity-50'} ${isChild ? 'pl-10 bg-surface-2/40' : ''}`}>
                  {isChild && <div className="mt-2 h-px w-5 bg-gray-700 shrink-0" />}
                  <input
                    type="checkbox"
                    checked={question.is_included}
                    onChange={() => handleToggleIncluded(question)}
                    disabled={saving || !question.is_active}
                    className="mt-1 accent-accent"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-gray-100">{question.question_text}</p>
                      <span className="text-[11px] uppercase tracking-wide text-gray-500">{question.section}</span>
                      {isChild && <span className="text-[11px] text-accent">Follow-up</span>}
                      {!question.is_active && <span className="text-[11px] text-warn">Archived</span>}
                    </div>
                    {conditionText(question) && (
                      <p className="text-xs text-accent mt-1">{conditionText(question)}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {question.response_key} · {question.question_type} · {question.scoring_dimension ?? 'no dimension'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleMove(question, -1)}
                      disabled={saving || !question.is_included}
                      className="px-2 py-1 rounded border border-gray-700 text-gray-400 text-sm disabled:opacity-30"
                    >
                      Up
                    </button>
                    <button
                      onClick={() => handleMove(question, 1)}
                      disabled={saving || !question.is_included}
                      className="px-2 py-1 rounded border border-gray-700 text-gray-400 text-sm disabled:opacity-30"
                    >
                      Down
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          <div className="bg-surface border border-gray-800 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-gray-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-100">Question Bank</h2>
                  <p className="text-xs text-gray-500">Archived questions stay in history and cannot be newly selected.</p>
                </div>
                <span
                  title={QUESTION_LIFECYCLE_TOOLTIP}
                  className="rounded-full border border-gray-700 px-2 py-0.5 text-xs text-gray-400"
                >
                  ?
                </span>
              </div>
            </div>
            <div className="divide-y divide-gray-800">
              {activeQuestions.map(question => (
                <div key={question.id} className="p-4 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-100">{question.question_text}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {question.question_key} · {question.section} · {question.question_type}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingQuestion(question);
                      setForm(toForm(question));
                    }}
                    className="px-3 py-1.5 rounded-lg border border-gray-700 text-sm text-gray-300 hover:border-gray-500"
                    title={QUESTION_LIFECYCLE_TOOLTIP}
                  >
                    Edit Question
                  </button>
                  <button
                    onClick={() => handleArchive(question.id)}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-lg border border-gray-700 text-sm text-gray-400 hover:border-red-800 hover:text-red-300 disabled:opacity-40"
                  >
                    Archive Question
                  </button>
                </div>
              ))}
              {archivedQuestions.length > 0 && (
                <div className="p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-3">Archived</p>
                  <div className="space-y-2">
                    {archivedQuestions.map(question => (
                      <p key={question.id} className="text-sm text-gray-500">{question.question_text}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="bg-surface border border-gray-800 rounded-lg p-4 h-fit">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-100">{editingQuestion ? 'Edit Question' : 'Add Question'}</h2>
              {editingQuestion && (
                <p className="text-xs text-gray-500 mt-1" title={QUESTION_LIFECYCLE_TOOLTIP}>
                  Question wording may be edited. Structural changes require archiving this question and creating a replacement.
                </p>
              )}
            </div>
            <span
              title={QUESTION_LIFECYCLE_TOOLTIP}
              className="rounded-full border border-gray-700 px-2 py-0.5 text-xs text-gray-400"
            >
              ?
            </span>
          </div>
          <form onSubmit={handleSubmitQuestion} className="mt-4 space-y-3">
            <input
              value={form.question_text}
              onChange={e => updateForm('question_text', e.target.value)}
              placeholder="Question text"
              required
              className="w-full bg-surface-2 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent"
            />
            <textarea
              value={form.help_text}
              onChange={e => updateForm('help_text', e.target.value)}
              placeholder="Help text"
              rows={3}
              className="w-full bg-surface-2 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent resize-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={form.question_key}
                onChange={e => updateForm('question_key', normalizeKey(e.target.value))}
                placeholder="question_key"
                required
                disabled={Boolean(editingQuestion)}
                className="w-full bg-surface-2 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent"
              />
              <input
                value={form.response_key}
                onChange={e => updateForm('response_key', normalizeKey(e.target.value))}
                placeholder="response_key"
                required
                disabled={Boolean(editingQuestion)}
                className="w-full bg-surface-2 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={form.section}
                onChange={e => updateForm('section', e.target.value)}
                placeholder="Section"
                required
                disabled={Boolean(editingQuestion)}
                className="w-full bg-surface-2 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent"
              />
              <select
                value={form.question_type}
                onChange={e => updateForm('question_type', e.target.value)}
                disabled={Boolean(editingQuestion)}
                className="w-full bg-surface-2 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-accent"
              >
                {QUESTION_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <input
              value={form.scoring_dimension}
              onChange={e => updateForm('scoring_dimension', e.target.value)}
              placeholder="Scoring dimension"
              disabled={Boolean(editingQuestion)}
              className="w-full bg-surface-2 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent"
            />
            <div className="grid grid-cols-[1fr_120px] gap-2">
              <input
                value={form.parent_question_key}
                onChange={e => updateForm('parent_question_key', normalizeKey(e.target.value))}
                placeholder="Parent question key"
                disabled={Boolean(editingQuestion)}
                className="w-full bg-surface-2 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent"
              />
              <select
                value={form.show_when_operator}
                onChange={e => updateForm('show_when_operator', e.target.value)}
                disabled={Boolean(editingQuestion)}
                className="w-full bg-surface-2 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-accent"
              >
                <option value="equals">equals</option>
                <option value="includes">includes</option>
              </select>
            </div>
            <input
              value={form.show_when_value}
              onChange={e => updateForm('show_when_value', e.target.value)}
              placeholder="Show when value"
              disabled={Boolean(editingQuestion)}
              className="w-full bg-surface-2 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent"
            />
            <textarea
              value={form.options_text}
              onChange={e => updateForm('options_text', e.target.value)}
              placeholder="Options, one per line"
              rows={5}
              disabled={Boolean(editingQuestion)}
              className="w-full bg-surface-2 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent resize-none"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-accent text-gray-950 text-sm font-semibold disabled:opacity-40"
              >
                {saving ? 'Saving...' : editingQuestion ? 'Save Question' : 'Add Question'}
              </button>
              {editingQuestion && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}
