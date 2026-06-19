ALTER TABLE public.creator_question_bank
  ADD COLUMN IF NOT EXISTS parent_question_key text,
  ADD COLUMN IF NOT EXISTS show_when_value text,
  ADD COLUMN IF NOT EXISTS show_when_operator text NOT NULL DEFAULT 'equals';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'valid_creator_show_when_operator'
      AND conrelid = 'public.creator_question_bank'::regclass
  ) THEN
    ALTER TABLE public.creator_question_bank
      ADD CONSTRAINT valid_creator_show_when_operator
      CHECK (show_when_operator IN ('equals', 'includes'));
  END IF;
END $$;

UPDATE public.creator_question_bank
SET
  question_key = 'content_comfort',
  question_text = 'Nudity comfort level',
  response_key = 'nudity_level',
  parent_question_key = null,
  show_when_value = null,
  show_when_operator = 'equals'
WHERE question_key = 'nudity_level'
  AND NOT EXISTS (
    SELECT 1
    FROM public.creator_question_bank
    WHERE question_key = 'content_comfort'
  );

UPDATE public.creator_question_bank
SET
  response_key = 'nudity_level',
  parent_question_key = null,
  show_when_value = null,
  show_when_operator = 'equals'
WHERE question_key = 'content_comfort';

UPDATE public.creator_question_bank
SET
  parent_question_key = null,
  show_when_value = null,
  show_when_operator = 'equals'
WHERE question_key NOT IN ('full_nude_expansion', 'fetish_description');

UPDATE public.creator_question_bank
SET
  parent_question_key = 'content_comfort',
  show_when_operator = 'includes',
  show_when_value = 'Full Nude',
  config = config - 'displayWhen'
WHERE question_key = 'full_nude_expansion';

UPDATE public.creator_question_bank
SET
  parent_question_key = 'content_comfort',
  show_when_operator = 'includes',
  show_when_value = 'Fetish',
  config = config - 'displayWhen'
WHERE question_key = 'fetish_description';
