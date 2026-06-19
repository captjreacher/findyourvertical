-- Assessment template system for creator assessments.

CREATE TABLE IF NOT EXISTS public.creator_question_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_key text NOT NULL UNIQUE,
  response_key text NOT NULL,
  question_text text NOT NULL,
  help_text text,
  section text NOT NULL,
  question_type text NOT NULL,
  scoring_dimension text,
  parent_question_key text,
  show_when_value text,
  show_when_operator text NOT NULL DEFAULT 'equals',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_creator_question_type CHECK (
    question_type IN ('short_text', 'long_text', 'single_choice', 'multi_choice', 'boolean', 'scale')
  ),
  CONSTRAINT valid_creator_show_when_operator CHECK (
    show_when_operator IN ('equals', 'includes')
  )
);

CREATE TABLE IF NOT EXISTS public.creator_assessment_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creator_assessment_template_questions (
  template_id uuid NOT NULL REFERENCES public.creator_assessment_templates(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.creator_question_bank(id) ON DELETE CASCADE,
  is_included boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, question_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_assessment_templates_single_default
  ON public.creator_assessment_templates(is_default)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_creator_question_bank_active_section
  ON public.creator_question_bank(is_active, section);

CREATE INDEX IF NOT EXISTS idx_creator_template_questions_order
  ON public.creator_assessment_template_questions(template_id, is_included, sort_order);

ALTER TABLE public.creator_assessments
  ADD COLUMN IF NOT EXISTS assessment_snapshot jsonb;

DROP TRIGGER IF EXISTS trg_creator_question_bank_updated_at ON public.creator_question_bank;
CREATE TRIGGER trg_creator_question_bank_updated_at
  BEFORE UPDATE ON public.creator_question_bank
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_creator_assessment_templates_updated_at ON public.creator_assessment_templates;
CREATE TRIGGER trg_creator_assessment_templates_updated_at
  BEFORE UPDATE ON public.creator_assessment_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_creator_assessment_template_questions_updated_at ON public.creator_assessment_template_questions;
CREATE TRIGGER trg_creator_assessment_template_questions_updated_at
  BEFORE UPDATE ON public.creator_assessment_template_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.creator_question_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_assessment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_assessment_template_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active creator questions"
  ON public.creator_question_bank FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY "Authenticated full access creator questions"
  ON public.creator_question_bank FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can read active assessment templates"
  ON public.creator_assessment_templates FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY "Authenticated full access assessment templates"
  ON public.creator_assessment_templates FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can read assessment template questions"
  ON public.creator_assessment_template_questions FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.creator_assessment_templates t
      WHERE t.id = template_id
        AND t.is_active = true
    )
  );

CREATE POLICY "Authenticated full access assessment template questions"
  ON public.creator_assessment_template_questions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

WITH default_template AS (
  INSERT INTO public.creator_assessment_templates (name, description, is_default, is_active)
  VALUES (
    'Default Creator Assessment',
    'Public creator brand strategy assessment.',
    true,
    true
  )
  ON CONFLICT DO NOTHING
  RETURNING id
),
resolved_template AS (
  SELECT id FROM default_template
  UNION ALL
  SELECT id FROM public.creator_assessment_templates WHERE name = 'Default Creator Assessment'
  LIMIT 1
),
questions AS (
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
    ('strengths', 'strengths', 'What are your top three natural ingredients?', 'Select all that apply', 'Strengths', 'multi_choice', 'creator_dna', null, null, 'equals',
      '["Humor","Dancing","Public Speaking","Specific Sport","Specialized Knowledge/Astrology","High-Energy","Aesthetic/Cozy"]'::jsonb,
      '{"required": true}'::jsonb, true),
    ('comfort_level', 'comfort_level', 'Rate your comfort level in front of the camera (1-10)', null, 'Strengths', 'scale', 'creator_dna', null, null, 'equals',
      '[]'::jsonb, '{"min": 1, "max": 10, "required": true}'::jsonb, true),
    ('passion_topic', 'passion_topic', 'What is one topic you could talk about for 30 minutes without preparation?', null, 'Strengths', 'long_text', 'consistency', null, null, 'equals',
      '[]'::jsonb, '{"placeholder": "E.g., astrology, vintage fashion, conspiracy theories..."}'::jsonb, true),
    ('persona_occupation', 'persona_occupation', 'Identify your persona''s backstory', 'What''s your character''s "occupation" or storyline?', 'Persona', 'single_choice', 'brand_identity', null, null, 'equals',
      '["Struggling student","Professional athlete","Corporate rebel","Cosy stay-at-home mom","Fitness enthusiast","Artist / creative","Spiritual guide","Party girl","Other"]'::jsonb,
      '{"required": true}'::jsonb, true),
    ('parasocial_comfort', 'parasocial_comfort', 'Comfortable sharing personal/dating stories to build parasocial bonds?', null, 'Persona', 'boolean', 'monetisation', null, null, 'equals',
      '[]'::jsonb, '{"trueLabel": "Yes", "falseLabel": "No"}'::jsonb, true),
    ('fantasy_keywords', 'fantasy_keywords', 'Describe your hottest fantasy in three keywords', null, 'Persona', 'short_text', 'brand_identity', null, null, 'equals',
      '[]'::jsonb, '{"placeholder": "E.g., power, submission, luxury"}'::jsonb, true),
    ('content_comfort', 'nudity_level', 'Nudity comfort level', null, 'Boundaries', 'single_choice', 'boundaries', null, null, 'equals',
      '[{"value":"sfw_only","label":"SFW only"},{"value":"teasing_only","label":"Teasing only"},{"value":"topless","label":"Topless"},{"value":"full_nude","label":"Full nude"},{"value":"fetish","label":"Fetish-specific"}]'::jsonb,
      '{"required": true}'::jsonb, true),
    ('niche_interests', 'niche_interests', 'Natural niche interests', 'Select any that resonate', 'Boundaries', 'multi_choice', 'content_strategy', null, null, 'equals',
      '["Armpits","Feet","Fitness/Muscle","Roleplay","Daddy dynamic","High-Fashion"]'::jsonb,
      '{}'::jsonb, true),
    ('audience_target', 'audience_target', 'Define your audience', 'This shapes your entire monetisation strategy', 'Goals', 'single_choice', 'monetisation', null, null, 'equals',
      '[{"value":"whales","label":"Whales","description":"High-spending executives seeking luxury & exclusivity. Low volume, high revenue per sub."},{"value":"masses","label":"The Masses","description":"High-volume casual subscribers. Quantity over ticket size. Free trial + upsell model."}]'::jsonb,
      '{"required": true, "variant": "audience_cards"}'::jsonb, true),
    ('creator_motivation', 'creator_motivation', 'What is it about doing OnlyFans that makes you feel good?', 'Choose the single biggest reason above all others. It might be money, freedom, attention, confidence, creativity, self-expression, connection, or something else.', 'Persona', 'long_text', 'creator_dna', null, null, 'equals',
      '[]'::jsonb, '{}'::jsonb, true),
    ('sexual_connection_to_content', 'sexual_connection_to_content', 'Do you feel any real sexual connection to your OnlyFans work, or is it primarily business?', null, 'Persona', 'single_choice', 'creator_dna', null, null, 'equals',
      '["Mostly business","Some personal connection","Strong personal connection","Prefer not to say"]'::jsonb, '{}'::jsonb, true),
    ('desired_fantasy_image', 'desired_fantasy_image', 'Describe the image of yourself that you would like men to imagine.', 'What are you wearing? What expression is on your face? How is your body positioned? What energy are you projecting? How do you want them to feel? What do they notice first?', 'Persona', 'long_text', 'brand_identity', null, null, 'equals',
      '[]'::jsonb, '{}'::jsonb, true),
    ('full_nude_expansion', 'full_nude_expansion', 'Do you anticipate your content involving sexual activity beyond full nudity?', null, 'Boundaries', 'single_choice', 'boundaries', 'content_comfort', 'Full Nude', 'includes',
      '["No","Yes, but no overt touching or masturbation","Yes, includes masturbation, no toys","Yes, includes masturbation, toys and more","Yes, includes self-pleasure and sex with others"]'::jsonb,
      '{"notesKey": "full_nude_expansion_notes", "notesLabel": "Notes"}'::jsonb, true),
    ('fetish_description', 'fetish_description', 'Describe your fetish or fetishes and how they would appear in your content.', null, 'Boundaries', 'long_text', 'content_strategy', 'content_comfort', 'Fetish', 'includes',
      '[]'::jsonb, '{}'::jsonb, true),
    ('creator_weaknesses', 'creator_weaknesses', 'What do you believe are your two biggest weaknesses as a creator right now?', 'Examples might include confidence, consistency, planning, communication, content creation, marketing, organisation, boundaries, mindset, or something else.', 'Goals', 'long_text', 'growth_readiness', null, null, 'equals',
      '[]'::jsonb, '{}'::jsonb, true)
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
    is_active = EXCLUDED.is_active
  RETURNING id, question_key
),
included_questions(question_key, sort_order) AS (
  VALUES
    ('strengths', 10),
    ('comfort_level', 20),
    ('passion_topic', 30),
    ('persona_occupation', 40),
    ('parasocial_comfort', 50),
    ('fantasy_keywords', 60),
    ('content_comfort', 70),
    ('niche_interests', 80),
    ('audience_target', 90)
)
INSERT INTO public.creator_assessment_template_questions (template_id, question_id, is_included, sort_order)
SELECT rt.id, q.id, true, iq.sort_order
FROM resolved_template rt
JOIN included_questions iq ON true
JOIN public.creator_question_bank q ON q.question_key = iq.question_key
ON CONFLICT (template_id, question_id) DO UPDATE SET
  is_included = EXCLUDED.is_included,
  sort_order = EXCLUDED.sort_order;

WITH resolved_template AS (
  SELECT id FROM public.creator_assessment_templates WHERE name = 'Default Creator Assessment' LIMIT 1
)
INSERT INTO public.creator_assessment_template_questions (template_id, question_id, is_included, sort_order)
SELECT rt.id, q.id, false, 1000 + row_number() OVER (ORDER BY q.question_key)
FROM resolved_template rt
JOIN public.creator_question_bank q ON q.question_key IN (
  'creator_motivation',
  'sexual_connection_to_content',
  'desired_fantasy_image',
  'full_nude_expansion',
  'fetish_description',
  'creator_weaknesses'
)
ON CONFLICT (template_id, question_id) DO NOTHING;
