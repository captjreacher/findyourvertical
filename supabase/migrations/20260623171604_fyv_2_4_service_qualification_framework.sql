-- FYV 2.4: Service Qualification Framework

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS business_acumen integer,
  ADD COLUMN IF NOT EXISTS coachability integer,
  ADD COLUMN IF NOT EXISTS management_wraparound_potential text,
  ADD COLUMN IF NOT EXISTS service_qualification jsonb NOT NULL DEFAULT '{
    "financial_advice": "Not Interested",
    "business_mentoring": "Not Interested",
    "content_vertical_sprint": "Not Interested",
    "chat_automation": "Not Interested",
    "social_extension": "Not Interested",
    "platform_extension": "Not Interested",
    "management_package": "Not Interested"
  }'::jsonb;

CREATE OR REPLACE FUNCTION public.is_valid_creator_service_qualification(
  p_service_qualification jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(p_service_qualification) = 'object'
    AND p_service_qualification ?& ARRAY[
      'financial_advice',
      'business_mentoring',
      'content_vertical_sprint',
      'chat_automation',
      'social_extension',
      'platform_extension',
      'management_package'
    ]
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_each_text(p_service_qualification) AS service(key, value)
      WHERE service.key NOT IN (
        'financial_advice',
        'business_mentoring',
        'content_vertical_sprint',
        'chat_automation',
        'social_extension',
        'platform_extension',
        'management_package'
      )
      OR service.value NOT IN (
        'Not Interested',
        'Not Suitable',
        'Future Opportunity',
        'Qualified',
        'Active Client'
      )
    );
$$;

ALTER TABLE public.creator_profiles
  DROP CONSTRAINT IF EXISTS valid_status,
  DROP CONSTRAINT IF EXISTS valid_creator_workflow_status,
  DROP CONSTRAINT IF EXISTS valid_business_acumen,
  DROP CONSTRAINT IF EXISTS valid_coachability,
  DROP CONSTRAINT IF EXISTS valid_management_wraparound_potential,
  DROP CONSTRAINT IF EXISTS valid_service_qualification;

UPDATE public.creator_profiles
SET status = CASE status
  WHEN 'prospect' THEN 'Assessment Complete'
  WHEN 'assessed' THEN 'Assessment Complete'
  WHEN 'qualified' THEN 'Qualified'
  WHEN 'interviewed' THEN 'Discovery Booked'
  WHEN 'accepted' THEN 'Proposal Sent'
  WHEN 'onboarding' THEN 'Client'
  WHEN 'active' THEN 'Managed Creator'
  WHEN 'paused' THEN 'Archived'
  WHEN 'offboarded' THEN 'Archived'
  ELSE status
END
WHERE status IN ('prospect','assessed','qualified','interviewed','accepted','onboarding','active','paused','offboarded');

ALTER TABLE public.creator_profiles
  ADD CONSTRAINT valid_creator_workflow_status CHECK (status IN (
    'Assessment Complete',
    'Qualified',
    'Discovery Booked',
    'Proposal Sent',
    'Client',
    'Managed Creator',
    'Archived'
  )),
  ADD CONSTRAINT valid_business_acumen CHECK (
    business_acumen IS NULL OR business_acumen BETWEEN 1 AND 10
  ),
  ADD CONSTRAINT valid_coachability CHECK (
    coachability IS NULL OR coachability BETWEEN 1 AND 10
  ),
  ADD CONSTRAINT valid_management_wraparound_potential CHECK (
    management_wraparound_potential IS NULL OR management_wraparound_potential IN ('Yes','No','Not Yet')
  ),
  ADD CONSTRAINT valid_service_qualification CHECK (
    public.is_valid_creator_service_qualification(service_qualification)
  );

CREATE INDEX IF NOT EXISTS idx_creator_profiles_service_qualification
  ON public.creator_profiles USING gin (service_qualification);

CREATE OR REPLACE FUNCTION public.creator_profile_qualification_event_type(
  p_status text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'Qualified' THEN 'creator_qualified'
    WHEN 'Discovery Booked' THEN 'discovery_booked'
    WHEN 'Proposal Sent' THEN 'proposal_sent'
    WHEN 'Archived' THEN 'creator_archived'
    ELSE 'creator_workflow_status_changed'
  END;
$$;

CREATE OR REPLACE FUNCTION public.creator_profiles_after_qualification_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_key text;
  v_old_status text;
  v_new_status text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.creator_status_events (creator_profile_id, event_type, details)
    VALUES (
      NEW.id,
      public.creator_profile_qualification_event_type(NEW.status),
      jsonb_build_object(
        'field', 'status',
        'previous_status', OLD.status,
        'new_status', NEW.status
      )
    );
  END IF;

  IF NEW.business_acumen IS DISTINCT FROM OLD.business_acumen THEN
    INSERT INTO public.creator_status_events (creator_profile_id, event_type, details)
    VALUES (
      NEW.id,
      'qualification_updated',
      jsonb_build_object(
        'field', 'business_acumen',
        'previous_value', OLD.business_acumen,
        'new_value', NEW.business_acumen
      )
    );
  END IF;

  IF NEW.coachability IS DISTINCT FROM OLD.coachability THEN
    INSERT INTO public.creator_status_events (creator_profile_id, event_type, details)
    VALUES (
      NEW.id,
      'qualification_updated',
      jsonb_build_object(
        'field', 'coachability',
        'previous_value', OLD.coachability,
        'new_value', NEW.coachability
      )
    );
  END IF;

  IF NEW.management_wraparound_potential IS DISTINCT FROM OLD.management_wraparound_potential THEN
    INSERT INTO public.creator_status_events (creator_profile_id, event_type, details)
    VALUES (
      NEW.id,
      CASE WHEN NEW.management_wraparound_potential = 'Yes'
        THEN 'management_candidate_identified'
        ELSE 'qualification_updated'
      END,
      jsonb_build_object(
        'field', 'management_wraparound_potential',
        'previous_value', OLD.management_wraparound_potential,
        'new_value', NEW.management_wraparound_potential
      )
    );
  END IF;

  FOR v_key IN
    SELECT key FROM jsonb_object_keys(NEW.service_qualification) AS key
  LOOP
    v_old_status := OLD.service_qualification ->> v_key;
    v_new_status := NEW.service_qualification ->> v_key;

    IF v_new_status IS DISTINCT FROM v_old_status THEN
      INSERT INTO public.creator_status_events (creator_profile_id, event_type, details)
      VALUES (
        NEW.id,
        CASE v_new_status
          WHEN 'Qualified' THEN 'service_qualified'
          WHEN 'Active Client' THEN 'service_activated'
          ELSE 'service_status_changed'
        END,
        jsonb_build_object(
          'field', 'service_qualification',
          'service', v_key,
          'previous_status', v_old_status,
          'new_status', v_new_status
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_creator_profiles_after_qualification_change ON public.creator_profiles;

CREATE TRIGGER trg_creator_profiles_after_qualification_change
  AFTER UPDATE OF status, business_acumen, coachability, management_wraparound_potential, service_qualification
  ON public.creator_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.creator_profiles_after_qualification_change();

COMMENT ON COLUMN public.creator_profiles.business_acumen IS
  'FYV 2.4 qualification score from 1-10.';

COMMENT ON COLUMN public.creator_profiles.coachability IS
  'FYV 2.4 qualification score from 1-10.';

COMMENT ON COLUMN public.creator_profiles.management_wraparound_potential IS
  'FYV 2.4 management wraparound potential: Yes, No, or Not Yet.';

COMMENT ON COLUMN public.creator_profiles.service_qualification IS
  'FYV 2.4 fixed service qualification map. Each service stores Not Interested, Not Suitable, Future Opportunity, Qualified, or Active Client.';