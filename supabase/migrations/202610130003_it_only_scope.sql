-- Keep legacy personal reports for audit/history, but retire personal issue choices.
-- The public submission endpoint now accepts only report_group='it' and public trends
-- aggregate only approved IT reports. No historical rows are deleted.
update public.issues
set active = false
where report_group = 'personal';

comment on table public.reports is
'Stores pending/approved/rejected/removed reports. Public submissions are restricted to IT employee experiences; legacy personal rows, if any, are retained but excluded from public trends.';
