-- FYV-2.4 Creator Pipeline & Relationship Layer.
-- Align creator profile lifecycle statuses with the relationship workflow.

ALTER TABLE public.creator_profiles
  DROP CONSTRAINT IF EXISTS valid_status,
  DROP CONSTRAINT IF EXISTS valid_creator_workflow_status;

UPDATE public.creator_profiles
SET status = CASE status
  WHEN 'prospect' THEN 'New'
  WHEN 'assessed' THEN 'Completed'
  WHEN 'qualified' THEN 'Qualified'
  WHEN 'interviewed' THEN 'Meeting Booked'
  WHEN 'accepted' THEN 'Qualified'
  WHEN 'onboarding' THEN 'Client'
  WHEN 'active' THEN 'Client'
  WHEN 'paused' THEN 'Declined'
  WHEN 'offboarded' THEN 'Declined'
  WHEN 'Assessment Complete' THEN 'Completed'
  WHEN 'Discovery Booked' THEN 'Meeting Booked'
  WHEN 'Proposal Sent' THEN 'Qualified'
  WHEN 'Managed Creator' THEN 'Client'
  WHEN 'Archived' THEN 'Declined'
  ELSE status
END
WHERE status IN (
  'prospect',
  'assessed',
  'qualified',
  'interviewed',
  'accepted',
  'onboarding',
  'active',
  'paused',
  'offboarded',
  'Assessment Complete',
  'Discovery Booked',
  'Proposal Sent',
  'Managed Creator',
  'Archived'
);

ALTER TABLE public.creator_profiles
  ALTER COLUMN status SET DEFAULT 'New',
  ADD CONSTRAINT valid_creator_workflow_status CHECK (status IN (
    'New',
    'Invited',
    'Started',
    'Completed',
    'Interested',
    'Qualified',
    'Meeting Booked',
    'Client',
    'Declined'
  ));

CREATE OR REPLACE FUNCTION public.creator_profile_qualification_event_type(
  p_status text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'Invited' THEN 'invite.created'
    WHEN 'Started' THEN 'assessment.started'
    WHEN 'Completed' THEN 'assessment.completed'
    WHEN 'Interested' THEN 'agency_interest.yes'
    WHEN 'Qualified' THEN 'creator.qualified'
    WHEN 'Meeting Booked' THEN 'strategy_call.booked'
    WHEN 'Client' THEN 'creator.client'
    WHEN 'Declined' THEN 'creator.declined'
    ELSE 'creator.status_changed'
  END;
$$;

COMMENT ON CONSTRAINT valid_creator_workflow_status ON public.creator_profiles IS
  'FYV relationship lifecycle: New, Invited, Started, Completed, Interested, Qualified, Meeting Booked, Client, Declined.';
