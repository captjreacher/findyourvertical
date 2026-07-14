import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  archiveQuestion,
  createAssessmentInviteLink,
  createAssessmentTemplate,
  createQuestion,
  deleteAssessmentTemplate,
  deleteQuestion,
  getAllCreatorProfiles,
  getAssessmentInviteLinks,
  getAssessmentTemplates,
  getQuestionBank,
  getQuestionDeleteEligibility,
  getTemplateDeleteEligibility,
  restoreQuestion,
  saveTemplateItems,
  saveTemplateBranchRules,
  setDefaultTemplate,
  setTemplateActive,
  updateAssessmentTemplate,
  updateQuestion,
} from '@/lib/creators-api';
import type {
  AssessmentQuestionOption,
  AssessmentBranchAction,
  AssessmentQuestionType,
  CreatorAssessmentBranchRule,
  CreatorAssessmentInviteLink,
  CreatorAssessmentRuntimeTemplate,
  CreatorAssessmentTemplateItem,
  CreatorProfile,
  CreatorQuestion,
  ReportTier,
} from '@/types/creator';

type DraftItem = CreatorAssessmentTemplateItem;
type DeleteEligibility = { canDelete: boolean; reason?: string };
type SaveState = 'Saved' | 'Unsaved changes' | 'Saving' | 'Error';
type OptionDraft = { id: string; label: string; requiresText: boolean; textPrompt: string };
type QuestionDraftEnvelope = { form: QuestionForm; baseUpdatedAt: string | null; savedAt: string };
type BranchRuleDraft = Pick<CreatorAssessmentBranchRule, 'source_question_id' | 'option_value' | 'action' | 'target_question_id' | 'target_section_item_id'>;
type QuestionForm = {
  id: string;
  question_text: string;
  help_text: string;
  question_key: string;
  response_key: string;
  question_type: AssessmentQuestionType;
  section: string;
  scoring_dimension: string;
  options: OptionDraft[];
  scaleMin: number;
  scaleMax: number;
  is_active: boolean;
};

const QUESTION_TYPES: AssessmentQuestionType[] = ['short_text', 'long_text', 'textarea', 'single_choice', 'multi_choice', 'boolean', 'scale', 'scenario_ranking'];
const BRANCH_ACTIONS: Array<{ value: AssessmentBranchAction; label: string }> = [
  { value: 'continue', label: 'Continue to next question' },
  { value: 'jump_question', label: 'Jump to question' },
  { value: 'jump_section', label: 'Jump to section' },
  { value: 'end', label: 'End assessment' },
];
const PUBLIC_ASSESSMENT_ORIGIN = 'https://findyourvertical.online';
const EMPTY_TEMPLATE_FORM = { name: '', slug: '', description: '', duplicateFromTemplateId: '' };
const EMPTY_INVITE_FORM = {
  templateId: '',
  source: 'manual' as 'manual' | 'existing',
  creatorProfileId: '',
  creatorSearch: '',
  creatorName: '',
  creatorEmail: '',
  onlyfansHandle: '',
  modelName: '',
  expiresAt: '',
  notes: '',
  reportTier: 'free' as ReportTier,
};
const EMPTY_QUESTION_FORM: QuestionForm = {
  id: '',
  question_text: '',
  help_text: '',
  question_key: '',
  response_key: '',
  question_type: 'long_text',
  section: 'About You',
  scoring_dimension: '',
  options: [],
  scaleMin: 1,
  scaleMax: 10,
  is_active: true,
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function normalizeSlug(value: string): string {
  return normalizeKey(value).replace(/_/g, '-');
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

function itemSort(a: DraftItem, b: DraftItem): number {
  return a.sort_order - b.sort_order;
}

function includedItemsFor(template: CreatorAssessmentRuntimeTemplate): DraftItem[] {
  return [...(template.items ?? [])]
    .filter(item => item.is_included)
    .sort(itemSort);
}

function buildInviteUrl(templateSlug: string, invite: CreatorAssessmentInviteLink): string {
  const params = new URLSearchParams({ ref: invite.invite_code });
  if (invite.creator_email) params.set('email', invite.creator_email);
  return `${PUBLIC_ASSESSMENT_ORIGIN}/a/${templateSlug}?${params.toString()}`;
}

function inviteStatus(invite: CreatorAssessmentInviteLink): string {
  if (!invite.is_active) return 'Revoked';
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) return 'Expired';
  return invite.status ?? 'Created';
}

function optionsToDrafts(options: AssessmentQuestionOption[] | null | undefined): OptionDraft[] {
  return (options ?? [])
    .map((option, index) => ({
      id: `option-${index}-${typeof option === 'string' ? option : option.value}`,
      label: typeof option === 'string' ? option : option.label || option.value,
      requiresText: typeof option === 'string' ? false : option.requiresText === true,
      textPrompt: typeof option === 'string' ? '' : option.textPrompt ?? '',
    }))
    .filter(option => option.label);
}

function draftsToOptions(options: OptionDraft[]): AssessmentQuestionOption[] {
  return options
    .map(option => option.label.trim())
    .filter(Boolean)
    .map((label, index) => {
      const draft = options.filter(option => option.label.trim())[index];
      return {
        value: normalizeKey(label) || label,
        label,
        ...(draft?.requiresText ? { requiresText: true, textPrompt: draft.textPrompt.trim() || 'Please specify' } : {}),
      };
    });
}

function scaleNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function questionToForm(question: CreatorQuestion): QuestionForm {
  return {
    id: question.id,
    question_text: question.question_text,
    help_text: question.help_text ?? '',
    question_key: question.question_key,
    response_key: question.response_key,
    question_type: question.question_type,
    section: question.section,
    scoring_dimension: question.scoring_dimension ?? '',
    options: optionsToDrafts(question.options),
    scaleMin: scaleNumber(question.config?.min, 1),
    scaleMax: scaleNumber(question.config?.max, 10),
    is_active: question.is_active,
  };
}

function questionCount(template: CreatorAssessmentRuntimeTemplate): number {
  return includedItemsFor(template).filter(item => item.item_type === 'question' && item.question?.is_active).length;
}

export function AssessmentTemplates() {
  const navigate = useNavigate();
  const location = useLocation();
  const { templateId, questionId } = useParams();
  const isQuestionBankRoute = location.pathname.includes('/settings/question-bank');

  const [templates, setTemplates] = useState<CreatorAssessmentRuntimeTemplate[]>([]);
  const [questions, setQuestions] = useState<CreatorQuestion[]>([]);
  const [creatorProfiles, setCreatorProfiles] = useState<CreatorProfile[]>([]);
  const [inviteLinks, setInviteLinks] = useState<CreatorAssessmentInviteLink[]>([]);
  const [questionDeleteEligibility, setQuestionDeleteEligibility] = useState<Record<string, DeleteEligibility>>({});
  const [templateDeleteEligibility, setTemplateDeleteEligibility] = useState<Record<string, DeleteEligibility>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [templateForm, setTemplateForm] = useState(EMPTY_TEMPLATE_FORM);
  const newTemplateNameRef = useRef<HTMLInputElement | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateSlug, setTemplateSlug] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateActive, setTemplateActiveDraft] = useState(false);
  const [templateDefault, setTemplateDefault] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [branchRules, setBranchRules] = useState<BranchRuleDraft[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [bankDrawerOpen, setBankDrawerOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState('');

  const [questionSearch, setQuestionSearch] = useState('');
  const [questionForm, setQuestionForm] = useState<QuestionForm>(EMPTY_QUESTION_FORM);
  const [questionEditorOpen, setQuestionEditorOpen] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftConflict, setDraftConflict] = useState(false);
  const [draftOwner, setDraftOwner] = useState('anonymous');

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE_FORM);
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState('');
  const [generatedInviteStatus, setGeneratedInviteStatus] = useState('');
  const [inviteModalError, setInviteModalError] = useState('');
  const inviteModalBodyRef = useRef<HTMLDivElement | null>(null);
  const inviteResultRef = useRef<HTMLDivElement | null>(null);
  const inviteAutoOpenRef = useRef(false);

  const selectedTemplate = templates.find(template => template.id === templateId) ?? null;
  const includedItems = useMemo(() => [...draftItems].filter(item => item.is_included).sort(itemSort), [draftItems]);
  const selectedSection = includedItems.find(item => item.id === selectedSectionId && item.item_type === 'section_heading') ?? null;
  const activeBankQuestions = questions.filter(question => question.is_active);
  const filteredInviteProfiles = useMemo(() => {
    const query = inviteForm.creatorSearch.trim().toLowerCase();
    return creatorProfiles.filter(profile => {
      if (!query) return true;
      return [
        profile.full_name,
        profile.email ?? '',
        profile.onlyfans_handle ?? '',
        profile.model_name ?? '',
      ].some(value => value.toLowerCase().includes(query));
    }).slice(0, 80);
  }, [creatorProfiles, inviteForm.creatorSearch]);
  const saveState: SaveState = saving ? 'Saving' : error ? 'Error' : selectedTemplate && JSON.stringify(templateSnapshot(selectedTemplate)) !== JSON.stringify(templateDraftSnapshot()) ? 'Unsaved changes' : 'Saved';

  const usedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    templates.forEach(template => {
      const usedIds = new Set<string>();
      (template.items ?? []).forEach(item => {
        if (item.item_type === 'question' && item.question_id && item.is_included) usedIds.add(item.question_id);
      });
      template.questions.forEach(question => {
        if (question.is_included) usedIds.add(question.id);
      });
      usedIds.forEach(id => {
        counts[id] = (counts[id] ?? 0) + 1;
      });
    });
    return counts;
  }, [templates]);

  const filteredBankQuestions = useMemo(() => {
    const query = bankSearch.trim().toLowerCase();
    return activeBankQuestions.filter(question => {
      if (!query) return true;
      return [
        question.question_text,
        question.question_key,
        question.section,
        question.scoring_dimension ?? '',
      ].some(value => value.toLowerCase().includes(query));
    });
  }, [activeBankQuestions, bankSearch]);

  const filteredQuestionBank = useMemo(() => {
    const query = questionSearch.trim().toLowerCase();
    return questions.filter(question => {
      if (!query) return true;
      return [
        question.question_text,
        question.question_key,
        question.response_key,
        question.section,
        question.scoring_dimension ?? '',
        question.question_type,
      ].some(value => value.toLowerCase().includes(query));
    });
  }, [questions, questionSearch]);

  function templateSnapshot(template: CreatorAssessmentRuntimeTemplate) {
    return {
      name: template.name,
      slug: template.slug,
      description: template.description ?? '',
      is_active: template.is_active,
      is_default: template.is_default,
      items: includedItemsFor(template).map(item => ({
        id: item.id,
        item_type: item.item_type,
        question_id: item.question_id,
        title: item.title ?? '',
        description: item.description ?? '',
        sort_order: item.sort_order,
      })),
      branchRules: (template.branch_rules ?? []).map(rule => ({
        source_question_id: rule.source_question_id,
        option_value: rule.option_value,
        action: rule.action,
        target_question_id: rule.target_question_id,
        target_section_item_id: rule.target_section_item_id,
      })),
    };
  }

  function templateDraftSnapshot() {
    return {
      name: templateName,
      slug: templateSlug,
      description: templateDescription,
      is_active: templateActive,
      is_default: templateDefault,
      items: includedItems.map(item => ({
        id: item.id,
        item_type: item.item_type,
        question_id: item.question_id,
        title: item.title ?? '',
        description: item.description ?? '',
        sort_order: item.sort_order,
      })),
      branchRules,
    };
  }

  const load = async () => {
    const [loadedTemplates, loadedQuestions, loadedInvites, loadedProfiles] = await Promise.all([
      getAssessmentTemplates(),
      getQuestionBank(),
      getAssessmentInviteLinks(),
      getAllCreatorProfiles(),
    ]);
    setTemplates(loadedTemplates);
    setQuestions(loadedQuestions);
    setInviteLinks(loadedInvites);
    setCreatorProfiles(loadedProfiles);

    const [questionEntries, templateEntries] = await Promise.all([
      Promise.all(loadedQuestions.map(async question => [question.id, await getQuestionDeleteEligibility(question.id)] as const)),
      Promise.all(loadedTemplates.map(async template => [template.id, await getTemplateDeleteEligibility(template.id)] as const)),
    ]);
    setQuestionDeleteEligibility(Object.fromEntries(questionEntries));
    setTemplateDeleteEligibility(Object.fromEntries(templateEntries));
  };

  useEffect(() => {
    void import('@/lib/supabase').then(({ supabase }) => supabase.auth.getUser()).then(({ data: { user } }) => {
      if (user) setDraftOwner(user.id);
    });
    load()
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load assessment templates'))
      .finally(() => setLoading(false));
  }, []);

  const draftKey = (id: string) => `fyv:question-draft:${draftOwner}:${id || 'new'}`;

  useEffect(() => {
    if (loading || !isQuestionBankRoute || (!questionId && !location.pathname.endsWith('/new'))) return;
    const question = questionId ? questions.find(item => item.id === questionId) : null;
    if (questionId && !question) return;
    const baseForm = question ? questionToForm(question) : EMPTY_QUESTION_FORM;
    const raw = sessionStorage.getItem(draftKey(questionId ?? 'new'));
    if (raw) {
      try {
        const draft = JSON.parse(raw) as QuestionDraftEnvelope;
        setQuestionForm(draft.form);
        setDraftRestored(true);
        setDraftConflict(Boolean(question && draft.baseUpdatedAt && question.updated_at !== draft.baseUpdatedAt));
      } catch {
        setQuestionForm(baseForm);
      }
    } else {
      setQuestionForm(baseForm);
      setDraftRestored(false);
      setDraftConflict(false);
    }
    setQuestionEditorOpen(true);
  }, [loading, isQuestionBankRoute, questionId, questions, location.pathname, draftOwner]);

  useEffect(() => {
    if (!questionEditorOpen) return;
    const record = questionForm.id ? questions.find(item => item.id === questionForm.id) : null;
    const envelope: QuestionDraftEnvelope = {
      form: questionForm,
      baseUpdatedAt: record?.updated_at ?? null,
      savedAt: new Date().toISOString(),
    };
    sessionStorage.setItem(draftKey(questionForm.id || 'new'), JSON.stringify(envelope));
  }, [questionForm, questionEditorOpen, draftOwner]);

  useEffect(() => {
    if (loading || inviteAutoOpenRef.current || new URLSearchParams(location.search).get('invite') !== '1') return;
    inviteAutoOpenRef.current = true;
    openInviteModal(selectedTemplate ?? templates[0]);
  }, [loading, location.search, selectedTemplate, templates]);

  useEffect(() => {
    if (!selectedTemplate) return;
    setTemplateName(selectedTemplate.name);
    setTemplateSlug(selectedTemplate.slug);
    setTemplateDescription(selectedTemplate.description ?? '');
    setTemplateActiveDraft(selectedTemplate.is_active);
    setTemplateDefault(selectedTemplate.is_default);
    setDraftItems(includedItemsFor(selectedTemplate));
    setBranchRules((selectedTemplate.branch_rules ?? []).map(rule => ({
      source_question_id: rule.source_question_id,
      option_value: rule.option_value,
      action: rule.action,
      target_question_id: rule.target_question_id,
      target_section_item_id: rule.target_section_item_id,
    })));
    setSelectedSectionId('');
    setBankDrawerOpen(false);
  }, [selectedTemplate?.id]);

  useEffect(() => {
    if (!inviteModalOpen) return;
    const modalBody = inviteModalBodyRef.current;
    modalBody?.scrollTo({ top: 0, behavior: 'auto' });
  }, [inviteModalOpen]);

  useEffect(() => {
    if (!inviteModalOpen || !generatedInviteUrl) return;
    const frame = window.requestAnimationFrame(() => {
      const modalBody = inviteModalBodyRef.current;
      const result = inviteResultRef.current;
      if (!modalBody || !result) return;
      const targetTop = Math.max(0, result.offsetTop - 16);
      modalBody.scrollTo({ top: targetTop, behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [generatedInviteUrl, inviteModalOpen]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saveState !== 'Unsaved changes') return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saveState]);

  const showError = (message: string) => {
    setError(message);
    setSuccess('');
  };

  const showSuccess = (message: string) => {
    setSuccess(message);
    setError('');
  };

  const resetTemplateForm = () => {
    setTemplateForm(EMPTY_TEMPLATE_FORM);
    window.setTimeout(() => newTemplateNameRef.current?.focus(), 0);
  };

  const createTemplate = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!templateForm.name.trim()) {
      showError('Template name is required.');
      return;
    }
    setSaving(true);
    try {
      const template = await createAssessmentTemplate({
        name: templateForm.name,
        slug: templateForm.slug || null,
        description: templateForm.description || null,
        duplicateFromTemplateId: templateForm.duplicateFromTemplateId || null,
      });
      resetTemplateForm();
      await load();
      showSuccess(templateForm.duplicateFromTemplateId ? 'Template duplicated.' : 'Blank template created.');
      navigate(`/cockpit/settings/assessment-templates/${template.id}`);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to create template');
    } finally {
      setSaving(false);
    }
  };

  const duplicateTemplate = async (template: CreatorAssessmentRuntimeTemplate) => {
    setSaving(true);
    try {
      const duplicate = await createAssessmentTemplate({
        name: `${template.name} Copy`,
        slug: `${template.slug}-copy`,
        description: template.description,
        duplicateFromTemplateId: template.id,
      });
      await load();
      showSuccess('Template duplicated.');
      navigate(`/cockpit/settings/assessment-templates/${duplicate.id}`);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to duplicate template');
    } finally {
      setSaving(false);
    }
  };

  const changeTemplateStatus = async (template: CreatorAssessmentRuntimeTemplate, active: boolean) => {
    if (!active && !window.confirm(`Archive "${template.name}"? Public links for this template will stop working.`)) return;
    setSaving(true);
    try {
      await setTemplateActive(template.id, active);
      await load();
      showSuccess(active ? 'Template restored.' : 'Template archived.');
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to update template status');
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (template: CreatorAssessmentRuntimeTemplate) => {
    const eligibility = templateDeleteEligibility[template.id];
    if (!eligibility?.canDelete) {
      showError(eligibility?.reason ?? 'Template cannot be deleted safely.');
      return;
    }
    if (!window.confirm(`Delete "${template.name}"? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await deleteAssessmentTemplate(template.id);
      await load();
      showSuccess('Template deleted.');
      if (template.id === templateId) navigate('/cockpit/settings/assessment-templates');
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to delete template');
    } finally {
      setSaving(false);
    }
  };

  const openInviteModal = (template?: CreatorAssessmentRuntimeTemplate) => {
    setGeneratedInviteUrl('');
    setGeneratedInviteStatus('');
    setInviteModalError('');
    setInviteForm({
      ...EMPTY_INVITE_FORM,
      templateId: template?.id ?? selectedTemplate?.id ?? templates[0]?.id ?? '',
    });
    setInviteModalOpen(true);
  };

  const selectInviteCreatorProfile = (profileId: string) => {
    const profile = creatorProfiles.find(row => row.id === profileId);
    setInviteForm(current => ({
      ...current,
      creatorProfileId: profileId,
      creatorName: profile?.full_name ?? '',
      creatorEmail: profile?.email ?? '',
      onlyfansHandle: profile?.onlyfans_handle ?? '',
      modelName: profile?.model_name ?? '',
    }));
  };

  const createInvite = async (event: FormEvent) => {
    event.preventDefault();
    const template = templates.find(row => row.id === inviteForm.templateId);
    if (!template) {
      const message = 'Choose a template before creating an invite.';
      setInviteModalError(message);
      showError(message);
      return;
    }
    const selectedProfile = inviteForm.source === 'existing'
      ? creatorProfiles.find(row => row.id === inviteForm.creatorProfileId)
      : null;
    const creatorName = selectedProfile?.full_name ?? inviteForm.creatorName;
    const creatorEmail = selectedProfile?.email ?? inviteForm.creatorEmail;

    if (inviteForm.source === 'existing' && !selectedProfile) {
      const message = 'Choose an existing creator before creating an invite.';
      setInviteModalError(message);
      showError(message);
      return;
    }
    if (!creatorName.trim() || !creatorEmail?.trim()) {
      const message = 'Creator name and email address are required.';
      setInviteModalError(message);
      showError(message);
      return;
    }
    setSaving(true);
    try {
      const invite = await createAssessmentInviteLink({
        templateId: template.id,
        creatorProfileId: selectedProfile?.id ?? null,
        creatorName,
        creatorEmail,
        onlyfansHandle: selectedProfile?.onlyfans_handle ?? inviteForm.onlyfansHandle,
        modelName: selectedProfile?.model_name ?? inviteForm.modelName,
        notes: inviteForm.notes || null,
        expiresAt: inviteForm.expiresAt ? new Date(inviteForm.expiresAt).toISOString() : null,
        reportTier: inviteForm.reportTier,
      });
      const url = buildInviteUrl(template.slug, invite);
      setGeneratedInviteUrl(url);
      setGeneratedInviteStatus(inviteStatus(invite));
      setInviteModalError('');
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      await load();
      showSuccess('Invite link created.');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to create invite link';
      setInviteModalError(message);
      showError(message);
    } finally {
      setSaving(false);
    }
  };

  const copyInviteUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    showSuccess('Invite URL copied.');
  };

  const openNewQuestionEditor = () => {
    navigate('/cockpit/settings/question-bank/new');
  };

  const openEditQuestionEditor = (question: CreatorQuestion) => {
    navigate(`/cockpit/settings/question-bank/${question.id}/edit`, {
      state: { returnTo: `${location.pathname}${location.search}`, scrollY: window.scrollY },
    });
  };

  const openDuplicateQuestionEditor = (question: CreatorQuestion) => {
    const duplicate = questionToForm(question);
    setQuestionForm({
      ...duplicate,
      id: '',
      question_text: `${duplicate.question_text} (copy)`,
      question_key: `${duplicate.question_key}_copy`,
      response_key: `${duplicate.response_key}_copy`,
      is_active: true,
    });
    setQuestionEditorOpen(true);
  };

  const reconcileQuestionUpdate = (updatedQuestion: CreatorQuestion) => {
    setQuestions(current => current.map(question => (
      question.id === updatedQuestion.id ? updatedQuestion : question
    )));

    setTemplates(current => current.map(template => ({
      ...template,
      questions: template.questions.map(question => (
        question.id === updatedQuestion.id ? { ...question, ...updatedQuestion } : question
      )),
      items: template.items?.map(item => (
        item.question_id === updatedQuestion.id
          ? { ...item, question: updatedQuestion }
          : item
      )),
    })));

    setDraftItems(current => current.map(item => (
      item.question_id === updatedQuestion.id
        ? { ...item, question: updatedQuestion }
        : item
    )));
  };

  const closeQuestionEditor = () => {
    setQuestionEditorOpen(false);
    const state = location.state as { returnTo?: string; scrollY?: number } | null;
    navigate(state?.returnTo ?? '/cockpit/settings/question-bank');
    if (typeof state?.scrollY === 'number') requestAnimationFrame(() => window.scrollTo(0, state.scrollY!));
  };

  const discardQuestionDraft = () => {
    sessionStorage.removeItem(draftKey(questionForm.id || 'new'));
    setDraftRestored(false);
    setDraftConflict(false);
    closeQuestionEditor();
  };

  const saveTemplate = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      await updateAssessmentTemplate(selectedTemplate.id, {
        name: templateName,
        slug: templateSlug,
        description: templateDescription || null,
      });
      if (templateActive !== selectedTemplate.is_active) await setTemplateActive(selectedTemplate.id, templateActive);
      await saveTemplateItems(selectedTemplate.id, includedItems);
      await saveTemplateBranchRules(selectedTemplate.id, branchRules);
      if (templateDefault && !selectedTemplate.is_default) await setDefaultTemplate(selectedTemplate.id);
      await load();
      showSuccess('Template saved.');
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const addSection = () => {
    if (!selectedTemplate) return;
    const now = new Date().toISOString();
    const nextOrder = Math.max(0, ...includedItems.map(item => item.sort_order)) + 10;
    const id = `new-section-${Date.now()}`;
    setDraftItems(current => [
      ...current,
      {
        id,
        template_id: selectedTemplate.id,
        item_type: 'section_heading',
        question_id: null,
        title: 'New Section',
        description: '',
        is_included: true,
        sort_order: nextOrder,
        created_at: now,
        updated_at: now,
        question: null,
      },
    ]);
    setSelectedSectionId(id);
  };

  const updateItem = (id: string, changes: Partial<DraftItem>) => {
    setDraftItems(current => current.map(item => item.id === id ? { ...item, ...changes } : item));
  };

  const removeItem = (id: string) => {
    if (!window.confirm('Remove this item from the template?')) return;
    setDraftItems(current => current.filter(item => item.id !== id).map((item, index) => ({ ...item, sort_order: (index + 1) * 10 })));
  };

  const moveItem = (id: string, direction: -1 | 1) => {
    const rows = [...includedItems];
    const index = rows.findIndex(item => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= rows.length) return;
    const [item] = rows.splice(index, 1);
    rows.splice(target, 0, item);
    setDraftItems(rows.map((row, orderIndex) => ({ ...row, sort_order: (orderIndex + 1) * 10 })));
  };

  const branchableQuestionItems = useMemo(
    () => includedItems.filter(item => item.item_type === 'question' && item.question?.is_active),
    [includedItems]
  );

  const sectionItems = useMemo(
    () => includedItems.filter(item => item.item_type === 'section_heading'),
    [includedItems]
  );

  const getBranchRule = (questionId: string, optionValue: string): BranchRuleDraft => (
    branchRules.find(rule => rule.source_question_id === questionId && rule.option_value === optionValue) ?? {
      source_question_id: questionId,
      option_value: optionValue,
      action: 'continue',
      target_question_id: null,
      target_section_item_id: null,
    }
  );

  const updateBranchRule = (
    questionId: string,
    optionValue: string,
    changes: Partial<BranchRuleDraft>
  ) => {
    setBranchRules(current => {
      const base = current.find(rule => rule.source_question_id === questionId && rule.option_value === optionValue) ?? {
        source_question_id: questionId,
        option_value: optionValue,
        action: 'continue' as AssessmentBranchAction,
        target_question_id: null,
        target_section_item_id: null,
      };
      const next: BranchRuleDraft = {
        ...base,
        ...changes,
        target_question_id: changes.action && changes.action !== 'jump_question' ? null : changes.target_question_id ?? base.target_question_id,
        target_section_item_id: changes.action && changes.action !== 'jump_section' ? null : changes.target_section_item_id ?? base.target_section_item_id,
      };
      const without = current.filter(rule => !(rule.source_question_id === questionId && rule.option_value === optionValue));
      if (next.action === 'continue') return without;
      return [...without, next];
    });
  };

  const addQuestionToTemplate = (question: CreatorQuestion) => {
    if (!selectedTemplate) return;
    const now = new Date().toISOString();
    const rows = [...includedItems];
    const sectionIndex = selectedSection ? rows.findIndex(item => item.id === selectedSection.id) : -1;
    const nextSectionIndex = rows.findIndex((item, index) => index > sectionIndex && item.item_type === 'section_heading');
    const insertIndex = selectedSection
      ? (nextSectionIndex === -1 ? rows.length : nextSectionIndex)
      : rows.length;
    rows.splice(insertIndex, 0, {
      id: `new-question-${Date.now()}-${question.id}`,
      template_id: selectedTemplate.id,
      item_type: 'question',
      question_id: question.id,
      title: null,
      description: null,
      is_included: true,
      sort_order: 0,
      created_at: now,
      updated_at: now,
      question,
    });
    setDraftItems(rows.map((row, index) => ({ ...row, sort_order: (index + 1) * 10 })));
    showSuccess('Question added to template. Save to publish the change.');
  };

  const submitQuestion = async (event: FormEvent) => {
    event.preventDefault();
    if (!questionForm.question_text.trim()) {
      showError('Question text is required.');
      return;
    }
    if (['single_choice', 'multi_choice', 'scenario_ranking'].includes(questionForm.question_type) && draftsToOptions(questionForm.options).length === 0) {
      showError('Add at least one answer option for single or multi select questions.');
      return;
    }
    if (questionForm.question_type === 'scale' && questionForm.scaleMin >= questionForm.scaleMax) {
      showError('Scale minimum must be lower than scale maximum.');
      return;
    }
    const payload = {
      question_key: normalizeKey(questionForm.question_key || questionForm.question_text),
      response_key: normalizeKey(questionForm.response_key || questionForm.question_key || questionForm.question_text),
      question_text: questionForm.question_text,
      help_text: questionForm.help_text || null,
      section: questionForm.section || 'General',
      question_type: questionForm.question_type,
      scoring_dimension: questionForm.scoring_dimension || null,
      options: ['single_choice', 'multi_choice', 'scenario_ranking'].includes(questionForm.question_type) ? draftsToOptions(questionForm.options) : [],
      config: questionForm.question_type === 'scale'
        ? { min: questionForm.scaleMin, max: questionForm.scaleMax }
        : questionForm.question_type === 'scenario_ranking'
          ? { evidence: { validationMode: 'scenario_rank' } }
          : {},
      parent_question_key: null,
      show_when_value: null,
      show_when_operator: 'equals' as const,
    };
    setSaving(true);
    try {
      if (questionForm.id) {
        const updatedQuestion = await updateQuestion(questionForm.id, payload);
        if (questionForm.is_active) await restoreQuestion(questionForm.id);
        else await archiveQuestion(questionForm.id);
        reconcileQuestionUpdate({
          ...updatedQuestion,
          is_active: questionForm.is_active,
        });
        showSuccess('Question updated.');
        sessionStorage.removeItem(draftKey(questionForm.id));
      } else {
        const createdQuestion = await createQuestion(payload);
        const normalizedQuestion = questionForm.is_active
          ? createdQuestion
          : { ...createdQuestion, is_active: false };
        if (!questionForm.is_active) await archiveQuestion(createdQuestion.id);
        setQuestions(current => [...current, normalizedQuestion]);
        setQuestionDeleteEligibility(current => ({
          ...current,
          [createdQuestion.id]: { canDelete: true },
        }));
        showSuccess('Question created.');
        sessionStorage.removeItem(draftKey('new'));
      }
      closeQuestionEditor();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to save question');
    } finally {
      setSaving(false);
    }
  };

  const duplicateQuestion = async (question: CreatorQuestion) => {
    openDuplicateQuestionEditor(question);
  };

  const addOption = () => {
    setQuestionForm(current => ({
      ...current,
      options: [...current.options, { id: `option-${Date.now()}`, label: '', requiresText: false, textPrompt: '' }],
    }));
  };

  const updateOption = (id: string, label: string) => {
    setQuestionForm(current => ({
      ...current,
      options: current.options.map(option => option.id === id ? { ...option, label } : option),
    }));
  };

  const updateOptionDetails = (id: string, changes: Partial<Pick<OptionDraft, 'requiresText' | 'textPrompt'>>) => {
    setQuestionForm(current => ({
      ...current,
      options: current.options.map(option => option.id === id ? { ...option, ...changes } : option),
    }));
  };

  const removeOption = (id: string) => {
    setQuestionForm(current => ({
      ...current,
      options: current.options.filter(option => option.id !== id),
    }));
  };

  const moveOption = (id: string, direction: -1 | 1) => {
    setQuestionForm(current => {
      const options = [...current.options];
      const index = options.findIndex(option => option.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= options.length) return current;
      const [option] = options.splice(index, 1);
      options.splice(target, 0, option);
      return { ...current, options };
    });
  };

  const questionStatusAction = async (question: CreatorQuestion, action: 'archive' | 'restore' | 'delete') => {
    if (action === 'archive' && !window.confirm('Archive this question? Existing templates keep their saved structure, but the public assessment will not show inactive questions.')) return;
    if (action === 'delete' && !window.confirm('Delete this unused question? This cannot be undone.')) return;
    setSaving(true);
    try {
      if (action === 'archive') await archiveQuestion(question.id);
      if (action === 'restore') await restoreQuestion(question.id);
      if (action === 'delete') await deleteQuestion(question.id);
      await load();
      showSuccess(action === 'archive' ? 'Question archived.' : action === 'restore' ? 'Question restored.' : 'Question deleted.');
      if (questionForm.id === question.id) closeQuestionEditor();
    } catch (e) {
      showError(e instanceof Error ? e.message : `Failed to ${action} question`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="cockpit-card-pad animate-pulse text-charcoal-2">Loading assessment templates...</div>;
  }

  return (
    <div className="cockpit-page">
      {error && <div className="rounded-xl border border-pink/30 bg-pink/10 px-4 py-3 text-sm text-pink" role="alert">{error}</div>}
      {success && <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success" role="status">{success}</div>}

      {isQuestionBankRoute ? renderQuestionBank() : templateId ? renderTemplateDetail() : renderTemplatesHome()}

      {inviteModalOpen && renderInviteModal()}
    </div>
  );

  function renderTemplatesHome() {
    return (
      <>
        <div className="cockpit-page-header">
          <div>
            <p className="cockpit-eyebrow">Assessment Templates</p>
            <h1 className="cockpit-title">Manage Templates</h1>
            <p className="cockpit-subtitle">High-level template actions only. Open a template to edit its structure.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => openInviteModal()} className="btn-primary">New Assessment Invite</button>
            <button type="button" onClick={resetTemplateForm} className="btn-secondary">New Template</button>
          </div>
        </div>

        <form onSubmit={createTemplate} className="cockpit-card-pad grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr_220px_auto]">
          <label className="grid gap-1 text-sm font-medium text-charcoal">
            <span>Template Name</span>
            <input ref={newTemplateNameRef} value={templateForm.name} onChange={e => setTemplateForm(current => ({ ...current, name: e.target.value, slug: current.slug || normalizeSlug(e.target.value) }))} required className="field-control" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-charcoal">
            <span>Template Slug</span>
            <input value={templateForm.slug} onChange={e => setTemplateForm(current => ({ ...current, slug: normalizeSlug(e.target.value) }))} className="field-control" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-charcoal">
            <span>Template Description</span>
            <input value={templateForm.description} onChange={e => setTemplateForm(current => ({ ...current, description: e.target.value }))} className="field-control" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-charcoal">
            <span>Starting Point</span>
            <select value={templateForm.duplicateFromTemplateId} onChange={e => setTemplateForm(current => ({ ...current, duplicateFromTemplateId: e.target.value }))} className="field-control">
              <option value="">Blank template</option>
              {templates.map(template => <option key={template.id} value={template.id}>Duplicate {template.name}</option>)}
            </select>
          </label>
          <button type="submit" disabled={saving || !templateForm.name.trim()} title={!templateForm.name.trim() ? 'Template name is required.' : saving ? 'Save already in progress.' : undefined} className="btn-primary">{saving ? 'Working...' : 'Create'}</button>
        </form>

        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Template</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Questions</th>
                <th>Last updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map(template => {
                const deleteEligibility = templateDeleteEligibility[template.id];
                return (
                  <tr key={template.id}>
                    <td>
                      <p className="font-semibold text-charcoal">{template.name}</p>
                      <p className="mt-1 max-w-md text-xs text-charcoal-2">{template.description || 'No description'}</p>
                      {template.is_default && <span className="mt-2 inline-flex rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">Default</span>}
                    </td>
                    <td className="font-mono text-xs text-charcoal-2">{template.slug}</td>
                    <td><StatusPill active={template.is_active} /></td>
                    <td>{questionCount(template)}</td>
                    <td>{formatDate(template.updated_at)}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Link to={`/cockpit/settings/assessment-templates/${template.id}`} className="btn-primary">Open</Link>
                        <button type="button" onClick={() => duplicateTemplate(template)} className="btn-subtle">Duplicate</button>
                        <button type="button" onClick={() => changeTemplateStatus(template, !template.is_active)} className="btn-subtle">{template.is_active ? 'Archive' : 'Restore'}</button>
                        <button type="button" onClick={() => openInviteModal(template)} className="btn-subtle text-accent">New Assessment Invite</button>
                        <button type="button" onClick={() => deleteTemplate(template)} disabled={!deleteEligibility?.canDelete} title={deleteEligibility?.reason ?? 'Checking delete safety.'} className="btn-subtle">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {templates.length === 0 && (
                <tr><td colSpan={6} className="text-charcoal-2">No templates yet. Create a blank template to begin.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  function renderTemplateDetail() {
    if (!selectedTemplate) {
      return (
        <div className="cockpit-card-pad">
          <h1 className="cockpit-title">Template not found</h1>
          <Link to="/cockpit/settings/assessment-templates" className="btn-primary mt-4">Back to Templates</Link>
        </div>
      );
    }

    const canSetDefault = templateActive && includedItems.some(item => item.item_type === 'question' && item.question?.is_active);

    return (
      <>
        <div className="cockpit-page-header">
          <div>
            <Link to="/cockpit/settings/assessment-templates" className="text-sm font-semibold text-accent">Back to Templates</Link>
            <h1 className="cockpit-title mt-2">{selectedTemplate.name}</h1>
            <p className="cockpit-subtitle">Edit one template structure. Question bank records are managed separately.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${saveState === 'Saved' ? 'bg-success/10 text-success' : saveState === 'Error' ? 'bg-pink/10 text-pink' : 'bg-warn/10 text-warn'}`}>{saveState}</span>
            <button type="button" onClick={() => openInviteModal(selectedTemplate)} className="btn-primary">New Assessment Invite</button>
            <button type="button" onClick={saveTemplate} disabled={saving || saveState === 'Saved'} title={saving ? 'Save already in progress.' : saveState === 'Saved' ? 'No unsaved changes.' : undefined} className="btn-primary">Save Template</button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="cockpit-panel">
              <div className="cockpit-panel-header">
                <h2 className="cockpit-section-title">Template Settings</h2>
              </div>
              <div className="space-y-3 p-4">
                <label className="grid gap-1 text-sm font-medium text-charcoal">
                  <span>Template Name</span>
                  <input value={templateName} onChange={e => setTemplateName(e.target.value)} className="field-control w-full" />
                </label>
                <label className="grid gap-1 text-sm font-medium text-charcoal">
                  <span>Template Slug</span>
                  <input value={templateSlug} onChange={e => setTemplateSlug(normalizeSlug(e.target.value))} className="field-control w-full" />
                </label>
                <label className="grid gap-1 text-sm font-medium text-charcoal">
                  <span>Template Description</span>
                  <textarea value={templateDescription} onChange={e => setTemplateDescription(e.target.value)} rows={3} className="field-control w-full resize-none" />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-surface-3 px-3 py-2 text-sm">
                  <span>Active template</span>
                  <input type="checkbox" checked={templateActive} onChange={e => setTemplateActiveDraft(e.target.checked)} className="accent-accent" />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-surface-3 px-3 py-2 text-sm">
                  <span>Default template</span>
                  <input type="checkbox" checked={templateDefault} disabled={!canSetDefault && !templateDefault} title={!canSetDefault && !templateDefault ? 'Template must be active and include at least one active question.' : undefined} onChange={e => setTemplateDefault(e.target.checked)} className="accent-accent disabled:opacity-40" />
                </label>
                {!canSetDefault && !templateDefault && <p className="text-xs text-charcoal-2">A default template must be active and include at least one active question.</p>}
              </div>
            </div>

            <div className="cockpit-panel">
              <div className="cockpit-panel-header">
                <h2 className="cockpit-section-title">Template Sections</h2>
              </div>
              <div className="space-y-2 p-4">
                <button type="button" onClick={addSection} className="btn-secondary w-full">Add Section Heading</button>
                {includedItems.filter(item => item.item_type === 'section_heading').map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedSectionId(item.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors ${selectedSectionId === item.id ? 'border-accent/50 bg-accent/10 text-charcoal' : 'border-white/10 bg-surface-3 text-charcoal-2 hover:bg-surface-2'}`}
                  >
                    {item.title || 'Untitled Section'}
                  </button>
                ))}
                {includedItems.every(item => item.item_type !== 'section_heading') && <p className="text-sm text-charcoal-2">No section headings yet.</p>}
              </div>
            </div>
          </aside>

          <section className="cockpit-panel">
            <div className="cockpit-panel-header flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="cockpit-section-title">Questions in This Template</h2>
                <p className="mt-1 text-xs text-charcoal-2">Add headings, add existing bank questions, remove, reorder, then save.</p>
              </div>
              <button type="button" onClick={() => setBankDrawerOpen(true)} className="btn-primary">Add from Question Bank</button>
            </div>
            <div className="space-y-3 p-4">
              {includedItems.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/15 bg-surface-3 p-8 text-center text-sm text-charcoal-2">
                  This template has no questions yet. Add questions from the question bank.
                </div>
              )}
              {includedItems.map((item, index) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-surface-3 p-4">
                  {item.item_type === 'section_heading' ? (
                    <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
                      <input value={item.title ?? ''} onChange={e => updateItem(item.id, { title: e.target.value })} placeholder="Section heading" className="field-control" />
                      <input value={item.description ?? ''} onChange={e => updateItem(item.id, { description: e.target.value })} placeholder="Optional description" className="field-control" />
                      <ItemActions index={index} item={item} />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-charcoal">{item.question?.question_text ?? 'Missing question'}</p>
                          <p className="mt-1 text-xs text-charcoal-2">{item.question?.question_key} / {item.question?.section} / {item.question?.question_type}</p>
                        </div>
                        <ItemActions index={index} item={item} question={item.question ?? undefined} />
                      </div>
                      {item.question && ['single_choice', 'multi_choice'].includes(item.question.question_type) && renderBranchingControls(item)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        {bankDrawerOpen && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
            <div className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-surface p-5 shadow-2xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="cockpit-section-title">Add from Question Bank</h2>
                  <p className="mt-1 text-xs text-charcoal-2">Selected section: {selectedSection?.title || 'End of template'}</p>
                </div>
                <button type="button" onClick={() => setBankDrawerOpen(false)} className="btn-subtle">Close</button>
              </div>
              <p className="mb-3 rounded-xl border border-white/10 bg-surface-3 px-3 py-2 text-xs text-charcoal-2">
                Duplicate placements are supported: each add creates a separate template item, so the same bank question can appear in more than one section when needed.
              </p>
              <input value={bankSearch} onChange={e => setBankSearch(e.target.value)} placeholder="Search bank questions" className="field-control mb-4 w-full" />
              <div className="space-y-3">
                {filteredBankQuestions.map(question => {
                  const placementCount = includedItems.filter(item => item.question_id === question.id).length;
                  return (
                    <div key={question.id} className="rounded-2xl border border-white/10 bg-surface-3 p-3">
                      <p className="text-sm font-semibold text-charcoal">{question.question_text}</p>
                      <p className="mt-1 text-xs text-charcoal-2">{question.question_key} / {question.section}{placementCount > 0 ? ` / already placed ${placementCount} time${placementCount === 1 ? '' : 's'}` : ''}</p>
                      <button type="button" onClick={() => addQuestionToTemplate(question)} className="btn-primary mt-3">{placementCount > 0 ? 'Add Again' : 'Add to Template'}</button>
                    </div>
                  );
                })}
                {filteredBankQuestions.length === 0 && <p className="text-sm text-charcoal-2">No matching active questions.</p>}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  function ItemActions({ item, index, question }: { item: DraftItem; index: number; question?: CreatorQuestion }) {
    return (
      <div className="flex flex-wrap gap-2">
        {question && <button type="button" onClick={() => openEditQuestionEditor(question)} className="btn-primary">Edit question</button>}
        <button type="button" onClick={() => moveItem(item.id, -1)} disabled={index === 0} title={index === 0 ? 'Already first item.' : undefined} className="btn-subtle">Up</button>
        <button type="button" onClick={() => moveItem(item.id, 1)} disabled={index === includedItems.length - 1} title={index === includedItems.length - 1 ? 'Already last item.' : undefined} className="btn-subtle">Down</button>
        <button type="button" onClick={() => removeItem(item.id)} className="btn-subtle">Remove</button>
      </div>
    );
  }

  function renderBranchingControls(item: DraftItem) {
    const question = item.question;
    if (!question) return null;
    const options = optionsToDrafts(question.options)
      .map(option => ({
        value: normalizeKey(option.label) || option.label,
        label: option.label,
      }))
      .filter(option => option.label);
    if (options.length === 0) return null;

    return (
      <div className="rounded-xl border border-white/10 bg-surface-3/50 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-charcoal">Branching Rules</p>
            <p className="mt-1 text-xs text-charcoal-2">Choose what happens after each answer option.</p>
          </div>
        </div>
        <div className="space-y-2">
          {options.map(option => {
            const rule = getBranchRule(question.id, option.value);
            return (
              <div key={option.value} className="grid gap-2 rounded-lg border border-white/10 bg-surface-3 p-2 lg:grid-cols-[minmax(0,1fr)_220px_minmax(0,1fr)]">
                <div className="min-h-10 rounded-lg bg-surface-3 px-3 py-2 text-sm text-charcoal">
                  {option.label}
                </div>
                <select
                  value={rule.action}
                  onChange={e => updateBranchRule(question.id, option.value, {
                    action: e.target.value as AssessmentBranchAction,
                    target_question_id: null,
                    target_section_item_id: null,
                  })}
                  className="field-control"
                  aria-label={`Branch action for ${option.label}`}
                >
                  {BRANCH_ACTIONS.map(action => <option key={action.value} value={action.value}>{action.label}</option>)}
                </select>
                {rule.action === 'jump_question' && (
                  <select
                    value={rule.target_question_id ?? ''}
                    onChange={e => updateBranchRule(question.id, option.value, { target_question_id: e.target.value || null })}
                    className="field-control"
                    aria-label={`Target question for ${option.label}`}
                  >
                    <option value="">Choose target question</option>
                    {branchableQuestionItems
                      .filter(target => target.question_id !== question.id)
                      .map(target => <option key={target.id} value={target.question_id ?? ''}>{target.question?.question_text}</option>)}
                  </select>
                )}
                {rule.action === 'jump_section' && (
                  <select
                    value={rule.target_section_item_id ?? ''}
                    onChange={e => updateBranchRule(question.id, option.value, { target_section_item_id: e.target.value || null })}
                    className="field-control"
                    aria-label={`Target section for ${option.label}`}
                  >
                    <option value="">Choose target section</option>
                    {sectionItems.map(section => <option key={section.id} value={section.id}>{section.title || 'Untitled Section'}</option>)}
                  </select>
                )}
                {(rule.action === 'continue' || rule.action === 'end') && (
                  <div className="min-h-10 rounded-lg bg-surface-3 px-3 py-2 text-sm text-charcoal-2">N/A</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderQuestionBank() {
    return (
      <>
        <div className="cockpit-page-header">
          <div>
            <p className="cockpit-eyebrow">Assessment Templates</p>
            <h1 className="cockpit-title">Manage Question Bank</h1>
            <p className="cockpit-subtitle">Reusable question records only. Template structure is edited on each template detail page.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openNewQuestionEditor} className="btn-primary">Add Question</button>
            <Link to="/cockpit/settings/assessment-templates" className="btn-secondary">Templates</Link>
          </div>
        </div>

        <div className="grid gap-4">
          <section className="cockpit-panel">
            <div className="cockpit-panel-header">
              <input value={questionSearch} onChange={e => setQuestionSearch(e.target.value)} placeholder="Search questions" className="field-control w-full" />
            </div>
            <div className="divide-y divide-white/10">
              <div className="hidden gap-4 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-charcoal-2 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(180px,0.32fr)_110px_minmax(260px,auto)]">
                <span>Question</span><span>Category &amp; metadata</span><span>Status</span><span>Actions</span>
              </div>
                  {filteredQuestionBank.map(question => {
                    const eligibility = questionDeleteEligibility[question.id];
                    return (
                      <article key={question.id} className="grid min-w-0 gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(180px,0.32fr)_110px_minmax(260px,auto)] lg:items-start">
                        <div className="min-w-0">
                          <p className="break-words font-semibold leading-6 text-charcoal">{question.question_text}</p>
                          {question.help_text && <p className="mt-1 break-words text-sm leading-5 text-charcoal-2">{question.help_text}</p>}
                        </div>
                        <div className="min-w-0 text-xs text-charcoal-2">
                          <p>{question.section}{question.scoring_dimension ? ` / ${question.scoring_dimension}` : ''}</p>
                          <p className="mt-1 break-all font-mono">{question.question_key}</p>
                          <p className="mt-1">{question.question_type} · {usedCounts[question.id] ?? 0} template{(usedCounts[question.id] ?? 0) === 1 ? '' : 's'}</p>
                        </div>
                        <div><StatusPill active={question.is_active} /></div>
                        <div>
                          <div className="flex flex-wrap gap-2 lg:justify-end">
                            <button type="button" onClick={() => openEditQuestionEditor(question)} className="btn-primary">Edit</button>
                            <button type="button" onClick={() => duplicateQuestion(question)} className="btn-subtle">Duplicate</button>
                            <button type="button" onClick={() => questionStatusAction(question, question.is_active ? 'archive' : 'restore')} className="btn-subtle">{question.is_active ? 'Archive' : 'Restore'}</button>
                            <button type="button" onClick={() => questionStatusAction(question, 'delete')} disabled={!eligibility?.canDelete} title={eligibility?.reason ?? 'Checking delete safety.'} className="btn-subtle">Delete</button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
            </div>
          </section>
        </div>

        {questionEditorOpen && renderQuestionEditorDrawer()}
      </>
    );
  }

  function renderQuestionEditorDrawer() {
    const needsOptions = ['single_choice', 'multi_choice', 'scenario_ranking'].includes(questionForm.question_type);
    const canSubmitQuestion = Boolean(
      questionForm.question_text.trim()
      && questionForm.question_key.trim()
      && questionForm.response_key.trim()
      && (!needsOptions || draftsToOptions(questionForm.options).length > 0)
      && (questionForm.question_type !== 'scale' || questionForm.scaleMin < questionForm.scaleMax)
    );
    const submitReason = !questionForm.question_text.trim()
      ? 'Question text is required.'
      : !questionForm.question_key.trim() || !questionForm.response_key.trim()
        ? 'Question key and response key are required.'
        : needsOptions && draftsToOptions(questionForm.options).length === 0
          ? 'Add at least one answer option.'
          : questionForm.question_type === 'scale' && questionForm.scaleMin >= questionForm.scaleMax
            ? 'Scale minimum must be lower than scale maximum.'
            : undefined;

    return (
      <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
        <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-surface p-5 shadow-2xl">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="cockpit-section-title">{questionForm.id ? 'Edit Question' : 'Add Question'}</h2>
              <p className="mt-1 text-xs text-charcoal-2">Create and edit reusable bank questions only.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={discardQuestionDraft} className="btn-subtle">Discard draft</button>
              <button type="button" onClick={closeQuestionEditor} className="btn-subtle">Close</button>
            </div>
          </div>

          {draftRestored && <p className="mb-3 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm text-success" role="status">Unsaved draft restored</p>}
          {draftConflict && <p className="mb-3 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn" role="alert">This question changed after this draft was created. Review the latest saved record before saving over it.</p>}

          <form onSubmit={submitQuestion} className="space-y-3">
            <textarea value={questionForm.question_text} onChange={e => {
              const text = e.target.value;
              setQuestionForm(current => ({
                ...current,
                question_text: text,
                question_key: current.id ? current.question_key : normalizeKey(text),
                response_key: current.id ? current.response_key : normalizeKey(text),
              }));
            }} placeholder="Question text" rows={3} required className="field-control w-full resize-none" />
            <textarea value={questionForm.help_text} onChange={e => setQuestionForm(current => ({ ...current, help_text: e.target.value }))} placeholder="Help text" rows={2} className="field-control w-full resize-none" />
            <div className="grid grid-cols-2 gap-3">
              <input value={questionForm.question_key} onChange={e => setQuestionForm(current => ({ ...current, question_key: normalizeKey(e.target.value) }))} placeholder="question_key" required className="field-control" />
              <input value={questionForm.response_key} onChange={e => setQuestionForm(current => ({ ...current, response_key: normalizeKey(e.target.value) }))} placeholder="response_key" required className="field-control" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select value={questionForm.question_type} onChange={e => setQuestionForm(current => ({ ...current, question_type: e.target.value as AssessmentQuestionType }))} className="field-control">
                {QUESTION_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
              <input value={questionForm.section} onChange={e => setQuestionForm(current => ({ ...current, section: e.target.value }))} placeholder="Section/category" className="field-control" />
            </div>
            <input value={questionForm.scoring_dimension} onChange={e => setQuestionForm(current => ({ ...current, scoring_dimension: e.target.value }))} placeholder="Scoring dimension" className="field-control w-full" />

            {needsOptions && (
              <div className="rounded-2xl border border-white/10 bg-surface-3 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-charcoal">Answer Options</p>
                    <p className="mt-1 text-xs text-charcoal-2">Add, edit, delete, and reorder selectable answers.</p>
                  </div>
                  <button type="button" onClick={addOption} className="btn-secondary">Add Option</button>
                </div>
                <div className="space-y-2">
                  {questionForm.options.map((option, index) => (
                    <div key={option.id} className="grid gap-2 rounded-xl border border-white/10 p-3 sm:grid-cols-[1fr_auto]">
                      <div className="grid gap-2">
                        <input value={option.label} onChange={e => updateOption(option.id, e.target.value)} placeholder={`Option ${index + 1}`} className="field-control" />
                        {questionForm.question_type === 'multi_choice' && (
                          <>
                            <label className="flex items-center gap-2 text-sm text-charcoal"><input type="checkbox" checked={option.requiresText} onChange={e => updateOptionDetails(option.id, { requiresText: e.target.checked })} className="accent-accent" /> Requires clarification text</label>
                            {option.requiresText && <input value={option.textPrompt} onChange={e => updateOptionDetails(option.id, { textPrompt: e.target.value })} placeholder="Please specify" className="field-control" aria-label={`Clarification prompt for ${option.label || `option ${index + 1}`}`} />}
                          </>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => moveOption(option.id, -1)} disabled={index === 0} title={index === 0 ? 'Already first option.' : undefined} className="btn-subtle">Up</button>
                        <button type="button" onClick={() => moveOption(option.id, 1)} disabled={index === questionForm.options.length - 1} title={index === questionForm.options.length - 1 ? 'Already last option.' : undefined} className="btn-subtle">Down</button>
                        <button type="button" onClick={() => removeOption(option.id)} className="btn-subtle">Delete</button>
                      </div>
                    </div>
                  ))}
                  {questionForm.options.length === 0 && <p className="text-sm text-charcoal-2">No answer options yet.</p>}
                </div>
              </div>
            )}

            {questionForm.question_type === 'scale' && (
              <div className="rounded-2xl border border-white/10 bg-surface-3 p-3">
                <p className="mb-3 text-sm font-semibold text-charcoal">Scale / Rating</p>
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" value={questionForm.scaleMin} onChange={e => setQuestionForm(current => ({ ...current, scaleMin: Number(e.target.value) }))} min={0} className="field-control" aria-label="Scale minimum" />
                  <input type="number" value={questionForm.scaleMax} onChange={e => setQuestionForm(current => ({ ...current, scaleMax: Number(e.target.value) }))} min={1} className="field-control" aria-label="Scale maximum" />
                </div>
              </div>
            )}

            <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-surface-3 px-3 py-2 text-sm">
              <span>Active question</span>
              <input type="checkbox" checked={questionForm.is_active} onChange={e => setQuestionForm(current => ({ ...current, is_active: e.target.checked }))} className="accent-accent" />
            </label>
            <button type="submit" disabled={saving || !canSubmitQuestion} title={saving ? 'Question save already in progress.' : submitReason} className="btn-primary w-full">{saving ? 'Saving...' : questionForm.id ? 'Save Question' : 'Create Question'}</button>
          </form>
        </div>
      </div>
    );
  }

  function renderInviteModal() {
    const selectedInviteTemplate = templates.find(template => template.id === inviteForm.templateId);
    const canCreateInvite = Boolean(
      selectedInviteTemplate
      && (
        inviteForm.source === 'existing'
          ? inviteForm.creatorProfileId
          : inviteForm.creatorName.trim() && inviteForm.creatorEmail.trim()
      )
    );
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-2xl">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 p-5">
            <div>
              <h2 className="cockpit-section-title">New Assessment Invite</h2>
              <p className="mt-1 text-xs text-charcoal-2">Generate an invite for a new or existing creator.</p>
            </div>
            <button type="button" onClick={() => setInviteModalOpen(false)} className="btn-subtle">Close</button>
          </div>
          <form onSubmit={createInvite} className="flex min-h-0 flex-1 flex-col">
            <div ref={inviteModalBodyRef} className="grid min-h-0 min-w-0 gap-3 overflow-y-auto overflow-x-hidden p-5">
              {inviteModalError && (
                <div className="rounded-2xl border border-pink/30 bg-pink/10 p-4 text-sm text-pink" role="alert">
                  <p className="font-semibold">Invite creation failed</p>
                  <p className="mt-1">{inviteModalError}</p>
                </div>
              )}
              {generatedInviteUrl && (
                <div ref={inviteResultRef} tabIndex={-1} className="w-full min-w-0 scroll-mt-4 rounded-2xl border border-success/30 bg-success/10 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-success">Invite created</p>
                      <p className="mt-1 text-xs text-charcoal-2">The generated assessment link is ready to copy or open.</p>
                    </div>
                    <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">{generatedInviteStatus}</span>
                  </div>
                  <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <a
                      href={generatedInviteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block min-w-0 break-all rounded-xl border border-white/10 bg-surface-3/70 px-3 py-2 text-sm text-charcoal-2 underline-offset-2 hover:text-charcoal hover:underline"
                    >
                      {generatedInviteUrl}
                    </a>
                    <button type="button" onClick={() => copyInviteUrl(generatedInviteUrl)} className="btn-secondary w-full sm:w-auto">Copy Link</button>
                  </div>
                </div>
              )}
              <label className="grid gap-1 text-sm font-medium text-charcoal">
                <span>Template</span>
                <select value={inviteForm.templateId} onChange={e => setInviteForm(current => ({ ...current, templateId: e.target.value }))} required className="field-control">
                  <option value="">Choose template</option>
                  {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </label>
              <div className="grid gap-2 text-sm font-medium text-charcoal">
                <span>Creator Source</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 ${inviteForm.source === 'existing' ? 'border-accent bg-accent/10 text-accent' : 'border-white/10 bg-surface-3'}`}>
                    <input
                      type="radio"
                      checked={inviteForm.source === 'existing'}
                      onChange={() => setInviteForm(current => ({ ...current, source: 'existing' }))}
                      className="accent-accent"
                    />
                    Existing Creator
                  </label>
                  <label className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 ${inviteForm.source === 'manual' ? 'border-accent bg-accent/10 text-accent' : 'border-white/10 bg-surface-3'}`}>
                    <input
                      type="radio"
                      checked={inviteForm.source === 'manual'}
                      onChange={() => setInviteForm(current => ({ ...current, source: 'manual', creatorProfileId: '' }))}
                      className="accent-accent"
                    />
                    New Creator / Manual Email
                  </label>
                </div>
              </div>

              {inviteForm.source === 'existing' ? (
                <div className="grid gap-3">
                  <label className="grid gap-1 text-sm font-medium text-charcoal">
                    <span>Search Creator</span>
                    <input
                      value={inviteForm.creatorSearch}
                      onChange={e => setInviteForm(current => ({ ...current, creatorSearch: e.target.value }))}
                      placeholder="Search by name, email, handle, or model name"
                      className="field-control"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-charcoal">
                    <span>Existing Creator</span>
                    <select value={inviteForm.creatorProfileId} onChange={e => selectInviteCreatorProfile(e.target.value)} required className="field-control">
                      <option value="">Choose creator</option>
                      {filteredInviteProfiles.map(profile => (
                        <option key={profile.id} value={profile.id}>
                          {profile.full_name} {profile.email ? `- ${profile.email}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  {inviteForm.creatorProfileId && (
                    <div className="rounded-xl border border-white/10 bg-surface-3 px-3 py-2 text-xs text-charcoal-2">
                      {inviteForm.creatorName || 'Selected creator'} / {inviteForm.creatorEmail || 'No email on profile'}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm font-medium text-charcoal">
                      <span>Creator Name</span>
                      <input value={inviteForm.creatorName} onChange={e => setInviteForm(current => ({ ...current, creatorName: e.target.value }))} required className="field-control" />
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-charcoal">
                      <span>Email Address</span>
                      <input type="email" value={inviteForm.creatorEmail} onChange={e => setInviteForm(current => ({ ...current, creatorEmail: e.target.value }))} required className="field-control" />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm font-medium text-charcoal">
                      <span>OnlyFans Handle</span>
                      <input value={inviteForm.onlyfansHandle} onChange={e => setInviteForm(current => ({ ...current, onlyfansHandle: e.target.value }))} placeholder="@creator" className="field-control" />
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-charcoal">
                      <span>Model Name</span>
                      <input value={inviteForm.modelName} onChange={e => setInviteForm(current => ({ ...current, modelName: e.target.value }))} className="field-control" />
                    </label>
                  </div>
                </>
              )}
              <label className="grid gap-1 text-sm font-medium text-charcoal">
                <span>Expiry Date</span>
                <input type="date" value={inviteForm.expiresAt} onChange={e => setInviteForm(current => ({ ...current, expiresAt: e.target.value }))} className="field-control" />
                <span className="text-xs font-normal text-charcoal-2">Optional. Leave blank for no expiry. Created date is generated automatically.</span>
              </label>
              <label className="grid gap-1 text-sm font-medium text-charcoal">
                <span>Report Tier</span>
                <select value={inviteForm.reportTier} onChange={e => setInviteForm(current => ({ ...current, reportTier: e.target.value as ReportTier }))} className="field-control">
                  <option value="free">Free creator report</option>
                  <option value="premium">Premium creator report</option>
                  <option value="agency">Agency/internal report</option>
                </select>
                <span className="text-xs font-normal text-charcoal-2">Agency/internal reports are for cockpit review and are not exposed as a public creator report.</span>
              </label>
              <label className="grid gap-1 text-sm font-medium text-charcoal">
                <span>Internal Notes</span>
                <textarea value={inviteForm.notes} onChange={e => setInviteForm(current => ({ ...current, notes: e.target.value }))} rows={3} className="field-control resize-none" />
              </label>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-white/10 bg-surface-3/60 p-4">
              <button type="button" onClick={() => setInviteModalOpen(false)} className="btn-subtle">Cancel</button>
              <button type="submit" disabled={saving || !canCreateInvite} title={!selectedInviteTemplate ? 'Choose a template first.' : saving ? 'Invite creation already in progress.' : !canCreateInvite ? 'Choose a creator or enter name and email.' : undefined} className="btn-primary">{saving ? 'Creating...' : 'Create Invite Link'}</button>
            </div>
          </form>
        </div>
      </div>
    );
  }
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${active ? 'bg-success/10 text-success' : 'bg-warn/10 text-warn'}`}>
      {active ? 'Active' : 'Archived'}
    </span>
  );
}
