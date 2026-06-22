-- Creator report action funnel: text strengths and follow-up flags.

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS follow_up_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS follow_up_reason text;

UPDATE public.creator_question_bank
SET
  question_text = 'Briefly describe the three top reasons why you will be successful as a creator on OnlyFans.',
  help_text = 'Tell us the three strongest reasons you believe you can succeed. For example: confidence on camera, strong fan connection, consistency, unique look, storytelling, niche expertise.',
  section = 'About You',
  question_type = 'long_text',
  options = '[]'::jsonb,
  config = '{"required": true, "rows": 4}'::jsonb,
  is_active = true
WHERE question_key = 'strengths';

COMMENT ON COLUMN public.creator_profiles.follow_up_required IS
  'True when a creator action needs agency follow-up, such as a calendar click without a confirmed booking.';

COMMENT ON COLUMN public.creator_profiles.follow_up_reason IS
  'Machine-readable reason for the latest creator follow-up requirement.';
