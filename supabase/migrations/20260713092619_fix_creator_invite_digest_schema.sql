alter function public.create_creator_access_invitation(uuid, uuid, text, interval)
  set search_path = public, extensions, pg_temp;

alter function public.validate_creator_access_invitation(text)
  set search_path = public, extensions, pg_temp;

alter function public.accept_creator_access_invitation(text, uuid)
  set search_path = public, extensions, pg_temp;