-- Attach assessment invite links to creator profiles for lifecycle attribution.

ALTER TABLE public.creator_assessment_links
  ADD COLUMN IF NOT EXISTS creator_profile_id uuid REFERENCES public.creator_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_creator_assessment_links_creator_profile
  ON public.creator_assessment_links(creator_profile_id, created_at DESC);

COMMENT ON COLUMN public.creator_assessment_links.creator_profile_id IS
  'Creator profile associated with this assessment invite when known.';
