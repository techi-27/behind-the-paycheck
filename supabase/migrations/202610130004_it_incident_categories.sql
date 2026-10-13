-- Add the IT employee incident categories used by the expanded homepage survey.
-- Apply this migration to the Supabase project before accepting these new issue IDs.
insert into public.issues (id, report_group, label, active) values
  ('job-switch-experience', 'it', 'Job switching experience', true),
  ('offer-release-delay', 'it', 'Offer release delays or withdrawn offers', true),
  ('moonlighting-policy', 'it', 'Moonlighting policy or second-job issues', true),
  ('pf-overlap', 'it', 'PF overlap or dual-employment record issues', true)
on conflict (id) do update set
  report_group = excluded.report_group,
  label = excluded.label,
  active = true;
