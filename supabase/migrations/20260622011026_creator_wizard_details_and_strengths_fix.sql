-- Creator wizard details capture and default template repair.

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS onlyfans_handle text,
  ADD COLUMN IF NOT EXISTS model_name text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS mailing_list_opt_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_to_contact boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS consent_at timestamptz;

UPDATE public.creator_profiles
SET
  email = lower(btrim(email)),
  onlyfans_handle = lower(regexp_replace(btrim(onlyfans_handle), '^@+', ''))
WHERE email IS NOT NULL
   OR onlyfans_handle IS NOT NULL;

CREATE INDEX IF NOT EXISTS creator_profiles_email_lower_idx
  ON public.creator_profiles (lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS creator_profiles_onlyfans_handle_lower_idx
  ON public.creator_profiles (lower(onlyfans_handle))
  WHERE onlyfans_handle IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'creator_profiles'
      AND policyname = 'Public can update creator profiles for assessment'
  ) THEN
    CREATE POLICY "Public can update creator profiles for assessment"
      ON public.creator_profiles FOR UPDATE
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

WITH default_template AS (
  SELECT id
  FROM public.creator_assessment_templates
  WHERE is_default = true
    AND is_active = true
  ORDER BY created_at
  LIMIT 1
),
strengths_question AS (
  INSERT INTO public.creator_question_bank (
    question_key,
    response_key,
    question_text,
    help_text,
    section,
    question_type,
    scoring_dimension,
    parent_question_key,
    show_when_value,
    show_when_operator,
    options,
    config,
    is_active
  )
  VALUES (
    'strengths',
    'strengths',
    'What are your top three natural ingredients?',
    'Select all that apply',
    'Strengths',
    'multi_choice',
    'creator_dna',
    null,
    null,
    'equals',
    '[
      {"value":"Humor","label":"Humor","is_active":true},
      {"value":"Dancing","label":"Dancing","is_active":true},
      {"value":"Public Speaking","label":"Public Speaking","is_active":true},
      {"value":"Specific Sport","label":"Specific Sport","is_active":true},
      {"value":"Specialized Knowledge/Astrology","label":"Specialized Knowledge/Astrology","is_active":true},
      {"value":"High-Energy","label":"High-Energy","is_active":true},
      {"value":"Aesthetic/Cozy","label":"Aesthetic/Cozy","is_active":true}
    ]'::jsonb,
    '{"required": true}'::jsonb,
    true
  )
  ON CONFLICT (question_key) DO UPDATE SET
    response_key = EXCLUDED.response_key,
    question_text = EXCLUDED.question_text,
    help_text = EXCLUDED.help_text,
    section = EXCLUDED.section,
    question_type = EXCLUDED.question_type,
    scoring_dimension = EXCLUDED.scoring_dimension,
    parent_question_key = EXCLUDED.parent_question_key,
    show_when_value = EXCLUDED.show_when_value,
    show_when_operator = EXCLUDED.show_when_operator,
    options = EXCLUDED.options,
    config = EXCLUDED.config,
    is_active = true
  RETURNING id
)
INSERT INTO public.creator_assessment_template_questions (template_id, question_id, is_included, sort_order)
SELECT dt.id, sq.id, true, 10
FROM default_template dt
CROSS JOIN strengths_question sq
ON CONFLICT (template_id, question_id) DO UPDATE SET
  is_included = true,
  sort_order = 10;

WITH default_template AS (
  SELECT id
  FROM public.creator_assessment_templates
  WHERE is_default = true
    AND is_active = true
  ORDER BY created_at
  LIMIT 1
)
UPDATE public.creator_assessment_template_questions tq
SET sort_order = 20
FROM default_template dt
JOIN public.creator_question_bank q ON q.question_key = 'comfort_level'
WHERE tq.template_id = dt.id
  AND tq.question_id = q.id
  AND tq.sort_order <= 10;
