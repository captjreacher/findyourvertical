import type { AssessmentQuestionOption, MultiChoiceAnswer } from '@/types/creator';

export function readMultiChoiceAnswer(value: unknown): MultiChoiceAnswer {
  if (Array.isArray(value)) {
    return { selectedOptionIds: value.map(String), optionText: {} };
  }
  if (value && typeof value === 'object') {
    const candidate = value as Partial<MultiChoiceAnswer>;
    return {
      selectedOptionIds: Array.isArray(candidate.selectedOptionIds) ? candidate.selectedOptionIds.map(String) : [],
      optionText: candidate.optionText && typeof candidate.optionText === 'object'
        ? Object.fromEntries(Object.entries(candidate.optionText).map(([key, text]) => [key, String(text ?? '')]))
        : {},
    };
  }
  return { selectedOptionIds: [], optionText: {} };
}

export function optionRequiresText(option: AssessmentQuestionOption): boolean {
  return typeof option !== 'string' && option.requiresText === true;
}

export function multiChoiceAnswerIsValid(value: unknown, options: AssessmentQuestionOption[], required = false): boolean {
  const answer = readMultiChoiceAnswer(value);
  if (required && answer.selectedOptionIds.length === 0) return false;
  return answer.selectedOptionIds.every(id => {
    const option = options.find(item => (typeof item === 'string' ? item : item.value) === id);
    return !option || !optionRequiresText(option) || Boolean(answer.optionText[id]?.trim());
  });
}

export function legacySelectedOptionIds(value: unknown): string[] {
  return readMultiChoiceAnswer(value).selectedOptionIds;
}
