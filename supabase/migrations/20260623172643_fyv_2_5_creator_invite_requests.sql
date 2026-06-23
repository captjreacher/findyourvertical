-- FYV-2.5 public invite request workflow.

CREATE TABLE IF NOT EXISTS public.creator_invite_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  onlyfans_handle text,
  status text NOT NULL DEFAULT 'New',
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creator_invite_requests_status_check
    CHECK (status IN ('New', 'Reviewed', 'Approved', 'Declined'))
);

CREATE INDEX IF NOT EXISTS idx_creator_invite_requests_status_created
  ON public.creator_invite_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_creator_invite_requests_email
  ON public.creator_invite_requests(lower(email));

CREATE OR REPLACE FUNCTION public.set_creator_invite_request_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_creator_invite_requests_updated_at ON public.creator_invite_requests;
CREATE TRIGGER trg_creator_invite_requests_updated_at
  BEFORE UPDATE ON public.creator_invite_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_creator_invite_request_updated_at();

ALTER TABLE public.creator_invite_requests ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON public.creator_invite_requests TO anon;
GRANT SELECT, INSERT, UPDATE ON public.creator_invite_requests TO authenticated;

DROP POLICY IF EXISTS "Public can create creator invite requests" ON public.creator_invite_requests;
CREATE POLICY "Public can create creator invite requests"
  ON public.creator_invite_requests FOR INSERT
  TO anon
  WITH CHECK (
    status = 'New'
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
    AND length(trim(name)) > 0
    AND email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  );

DROP POLICY IF EXISTS "Authenticated can review creator invite requests" ON public.creator_invite_requests;
CREATE POLICY "Authenticated can review creator invite requests"
  ON public.creator_invite_requests FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
