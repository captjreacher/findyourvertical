-- FYV-6 report and agency conversion optimisation support.

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS strategy_meeting_booked_at timestamptz;

ALTER TABLE public.creator_reports
  ADD COLUMN IF NOT EXISTS report_tier text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS premium_report_available boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS premium_report_generated boolean NOT NULL DEFAULT false;

ALTER TABLE public.creator_reports
  ADD CONSTRAINT creator_reports_report_tier_check
  CHECK (report_tier IN ('free', 'premium'))
  NOT VALID;

ALTER TABLE public.creator_reports
  VALIDATE CONSTRAINT creator_reports_report_tier_check;

CREATE INDEX IF NOT EXISTS idx_creator_reports_report_tier
  ON public.creator_reports(report_tier, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_creator_status_events_type_created
  ON public.creator_status_events(event_type, created_at DESC);

COMMENT ON COLUMN public.creator_profiles.strategy_meeting_booked_at IS
  'Timestamp set only after a confirmed strategy meeting booking is received from Calendly or another booking webhook.';

COMMENT ON COLUMN public.creator_reports.report_tier IS
  'Creator-facing report tier. Defaults to free until premium report monetisation is implemented.';

COMMENT ON COLUMN public.creator_reports.premium_report_available IS
  'True when a premium report can be offered for this creator-facing report.';

COMMENT ON COLUMN public.creator_reports.premium_report_generated IS
  'True when the premium report artifact has been generated. This does not imply purchase or delivery.';
