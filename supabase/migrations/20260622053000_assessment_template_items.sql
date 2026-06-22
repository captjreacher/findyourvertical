-- Ordered template items allow templates to contain non-answerable section headings.

CREATE TABLE IF NOT EXISTS public.creator_assessment_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.creator_assessment_templates(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  question_id uuid REFERENCES public.creator_question_bank(id) ON DELETE RESTRICT,
  title text,
  description text,
  is_included boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_creator_template_item_type CHECK (item_type IN ('section_heading', 'question')),
  CONSTRAINT valid_creator_template_item_payload CHECK (
    (item_type = 'question' AND question_id IS NOT NULL)
    OR
    (item_type = 'section_heading' AND question_id IS NULL AND title IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_creator_template_items_order
  ON public.creator_assessment_template_items(template_id, is_included, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_template_items_template_question
  ON public.creator_assessment_template_items(template_id, question_id)
  WHERE item_type = 'question' AND question_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_creator_assessment_template_items_updated_at ON public.creator_assessment_template_items;
CREATE TRIGGER trg_creator_assessment_template_items_updated_at
  BEFORE UPDATE ON public.creator_assessment_template_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.creator_assessment_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active assessment template items"
  ON public.creator_assessment_template_items FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.creator_assessment_templates t
      WHERE t.id = template_id
        AND t.is_active = true
    )
  );

CREATE POLICY "Authenticated full access assessment template items"
  ON public.creator_assessment_template_items FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

WITH question_rows AS (
  SELECT
    tq.template_id,
    tq.question_id,
    tq.is_included,
    tq.sort_order,
    CASE q.section
      WHEN 'Strengths' THEN 'About You'
      WHEN 'Boundaries' THEN 'Current Approach'
      WHEN 'Persona' THEN 'Exploring Content Possibilities'
      WHEN 'Goals' THEN 'Options for the Future'
      ELSE COALESCE(NULLIF(q.section, ''), 'Unsectioned Questions')
    END AS section_title
  FROM public.creator_assessment_template_questions tq
  JOIN public.creator_question_bank q ON q.id = tq.question_id
),
section_rows AS (
  SELECT
    template_id,
    section_title,
    MIN(sort_order) AS first_sort_order,
    DENSE_RANK() OVER (
      PARTITION BY template_id
      ORDER BY
        CASE section_title
          WHEN 'About You' THEN 10
          WHEN 'Current Approach' THEN 20
          WHEN 'Exploring Content Possibilities' THEN 30
          WHEN 'Options for the Future' THEN 40
          ELSE 999
        END,
        MIN(sort_order),
        section_title
    ) AS section_rank
  FROM question_rows
  GROUP BY template_id, section_title
),
inserted_sections AS (
  INSERT INTO public.creator_assessment_template_items (
    template_id,
    item_type,
    title,
    description,
    is_included,
    sort_order
  )
  SELECT
    sr.template_id,
    'section_heading',
    sr.section_title,
    CASE sr.section_title
      WHEN 'About You' THEN 'Tell us a little about yourself, your creator identity, and what makes your content unique.'
      WHEN 'Current Approach' THEN 'Help us understand how you currently create, engage with fans, and approach content creation.'
      WHEN 'Exploring Content Possibilities' THEN 'Let''s explore the content styles, personas, and opportunities that may align with your strengths.'
      WHEN 'Options for the Future' THEN 'Share where you''d like your creator journey to go and how success looks for you.'
      ELSE NULL
    END,
    true,
    sr.section_rank * 1000
  FROM section_rows sr
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.creator_assessment_template_items existing
    WHERE existing.template_id = sr.template_id
      AND existing.item_type = 'section_heading'
      AND existing.title = sr.section_title
  )
  RETURNING id
)
INSERT INTO public.creator_assessment_template_items (
  template_id,
  item_type,
  question_id,
  is_included,
  sort_order
)
SELECT
  qr.template_id,
  'question',
  qr.question_id,
  qr.is_included,
  (sr.section_rank * 1000) + (ROW_NUMBER() OVER (
    PARTITION BY qr.template_id, qr.section_title
    ORDER BY qr.sort_order
  ) * 10)
FROM question_rows qr
JOIN section_rows sr
  ON sr.template_id = qr.template_id
  AND sr.section_title = qr.section_title
WHERE NOT EXISTS (
  SELECT 1
  FROM public.creator_assessment_template_items existing
  WHERE existing.template_id = qr.template_id
    AND existing.item_type = 'question'
    AND existing.question_id = qr.question_id
);
