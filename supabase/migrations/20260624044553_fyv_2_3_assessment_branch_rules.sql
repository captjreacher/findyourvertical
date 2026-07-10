-- Ensure invite lifecycle columns exist before functions below reference them.
ALTER TABLE public.creator_assessment_links
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Created',
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz NOT NULL DEFAULT now();
-- FYV-2.3 option-level assessment branching rules.

CREATE TABLE IF NOT EXISTS public.creator_assessment_branch_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.creator_assessment_templates(id) ON DELETE CASCADE,
  source_question_id uuid NOT NULL REFERENCES public.creator_question_bank(id) ON DELETE CASCADE,
  option_value text NOT NULL,
  action text NOT NULL DEFAULT 'continue',
  target_question_id uuid REFERENCES public.creator_question_bank(id) ON DELETE SET NULL,
  target_section_item_id uuid REFERENCES public.creator_assessment_template_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creator_assessment_branch_rules_action_check
    CHECK (action IN ('continue', 'jump_question', 'jump_section', 'end')),
  CONSTRAINT creator_assessment_branch_rules_target_check
    CHECK (
      (action IN ('continue', 'end') AND target_question_id IS NULL AND target_section_item_id IS NULL)
      OR (action = 'jump_question' AND target_question_id IS NOT NULL AND target_section_item_id IS NULL)
      OR (action = 'jump_section' AND target_section_item_id IS NOT NULL AND target_question_id IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_assessment_branch_rules_option
  ON public.creator_assessment_branch_rules(template_id, source_question_id, option_value);

CREATE INDEX IF NOT EXISTS idx_creator_assessment_branch_rules_template
  ON public.creator_assessment_branch_rules(template_id);

DROP TRIGGER IF EXISTS trg_creator_assessment_branch_rules_updated_at ON public.creator_assessment_branch_rules;
CREATE TRIGGER trg_creator_assessment_branch_rules_updated_at
  BEFORE UPDATE ON public.creator_assessment_branch_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.creator_assessment_branch_rules ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.creator_assessment_branch_rules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_assessment_branch_rules TO authenticated;

DROP POLICY IF EXISTS "Public can read active public assessment branch rules" ON public.creator_assessment_branch_rules;
CREATE POLICY "Public can read active public assessment branch rules"
  ON public.creator_assessment_branch_rules FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.creator_assessment_templates t
      WHERE t.id = creator_assessment_branch_rules.template_id
        AND t.is_active = true
        AND t.is_public = true
    )
  );

DROP POLICY IF EXISTS "Authenticated full access assessment branch rules" ON public.creator_assessment_branch_rules;
CREATE POLICY "Authenticated full access assessment branch rules"
  ON public.creator_assessment_branch_rules FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.get_creator_assessment_invite_status(p_invite_code text)
RETURNS TABLE (
  id uuid,
  template_id uuid,
  invite_code text,
  creator_name text,
  creator_email text,
  notes text,
  status text,
  status_updated_at timestamptz,
  is_active boolean,
  created_at timestamptz,
  expires_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    link.id,
    link.template_id,
    link.invite_code,
    link.creator_name,
    link.creator_email,
    NULL::text AS notes,
    link.status,
    link.status_updated_at,
    link.is_active,
    link.created_at,
    link.expires_at
  FROM public.creator_assessment_links link
  WHERE link.invite_code = NULLIF(trim(p_invite_code), '')
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_creator_assessment_invite_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_creator_assessment_invite_status(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_creator_assessment_invite_status(
  p_invite_code text,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('Opened', 'Email Verified', 'Started', 'Completed') THEN
    RAISE EXCEPTION 'Unsupported invite status'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.creator_assessment_links
  SET
    status = p_status,
    status_updated_at = now()
  WHERE invite_code = NULLIF(trim(p_invite_code), '')
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND status NOT IN ('Completed', 'Revoked', 'Expired');
END;
$$;

REVOKE ALL ON FUNCTION public.set_creator_assessment_invite_status(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_creator_assessment_invite_status(text, text) TO anon, authenticated;

