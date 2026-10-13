-- Structured, privacy-minimized IT experience fields for Employee Trends.
alter table public.reports
  add column if not exists stage text,
  add column if not exists event_month date,
  add column if not exists company_type text,
  add column if not exists experience_band text,
  add column if not exists city text,
  add column if not exists notice_period_days integer,
  add column if not exists joining_time_days integer,
  add column if not exists hike_percent numeric(5,2),
  add column if not exists offer_delay_days integer,
  add column if not exists outcome text;

alter table public.reports drop constraint if exists reports_stage_check;
alter table public.reports add constraint reports_stage_check
  check (stage is null or stage in ('applying','interview','offer','notice-period','joining','working','layoff'));
alter table public.reports drop constraint if exists reports_company_type_check;
alter table public.reports add constraint reports_company_type_check
  check (company_type is null or company_type in ('service','product','gcc','startup'));
alter table public.reports drop constraint if exists reports_experience_band_check;
alter table public.reports add constraint reports_experience_band_check
  check (experience_band is null or experience_band in ('0-2','3-5','6-10','10+'));
alter table public.reports drop constraint if exists reports_city_check;
alter table public.reports add constraint reports_city_check
  check (city is null or city in ('Bengaluru','Hyderabad','Pune','Chennai','Mumbai','Delhi NCR','Kolkata','Noida','Gurugram','Kochi','Ahmedabad','Other'));
alter table public.reports drop constraint if exists reports_notice_period_days_check;
alter table public.reports add constraint reports_notice_period_days_check
  check (notice_period_days is null or notice_period_days between 0 and 365);
alter table public.reports drop constraint if exists reports_joining_time_days_check;
alter table public.reports add constraint reports_joining_time_days_check
  check (joining_time_days is null or joining_time_days between 0 and 365);
alter table public.reports drop constraint if exists reports_hike_percent_check;
alter table public.reports add constraint reports_hike_percent_check
  check (hike_percent is null or hike_percent between -100 and 500);
alter table public.reports drop constraint if exists reports_offer_delay_days_check;
alter table public.reports add constraint reports_offer_delay_days_check
  check (offer_delay_days is null or offer_delay_days between 0 and 730);
alter table public.reports drop constraint if exists reports_outcome_check;
alter table public.reports add constraint reports_outcome_check
  check (outcome is null or outcome in ('resolved','lost-job','left-company','ongoing'));

create index if not exists reports_it_event_month_idx on public.reports (event_month, stage) where report_group='it';
create index if not exists reports_it_company_type_idx on public.reports (company_type, status) where report_group='it';
create index if not exists reports_it_city_idx on public.reports (city, status) where report_group='it';

comment on column public.reports.event_month is 'Month of the event, stored as the first day of that month; never collect exact event dates.';
comment on column public.reports.experience_band is 'Broad optional experience band; do not collect exact age or exact years.';
comment on column public.reports.city is 'Optional city-level trend only; no office address or exact location.';
