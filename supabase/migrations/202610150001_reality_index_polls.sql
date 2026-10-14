-- Behind the Paycheck: Employee Reality Index quick polls.
-- Additive migration. No IP addresses or raw device tokens are stored.
begin;

create table if not exists public.polls (
  id text primary key,
  question text not null,
  options jsonb not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint polls_options_array check (jsonb_typeof(options) = 'array'),
  constraint polls_options_count check (jsonb_array_length(options) between 2 and 5)
);

create table if not exists public.poll_votes (
  id bigint generated always as identity primary key,
  poll_id text not null references public.polls(id) on delete cascade,
  option_id text not null,
  device_token_hash text not null check (device_token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  constraint poll_votes_one_per_device unique (poll_id, device_token_hash)
);

create index if not exists poll_votes_poll_created_idx
  on public.poll_votes(poll_id, created_at);

alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;
revoke all on table public.polls, public.poll_votes from anon, authenticated;
grant select, insert, update, delete on table public.polls, public.poll_votes to service_role;

insert into public.polls(id, question, options, active, sort_order) values
('notice-period-double-standard','Have you seen a company reject candidates with long notice periods while enforcing long notice on its own staff?',
 '[{"id":"yes","label":"Yes, both happen"},{"id":"no","label":"No"},{"id":"not-sure","label":"Not sure"}]'::jsonb,true,1),
('offer-letter-wait','How long did you wait for an offer letter after verbal confirmation?',
 '[{"id":"0-7","label":"0–7 days"},{"id":"8-15","label":"8–15 days"},{"id":"16-30","label":"16–30 days"},{"id":"31-plus","label":"31+ days"}]'::jsonb,true,2),
('hike-vs-inflation','How did your latest salary hike compare with your cost-of-living increase?',
 '[{"id":"below","label":"Below it"},{"id":"about-same","label":"About the same"},{"id":"above","label":"Above it"},{"id":"no-hike","label":"No hike"}]'::jsonb,true,3),
('layoff-insurance','Should India explore temporary income protection for workers affected by layoffs?',
 '[{"id":"strongly-support","label":"Strongly support"},{"id":"somewhat-support","label":"Somewhat support"},{"id":"oppose","label":"Oppose"},{"id":"unsure","label":"Unsure"}]'::jsonb,true,4)
on conflict (id) do update set question=excluded.question, options=excluded.options, active=excluded.active, sort_order=excluded.sort_order;

commit;
