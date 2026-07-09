-- Lead Cockpit View
-- Provides unified view of leads from events and paperclip issues
-- Does NOT create new source-of-truth tables

BEGIN;

DO $$
DECLARE
  v_has_paperclip_issues boolean;
BEGIN
  IF to_regclass('public.events') IS NULL THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.lead_cockpit_view AS
      SELECT
        NULL::uuid AS event_id,
        NULL::timestamptz AS captured_at,
        NULL::uuid AS lead_id,
        NULL::text AS email,
        NULL::text AS name,
        NULL::text AS phone,
        NULL::text AS message,
        NULL::text AS source,
        NULL::text AS source_system,
        NULL::text AS event_status,
        NULL::jsonb AS metadata,
        NULL::uuid AS issue_id,
        NULL::text AS issue_status,
        NULL::text AS assigned_agent,
        NULL::text AS priority,
        NULL::timestamptz AS routed_at,
        NULL::timestamptz AS resolved_at,
        NULL::text AS workflow_state
      WHERE false
    $view$;
    RETURN;
  END IF;

  SELECT to_regclass('paperclip.issues') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'paperclip'
        AND table_name = 'issues'
        AND column_name IN (
          'id',
          'status',
          'assigned_agent',
          'priority',
          'created_at',
          'resolved_at',
          'source_entity_id',
          'source_entity_type'
        )
      GROUP BY table_schema, table_name
      HAVING count(*) = 8
    )
  INTO v_has_paperclip_issues;

  IF v_has_paperclip_issues THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.lead_cockpit_view AS
      SELECT
        e.id AS event_id,
        e.created_at AS captured_at,
        e.entity_id AS lead_id,
        e.entity_ref AS email,
        e.payload->>'name' AS name,
        e.payload->>'phone' AS phone,
        e.payload->>'message' AS message,
        e.payload->>'source' AS source,
        e.source_system,
        e.status AS event_status,
        e.payload->'metadata' AS metadata,

        pi.id AS issue_id,
        pi.status AS issue_status,
        pi.assigned_agent,
        pi.priority,
        pi.created_at AS routed_at,
        pi.resolved_at,

        CASE
          WHEN pi.id IS NULL THEN 'unrouted'
          WHEN pi.resolved_at IS NOT NULL THEN 'resolved'
          WHEN pi.status = 'blocked' THEN 'blocked'
          WHEN pi.assigned_agent IS NOT NULL THEN 'assigned'
          ELSE 'pending'
        END AS workflow_state

      FROM public.events e
      LEFT JOIN paperclip.issues pi
        ON pi.source_entity_id = e.entity_id
        AND pi.source_entity_type = 'lead'
      WHERE e.event_type = 'lead.captured'
        AND e.entity_type = 'lead'
      ORDER BY e.created_at DESC
    $view$;
  ELSE
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.lead_cockpit_view AS
      SELECT
        e.id AS event_id,
        e.created_at AS captured_at,
        e.entity_id AS lead_id,
        e.entity_ref AS email,
        e.payload->>'name' AS name,
        e.payload->>'phone' AS phone,
        e.payload->>'message' AS message,
        e.payload->>'source' AS source,
        e.source_system,
        e.status AS event_status,
        e.payload->'metadata' AS metadata,

        NULL::uuid AS issue_id,
        NULL::text AS issue_status,
        NULL::text AS assigned_agent,
        NULL::text AS priority,
        NULL::timestamptz AS routed_at,
        NULL::timestamptz AS resolved_at,
        'unrouted'::text AS workflow_state

      FROM public.events e
      WHERE e.event_type = 'lead.captured'
        AND e.entity_type = 'lead'
      ORDER BY e.created_at DESC
    $view$;
  END IF;
END $$;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_events_lead_captured
  ON public.events(event_type, entity_type, created_at DESC)
  WHERE event_type = 'lead.captured';

COMMENT ON VIEW public.lead_cockpit_view IS
  'Unified view of captured leads with routing status. Joins events table with paperclip issues for workflow tracking.';

COMMIT;
