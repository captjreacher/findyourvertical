-- Creator assessment vNext: future-focused questions and agency opportunity signals.

WITH upserted_questions AS (
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
  VALUES
    (
      'aspirational_creators',
      'aspirational_creators',
      'Are there any OnlyFans creators that you aspire to?',
      'Add their OnlyFans handles below.',
      'Options for the Future',
      'long_text',
      'agency_signal',
      null,
      null,
      'equals',
      '[]'::jsonb,
      '{}'::jsonb,
      true
    ),
    (
      'alternative_content_ideas',
      'alternative_content_ideas',
      'Have you had any ideas for a different approach to your content?',
      'If so, describe it below.',
      'Options for the Future',
      'long_text',
      'agency_signal',
      null,
      null,
      'equals',
      '[]'::jsonb,
      '{}'::jsonb,
      true
    ),
    (
      'future_improvements',
      'future_improvements',
      'What would you most like to improve in the future?',
      'Select as many as apply.',
      'Options for the Future',
      'multi_choice',
      'agency_signal',
      null,
      null,
      'equals',
      '[
        {"value":"Financial Resources (more income)","label":"Financial Resources (more income)","is_active":true},
        {"value":"Lifestyle (better balance, fewer hours)","label":"Lifestyle (better balance, fewer hours)","is_active":true},
        {"value":"Personal Fulfilment (better alignment with goals and values)","label":"Personal Fulfilment (better alignment with goals and values)","is_active":true},
        {"value":"Channel Expansion (additional platforms and revenue streams)","label":"Channel Expansion (additional platforms and revenue streams)","is_active":true},
        {"value":"Content Direction (changes to content style or positioning)","label":"Content Direction (changes to content style or positioning)","is_active":true},
        {"value":"Moderation & Compliance (classification, restrictions, platform concerns)","label":"Moderation & Compliance (classification, restrictions, platform concerns)","is_active":true},
        {"value":"Skills Match (better use of strengths and abilities)","label":"Skills Match (better use of strengths and abilities)","is_active":true},
        {"value":"Long-Term Goals","label":"Long-Term Goals","is_active":true},
        {"value":"Audience Growth","label":"Audience Growth","is_active":true},
        {"value":"Subscriber Retention","label":"Subscriber Retention","is_active":true},
        {"value":"Other","label":"Other","is_active":true}
      ]'::jsonb,
      '{}'::jsonb,
      true
    ),
    (
      'future_improvements_other',
      'future_improvements_other',
      'Please describe.',
      null,
      'Options for the Future',
      'long_text',
      'agency_signal',
      'future_improvements',
      'Other',
      'includes',
      '[]'::jsonb,
      '{}'::jsonb,
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
  RETURNING id, question_key
),
default_template AS (
  SELECT id
  FROM public.creator_assessment_templates
  WHERE is_default = true
    AND is_active = true
  ORDER BY created_at
  LIMIT 1
),
question_order AS (
  SELECT id, question_key,
    CASE question_key
      WHEN 'aspirational_creators' THEN 100
      WHEN 'alternative_content_ideas' THEN 110
      WHEN 'future_improvements' THEN 120
      WHEN 'future_improvements_other' THEN 130
      ELSE 999
    END AS sort_order
  FROM upserted_questions
)
INSERT INTO public.creator_assessment_template_questions (template_id, question_id, is_included, sort_order)
SELECT dt.id, qo.id, true, qo.sort_order
FROM default_template dt
CROSS JOIN question_order qo
ON CONFLICT (template_id, question_id) DO UPDATE SET
  is_included = true,
  sort_order = EXCLUDED.sort_order;

UPDATE public.creator_question_bank
SET section = CASE section
  WHEN 'Strengths' THEN 'About You'
  WHEN 'Boundaries' THEN 'Current Approach'
  WHEN 'Persona' THEN 'Exploring Content Possibilities'
  WHEN 'Goals' THEN 'Options for the Future'
  ELSE section
END
WHERE section IN ('Strengths', 'Boundaries', 'Persona', 'Goals');
