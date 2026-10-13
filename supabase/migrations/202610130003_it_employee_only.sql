-- Behind the Paycheck: focus the product on IT employee job-market and workplace experiences.
-- Run this migration in Supabase after deploying the updated Edge Functions.
-- Historical personal reports remain stored privately for audit/history but are excluded from public trends.
update public.issues set active = false where report_group = 'personal';
-- Remove legacy personal reports from the pending moderation queue without exposing or deleting their text.
update public.reports set status = 'removed', moderated_at = now()
where report_group = 'personal' and status = 'pending';
update public.issues set report_group = 'it', label = 'Other IT job or workplace issue', active = true where id = 'other-it';

-- Add specific IT job-search and compensation categories for more useful trends.
insert into public.issues (id, report_group, label, active) values
  ('job-application-no-response','it','Job applications with no response',true),
  ('recruiter-ghosting','it','Recruiter ghosting after contact or interviews',true),
  ('interview-process','it','Interview rounds and unclear hiring process',true),
  ('salary-negotiation','it','Salary negotiation and expected CTC mismatch',true),
  ('background-verification','it','Background verification delays or concerns',true),
  ('counter-offer-pressure','it','Counter-offer pressure when resigning',true),
  ('internal-role-growth','it','Internal role change and career growth',true),
  ('work-from-home-policy','it','Work-from-home and return-to-office policy',true)
on conflict (id) do update set
  report_group = excluded.report_group,
  label = excluded.label,
  active = true;
