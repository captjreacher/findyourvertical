-- Make choice options individually archivable while keeping existing option values stable.

UPDATE public.creator_question_bank q
SET options = normalized.options
FROM (
  SELECT
    id,
    COALESCE(
      jsonb_agg(
        CASE
          WHEN jsonb_typeof(option_item) = 'string' THEN
            jsonb_build_object(
              'value', option_item #>> '{}',
              'label', option_item #>> '{}',
              'is_active', true
            )
          ELSE
            option_item || jsonb_build_object('is_active', COALESCE((option_item ->> 'is_active')::boolean, true))
        END
        ORDER BY option_ordinality
      ) FILTER (WHERE option_item IS NOT NULL),
      '[]'::jsonb
    ) AS options
  FROM public.creator_question_bank
  LEFT JOIN LATERAL jsonb_array_elements(options) WITH ORDINALITY AS option_rows(option_item, option_ordinality) ON true
  WHERE question_type IN ('single_choice', 'multi_choice', 'scale')
  GROUP BY id
) normalized
WHERE q.id = normalized.id
  AND q.question_type IN ('single_choice', 'multi_choice', 'scale');

WITH resolved_template AS (
  SELECT id
  FROM public.creator_assessment_templates
  WHERE name = 'Default Creator Assessment'
  LIMIT 1
),
included_questions(question_key, sort_order) AS (
  VALUES
    ('strengths', 10),
    ('comfort_level', 20),
    ('passion_topic', 30),
    ('persona_occupation', 40),
    ('parasocial_comfort', 50),
    ('fantasy_keywords', 60),
    ('creator_motivation', 61),
    ('sexual_connection_to_content', 62),
    ('desired_fantasy_image', 63),
    ('content_comfort', 70),
    ('full_nude_expansion', 71),
    ('fetish_description', 72),
    ('niche_interests', 80),
    ('audience_target', 90),
    ('creator_weaknesses', 91)
)
INSERT INTO public.creator_assessment_template_questions (template_id, question_id, is_included, sort_order)
SELECT rt.id, q.id, true, iq.sort_order
FROM resolved_template rt
JOIN included_questions iq ON true
JOIN public.creator_question_bank q ON q.question_key = iq.question_key
WHERE q.is_active = true
ON CONFLICT (template_id, question_id) DO UPDATE SET
  is_included = EXCLUDED.is_included,
  sort_order = EXCLUDED.sort_order;
