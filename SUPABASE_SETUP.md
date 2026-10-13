# Supabase setup — Behind the Paycheck

This repository keeps the existing static HTML/CSS/JavaScript frontend on GitHub Pages. Supabase will provide shared PostgreSQL data and secure server-side functions.

## Current status

- The migration in `supabase/migrations/202610130001_initial_schema.sql` defines the first database schema.
- It creates an issue catalogue aligned with the current UI, reports, report issues, companies, moderation events, company responses and policy changes.
- RLS is enabled on every table, with no public table policies. Raw reports are not exposed directly to anonymous browser clients.
- This is a schema foundation only. It does **not** yet connect the website to Supabase or accept public submissions. Do not advertise shared reporting until the backend functions and frontend integration have been deployed and tested.

## Create a development project

1. Create a Supabase account and a new project named `behind-the-paycheck-dev` at https://supabase.com/dashboard.
2. Choose a region suitable for your audience and save the database password in a password manager.
3. Open **SQL Editor → New query**.
4. Open the migration file in this repository and copy its complete SQL into the editor.
5. Run it once. Review the output for errors.
6. In **Table Editor**, confirm the tables `companies`, `issues`, `reports`, `report_issues`, `moderation_events`, `company_responses`, and `policy_changes` exist.
7. Confirm `issues` contains the initial issue catalogue and that RLS is enabled for each table.

## Credentials and secrets

- Project URL and publishable key are not database passwords. They may be used by browser code only when the database permissions remain restrictive.
- Never put the database password, secret API key, or service-role key in `public/`, HTML, JavaScript, GitHub commits, screenshots, or chat.
- The service-role key belongs only in Supabase Edge Function secrets/server-side environments. It bypasses RLS and must be treated as a high-privilege secret.
- Do not add public policies to raw report tables to make the frontend work. Public submission and public statistics should go through purpose-built Edge Functions.

## Schema and moderation design

- New reports default to `pending`; only approved reports should contribute to public aggregate statistics.
- One report may include up to three issue IDs, and the database trigger validates that issue IDs belong to the report group.
- Company names are normalized to avoid duplicate company records caused by letter case or repeated spaces.
- Avoid storing names, emails, phone numbers, IP addresses, device IDs, or exact work locations in report rows.
- Free-text reports can still identify people. Moderation and removal workflows must exist before public publication.
- Public statistics should be aggregate-only and should suppress small groups where a person might be inferred.
- Provider logs may retain technical metadata; verify provider settings and describe actual practices in the privacy notice.

## Before public launch

1. Add and deploy an Edge Function for report submission with server-side validation, strict input limits, bot protection and reliable rate limiting.
2. Add a public aggregate-statistics function that returns only approved, privacy-safe counts.
3. Add authenticated moderator-only functions for approval, rejection and removal, plus an audit trail.
4. Test anonymous users cannot select, insert, update or delete raw rows through the REST API.
5. Add a deletion request and data-retention process, privacy notice and abuse contact.
6. Configure backups and test a restore.
7. Create a separate production Supabase project only after the development schema and functions have been reviewed.

## Applying future migrations

Use timestamped SQL files in `supabase/migrations/`. In development, test each migration before applying it to production. For a CLI workflow, follow the official Supabase guide: https://supabase.com/docs/guides/deployment/database-migrations.
