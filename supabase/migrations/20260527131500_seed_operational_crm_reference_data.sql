insert into public.activity_types (slug, label, category, system_managed)
values
  ('manual_note', 'Manual note', 'manual', true),
  ('enrichment_completed', 'Enrichment completed', 'enrichment', true),
  ('trust_reviewed', 'Trust reviewed', 'trust', true),
  ('outbound_email', 'Outbound email', 'outreach', true),
  ('followup_call', 'Follow-up call', 'outreach', true),
  ('website_misalignment_detected', 'Website misalignment detected', 'trust', true)
on conflict (slug) do nothing;

insert into public.tags (slug, label, category, system_managed)
values
  ('trust/no_website', 'No website', 'trust', true),
  ('trust/weak_reviews', 'Weak reviews', 'trust', true),
  ('industry/tradie', 'Tradie', 'industry', true),
  ('outreach/followup_required', 'Follow-up required', 'outreach', true),
  ('sales/high_value', 'High value', 'sales', true),
  ('relationship/decision_maker', 'Decision maker', 'relationship', true),
  ('workflow/manual_review', 'Manual review', 'workflow', true)
on conflict (slug) do nothing;
