-- Behind the Paycheck v2 structured reporting and auto-publication model.
-- Additive migration: preserves existing reports and issue IDs; test in development first.
begin;

-- 1) Expand report model without dropping the legacy status column or report links.
alter table public.reports
  alter column story_text drop not null,
  add column if not exists primary_issue_id text references public.issues(id),
  add column if not exists secondary_issue_ids text[] not null default '{}',
  add column if not exists public_status text not null default 'hidden',
  add column if not exists screening_result text,
  add column if not exists screening_reasons text[] not null default '{}',
  add column if not exists public_text text,
  add column if not exists screened_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists withdrawal_hash text,
  add column if not exists flag_count integer not null default 0,
  add column if not exists last_flagged_at timestamptz,
  add column if not exists roast_text text,
  add column if not exists notice_rejected boolean,
  add column if not exists notice_period_band text,
  add column if not exists joining_demand_band text,
  add column if not exists offer_wait_band text,
  add column if not exists company_enforces_long_notice boolean,
  add column if not exists offer_days_waited integer,
  add column if not exists resigned_before_offer boolean,
  add column if not exists offer_revoked_after_resignation boolean,
  add column if not exists hike_band text,
  add column if not exists performance_rating text,
  add column if not exists bgv_days_pending integer,
  add column if not exists bgv_blocked_joining boolean,
  add column if not exists bgv_check_type text,
  add column if not exists moonlighting_outcome text,
  add column if not exists layoff_notice_days integer,
  add column if not exists layoff_called_resignation boolean,
  add column if not exists role_family text,
  add column if not exists hiring_source text,
  add column if not exists hr_escalated boolean,
  add column if not exists has_evidence boolean,
  add column if not exists primary_issue_label_snapshot text;

-- The existing report_type check permits problem/good; add roast without rewriting rows.
alter table public.reports drop constraint if exists reports_report_type_check;
alter table public.reports add constraint reports_report_type_check
  check (report_type in ('problem','good','roast'));
alter table public.reports drop constraint if exists reports_positive_tags_check;
alter table public.reports add constraint reports_positive_tags_check
  check (positive_tags <@ array['offer-on-time','notice-respected','fair-hike','supportive-layoff','transparent-process','quick-bgv']::text[]);

alter table public.reports drop constraint if exists reports_story_text_check;
alter table public.reports drop constraint if exists reports_story_length_check;
alter table public.reports add constraint reports_story_length_check
  check (
    (story_text is null) or
    (char_length(trim(story_text)) between 20 and 600)
  );

alter table public.reports drop constraint if exists reports_public_status_check;
alter table public.reports add constraint reports_public_status_check
  check (public_status in ('published','hidden','withdrawn'));

alter table public.reports drop constraint if exists reports_screening_result_check;
alter table public.reports add constraint reports_screening_result_check
  check (screening_result is null or screening_result in ('clean','masked','edit_required','rejected'));

alter table public.reports drop constraint if exists reports_primary_issue_required_check;
alter table public.reports add constraint reports_primary_issue_required_check
  check (
    (report_type = 'roast' and primary_issue_id is null and company_id is null and roast_text is not null
      and char_length(trim(roast_text)) between 1 and 120)
    or
    (report_type in ('problem','good') and primary_issue_id is not null)
  ) not valid;

alter table public.reports drop constraint if exists reports_secondary_issue_count_check;
alter table public.reports add constraint reports_secondary_issue_count_check
  check (cardinality(secondary_issue_ids) <= 2 and not (primary_issue_id = any(secondary_issue_ids)));

alter table public.reports drop constraint if exists reports_notice_period_band_check;
alter table public.reports add constraint reports_notice_period_band_check check (notice_period_band is null or notice_period_band in ('0-15','30','60','90','other'));
alter table public.reports drop constraint if exists reports_joining_demand_band_check;
alter table public.reports add constraint reports_joining_demand_band_check check (joining_demand_band is null or joining_demand_band in ('immediate','up-to-15','up-to-30','other'));
alter table public.reports drop constraint if exists reports_offer_wait_band_check;
alter table public.reports add constraint reports_offer_wait_band_check check (offer_wait_band is null or offer_wait_band in ('0-7','8-15','16-30','31-60','61-90','91+'));
alter table public.reports drop constraint if exists reports_hike_band_check;
alter table public.reports add constraint reports_hike_band_check
  check (hike_band is null or hike_band in ('0','1-5','6-10','11-15','16+'));
alter table public.reports drop constraint if exists reports_performance_rating_check;
alter table public.reports add constraint reports_performance_rating_check
  check (performance_rating is null or performance_rating in ('exceeded','met','below'));
alter table public.reports drop constraint if exists reports_bgv_check_type_check;
alter table public.reports add constraint reports_bgv_check_type_check
  check (bgv_check_type is null or bgv_check_type in ('education','employment','address','other'));
alter table public.reports drop constraint if exists reports_moonlighting_outcome_check;
alter table public.reports add constraint reports_moonlighting_outcome_check
  check (moonlighting_outcome is null or moonlighting_outcome in ('warning','bgv-flag','termination','no-action'));
alter table public.reports drop constraint if exists reports_offer_days_waited_check;
alter table public.reports add constraint reports_offer_days_waited_check
  check (offer_days_waited is null or offer_days_waited between 0 and 730);
alter table public.reports drop constraint if exists reports_bgv_days_pending_check;
alter table public.reports add constraint reports_bgv_days_pending_check
  check (bgv_days_pending is null or bgv_days_pending between 0 and 730);
alter table public.reports drop constraint if exists reports_layoff_notice_days_check;
alter table public.reports add constraint reports_layoff_notice_days_check
  check (layoff_notice_days is null or layoff_notice_days between 0 and 365);
alter table public.reports drop constraint if exists reports_hiring_source_check;
alter table public.reports add constraint reports_hiring_source_check
  check (hiring_source is null or hiring_source in ('direct','consultant','referral','portal'));
alter table public.reports drop constraint if exists reports_role_family_check;
alter table public.reports add constraint reports_role_family_check
  check (role_family is null or role_family in ('engineering','devops-sre-platform','data-ai-ml','qa-testing','security','product-project','design','support-operations','management','other'));

-- Existing rows are preserved. Previously approved rows are migrated as published legacy posts;
-- they become trend-eligible only after the 24-hour no-flags window.
update public.reports
set public_status = case when status = 'approved' then 'published' else 'hidden' end,
    published_at = case when status = 'approved' then coalesce(moderated_at, created_at) else null end,
    screening_result = case when status = 'approved' then 'clean' else null end
where public_status = 'hidden' and published_at is null and screening_result is null;

-- Legacy story_text was mandatory. It is now optional for structured reports; roast uses roast_text.
-- Legacy report_type values and existing company/issue links remain intact.
alter table public.reports
  drop constraint if exists reports_primary_issue_required_check;
alter table public.reports add constraint reports_primary_issue_required_check
  check (
    (report_type = 'roast' and primary_issue_id is null and company_id is null and roast_text is not null
      and char_length(trim(roast_text)) between 1 and 120)
    or
    (report_type = 'problem' and (primary_issue_id is not null or public_status = 'hidden')) or (report_type = 'good' and primary_issue_id is null)
  ) not valid;

-- 2) Canonical issue catalogue. Do not delete or rename historical issue IDs.
insert into public.issues (id, report_group, label, active) values
  ('recruiter-ghosting','it','No response or ghosting',true),
  ('too-many-rounds','it','Too many interview rounds',true),
  ('budget-revealed-late','it','Budget revealed late',true),
  ('offer-letter-delay','it','Offer letter delayed or withheld',true),
  ('offer-revoked','it','Offer revoked',true),
  ('counter-offer-pressure','it','Counter-offer pressure',true),
  ('notice-period-rejected','it','Notice period rejected',true),
  ('notice-buyout-refused','it','Notice buyout refused',true),
  ('bgv-delay','it','Background verification delay',true),
  ('relieving-letter-withheld','it','Relieving or experience letter withheld',true),
  ('final-settlement-delay','it','Final settlement delayed',true),
  ('moonlighting-action','it','Moonlighting action',true),
  ('work-location-change','it','RTO or WFH change',true),
  ('promotion-denied','it','Promotion denied',true),
  ('layoff-no-notice','it','No advance layoff notice',true),
  ('layoff-severance','it','Severance low or unpaid',true),
  ('forced-resignation-pip','it','Forced resignation or PIP',true),
  ('layoff-access-cut','it','Access cut same day',true),
  ('offer-on-time','it','Offer on time',true),
  ('notice-respected','it','Notice period respected',true),
  ('fair-hike','it','Fair hike',true),
  ('supportive-layoff','it','Supportive layoff handling',true),
  ('transparent-process','it','Transparent process',true),
  ('quick-bgv','it','Quick BGV',true)
on conflict (id) do update set report_group=excluded.report_group,label=excluded.label,active=true;

-- 3) Stage mapping is authoritative for newly submitted primary/secondary issues.
create table if not exists public.stage_issue_map (
  stage text not null check (stage in ('applying','interview','offer','notice-joining','working','layoff')),
  issue_id text not null references public.issues(id) on update cascade on delete restrict,
  report_type text not null check (report_type in ('problem','good')),
  sort_order integer not null default 0,
  primary key (stage, issue_id, report_type)
);
insert into public.stage_issue_map(stage,issue_id,report_type,sort_order) values
 ('applying','recruiter-ghosting','problem',1),
 ('applying','no-feedback','problem',2),
 ('applying','too-many-rounds','problem',3),
 ('applying','documents-early','problem',4),
 ('applying','budget-revealed-late','problem',5),
 ('interview','recruiter-ghosting','problem',1),
 ('interview','no-feedback','problem',2),
 ('interview','too-many-rounds','problem',3),
 ('interview','documents-early','problem',4),
 ('interview','budget-revealed-late','problem',5),
 ('offer','offer-letter-delay','problem',1),
 ('offer','offer-revoked','problem',2),
 ('offer','offer-mismatch','problem',3),
 ('offer','counter-offer-pressure','problem',4),
 ('notice-joining','immediate-joining','problem',1),
 ('notice-joining','notice-period-rejected','problem',2),
 ('notice-joining','notice-buyout-refused','problem',3),
 ('notice-joining','bgv-delay','problem',4),
 ('notice-joining','relieving-letter-withheld','problem',5),
 ('notice-joining','final-settlement-delay','problem',6),
 ('working','unpaid-salary','problem',1),
 ('working','low-hike','problem',2),
 ('working','unpaid-overtime','problem',3),
 ('working','work-pressure','problem',4),
 ('working','moonlighting-action','problem',5),
 ('working','work-location-change','problem',6),
 ('working','promotion-denied','problem',7),
 ('layoff','layoff-no-notice','problem',1),
 ('layoff','layoff-severance','problem',2),
 ('layoff','forced-resignation-pip','problem',3),
 ('layoff','layoff-access-cut','problem',4)
on conflict (stage,issue_id,report_type) do update set sort_order=excluded.sort_order;

-- Good tags are stage-independent, but offered in stage-relevant UI; map to each applicable stage.
insert into public.stage_issue_map(stage,issue_id,report_type,sort_order)
select st.stage, i.issue_id, 'good', i.sort_order
from (values ('applying',1),('interview',2),('offer',3),('notice-joining',4),('working',5),('layoff',6)) st(stage,stage_order)
cross join (values
 ('offer-on-time',1),('notice-respected',2),('fair-hike',3),
 ('supportive-layoff',4),('transparent-process',5),('quick-bgv',6)
) i(issue_id,sort_order)
on conflict (stage,issue_id,report_type) do update set sort_order=excluded.sort_order;

create table if not exists public.legacy_issue_map (
  legacy_issue_id text primary key references public.issues(id) on update cascade on delete restrict,
  canonical_issue_id text not null references public.issues(id) on update cascade on delete restrict,
  mapping_note text not null,
  created_at timestamptz not null default now()
);
insert into public.legacy_issue_map(legacy_issue_id,canonical_issue_id,mapping_note) values
 ('job-application-no-response','recruiter-ghosting','Legacy no-response category; preserves historical counts.'),
 ('recruiter-ghosting','recruiter-ghosting','Same meaning.'),
 ('no-feedback','no-feedback','Same meaning.'),
 ('interview-process','too-many-rounds','Legacy interview-process category; broad mapping, exclude from precise round-count metrics.'),
 ('documents-early','documents-early','Same meaning.'),
 ('salary-negotiation','offer-mismatch','Legacy salary negotiation category; use only for broad offer mismatch counts.'),
 ('offer-release-delay','offer-letter-delay','Legacy offer-release delay category.'),
 ('offer-letter','offer-letter-delay','Legacy offer-letter category; broad mapping, not proof of delay.'),
 ('offer-mismatch','offer-mismatch','Same meaning.'),
 ('immediate-joining','immediate-joining','Same meaning.'),
 ('notice-joining','notice-period-rejected','Legacy notice-versus-joining category; broad mapping only.'),
 ('notice-period','notice-period-rejected','Legacy notice category; broad mapping only.'),
 ('background-verification','bgv-delay','Legacy background verification category; broad mapping only.'),
 ('unpaid-salary','unpaid-salary','Same meaning.'),
 ('low-hike','low-hike','Same meaning.'),
 ('unpaid-overtime','unpaid-overtime','Same meaning.'),
 ('work-pressure','work-pressure','Same meaning.'),
 ('moonlighting-policy','moonlighting-action','Legacy moonlighting policy category; not necessarily a disciplinary action.'),
 ('work-from-home-policy','work-location-change','Legacy WFH/RTO policy category.'),
 ('internal-role-growth','promotion-denied','Legacy role-growth category; broad mapping only.'),
 ('unemployment','layoff-no-notice','Legacy unemployment/layoff category; broad mapping only.'),
 ('job-insecurity','forced-resignation-pip','Legacy job-security category; broad mapping only.'),
 ('job-switch-experience','other','Legacy broad job-switching category.'),
 ('pf-overlap','other','Legacy PF-overlap category; retained as broad historical IT issue.'),
 ('other','other','Legacy other category.')
on conflict (legacy_issue_id) do update set canonical_issue_id=excluded.canonical_issue_id,mapping_note=excluded.mapping_note;

-- 4) Required enum/range validation for the new structured quick-fact answers.
alter table public.reports drop constraint if exists reports_stage_check;
alter table public.reports add constraint reports_stage_check
 check (stage is null or stage in ('applying','interview','offer','notice-joining','notice-period','joining','working','layoff'));
alter table public.reports drop constraint if exists reports_notice_period_days_check;
alter table public.reports add constraint reports_notice_period_days_check
 check (notice_period_days is null or notice_period_days between 0 and 365);
alter table public.reports drop constraint if exists reports_joining_time_days_check;
alter table public.reports add constraint reports_joining_time_days_check
 check (joining_time_days is null or joining_time_days between 0 and 365);
alter table public.reports drop constraint if exists reports_offer_delay_days_check;
alter table public.reports add constraint reports_offer_delay_days_check
 check (offer_delay_days is null or offer_delay_days between 0 and 730);
alter table public.reports drop constraint if exists reports_hike_percent_check;
alter table public.reports add constraint reports_hike_percent_check
 check (hike_percent is null or hike_percent between -100 and 500);
alter table public.reports drop constraint if exists reports_outcome_check;
alter table public.reports add constraint reports_outcome_check
 check (outcome is null or outcome in ('resolved','lost-job','left-company','ongoing'));
alter table public.reports drop constraint if exists reports_layoff_severance_weeks_check;
alter table public.reports add constraint reports_layoff_severance_weeks_check
 check (layoff_severance_weeks is null or layoff_severance_weeks between 0 and 104);

-- 5) Enforce issue/stage/type combinations and primary/secondary limits inside Postgres.
create or replace function public.validate_structured_report()
returns trigger language plpgsql set search_path = ''
as $$
declare
  issue text;
  report_stage text;
  report_kind text;
  company_exists boolean;
begin
  report_stage := new.stage;
  report_kind := new.report_type;

  if report_kind = 'roast' then
    if new.company_id is not null then raise exception 'A roast must be company-neutral'; end if;
    if new.roast_text is null or char_length(trim(new.roast_text)) not between 1 and 120 then
      raise exception 'Roast must be between 1 and 120 characters';
    end if;
    return new;
  end if;

  if report_stage is null or report_stage not in ('applying','interview','offer','notice-joining','working','layoff') then
    -- Allow legacy rows to remain unchanged; new reports set screened_at/public_status.
    if new.screened_at is not null or new.public_status = 'published' then
      raise exception 'Choose a valid stage';
    end if;
    return new;
  end if;

  if report_kind = 'problem' and new.primary_issue_id is null then
    if new.screened_at is not null or new.public_status = 'published' then raise exception 'Primary issue is required'; end if;
    return new;
  end if;
  if cardinality(coalesce(new.secondary_issue_ids,'{}')) > 2 then raise exception 'At most two secondary issues are allowed'; end if;
  if new.primary_issue_id = any(coalesce(new.secondary_issue_ids,'{}')) then raise exception 'Primary issue cannot be repeated as a secondary issue'; end if;

  if new.report_type in ('problem','good') then
    if new.company_id is null then raise exception 'Company is required'; end if;
    if new.report_type = 'good' and cardinality(coalesce(new.positive_tags,'{}')) < 1 then
      raise exception 'At least one positive experience tag is required';
    end if;
    if new.report_type = 'problem' and cardinality(coalesce(new.positive_tags,'{}')) > 0 then
      raise exception 'Problem reports cannot use positive tags';
    end if;
    if report_kind = 'problem' then
      foreach issue in array array_prepend(new.primary_issue_id,coalesce(new.secondary_issue_ids,'{}')) loop
        if not exists(select 1 from public.stage_issue_map m where m.stage=report_stage and m.issue_id=issue and m.report_type='problem') then
          raise exception 'Issue is not valid for the selected stage';
        end if;
      end loop;
    else
      foreach issue in array coalesce(new.positive_tags,'{}') loop
        if not exists(select 1 from public.stage_issue_map m where m.stage=report_stage and m.issue_id=issue and m.report_type='good') then
          raise exception 'Positive tag is not valid for the selected stage';
        end if;
      end loop;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists reports_validate_structured_before_write on public.reports;
create trigger reports_validate_structured_before_write
before insert or update of report_type,stage,primary_issue_id,secondary_issue_ids,company_id,roast_text,positive_tags,screened_at,public_status
on public.reports for each row execute function public.validate_structured_report();

-- 6) Screening/flag/withdrawal tables. Store hashes only for device and withdrawal tokens.
create table if not exists public.post_flags (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  device_hash text not null,
  reason_code text not null check (reason_code in ('personal-info','harassment','false-information','spam','other')),
  created_at timestamptz not null default now(),
  unique(report_id,device_hash)
);
create index if not exists post_flags_report_created_idx on public.post_flags(report_id,created_at desc);

create index if not exists reports_withdrawal_hash_idx on public.reports(withdrawal_hash) where withdrawal_hash is not null;

create or replace function public.refresh_report_flag_count()
returns trigger language plpgsql set search_path = ''
as $
declare
  target_report uuid;
  current_count integer;
begin
  target_report := coalesce(new.report_id,old.report_id);
  select count(distinct f.device_hash)::integer into current_count
  from public.post_flags f where f.report_id=target_report;
  update public.reports
  set flag_count=current_count,
      last_flagged_at=case when current_count > 0 then now() else null end,
      public_status=case when current_count >= 3 then 'hidden' else public_status end
  where id=target_report;
  return coalesce(new,old);
end $;

drop trigger if exists post_flags_refresh_count on public.post_flags;
create trigger post_flags_refresh_count
after insert or delete on public.post_flags
for each row execute function public.refresh_report_flag_count();


create table if not exists public.moderator_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('moderator','admin')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.government_poll (
  id uuid primary key default gen_random_uuid(),
  option_slug text not null check (option_slug in ('layoff-insurance','notice-regulation','severance-tax-relief','faster-grievance-portal','other')),
  other_text text check (other_text is null or char_length(trim(other_text)) between 1 and 120),
  voter_hash text not null,
  created_at timestamptz not null default now(),
  unique(voter_hash)
);
create index if not exists government_poll_option_created_idx on public.government_poll(option_slug,created_at desc);

-- 7) DB-side eligibility source: posts must be published, screened clean/masked, unflagged,
-- and at least 24 hours old. Public callers cannot read this view or raw tables directly.
create or replace view public.trend_eligible_reports
with (security_invoker=true)
as
select r.id,r.report_group,r.report_type,r.company_id,r.stage,r.event_month,
       r.primary_issue_id,r.secondary_issue_ids,r.positive_tags,r.company_type,
       r.experience_band,r.city,r.notice_period_days,r.joining_time_days,
       r.notice_period_band,r.joining_demand_band,r.notice_rejected,r.company_enforces_long_notice,r.offer_days_waited,r.offer_wait_band,
       r.resigned_before_offer,r.offer_revoked_after_resignation,r.hike_band,
       r.hike_percent,r.performance_rating,r.bgv_days_pending,r.bgv_blocked_joining,
       r.bgv_check_type,r.moonlighting_outcome,r.layoff_notice_days,
       r.layoff_advance_notice,r.layoff_severance_weeks,r.layoff_access_cut_same_day,
       r.layoff_called_resignation,r.outcome,r.role_family,r.hiring_source,
       r.hr_escalated,r.has_evidence,r.published_at,r.created_at
from public.reports r
where r.report_group='it'
  and r.public_status='published'
  and r.screening_result in ('clean','masked')
  and r.flag_count=0
  and r.published_at <= now() - interval '24 hours'
  and r.status not in ('rejected','removed');

create or replace view public.company_issue_counts_min5
with (security_invoker=true)
as
with issue_rows as (
  select e.id,e.company_id,e.primary_issue_id as issue_id
  from public.trend_eligible_reports e
  where e.report_type='problem' and e.company_id is not null and e.primary_issue_id is not null
  union
  select e.id,e.company_id,unnest(e.secondary_issue_ids) as issue_id
  from public.trend_eligible_reports e
  where e.report_type='problem' and e.company_id is not null and cardinality(e.secondary_issue_ids)>0
)
select company_id,issue_id,count(distinct id)::bigint as report_count
from issue_rows
group by company_id,issue_id
having count(distinct id) >= 5;

create or replace view public.issue_counts_min5
with (security_invoker=true)
as
with issue_rows as (
  select e.id,e.primary_issue_id as issue_id
  from public.trend_eligible_reports e
  where e.report_type='problem' and e.primary_issue_id is not null
  union
  select e.id,unnest(e.secondary_issue_ids) as issue_id
  from public.trend_eligible_reports e
  where e.report_type='problem' and cardinality(e.secondary_issue_ids)>0
  union
  select r.id,coalesce(l.canonical_issue_id,ri.issue_id) as issue_id
  from public.trend_eligible_reports r
  join public.report_issues ri on ri.report_id=r.id
  left join public.legacy_issue_map l on l.legacy_issue_id=ri.issue_id
  where r.report_type='problem' and r.primary_issue_id is null
)
select issue_id,count(distinct id)::bigint as report_count
from issue_rows
group by issue_id
having count(distinct id)>=5;

create or replace view public.company_positive_counts_min5
with (security_invoker=true)
as
select company_id,count(distinct id)::bigint as report_count
from public.trend_eligible_reports
where report_type='good' and company_id is not null
group by company_id
having count(distinct id)>=5;

create or replace view public.company_counts_min5
with (security_invoker=true)
as
select e.company_id,count(*)::bigint as report_count
from public.trend_eligible_reports e
where e.report_type='problem' and e.company_id is not null
group by e.company_id
having count(*) >= 5;

-- 8) RLS: raw report, flags, moderator roles and poll data remain unavailable to public clients.
alter table public.stage_issue_map enable row level security;
alter table public.legacy_issue_map enable row level security;
alter table public.post_flags enable row level security;
alter table public.moderator_roles enable row level security;
alter table public.government_poll enable row level security;
revoke all on public.stage_issue_map,public.legacy_issue_map,public.post_flags,public.moderator_roles,public.government_poll from anon,authenticated;
revoke all on public.trend_eligible_reports,public.company_issue_counts_min5,public.company_counts_min5,public.issue_counts_min5,public.company_positive_counts_min5 from anon,authenticated;
grant select,insert,update,delete on public.stage_issue_map,public.legacy_issue_map,public.post_flags,public.moderator_roles,public.government_poll to service_role;
grant select on public.trend_eligible_reports,public.company_issue_counts_min5,public.company_counts_min5,public.issue_counts_min5,public.company_positive_counts_min5 to service_role;


-- Extend the audit vocabulary for the new flagged/hidden moderation queue.
alter table public.moderation_events drop constraint if exists moderation_events_action_check;
alter table public.moderation_events add constraint moderation_events_action_check
  check (action in ('approved','rejected','removed','returned-to-pending','hidden','restored','withdrawn'));

-- The migration intentionally does not publish legacy pending/rejected/removed reports.
commit;
