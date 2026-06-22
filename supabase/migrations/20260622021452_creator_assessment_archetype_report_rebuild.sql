-- Rebuild creator assessment question data for talent identification.

WITH strengths_question AS (
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
    'Briefly describe the three top reasons why you will be successful as a creator on OnlyFans.',
    'Select up to 3.',
    'Strengths',
    'multi_choice',
    'creator_dna',
    null,
    null,
    'equals',
    '[
      {"value":"My appearance","label":"My appearance","is_active":true},
      {"value":"My personality","label":"My personality","is_active":true},
      {"value":"My confidence","label":"My confidence","is_active":true},
      {"value":"My humour","label":"My humour","is_active":true},
      {"value":"My intelligence","label":"My intelligence","is_active":true},
      {"value":"My kindness","label":"My kindness","is_active":true},
      {"value":"My creativity","label":"My creativity","is_active":true},
      {"value":"My fitness","label":"My fitness","is_active":true},
      {"value":"My sensuality","label":"My sensuality","is_active":true},
      {"value":"My authenticity","label":"My authenticity","is_active":true},
      {"value":"My storytelling ability","label":"My storytelling ability","is_active":true},
      {"value":"My communication skills","label":"My communication skills","is_active":true},
      {"value":"My ability to connect with people","label":"My ability to connect with people","is_active":true},
      {"value":"My lifestyle","label":"My lifestyle","is_active":true},
      {"value":"My fashion / beauty style","label":"My fashion / beauty style","is_active":true},
      {"value":"My energy","label":"My energy","is_active":true},
      {"value":"My work ethic","label":"My work ethic","is_active":true},
      {"value":"My consistency","label":"My consistency","is_active":true},
      {"value":"My niche expertise","label":"My niche expertise","is_active":true},
      {"value":"My ability to entertain","label":"My ability to entertain","is_active":true}
    ]'::jsonb,
    '{"required": true, "maxSelections": 3}'::jsonb,
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
),
archetype_question AS (
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
    'persona_occupation',
    'persona_occupation',
    'Select any creator archetypes that resonate with you.',
    'What role, fantasy, identity or character best represents your content?',
    'Persona',
    'multi_choice',
    'brand_identity',
    null,
    null,
    'equals',
    '[
      {"value":"Girl Next Door","label":"Girl Next Door","is_active":true},
      {"value":"Hot Teacher","label":"Hot Teacher","is_active":true},
      {"value":"Naughty Librarian","label":"Naughty Librarian","is_active":true},
      {"value":"Nurse","label":"Nurse","is_active":true},
      {"value":"Doctor","label":"Doctor","is_active":true},
      {"value":"Corporate Rebel","label":"Corporate Rebel","is_active":true},
      {"value":"Fitness Goddess","label":"Fitness Goddess","is_active":true},
      {"value":"Dominatrix","label":"Dominatrix","is_active":true},
      {"value":"Brat","label":"Brat","is_active":true},
      {"value":"Submissive","label":"Submissive","is_active":true},
      {"value":"Trophy Wife","label":"Trophy Wife","is_active":true},
      {"value":"Rich Girl","label":"Rich Girl","is_active":true},
      {"value":"Luxury Muse","label":"Luxury Muse","is_active":true},
      {"value":"Alternative / Tattooed","label":"Alternative / Tattooed","is_active":true},
      {"value":"Gamer Girl","label":"Gamer Girl","is_active":true},
      {"value":"Cosplayer","label":"Cosplayer","is_active":true},
      {"value":"Spiritual Goddess","label":"Spiritual Goddess","is_active":true},
      {"value":"MILF","label":"MILF","is_active":true},
      {"value":"Single Mom","label":"Single Mom","is_active":true},
      {"value":"College Girl","label":"College Girl","is_active":true},
      {"value":"Party Girl","label":"Party Girl","is_active":true},
      {"value":"Boss Babe","label":"Boss Babe","is_active":true},
      {"value":"Country Girl","label":"Country Girl","is_active":true},
      {"value":"Bimbo","label":"Bimbo","is_active":true},
      {"value":"Soft Girlfriend Experience","label":"Soft Girlfriend Experience","is_active":true},
      {"value":"High-Class Escort Fantasy","label":"High-Class Escort Fantasy","is_active":true},
      {"value":"Seductress","label":"Seductress","is_active":true},
      {"value":"Artist / Creative Muse","label":"Artist / Creative Muse","is_active":true},
      {"value":"Other","label":"Other","is_active":true}
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
),
default_template AS (
  SELECT id
  FROM public.creator_assessment_templates
  WHERE is_default = true
    AND is_active = true
  ORDER BY created_at
  LIMIT 1
)
INSERT INTO public.creator_assessment_template_questions (template_id, question_id, is_included, sort_order)
SELECT dt.id, q.id, true, q.sort_order
FROM default_template dt
CROSS JOIN (
  SELECT id, 10 AS sort_order FROM strengths_question
  UNION ALL
  SELECT id, 40 AS sort_order FROM archetype_question
) q
ON CONFLICT (template_id, question_id) DO UPDATE SET
  is_included = true,
  sort_order = EXCLUDED.sort_order;

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
