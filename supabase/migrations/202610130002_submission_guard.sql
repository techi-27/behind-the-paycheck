-- Behind the Paycheck: approved public trends and anonymous repeat-submission protection.
create table if not exists public.submission_guard (
  client_token_hash text not null,
  report_group public.report_group not null,
  created_at timestamptz not null default now(),
  primary key (client_token_hash, report_group)
);
alter table public.submission_guard enable row level security;
revoke all on table public.submission_guard from anon, authenticated;
grant select, insert, delete on table public.submission_guard to service_role;

insert into public.issues (id, report_group, label, active)
values ('personal-other', 'personal', 'Other personal struggles', true)
on conflict (id) do update set report_group=excluded.report_group, label=excluded.label, active=true;
