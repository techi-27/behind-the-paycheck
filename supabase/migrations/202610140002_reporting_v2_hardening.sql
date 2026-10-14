-- v2 follow-up hardening. Safe to apply after 202610140001_structured_reporting_v2.sql.
begin;

-- Good reports use positive tags and do not have a primary problem issue.
alter table public.reports drop constraint if exists reports_primary_issue_required_check;
alter table public.reports add constraint reports_primary_issue_required_check
check (
  (report_type='roast' and primary_issue_id is null and company_id is null and roast_text is not null and char_length(trim(roast_text)) between 1 and 120)
  or (report_type='problem' and (primary_issue_id is not null or public_status='hidden'))
  or (report_type='good' and primary_issue_id is null and cardinality(positive_tags)>=1)
) not valid;

-- A post is trend-eligible only after 24 hours without a new flag; fewer than three flags do not permanently exclude it.
create or replace view public.trend_eligible_reports
with (security_invoker=true)
as
select r.id,r.report_group,r.report_type,r.company_id,r.stage,r.event_month,
       r.primary_issue_id,r.secondary_issue_ids,r.positive_tags,r.company_type,
       r.experience_band,r.city,r.notice_period_days,r.joining_time_days,
       r.notice_period_band,r.joining_demand_band,r.notice_rejected,r.company_enforces_long_notice,
       r.offer_days_waited,r.offer_wait_band,r.resigned_before_offer,r.offer_revoked_after_resignation,
       r.hike_band,r.hike_percent,r.performance_rating,r.bgv_days_pending,r.bgv_blocked_joining,
       r.bgv_check_type,r.moonlighting_outcome,r.layoff_notice_days,r.layoff_advance_notice,
       r.layoff_severance_weeks,r.layoff_access_cut_same_day,r.layoff_called_resignation,
       r.outcome,r.role_family,r.hiring_source,r.hr_escalated,r.has_evidence,r.published_at,r.created_at
from public.reports r
where r.report_group='it'
  and r.public_status='published'
  and r.screening_result in ('clean','masked')
  and r.status not in ('rejected','removed')
  and r.published_at <= now() - interval '24 hours'
  and (r.last_flagged_at is null or r.last_flagged_at <= now() - interval '24 hours');

create or replace view public.company_positive_counts_min5
with (security_invoker=true) as
select e.company_id,count(*)::bigint as report_count
from public.trend_eligible_reports e
where e.report_type='good' and e.company_id is not null
group by e.company_id having count(*)>=5;

create or replace view public.issue_counts_min5
with (security_invoker=true) as
select ri.issue_id,count(distinct e.id)::bigint as report_count
from public.trend_eligible_reports e
join public.report_issues ri on ri.report_id=e.id
where e.report_type='problem'
group by ri.issue_id having count(distinct e.id)>=5;

create or replace view public.stage_issue_counts_min5
with (security_invoker=true) as
select e.stage,ri.issue_id,count(distinct e.id)::bigint as report_count
from public.trend_eligible_reports e
join public.report_issues ri on ri.report_id=e.id
where e.report_type='problem'
group by e.stage,ri.issue_id having count(distinct e.id)>=5;

create or replace view public.company_all_counts_min5
with (security_invoker=true) as
select e.company_id,count(*)::bigint as report_count
from public.trend_eligible_reports e
where e.company_id is not null
group by e.company_id having count(*)>=5;

revoke all on public.trend_eligible_reports,public.company_issue_counts_min5,public.company_counts_min5,
 public.company_positive_counts_min5,public.issue_counts_min5,public.stage_issue_counts_min5,public.company_all_counts_min5
from anon,authenticated;
grant select on public.trend_eligible_reports,public.company_issue_counts_min5,public.company_counts_min5,
 public.company_positive_counts_min5,public.issue_counts_min5,public.stage_issue_counts_min5,public.company_all_counts_min5
to service_role;

-- The existing audit table allowed only legacy action values. Extend it for the new moderator UI.
alter table public.moderation_events drop constraint if exists moderation_events_action_check;
alter table public.moderation_events add constraint moderation_events_action_check
check (action in ('approved','rejected','removed','returned-to-pending','hidden','restored','withdrawn'));

commit;
