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
  strengths: [],
  comfort_level: 5,
  passion_topic: '',
  persona_occupation: '',
  parasocial_comfort: false,
  fantasy_keywords: '',
  nudity_level: '',
  niche_interests: [],
  audience_target: null,
  full_name: '',
  email: '',
  country: '',
  consent: false,
};

const SECTION_ORDER = ['Strengths', 'Persona', 'Boundaries', 'Goals'];
const SECTION_TITLES: Record<string, string> = {
  Strengths: 'What are your top three natural ingredients?',
  Persona: "Identify your persona's backstory",
  Boundaries: 'Set your boundaries',
  Goals: 'Define your audience',
};

const SECTION_HELP: Record<string, string> = {
  Persona: 'What\'s your character\'s "occupation" or storyline?',
  Goals: 'This shapes your entire monetisation strategy',
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
      question_text: 'What are your top three natural ingredients?',
      help_text: 'Select all that apply',
      section: 'Strengths',
      question_type: 'multi_choice',
      scoring_dimension: 'creator_dna',
      parent_question_key: null,
      show_when_value: null,
      show_when_operator: 'equals',
      options: ['Humor', 'Dancing', 'Public Speaking', 'Specific Sport', 'Specialized Knowledge/Astrology', 'High-Energy', 'Aesthetic/Cozy'],
      config: { required: true },
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
      question_text: "Identify your persona's backstory",
      help_text: 'What\'s your character\'s "occupation" or storyline?',
      section: 'Persona',
      question_type: 'single_choice',
      scoring_dimension: 'brand_identity',
      parent_question_key: null,
      show_when_value: null,
      show_when_operator: 'equals',
      options: ['Struggling student', 'Professional athlete', 'Corporate rebel', 'Cosy stay-at-home mom', 'Fitness enthusiast', 'Artist / creative', 'Spiritual guide', 'Party girl', 'Other'],
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

function normalizedConditionValue(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function selectedLabels(question: CreatorAssessmentQuestion, selectedValue: unknown): string[] {
  const selected = Array.isArray(selectedValue) ? selectedValue : [selectedValue];

  return selected.flatMap(value => {
    const valueText = String(value ?? '');
    const option = question.options.find(item => optionValue(item) === valueText || optionLabel(item) === valueText);
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
        setTemplate(runtimeTemplate);
        setData(current => {
          const next = { ...current };
          for (const question of runtimeTemplate?.questions ?? []) {
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
    const includedQuestions = (template?.questions ?? []).filter(q => q.is_included && q.is_active);
    const grouped = new Map<string, CreatorAssessmentQuestion[]>();

    for (const question of includedQuestions) {
      grouped.set(question.section, [...(grouped.get(question.section) ?? []), question]);
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => {
        const ai = SECTION_ORDER.indexOf(a);
        const bi = SECTION_ORDER.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
      .map(([section, questions]) => ({
        section,
        questions: questions.sort((a, b) => a.sort_order - b.sort_order),
      }));
  }, [template]);

  const templateQuestions = useMemo(
    () => sections.flatMap(section => section.questions),
    [sections]
  );
  const steps = [...sections.map(x => x.section), 'Submit'];
  const activeSection = sections[step];
  const isSubmitStep = step === steps.length - 1;

  const update = (key: string, value: unknown) => {
    setData(d => ({ ...d, [key]: value }));
  };

  const toggleArray = (key: string, value: string) => {
    setData(d => {
      const existing = Array.isArray(d[key]) ? d[key] as string[] : [];
      return {
        ...d,
        [key]: existing.includes(value)
          ? existing.filter(x => x !== value)
          : [...existing, value],
      };
    });
  };

  const canNext = (): boolean => {
    if (isSubmitStep) {
      return data.full_name !== '' && data.email !== '' && data.country !== '' && data.consent;
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

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const visibleQuestions = templateQuestions.filter(question => isVisible(question, data, templateQuestions));
      const visibleResponseKeys = new Set(visibleQuestions.map(question => question.response_key));
      const sanitizedData = { ...data };

      for (const question of templateQuestions) {
        if (!question.parent_question_key || visibleResponseKeys.has(question.response_key)) continue;
        delete sanitizedData[question.response_key];
        const notesKey = question.config.notesKey as string | undefined;
        if (notesKey) delete sanitizedData[notesKey];
      }

      const visibleTemplate = template
        ? { ...template, questions: template.questions.filter(question => !question.is_included || visibleResponseKeys.has(question.response_key)) }
        : template;
      const result = await submitAssessment(sanitizedData, visibleTemplate);
      navigate(`/report/${result.report.report_slug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setSubmitting(false);
    }
  };

  const renderQuestion = (question: CreatorAssessmentQuestion, firstInSection: boolean) => {
    if (!isVisible(question, data, templateQuestions)) return null;

    const value = data[question.response_key];
    const showAsHeading = firstInSection && question.section !== 'Boundaries';

    return (
      <div key={question.id}>
        {showAsHeading ? (
          <>
            <h2 className="font-display text-xl font-semibold">
              {SECTION_TITLES[question.section] ?? question.question_text}
            </h2>
            {(question.help_text || SECTION_HELP[question.section]) && (
              <p className="text-gray-500 text-sm mt-2">{question.help_text ?? SECTION_HELP[question.section]}</p>
            )}
          </>
        ) : (
          <>
            <label className="block text-sm font-medium mb-2 text-gray-300">
              {question.question_text}
            </label>
            {question.help_text && <p className="text-gray-500 text-xs mb-3">{question.help_text}</p>}
          </>
        )}

        {question.question_type === 'multi_choice' && (
          <div className={question.section === 'Boundaries' ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}>
            {question.options.map(option => {
              const optionKey = optionValue(option);
              const selected = Array.isArray(value) && value.includes(optionKey);
              return (
                <button
                  key={optionKey}
                  onClick={() => toggleArray(question.response_key, optionKey)}
                  className={`${question.section === 'Boundaries' ? 'px-4 py-3 rounded-lg text-left' : 'px-4 py-2 rounded-full'} text-sm font-medium border transition-all ${
                    selected
                      ? 'bg-accent/20 border-accent text-accent'
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
          <div className="grid grid-cols-2 gap-4">
            {question.options.map(option => {
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
          <div className="grid grid-cols-2 gap-2">
            {question.options.map(option => {
              const optionKey = optionValue(option);
              return (
                <button
                  key={optionKey}
                  onClick={() => update(question.response_key, optionKey)}
                  className={`px-4 py-3 rounded-lg text-sm font-medium border transition-all text-left ${
                    value === optionKey
                      ? question.section === 'Boundaries'
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
          <div className="flex gap-2">
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
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">{String(question.config.min ?? 1)}</span>
            <input
              type="range"
              min={Number(question.config.min ?? 1)}
              max={Number(question.config.max ?? 10)}
              value={Number(value ?? question.config.min ?? 1)}
              onChange={e => update(question.response_key, parseInt(e.target.value))}
              className="flex-1 accent-accent"
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
            className="w-full bg-surface-2 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent"
          />
        )}

        {question.question_type === 'long_text' && (
          <textarea
            value={String(value ?? '')}
            onChange={e => update(question.response_key, e.target.value)}
            placeholder={String(question.config.placeholder ?? '')}
            rows={3}
            className="w-full bg-surface-2 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent resize-none"
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
              className="w-full bg-surface-2 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent resize-none"
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
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <div className="text-center mb-10">
          <h1 className="font-display text-3xl font-bold mb-2">Creator Ikigai</h1>
          <p className="text-gray-500 text-sm">Brand Strategy Wizard</p>
        </div>

        <div className="flex gap-2 mb-10">
          {steps.map((label, i) => (
            <div key={label} className="flex-1">
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

        {!isSubmitStep && activeSection && (
          <div className="space-y-6 animate-in">
            {activeSection.section === 'Boundaries' && (
              <h2 className="font-display text-xl font-semibold">{SECTION_TITLES.Boundaries}</h2>
            )}
            {activeSection.questions.map((question, index) => renderQuestion(question, index === 0))}
          </div>
        )}

        {isSubmitStep && (
          <div className="space-y-6 animate-in">
            <h2 className="font-display text-xl font-semibold">Almost done - who are you?</h2>
            <div className="space-y-4">
              <input
                type="text"
                value={data.full_name}
                onChange={e => update('full_name', e.target.value)}
                placeholder="Full name / stage name"
                className="w-full bg-surface-2 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent"
              />
              <input
                type="email"
                value={data.email}
                onChange={e => update('email', e.target.value)}
                placeholder="Email address"
                className="w-full bg-surface-2 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent"
              />
              <input
                type="text"
                value={data.country}
                onChange={e => update('country', e.target.value)}
                placeholder="Country"
                className="w-full bg-surface-2 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent"
              />
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.consent}
                  onChange={e => update('consent', e.target.checked)}
                  className="mt-1 accent-accent"
                />
                <span className="text-sm text-gray-400">
                  I consent to being contacted regarding creator management services.
                </span>
              </label>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-10">
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
              {submitting ? 'Generating report...' : 'Get my Brand Strategy Report'}
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
