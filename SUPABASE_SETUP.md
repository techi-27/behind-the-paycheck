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


## Current homepage survey update

The homepage now lets an employee choose up to three IT incident categories and optionally share their experience range. The additional category IDs are defined in `supabase/migrations/202610130004_it_incident_categories.sql`. **Apply this migration to the Supabase project before using the new Offer release, Moonlighting, or PF overlap options**, otherwise the submission function may reject those categories as unknown/inactive. The public-trends function only counts approved IT reports and suppresses issue/company buckets below five reports.

## Company policy profiles and policy tracker

The homepage now includes a searchable Company Policy Profiles section and a Policy Change Tracker. The frontend reads only aggregate data from the `public-trends` Edge Function:

- Company profiles appear only after at least five approved IT reports for that company.
- A company's issue breakdown appears only after at least five approved reports for that issue.
- Policy changes appear only when the entry is approved and has an evidence URL.
- Company responses appear only after approval and are shown only for companies that meet the report threshold.
- Employee-reported patterns are not presented as proof of misconduct or as a verified company rating.

### Deploy the updated aggregate function

The source change in `supabase/functions/public-trends/index.ts` does not deploy automatically when committed to GitHub. After linking the Supabase CLI to the correct project, deploy the function:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy public-trends
```

Do not put a Supabase service-role key in frontend code or commit it to GitHub. Confirm the deployed function returns `company_profiles`, `policy_changes`, and `company_responses` before considering the feature live. Policy changes and company responses must be reviewed and approved in the database before they become public; add only evidence-backed policy updates and avoid publishing confidential company information.

## Applying future migrations

Use timestamped SQL files in `supabase/migrations/`. In development, test each migration before applying it to production. For a CLI workflow, follow the official Supabase guide: https://supabase.com/docs/guides/deployment/database-migrations.
