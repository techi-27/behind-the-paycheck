-- Behind the Paycheck: initial production-minded schema
-- Apply in a NEW Supabase development project first.
-- No public policies are created here. Anonymous writes must go through a validated
-- Edge Function; raw reports and moderation records are not directly readable publicly.

create extension if not exists pgcrypto;

create type public.report_group as enum ('personal', 'it');
create type public.report_status as enum ('pending', 'approved', 'rejected', 'removed');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(trim(display_name)) between 1 and 100),
  normalized_name text generated always as (lower(regexp_replace(trim(display_name), '\s+', ' ', 'g'))) stored,
  created_at timestamptz not null default now(),
  constraint companies_normalized_name_unique unique (normalized_name)
);

create table public.issues (
  id text primary key,
  report_group public.report_group not null,
  label text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  report_group public.report_group not null,
  company_id uuid references public.companies(id) on delete set null,
  story_text text not null check (char_length(trim(story_text)) between 20 and 600),
  gender text check (gender is null or gender in ('woman', 'man', 'non-binary', 'prefer-not-to-say')),
  experience_range text check (experience_range is null or experience_range in ('0-1', '1-3', '3-5', '5-8', '8+', 'prefer-not-to-say')),
  status public.report_status not null default 'pending',
  created_at timestamptz not null default now(),
  moderated_at timestamptz,
  -- No names, emails, phone numbers, IP addresses or device identifiers are stored.
  constraint report_moderation_timestamp_check check (
    (status = 'pending' and moderated_at is null) or
    (status <> 'pending')
  )
);

create table public.report_issues (
  report_id uuid not null references public.reports(id) on delete cascade,
  issue_id text not null references public.issues(id),
  created_at timestamptz not null default now(),
  primary key (report_id, issue_id)
);

create table public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  moderator_id uuid not null references auth.users(id),
  action text not null check (action in ('approved', 'rejected', 'removed', 'returned-to-pending')),
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

create table public.company_responses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  response_text text not null check (char_length(trim(response_text)) between 20 and 3000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'removed')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

create table public.policy_changes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 5 and 160),
  description text not null check (char_length(trim(description)) between 20 and 3000),
  evidence_url text check (evidence_url is null or char_length(evidence_url) <= 2048),
  effective_date date,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'removed')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

create index reports_status_created_at_idx on public.reports (status, created_at desc);
create index reports_company_status_idx on public.reports (company_id, status) where company_id is not null;
create index reports_group_status_idx on public.reports (report_group, status);
create index report_issues_issue_id_idx on public.report_issues (issue_id, report_id);
create index moderation_events_report_created_idx on public.moderation_events (report_id, created_at desc);
create index company_responses_company_status_idx on public.company_responses (company_id, status);
create index policy_changes_company_status_idx on public.policy_changes (company_id, status);

-- Validate report issue group and limit each report to at most 3 distinct issues.
create or replace function public.validate_report_issue()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_group public.report_group;
  issue_group public.report_group;
  issue_count integer;
begin
  select r.report_group into target_group
  from public.reports r where r.id = new.report_id;

  if target_group is null then
    raise exception 'Report does not exist';
  end if;

  select i.report_group into issue_group
  from public.issues i where i.id = new.issue_id and i.active = true;

  if issue_group is null or issue_group <> target_group then
    raise exception 'Issue is not valid for this report type';
  end if;

  select count(*) into issue_count
  from public.report_issues ri
  where ri.report_id = new.report_id and ri.issue_id <> new.issue_id;

  if issue_count >= 3 then
    raise exception 'A report can include at most three issues';
  end if;

  return new;
end;
$$;

create trigger report_issues_validate_before_insert
before insert or update of report_id, issue_id on public.report_issues
for each row execute function public.validate_report_issue();

-- Initial issue catalogue aligned to the existing UI.
insert into public.issues (id, report_group, label) values
  ('loans', 'personal', 'Loans & EMIs'),
  ('family', 'personal', 'Family responsibilities'),
  ('tax', 'personal', 'Tax & take-home pay'),
  ('health-costs', 'personal', 'Healthcare expenses'),
  ('housing-costs', 'personal', 'Rent & housing costs'),
  ('caregiving', 'personal', 'Caregiving responsibilities'),
  ('unexpected-expenses', 'personal', 'Unexpected expenses'),
  ('mental-load', 'personal', 'Personal stress & wellbeing'),
  ('personal-uncertainty', 'personal', 'Uncertainty about the future'),
  ('other-it', 'personal', 'Other IT workplace struggles'),
  ('unemployment', 'it', 'Unemployment & layoffs'),
  ('notice-period', 'it', 'Three-month notice period'),
  ('immediate-joining', 'it', 'Immediate joining pressure'),
  ('offer-letter', 'it', 'Offer letter issues'),
  ('unpaid-salary', 'it', 'Unpaid or delayed salary'),
  ('work-pressure', 'it', 'Work pressure & burnout'),
  ('job-insecurity', 'it', 'Job insecurity'),
  ('salary-growth', 'it', 'Salary growth'),
  ('other', 'it', 'Other struggles'),
  ('notice-joining', 'it', 'Notice vs. joining demand'),
  ('offer-mismatch', 'it', 'Budget / offer mismatch'),
  ('no-feedback', 'it', 'No interview feedback'),
  ('documents-early', 'it', 'Early document requests'),
  ('unpaid-overtime', 'it', 'Unpaid extra hours'),
  ('low-hike', 'it', 'Zero or very low hikes')
on conflict (id) do update set
  report_group = excluded.report_group,
  label = excluded.label,
  active = true;

-- Enable RLS on every table. No anon/authenticated policies are granted by this migration.
alter table public.companies enable row level security;
alter table public.issues enable row level security;
alter table public.reports enable row level security;
alter table public.report_issues enable row level security;
alter table public.moderation_events enable row level security;
alter table public.company_responses enable row level security;
alter table public.policy_changes enable row level security;

-- Remove default broad table access. A trusted Edge Function will use its server-side
-- service-role credential after validation; browser clients must not access raw tables.
revoke all on table public.companies from anon, authenticated;
revoke all on table public.issues from anon, authenticated;
revoke all on table public.reports from anon, authenticated;
revoke all on table public.report_issues from anon, authenticated;
revoke all on table public.moderation_events from anon, authenticated;
revoke all on table public.company_responses from anon, authenticated;
revoke all on table public.policy_changes from anon, authenticated;

revoke all on function public.validate_report_issue() from public, anon, authenticated;
