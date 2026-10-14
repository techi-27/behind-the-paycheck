-- Add fake interview calls / recruiter no-shows as a reportable IT issue.
begin;

insert into public.issues (id, report_group, label, active)
values ('fake-interview-call', 'it', 'Fake interview calls / recruiter no-show', true)
on conflict (id) do update
set report_group = excluded.report_group,
    label = excluded.label,
    active = true;

insert into public.stage_issue_map (stage, issue_id, report_type, sort_order)
values
  ('applying', 'fake-interview-call', 'problem', 2),
  ('interview', 'fake-interview-call', 'problem', 2)
on conflict (stage, issue_id, report_type)
do update set sort_order = excluded.sort_order;

commit;
