// ── Raw Responses Tab ──
// Sprint FYV-3.2B: canonical human-readable assessment viewer.
// Displays responses grouped by section with search/filter.

import { useState, useMemo } from 'react';
import type {
  CreatorAssessmentQuestion,
  AssessmentQuestionOption,
  AssessmentQuestionType,
} from '@/types/creator';
import { useCreatorIntelligence } from '../context';

/* ── helpers ── */

function clamp(v: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function optionLabel(o: AssessmentQuestionOption): string {
  if (typeof o === 'string') return o;
  if (o && typeof o === 'object' && 'label' in o) return o.label;
  return String(o);
}

function optionValue(o: AssessmentQuestionOption): string {
  if (typeof o === 'string') return o;
  if (o && typeof o === 'object' && 'value' in o) return o.value;
  return String(o);
}

function optionDescription(o: AssessmentQuestionOption): string | undefined {
  if (typeof o === 'string') return undefined;
  return (o as any)?.description;
}

function lookupOption(
  options: AssessmentQuestionOption[],
  val: string,
): AssessmentQuestionOption | undefined {
  return options.find(
    (o) => optionLabel(o) === val || optionValue(o) === val,
  );
}

function questionTypeLabel(qt: AssessmentQuestionType | string): string {
  const map: Record<string, string> = {
    short_text: 'Short Text',
    long_text: 'Long Text',
    textarea: 'Long Text',
    single_choice: 'Single Select',
    multi_choice: 'Multi Select',
    boolean: 'Yes / No',
    scale: 'Rating',
    scenario_ranking: 'Scenario Ranking',
  };
  return map[qt] ?? qt.replace(/_/g, ' ');
}

/* ── answer renderer ── */

function FormatAnswer({
  question,
  value,
}: {
  question: CreatorAssessmentQuestion;
  value: unknown;
}) {
  const qt = question.question_type;
  const isBlank =
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0);

  if (isBlank) {
    return <span className="text-gray-400 italic">No answer</span>;
  }

  // ── text types ──
  if (
    qt === 'short_text' ||
    qt === 'long_text' ||
    qt === 'textarea'
  ) {
    return (
      <p className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
        {String(value)}
      </p>
    );
  }

  // ── single choice ──
  if (qt === 'single_choice') {
    const match = lookupOption(question.options ?? [], String(value));
    const label = match ? optionLabel(match) : String(value);
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-800">
        <span className="w-2 h-2 rounded-full bg-accent" />
        {label}
      </span>
    );
  }

  // ── multi choice ──
  if (qt === 'multi_choice') {
    const vals: string[] = Array.isArray(value)
      ? value.map(String)
      : [String(value)];
    return (
      <ul className="space-y-1">
        {vals.map((v, i) => {
          const match = lookupOption(question.options ?? [], v);
          return (
            <li
              key={i}
              className="flex items-start gap-1.5 text-sm text-gray-800"
            >
              <span className="mt-1.5 w-1.5 h-1.5 shrink-0 rounded-full bg-accent/60" />
              <span>{match ? optionLabel(match) : v}</span>
            </li>
          );
        })}
      </ul>
    );
  }

  // ── boolean ──
  if (qt === 'boolean') {
    const v = value === true || value === 'true';
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-sm font-medium ${
          v ? 'text-success' : 'text-gray-500'
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full ${
            v ? 'bg-success' : 'bg-gray-400'
          }`}
        />
        {v ? 'Yes' : 'No'}
      </span>
    );
  }

  // ── scale / rating ──
  if (qt === 'scale') {
    const n = Number(value);
    const pct = clamp(isNaN(n) ? 0 : n, 0, 10) * 10;
    return (
      <div className="flex items-center gap-3 max-w-xs">
        <div className="h-2 flex-1 rounded-full bg-surface-3 overflow-hidden">
          <div
            className="h-2 rounded-full bg-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-sm font-semibold text-gray-800 tabular-nums">
          {isNaN(n) ? '—' : `${n}/10`}
        </span>
      </div>
    );
  }

  // ── scenario ranking ──
  if (qt === 'scenario_ranking') {
    const items: string[] = Array.isArray(value)
      ? value.map(String)
      : [String(value)];

    if (items.length === 0) {
      return <span className="text-gray-400 italic">No ranking recorded</span>;
    }

    return (
      <ol className="space-y-3">
        {items.map((v, i) => {
          const opt = lookupOption(question.options ?? [], v);
          const label = opt ? optionLabel(opt) : v;
          const desc = opt ? optionDescription(opt) : undefined;

          return (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
                {i + 1}
              </span>
              <div className="min-w-0">
                <span className="text-sm font-medium text-gray-800">
                  {label}
                </span>
                {desc && (
                  <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">
                    {desc}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  // ── unknown / legacy ──
  return (
    <span className="text-sm text-gray-800">
      {typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)}
    </span>
  );
}

/* ── question metadata ── */

function QuestionMeta({ question }: { question: CreatorAssessmentQuestion }) {
  const parts: string[] = [];
  if (question.scoring_dimension)
    parts.push(`Dimension: ${question.scoring_dimension}`);
  if (question.response_key) parts.push(`Key: ${question.response_key}`);
  if (question.id) parts.push(`ID: ${question.id}`);
  if (parts.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {parts.map((p) => (
        <span
          key={p}
          className="px-1.5 py-0.5 rounded text-[10px] bg-surface-3 text-gray-500 font-mono"
        >
          {p}
        </span>
      ))}
    </div>
  );
}

/* ── debug payload ── */

function DebugPayload({ value }: { value: unknown }) {
  return (
    <details className="mt-2">
      <summary className="text-[10px] text-gray-400 cursor-pointer select-none hover:text-gray-600">
        Debug payload
      </summary>
      <pre className="mt-1 max-h-48 overflow-auto rounded bg-gray-900 p-2 text-[10px] text-green-300 leading-relaxed">
        {(() => {
          try {
            return JSON.stringify(value, null, 2);
          } catch {
            return String(value);
          }
        })()}
      </pre>
    </details>
  );
}

/* ── main tab ── */

export function ResponsesTab() {
  const { selectedAssessment } = useCreatorIntelligence();

  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [showUnansweredOnly, setShowUnansweredOnly] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  // ── questions ──
  const questions: CreatorAssessmentQuestion[] =
    selectedAssessment?.assessment_snapshot?.question_snapshot ?? [];

  // ── section ordering ──
  const sections = useMemo(() => {
    const map = new Map<string, CreatorAssessmentQuestion[]>();
    for (const q of questions) {
      const s = q.section || 'Other';
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(q);
    }
    return Array.from(map.entries());
  }, [questions]);

  // ── filter / search ──
  const filteredSections = useMemo(() => {
    const q = search.toLowerCase().trim();

    return sections
      .map(([sectionName, qs]) => {
        if (
          sectionFilter &&
          sectionName.toLowerCase() !== sectionFilter.toLowerCase()
        ) {
          return null;
        }

        const filtered = qs.filter((question) => {
          const value =
            selectedAssessment?.responses?.[question.response_key] ??
            selectedAssessment?.answers?.[question.response_key];

          const isBlank =
            value === null ||
            value === undefined ||
            value === '' ||
            (Array.isArray(value) && value.length === 0);

          if (showUnansweredOnly && !isBlank) return false;

          if (q) {
            const textMatch =
              question.question_text.toLowerCase().includes(q) ||
              question.help_text?.toLowerCase().includes(q) ||
              question.response_key.toLowerCase().includes(q);

            const answerMatch =
              value != null &&
              String(
                Array.isArray(value) ? value.join(' ') : value,
              )
                .toLowerCase()
                .includes(q);

            if (!textMatch && !answerMatch) return false;
          }

          return true;
        });

        return filtered.length > 0
          ? ([sectionName, filtered] as const)
          : null;
      })
      .filter(Boolean) as [string, CreatorAssessmentQuestion[]][];
  }, [sections, search, sectionFilter, showUnansweredOnly, selectedAssessment]);

  // ── empty states ──

  if (!selectedAssessment) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-600">
          No assessment selected. Use the dropdown above to choose an
          assessment.
        </p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-warn/30 bg-warn/10 p-4 text-sm text-warn">
          No question snapshot stored with this assessment. The assessment
          was likely completed before question snapshots were captured.
        </div>

        {selectedAssessment.responses &&
          Object.keys(selectedAssessment.responses).length > 0 && (
            <details
              open={debugOpen}
              onToggle={(e) =>
                setDebugOpen((e.target as HTMLDetailsElement).open)
              }
              className="rounded-lg border border-gray-200 bg-white"
            >
              <summary className="cursor-pointer select-none px-4 py-3 text-xs font-medium text-gray-500 hover:text-gray-700">
                View raw responses (no question metadata available)
              </summary>
              <pre className="max-h-96 overflow-auto border-t border-gray-100 bg-gray-900 p-4 text-[11px] text-green-300 leading-relaxed">
                {JSON.stringify(selectedAssessment.responses, null, 2)}
              </pre>
            </details>
          )}
      </div>
    );
  }

  const totalQuestions = questions.length;
  const filteredCount = filteredSections.reduce(
    (sum, [, qs]) => sum + qs.length,
    0,
  );

  return (
    <div className="space-y-6">
      {/* ── controls ── */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-[200px]">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            Search
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions or answers…"
            className="field-control w-full text-sm"
          />
        </label>

        <label>
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            Section
          </span>
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            className="field-control text-sm"
          >
            <option value="">All sections</option>
            {sections.map(([name]) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 pb-1">
          <input
            type="checkbox"
            checked={showUnansweredOnly}
            onChange={(e) => setShowUnansweredOnly(e.target.checked)}
            className="rounded border-gray-300 text-accent focus:ring-accent"
          />
          <span className="text-xs font-medium text-gray-600">
            Unanswered only
          </span>
        </label>

        <span className="text-xs text-gray-400 pb-2">
          {filteredCount === totalQuestions
            ? `${totalQuestions} questions`
            : `${filteredCount} of ${totalQuestions} questions`}
        </span>
      </div>

      {/* ── results ── */}
      {filteredSections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-surface-2 p-8 text-center text-sm text-gray-500">
          No questions match the current filters.
        </div>
      ) : (
        filteredSections.map(([sectionName, qs]) => (
          <div key={sectionName}>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-4 pb-2 border-b border-gray-200 flex items-center gap-2">
              {sectionName}
              <span className="text-xs text-gray-400 font-normal normal-case">
                {qs.length} question{qs.length !== 1 ? 's' : ''}
              </span>
            </h3>

            <div className="space-y-5">
              {qs.map((question) => {
                const value =
                  selectedAssessment.responses?.[question.response_key] ??
                  selectedAssessment.answers?.[question.response_key];

                return (
                  <div
                    key={question.id || question.response_key}
                    className="bg-surface-2 rounded-lg p-4"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900">
                          {question.question_text}
                        </p>
                        {question.help_text && (
                          <p className="text-xs text-gray-500 mt-1">
                            {question.help_text}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600">
                        {questionTypeLabel(question.question_type)}
                      </span>
                    </div>

                    {/* Answer */}
                    <div className="pl-3 border-l-2 border-surface-3">
                      <FormatAnswer
                        question={question}
                        value={value}
                      />
                    </div>

                    {/* Metadata */}
                    <QuestionMeta question={question} />

                    {/* Debug payload (collapsed) */}
                    <DebugPayload value={value} />
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
