import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDefaultAssessmentTemplate, submitAssessment } from '@/lib/creators-api';
import type {
  AssessmentQuestionOption,
  AssessmentResponses,
  CreatorAssessmentQuestion,
  CreatorAssessmentRuntimeTemplate,
} from '@/types/creator';

const INITIAL: AssessmentResponses = {
  strengths: '',
  comfort_level: 5,
  passion_topic: '',
  persona_occupation: [],
  parasocial_comfort: false,
  fantasy_keywords: '',
  nudity_level: '',
  niche_interests: [],
  audience_target: null,
  first_name: '',
  last_name: '',
  onlyfans_handle: '',
  model_name: '',
  city: '',
  full_name: '',
  email: '',
  country: '',
  consent: true,
  mailing_list_opt_out: false,
  aspirational_creators: '',
  alternative_content_ideas: '',
  future_improvements: [],
  future_improvements_other: '',
};

const SECTION_ORDER = ['About You', 'Current Approach', 'Exploring Content Possibilities', 'Options for the Future'];
const LEGACY_SECTION_MAP: Record<string, string> = {
  Strengths: 'About You',
  Boundaries: 'Current Approach',
  Persona: 'Exploring Content Possibilities',
  Goals: 'Options for the Future',
};
const SECTION_DESCRIPTIONS: Record<string, string> = {
  'About You': 'Tell us a little about yourself, your creator identity, and what makes your content unique.',
  'Current Approach': 'Help us understand how you currently create, engage with fans, and approach content creation.',
  'Exploring Content Possibilities': "Let's explore the content styles, personas, and opportunities that may align with your strengths.",
  'Options for the Future': "Share where you'd like your creator journey to go and how success looks for you.",
};

const FALLBACK_TEMPLATE: CreatorAssessmentRuntimeTemplate = {
  id: 'legacy-fallback',
  name: 'Default Creator Assessment',
  description: 'Legacy fallback used before assessment template tables are available.',
  is_default: true,
  is_active: true,
  created_at: '',
  updated_at: '',
  questions: [
    {
      id: 'fallback-strengths',
      question_key: 'strengths',
      response_key: 'strengths',
      question_text: 'Briefly describe the three top reasons why you will be successful as a creator on OnlyFans.',
      help_text: 'Tell us the three strongest reasons you believe you can succeed. For example: confidence on camera, strong fan connection, consistency, unique look, storytelling, niche expertise.',
      section: 'Strengths',
      question_type: 'long_text',
      scoring_dimension: 'creator_dna',
      parent_question_key: null,
      show_when_value: null,
      show_when_operator: 'equals',
      options: [],
      config: { required: true, rows: 4 },
      is_active: true,
      created_at: '',
      updated_at: '',
      template_id: 'legacy-fallback',
      is_included: true,
      sort_order: 10,
    },
    {
      id: 'fallback-comfort',
      question_key: 'comfort_level',
      response_key: 'comfort_level',
      question_text: 'Rate your comfort level in front of the camera (1-10)',
      help_text: null,
      section: 'Strengths',
      question_type: 'scale',
      scoring_dimension: 'creator_dna',
      parent_question_key: null,
      show_when_value: null,
      show_when_operator: 'equals',
      options: [],
      config: { min: 1, max: 10, required: true },
      is_active: true,
      created_at: '',
      updated_at: '',
      template_id: 'legacy-fallback',
      is_included: true,
      sort_order: 20,
    },
    {
      id: 'fallback-passion',
      question_key: 'passion_topic',
      response_key: 'passion_topic',
      question_text: 'What is one topic you could talk about for 30 minutes without preparation?',
      help_text: null,
      section: 'Strengths',
      question_type: 'long_text',
      scoring_dimension: 'consistency',
      parent_question_key: null,
      show_when_value: null,
      show_when_operator: 'equals',
      options: [],
      config: { placeholder: 'E.g., astrology, vintage fashion, conspiracy theories...' },
      is_active: true,
      created_at: '',
      updated_at: '',
      template_id: 'legacy-fallback',
      is_included: true,
      sort_order: 30,
    },
    {
      id: 'fallback-persona',
      question_key: 'persona_occupation',
      response_key: 'persona_occupation',
      question_text: 'Select any creator archetypes that resonate with you.',
      help_text: 'What role, fantasy, identity or character best represents your content?',
      section: 'Persona',
      question_type: 'multi_choice',
      scoring_dimension: 'brand_identity',
      parent_question_key: null,
      show_when_value: null,
      show_when_operator: 'equals',
      options: ['Girl Next Door', 'Hot Teacher', 'Naughty Librarian', 'Nurse', 'Doctor', 'Corporate Rebel', 'Fitness Goddess', 'Dominatrix', 'Brat', 'Submissive', 'Trophy Wife', 'Rich Girl', 'Luxury Muse', 'Alternative / Tattooed', 'Gamer Girl', 'Cosplayer', 'Spiritual Goddess', 'MILF', 'Single Mom', 'College Girl', 'Party Girl', 'Boss Babe', 'Country Girl', 'Bimbo', 'Soft Girlfriend Experience', 'High-Class Escort Fantasy', 'Seductress', 'Artist / Creative Muse', 'Other'],
      config: { required: true },
      is_active: true,
      created_at: '',
      updated_at: '',
      template_id: 'legacy-fallback',
      is_included: true,
      sort_order: 40,
    },
    {
      id: 'fallback-parasocial',
      question_key: 'parasocial_comfort',
      response_key: 'parasocial_comfort',
      question_text: 'Comfortable sharing personal/dating stories to build parasocial bonds?',
      help_text: null,
      section: 'Persona',
      question_type: 'boolean',
      scoring_dimension: 'monetisation',
      parent_question_key: null,
      show_when_value: null,
      show_when_operator: 'equals',
      options: [],
      config: { trueLabel: 'Yes', falseLabel: 'No' },
      is_active: true,
      created_at: '',
      updated_at: '',
      template_id: 'legacy-fallback',
      is_included: true,
      sort_order: 50,
    },
    {
      id: 'fallback-fantasy',
      question_key: 'fantasy_keywords',
      response_key: 'fantasy_keywords',
      question_text: 'Describe your hottest fantasy in three keywords',
      help_text: null,
      section: 'Persona',
      question_type: 'short_text',
      scoring_dimension: 'brand_identity',
      parent_question_key: null,
      show_when_value: null,
      show_when_operator: 'equals',
      options: [],
      config: { placeholder: 'E.g., power, submission, luxury' },
      is_active: true,
      created_at: '',
      updated_at: '',
      template_id: 'legacy-fallback',
      is_included: true,
      sort_order: 60,
    },
    {
      id: 'fallback-nudity',
      question_key: 'content_comfort',
      response_key: 'nudity_level',
      question_text: 'Nudity comfort level',
      help_text: null,
      section: 'Boundaries',
      question_type: 'single_choice',
      scoring_dimension: 'boundaries',
      parent_question_key: null,
      show_when_value: null,
      show_when_operator: 'equals',
      options: [
        { value: 'sfw_only', label: 'SFW only' },
        { value: 'teasing_only', label: 'Teasing only' },
        { value: 'topless', label: 'Topless' },
        { value: 'full_nude', label: 'Full nude' },
        { value: 'fetish', label: 'Fetish-specific' },
      ],
      config: { required: true },
      is_active: true,
      created_at: '',
      updated_at: '',
      template_id: 'legacy-fallback',
      is_included: true,
      sort_order: 70,
    },
    {
      id: 'fallback-niches',
      question_key: 'niche_interests',
      response_key: 'niche_interests',
      question_text: 'Natural niche interests',
      help_text: 'Select any that resonate',
      section: 'Boundaries',
      question_type: 'multi_choice',
      scoring_dimension: 'content_strategy',
      parent_question_key: null,
      show_when_value: null,
      show_when_operator: 'equals',
      options: ['Armpits', 'Feet', 'Fitness/Muscle', 'Roleplay', 'Daddy dynamic', 'High-Fashion'],
      config: {},
      is_active: true,
      created_at: '',
      updated_at: '',
      template_id: 'legacy-fallback',
      is_included: true,
      sort_order: 80,
    },
    {
      id: 'fallback-audience',
      question_key: 'audience_target',
      response_key: 'audience_target',
      question_text: 'Define your audience',
      help_text: 'This shapes your entire monetisation strategy',
      section: 'Goals',
      question_type: 'single_choice',
      scoring_dimension: 'monetisation',
      parent_question_key: null,
      show_when_value: null,
      show_when_operator: 'equals',
      options: [
        { value: 'whales', label: 'Whales', description: 'High-spending executives seeking luxury & exclusivity. Low volume, high revenue per sub.' },
        { value: 'masses', label: 'The Masses', description: 'High-volume casual subscribers. Quantity over ticket size. Free trial + upsell model.' },
      ],
      config: { required: true, variant: 'audience_cards' },
      is_active: true,
      created_at: '',
      updated_at: '',
      template_id: 'legacy-fallback',
      is_included: true,
      sort_order: 90,
    },
    {
      id: 'fallback-aspirational-creators',
      question_key: 'aspirational_creators',
      response_key: 'aspirational_creators',
      question_text: 'Are there any OnlyFans creators that you aspire to?',
      help_text: 'Add their OnlyFans handles below.',
      section: 'Goals',
      question_type: 'long_text',
      scoring_dimension: 'agency_signal',
      parent_question_key: null,
      show_when_value: null,
      show_when_operator: 'equals',
      options: [],
      config: {},
      is_active: true,
      created_at: '',
      updated_at: '',
      template_id: 'legacy-fallback',
      is_included: true,
      sort_order: 100,
    },
    {
      id: 'fallback-alternative-content-ideas',
      question_key: 'alternative_content_ideas',
      response_key: 'alternative_content_ideas',
      question_text: 'Have you had any ideas for a different approach to your content?',
      help_text: 'If so, describe it below.',
      section: 'Goals',
      question_type: 'long_text',
      scoring_dimension: 'agency_signal',
      parent_question_key: null,
      show_when_value: null,
      show_when_operator: 'equals',
      options: [],
      config: {},
      is_active: true,
      created_at: '',
      updated_at: '',
      template_id: 'legacy-fallback',
      is_included: true,
      sort_order: 110,
    },
    {
      id: 'fallback-future-improvements',
      question_key: 'future_improvements',
      response_key: 'future_improvements',
      question_text: 'What would you most like to improve in the future?',
      help_text: 'Select as many as apply.',
      section: 'Goals',
      question_type: 'multi_choice',
      scoring_dimension: 'agency_signal',
      parent_question_key: null,
      show_when_value: null,
      show_when_operator: 'equals',
      options: ['Financial Resources (more income)', 'Lifestyle (better balance, fewer hours)', 'Personal Fulfilment (better alignment with goals and values)', 'Channel Expansion (additional platforms and revenue streams)', 'Content Direction (changes to content style or positioning)', 'Moderation & Compliance (classification, restrictions, platform concerns)', 'Skills Match (better use of strengths and abilities)', 'Long-Term Goals', 'Audience Growth', 'Subscriber Retention', 'Other'],
      config: {},
      is_active: true,
      created_at: '',
      updated_at: '',
      template_id: 'legacy-fallback',
      is_included: true,
      sort_order: 120,
    },
    {
      id: 'fallback-future-improvements-other',
      question_key: 'future_improvements_other',
      response_key: 'future_improvements_other',
      question_text: 'Please describe.',
      help_text: null,
      section: 'Goals',
      question_type: 'long_text',
      scoring_dimension: 'agency_signal',
      parent_question_key: 'future_improvements',
      show_when_value: 'Other',
      show_when_operator: 'includes',
      options: [],
      config: {},
      is_active: true,
      created_at: '',
      updated_at: '',
      template_id: 'legacy-fallback',
      is_included: true,
      sort_order: 130,
    },
  ],
};

function optionValue(option: AssessmentQuestionOption): string {
  return typeof option === 'string' ? option : option.value;
}

function optionLabel(option: AssessmentQuestionOption): string {
  return typeof option === 'string' ? option : option.label;
}

function optionDescription(option: AssessmentQuestionOption): string | undefined {
  return typeof option === 'string' ? undefined : option.description;
}

function optionIsActive(option: AssessmentQuestionOption): boolean {
  return typeof option === 'string' ? true : option.is_active ?? true;
}

function activeOptions(question: CreatorAssessmentQuestion): AssessmentQuestionOption[] {
  return question.options.filter(optionIsActive);
}

function normalizedConditionValue(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function selectedLabels(question: CreatorAssessmentQuestion, selectedValue: unknown): string[] {
  const selected = Array.isArray(selectedValue) ? selectedValue : [selectedValue];

  return selected.flatMap(value => {
    const valueText = String(value ?? '');
    const option = activeOptions(question).find(item => optionValue(item) === valueText || optionLabel(item) === valueText);
    return option ? [valueText, optionLabel(option), optionValue(option)] : [valueText];
  });
}

function conditionMatches(question: CreatorAssessmentQuestion, parent: CreatorAssessmentQuestion, data: AssessmentResponses): boolean {
  if (!question.parent_question_key || !question.show_when_value) return true;

  const parentValue = data[parent.response_key];
  const target = normalizedConditionValue(question.show_when_value);
  const candidates = selectedLabels(parent, parentValue).map(normalizedConditionValue);

  if (question.show_when_operator === 'includes') {
    return candidates.some(candidate => candidate.includes(target) || target.includes(candidate));
  }

  return candidates.some(candidate => candidate === target);
}

function isVisible(
  question: CreatorAssessmentQuestion,
  data: AssessmentResponses,
  questions: CreatorAssessmentQuestion[]
): boolean {
  if (!question.parent_question_key) return true;
  const parent = questions.find(item => item.question_key === question.parent_question_key);
  if (!parent) return false;
  return conditionMatches(question, parent, data);
}

function defaultValue(question: CreatorAssessmentQuestion): unknown {
  if (question.question_type === 'multi_choice') return [];
  if (question.question_type === 'boolean') return false;
  if (question.question_type === 'scale') return Number(question.config.min ?? 1);
  return '';
}

function textValue(value: unknown): string {
  return String(value ?? '').trim();
}

function maxSelections(question: CreatorAssessmentQuestion): number | null {
  const value = question.config.maxSelections;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function displaySectionName(section: string): string {
  return LEGACY_SECTION_MAP[section] ?? section;
}

function normalizeRuntimeTemplate(template: CreatorAssessmentRuntimeTemplate): CreatorAssessmentRuntimeTemplate {
  return {
    ...template,
    questions: template.questions.map(question => {
      if (question.question_key !== 'strengths') return question;

      return {
        ...question,
        question_text: 'Briefly describe the three top reasons why you will be successful as a creator on OnlyFans.',
        help_text: 'Tell us the three strongest reasons you believe you can succeed. For example: confidence on camera, strong fan connection, consistency, unique look, storytelling, niche expertise.',
        question_type: 'long_text',
        options: [],
        config: { ...question.config, required: true, rows: 4 },
      };
    }),
  };
}

export function AssessmentWizard() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<AssessmentResponses>(INITIAL);
  const [template, setTemplate] = useState<CreatorAssessmentRuntimeTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    getDefaultAssessmentTemplate()
      .then(runtimeTemplate => {
        if (!mounted) return;
        const nextTemplate = normalizeRuntimeTemplate(runtimeTemplate ?? FALLBACK_TEMPLATE);
        setTemplate(nextTemplate);
        setData(current => {
          const next = { ...current };
          for (const question of nextTemplate.questions) {
            if (next[question.response_key] === undefined) {
              next[question.response_key] = defaultValue(question);
            }
            const notesKey = question.config.notesKey as string | undefined;
            if (notesKey && next[notesKey] === undefined) next[notesKey] = '';
          }
          return next;
        });
      })
      .catch(() => setTemplate(FALLBACK_TEMPLATE))
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const sections = useMemo(() => {
    const includedItems = (template?.items ?? []).filter(item => item.is_included);
    if (includedItems.length > 0) {
      const itemSections: { section: string; description?: string | null; questions: CreatorAssessmentQuestion[] }[] = [];
      let currentSection: { section: string; description?: string | null; questions: CreatorAssessmentQuestion[] } | null = null;

      for (const item of includedItems.sort((a, b) => a.sort_order - b.sort_order)) {
        if (item.item_type === 'section_heading') {
          currentSection = {
            section: item.title?.trim() || 'Unsectioned Questions',
            description: item.description,
            questions: [],
          };
          itemSections.push(currentSection);
          continue;
        }

        if (item.item_type !== 'question' || !item.question?.is_active) continue;
        const question = {
          ...item.question,
          template_id: item.template_id,
          is_included: item.is_included,
          sort_order: item.sort_order,
        };

        if (!currentSection) {
          currentSection = {
            section: 'Unsectioned Questions',
            description: null,
            questions: [],
          };
          itemSections.push(currentSection);
        }

        currentSection.questions.push(question);
      }

      return itemSections.filter(section => section.questions.length > 0);
    }

    const includedQuestions = (template?.questions ?? []).filter(q => q.is_included && q.is_active);
    const grouped = new Map<string, CreatorAssessmentQuestion[]>();

    for (const question of includedQuestions) {
      const section = displaySectionName(question.section?.trim() || 'Other');
      grouped.set(section, [...(grouped.get(section) ?? []), { ...question, section }]);
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => {
        const ai = SECTION_ORDER.indexOf(a);
        const bi = SECTION_ORDER.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
      .map(([section, questions]) => ({
        section,
        description: SECTION_DESCRIPTIONS[section] ?? null,
        questions: questions.sort((a, b) => a.sort_order - b.sort_order),
      }));
  }, [template]);

  const templateQuestions = useMemo(
    () => sections.flatMap(section => section.questions),
    [sections]
  );
  const steps = ['Details', ...sections.map(x => x.section), 'Submit'];
  const isDetailsStep = step === 0;
  const activeSection = sections[step - 1];
  const isSubmitStep = step === steps.length - 1;
  const visibleActiveSectionQuestions = useMemo(() => {
    if (!activeSection) return [];

    return activeSection.questions.filter(question => isVisible(question, data, templateQuestions));
  }, [activeSection, data, templateQuestions]);

  const update = (key: string, value: unknown) => {
    setData(d => ({ ...d, [key]: value }));
  };

  const toggleArray = (question: CreatorAssessmentQuestion, value: string) => {
    setData(d => {
      const existing = Array.isArray(d[question.response_key]) ? d[question.response_key] as string[] : [];
      const limit = maxSelections(question);
      if (!existing.includes(value) && limit !== null && existing.length >= limit) return d;

      return {
        ...d,
        [question.response_key]: existing.includes(value)
          ? existing.filter(x => x !== value)
          : [...existing, value],
      };
    });
  };

  const canNext = (): boolean => {
    if (isDetailsStep) {
      return Boolean(
        textValue(data.first_name)
        && textValue(data.last_name)
        && textValue(data.onlyfans_handle)
        && textValue(data.city)
        && textValue(data.country)
        && textValue(data.email)
      );
    }

    if (isSubmitStep) {
      return canNextDetails();
    }

    return (activeSection?.questions ?? [])
      .filter(question => isVisible(question, data, templateQuestions))
      .every(question => {
        if (!question.config.required) return true;
        const value = data[question.response_key];
        if (Array.isArray(value)) return value.length > 0;
        return value !== '' && value !== null && value !== undefined;
      });
  };

  const canNextDetails = (): boolean => Boolean(
    textValue(data.first_name)
    && textValue(data.last_name)
    && textValue(data.onlyfans_handle)
    && textValue(data.city)
    && textValue(data.country)
    && textValue(data.email)
  );

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const visibleQuestions = templateQuestions.filter(question => isVisible(question, data, templateQuestions));
      const visibleResponseKeys = new Set(visibleQuestions.map(question => question.response_key));
      const firstName = textValue(data.first_name);
      const lastName = textValue(data.last_name);
      const sanitizedData: AssessmentResponses = {
        ...data,
        first_name: firstName,
        last_name: lastName,
        full_name: [firstName, lastName].filter(Boolean).join(' '),
        onlyfans_handle: textValue(data.onlyfans_handle),
        model_name: textValue(data.model_name),
        city: textValue(data.city),
        country: textValue(data.country),
        email: textValue(data.email).toLowerCase(),
        consent: !data.mailing_list_opt_out,
      };

      for (const question of templateQuestions) {
        if (!question.parent_question_key || visibleResponseKeys.has(question.response_key)) continue;
        delete sanitizedData[question.response_key];
        const notesKey = question.config.notesKey as string | undefined;
        if (notesKey) delete sanitizedData[notesKey];
      }

      const visibleTemplate = template
        ? {
            ...template,
            questions: template.questions
              .filter(question => !question.is_included || visibleResponseKeys.has(question.response_key))
              .map(question => ({ ...question, options: activeOptions(question) })),
          }
        : template;
      const result = await submitAssessment(sanitizedData, visibleTemplate);
      navigate(`/report/${result.report.report_slug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const renderDetailsStep = () => (
    <div className="mx-auto max-w-2xl space-y-6 animate-in">
      <div className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Find Your Vertical – Modelling Creator Talent</h2>
        <p className="text-sm leading-6 text-gray-400">
          Find Your Vertical is designed to identify your strongest creator positioning, content opportunities, monetisation potential, and long-term growth paths.
        </p>
        <p className="text-sm leading-6 text-gray-400">
          Your responses help generate a personalised creator report and may be reviewed for creator management opportunities.
        </p>
        <p className="text-sm leading-6 text-gray-400">
          Your information is treated confidentially and used only for assessment and creator contact purposes.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <input
          type="text"
          value={String(data.first_name ?? '')}
          onChange={e => update('first_name', e.target.value)}
          placeholder="First Name"
          className="w-full bg-surface-2 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent"
        />
        <input
          type="text"
          value={String(data.last_name ?? '')}
          onChange={e => update('last_name', e.target.value)}
          placeholder="Last Name"
          className="w-full bg-surface-2 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent"
        />
        <input
          type="text"
          value={String(data.onlyfans_handle ?? '')}
          onChange={e => update('onlyfans_handle', e.target.value)}
          placeholder="OnlyFans handle"
          className="w-full bg-surface-2 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent"
        />
        <input
          type="text"
          value={String(data.model_name ?? '')}
          onChange={e => update('model_name', e.target.value)}
          placeholder="Model name / stage name (optional)"
          className="w-full bg-surface-2 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent"
        />
        <input
          type="text"
          value={String(data.city ?? '')}
          onChange={e => update('city', e.target.value)}
          placeholder="City"
          className="w-full bg-surface-2 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent"
        />
        <input
          type="text"
          value={String(data.country ?? '')}
          onChange={e => update('country', e.target.value)}
          placeholder="Country"
          className="w-full bg-surface-2 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent"
        />
        <input
          type="email"
          value={String(data.email ?? '')}
          onChange={e => update('email', e.target.value)}
          placeholder="Email"
          className="w-full bg-surface-2 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent sm:col-span-2"
        />
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={data.mailing_list_opt_out}
          onChange={e => update('mailing_list_opt_out', e.target.checked)}
          className="mt-1 accent-accent"
        />
        <span className="text-sm text-gray-400">Opt out of mailing list updates</span>
      </label>
    </div>
  );

  const renderQuestion = (question: CreatorAssessmentQuestion) => {
    if (!isVisible(question, data, templateQuestions)) return null;

    const value = data[question.response_key];
    return (
      <div key={question.id}>
        <label className="block text-sm font-medium mb-2 text-gray-300">
          {question.question_text}
        </label>
        {question.help_text && <p className="text-gray-500 text-xs mb-3">{question.help_text}</p>}

        {question.question_type === 'multi_choice' && (
          <div className={question.section === 'Current Approach' || question.section === 'Options for the Future' ? 'grid max-w-xl grid-cols-1 gap-2 sm:grid-cols-2' : 'flex max-w-lg flex-wrap gap-2'}>
            {activeOptions(question).map(option => {
              const optionKey = optionValue(option);
              const selected = Array.isArray(value) && value.includes(optionKey);
              const limit = maxSelections(question);
              const atLimit = !selected && limit !== null && Array.isArray(value) && value.length >= limit;
              return (
                <button
                  key={optionKey}
                  disabled={atLimit}
                  onClick={() => toggleArray(question, optionKey)}
                  className={`${question.section === 'Current Approach' || question.section === 'Options for the Future' ? 'px-4 py-3 rounded-lg text-left' : 'max-w-full px-4 py-2 rounded-full'} text-sm font-medium border transition-all ${
                    selected
                      ? 'bg-accent/20 border-accent text-accent'
                      : atLimit
                        ? 'border-gray-800 text-gray-600 cursor-not-allowed'
                        : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {optionLabel(option)}
                </button>
              );
            })}
          </div>
        )}

        {question.question_type === 'single_choice' && question.config.variant === 'audience_cards' && (
          <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            {activeOptions(question).map(option => {
              const optionKey = optionValue(option);
              return (
                <button
                  key={optionKey}
                  onClick={() => update(question.response_key, optionKey)}
                  className={`p-5 rounded-xl border-2 transition-all text-left ${
                    value === optionKey
                      ? 'border-accent bg-accent/10'
                      : 'border-gray-700 hover:border-gray-500'
                  }`}
                >
                  <div className="font-semibold text-gray-100">{optionLabel(option)}</div>
                  {optionDescription(option) && (
                    <p className="text-xs text-gray-500 mt-1">{optionDescription(option)}</p>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {question.question_type === 'single_choice' && question.config.variant !== 'audience_cards' && (
          <div className="grid max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
            {activeOptions(question).map(option => {
              const optionKey = optionValue(option);
              return (
                <button
                  key={optionKey}
                  onClick={() => update(question.response_key, optionKey)}
                  className={`px-4 py-3 rounded-lg text-sm font-medium border transition-all text-left ${
                    value === optionKey
                      ? question.section === 'Current Approach'
                        ? 'bg-pink/20 border-pink text-pink'
                        : 'bg-accent/20 border-accent text-accent'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {optionLabel(option)}
                </button>
              );
            })}
          </div>
        )}

        {question.question_type === 'boolean' && (
          <div className="flex max-w-sm gap-2">
            {[
              { label: String(question.config.trueLabel ?? 'Yes'), value: true },
              { label: String(question.config.falseLabel ?? 'No'), value: false },
            ].map(option => (
              <button
                key={option.label}
                onClick={() => update(question.response_key, option.value)}
                className={`px-6 py-2 rounded-full text-sm font-medium border transition-all ${
                  value === option.value
                    ? 'bg-pink/20 border-pink text-pink'
                    : 'border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {question.question_type === 'scale' && (
          <div className="flex w-full max-w-lg min-w-0 items-center gap-3 rounded-lg bg-surface/60 px-4 py-3">
            <span className="text-xs text-gray-500">{String(question.config.min ?? 1)}</span>
            <input
              type="range"
              min={Number(question.config.min ?? 1)}
              max={Number(question.config.max ?? 10)}
              value={Number(value ?? question.config.min ?? 1)}
              onChange={e => update(question.response_key, parseInt(e.target.value))}
              className="min-w-0 flex-1 accent-accent"
            />
            <span className="text-xs text-gray-500">{String(question.config.max ?? 10)}</span>
            <span className="font-display text-xl text-accent ml-2 w-6 text-center">{String(value)}</span>
          </div>
        )}

        {question.question_type === 'short_text' && (
          <input
            type="text"
            value={String(value ?? '')}
            onChange={e => update(question.response_key, e.target.value)}
            placeholder={String(question.config.placeholder ?? '')}
            className="w-full max-w-lg bg-surface-2 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent"
          />
        )}

        {(question.question_type === 'long_text' || question.question_type === 'textarea') && (
          <textarea
            value={String(value ?? '')}
            onChange={e => update(question.response_key, e.target.value)}
            placeholder={String(question.config.placeholder ?? '')}
            rows={Number(question.config.rows ?? 3)}
            className="w-full max-w-lg bg-surface-2 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent resize-none"
          />
        )}

        {Boolean(question.config.notesKey) && (
          <div className="mt-3">
            <label className="block text-sm font-medium mb-2 text-gray-300">
              {String(question.config.notesLabel ?? 'Notes')}
            </label>
            <textarea
              value={String(data[String(question.config.notesKey)] ?? '')}
              onChange={e => update(String(question.config.notesKey), e.target.value)}
              rows={3}
              className="w-full max-w-lg bg-surface-2 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent resize-none"
            />
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-gray-500 text-sm">Loading assessment...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full overflow-x-hidden px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="text-center mb-6 sm:mb-10">
          <h1 className="font-display text-3xl font-bold mb-2">Find Your Vertical</h1>
          <p className="text-gray-500 text-sm">Creator Vertical Assessment</p>
        </div>

        <div className="mx-auto mb-6 flex max-w-xl gap-2 overflow-x-auto pb-1 sm:mb-10">
          {steps.map((label, i) => (
            <div key={label} className="min-w-20 flex-1">
              <div className={`h-1 rounded-full transition-colors ${i <= step ? 'bg-accent' : 'bg-surface-3'}`} />
              <span className={`text-xs mt-1 block ${i <= step ? 'text-accent' : 'text-gray-600'}`}>{label}</span>
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-800 text-red-300 rounded-lg px-4 py-3 mb-6 text-sm">
            {error}
          </div>
        )}

        {isDetailsStep && renderDetailsStep()}

        {!isDetailsStep && !isSubmitStep && activeSection && (
          <div className="mx-auto max-w-2xl space-y-6 animate-in">
            <div>
              <h2 className="font-display text-xl font-semibold">{activeSection.section}</h2>
              {activeSection.description && (
                <p className="mt-2 text-sm leading-6 text-gray-500">{activeSection.description}</p>
              )}
            </div>
            {visibleActiveSectionQuestions.map(question => renderQuestion(question))}
          </div>
        )}

        {isSubmitStep && (
          <div className="mx-auto max-w-lg space-y-6 animate-in">
            <h2 className="font-display text-xl font-semibold">Ready to generate your report?</h2>
            <p className="text-sm leading-6 text-gray-400">
              We will create your creator profile and assessment report from the details and answers you provided.
            </p>
          </div>
        )}

        <div className="mx-auto mt-10 flex max-w-lg gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="px-6 py-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-all text-sm font-medium"
            >
              Back
            </button>
          )}
          {!isSubmitStep ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext()}
              className="ml-auto px-6 py-2.5 rounded-lg bg-accent hover:bg-accent-2 text-gray-950 font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canNext() || submitting}
              className="ml-auto px-6 py-2.5 rounded-lg bg-accent hover:bg-accent-2 text-gray-950 font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Generating report...' : 'Get my Vertical Report'}
            </button>
          )}
        </div>
        <p className="text-xs text-gray-600 text-center mt-4">
          Step {step + 1} of {steps.length}
        </p>
      </div>
    </div>
  );
}
