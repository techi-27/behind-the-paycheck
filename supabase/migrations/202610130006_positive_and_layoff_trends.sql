-- Positive employee experiences and privacy-minimized layoff trend fields.
alter table public.reports
  add column if not exists report_type text not null default 'problem',
  add column if not exists positive_tags text[] not null default '{}',
  add column if not exists layoff_advance_notice boolean,
  add column if not exists layoff_severance_weeks numeric(5,2),
  add column if not exists layoff_access_cut_same_day boolean;

alter table public.reports drop constraint if exists reports_report_type_check;
alter table public.reports add constraint reports_report_type_check
  check (report_type in ('problem','good'));

alter table public.reports drop constraint if exists reports_positive_tags_check;
alter table public.reports add constraint reports_positive_tags_check
  check (positive_tags <@ array['offer-on-time','notice-respected','fair-hike','supportive-layoff']::text[]);

alter table public.reports drop constraint if exists reports_layoff_severance_weeks_check;
alter table public.reports add constraint reports_layoff_severance_weeks_check
  check (layoff_severance_weeks is null or layoff_severance_weeks between 0 and 104);

create index if not exists reports_it_type_month_idx
  on public.reports (report_type, event_month, stage) where report_group='it' and status='approved';

comment on column public.reports.report_type is 'Problem report or positive employee experience.';
comment on column public.reports.positive_tags is 'Controlled positive-experience tags only; no free text.';
comment on column public.reports.layoff_advance_notice is 'Optional yes/no response for layoff reports.';
comment on column public.reports.layoff_access_cut_same_day is 'Optional yes/no response for layoff reports.';
