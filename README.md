# Behind the Paycheck

**An anonymous, employee-reported view of India's IT workplace.**

Website: https://behindthepaycheck.in/  
Repository: https://github.com/techi-27/behind-the-paycheck

Behind the Paycheck helps IT employees share workplace experiences and explore privacy-protected patterns around hiring, interviews, offer letters, salary hikes, notice periods, joining conflicts, workplace policies and layoffs. The product combines structured reporting, aggregate trends, official employee-rights resources and clearly labelled workplace satire.

> **Important:** Reports are voluntary, self-reported accounts. They are not a representative survey, independently verified findings, or proof of wrongdoing by a company or individual. Company patterns appear only when the required privacy threshold is met.

---

## Contents

- [Product goals](#product-goals)
- [Pages and features](#pages-and-features)
- [How reporting works](#how-reporting-works)
- [Employee Reality Index and trends](#employee-reality-index-and-trends)
- [Privacy, moderation and safety](#privacy-moderation-and-safety)
- [Technology and architecture](#technology-and-architecture)
- [Repository structure](#repository-structure)
- [Run locally](#run-locally)
- [Deploy the static website](#deploy-the-static-website)
- [Configure Supabase](#configure-supabase)
- [Apply database migrations](#apply-database-migrations)
- [Deploy Edge Functions](#deploy-edge-functions)
- [Moderation workflow](#moderation-workflow)
- [Test before launch](#test-before-launch)
- [Known limitations and production checklist](#known-limitations-and-production-checklist)
- [Contribution guidelines](#contribution-guidelines)
- [License](#license)

## Product goals

1. Give IT employees a place to share workplace experiences without creating public personal profiles.
2. Collect structured, comparable information so trends can be grouped by issue, career stage, month, company type, experience band and city.
3. Publish aggregate data only when enough approved reports exist to reduce the risk of identifying a person.
4. Keep raw report text private; the public trends experience is based on approved aggregate data.
5. Separate employee-reported patterns from verified facts, official policy information and satire.
6. Offer links to official employment and grievance resources without pretending to provide legal advice.

The site is focused on IT employee experiences in India. It is not a recruitment agency, employer-rating authority, legal service or job-placement service.

## Pages and features

The main navigation links to these areas:

| Page | File | Purpose |
|---|---|---|
| Home | `public/index.html` | Hero, Employee Reality Index, structured trends preview, community aggregate wall, corporate satire, rights resources and submission links |
| Employee Trends | `public/dashboard.html` | Aggregate trend dashboard, company patterns and privacy-thresholded comparisons |
| Share Experience | `public/it-employee-struggles.html` and `public/feedback.html` | Collect an anonymous structured IT workplace report |
| Satire Lab | Homepage section in `public/index.html` | Corporate Bingo and HR Translator; entertainment only |
| Employee Rights | Homepage section and `public/about.html` | Links to official resources and explains the site's purpose and limits |
| About | `public/about.html` | Product purpose, methodology and privacy principles |
| Coffee | `public/coffee.html` | Optional support page |

Other files include `public/moderation.html` for moderation-related UI, `public/personal-struggles.html` for a legacy page, and `public/demo.html` for demonstration purposes. Review these pages before launch and keep their links consistent with the product's current IT-workplace-only scope.

### Homepage section order

The homepage is designed in this order:

1. Hero
2. The Employee Reality Index
3. Structured IT Employee Trends
4. The Community Wall
5. The Corporate Circus
6. Satire Lab / No Fake Facts
7. From Reports to Action
8. Your Experience Matters
9. Got a company-specific experience? — final banner

The hero is intentionally visually distinct. Below it, the content sections stack vertically.

## How reporting works

### Problem reports

A user chooses a company and one to three issue categories, writes a short account and completes the structured fields. The current submission function validates the report on the server and accepts only the IT report group.

Expected core fields include:

- Company name
- Issue categories (one to three for a problem report)
- Story text (20–600 characters)
- Stage when the event occurred: Applying, Interview, Offer, Notice period, Joining, Working or Layoff
- Event month and year
- Optional company type: Service, Product, GCC or Startup
- Optional experience band: 0–2, 3–5, 6–10 or 10+ years
- Optional city and outcome
- Conditional details when relevant:
  - Notice period and demanded joining time for notice/joining issues
  - Hike percentage for salary-related issues
  - Offer delay in days for offer-letter issues
  - For layoff reports: whether advance notice was given, severance weeks and whether access was cut the same day

The form may change as the product evolves; server-side validation is authoritative. Do not rely on browser validation alone.

### Good-experience reports

The submission function supports a separate **Good experience** report type. A good report must include at least one positive tag:

- Offer on time
- Notice period respected
- Fair hike
- Supportive layoff handling

Good-experience reports do not use problem issue categories. They remain pending until approved, just like problem reports.

### Company name handling

Company names are trimmed and whitespace-normalized. The backend attempts to match a normalized name to an existing company record before creating a new record. This reduces duplicates caused by case and repeated spaces, but it is not a comprehensive legal-entity matching service. Review aliases and subsidiaries carefully before combining them.

### Submission frequency protection

The submit function uses a browser-generated token hashed together with the normalized company name. The raw token and IP address are not written by this logic. A browser/company combination is limited to one submission in a seven-day period. This is a basic abuse-prevention measure, not proof of one report per real person; users can clear browser data or use another browser/device.

### What happens after submission?

Submissions are stored with a `pending` status. They must be reviewed and approved before they contribute to public aggregates. A successful submission response means the report was accepted for processing, not that its claims were verified or that it is already public.

## Employee Reality Index and trends

The frontend reads aggregate data from the `public-trends` Supabase Edge Function. The function queries approved IT reports and their issue links; it does not intentionally return raw story text.

Depending on available approved data, the trend experience can show:

- Approved report totals and companies meeting the privacy threshold
- Issue breakdowns
- Stage-level patterns and issue categories by stage
- Monthly issue trends, including recent month/quarter summaries where available
- Company-type and city comparisons
- Notice-period versus demanded joining-time medians
- Median reported hike percentages
- Median offer-letter delay
- Layoff pulse: monthly counts, no-advance-notice percentage, same-day access-cut percentage and median severance weeks
- Red Flag Watchlist based on weighted problem-report patterns
- Green Flag Companies based on approved positive-experience reports
- Company policy changes and company responses, when approved and supported by evidence as required by the feature

### Privacy thresholds and interpretation

- A named company pattern must have at least **five approved problem reports** for the relevant company-level problem pattern before the company is listed.
- A company issue breakdown requires at least five approved reports for that issue.
- Other buckets and medians should only appear when the relevant group has at least five usable approved reports.
- Small groups are suppressed rather than filled with sample data.
- Median values are preferred for skewed measures such as hikes, delays and severance.
- Every chart/list should explain its denominator and include a warning that the information is based on anonymous employee reports and is not proof of wrongdoing.
- Larger employers may receive more reports simply because they employ more people. Counts are not employee-adjusted rates unless a reliable, sourced headcount denominator is added.
- The Red Flag Watchlist is a weighted summary of reports, not a factual finding, legal conclusion, or instruction not to join a company.
- A company should not be considered a Green Flag simply because few people reported a problem. Positive patterns must come from approved good-experience reports.

**No sample data should be presented as real.** If a trend cannot be calculated or the function is unavailable, show an honest empty/unavailable state.

## Privacy, moderation and safety

The product is designed to avoid public personal profiles and public story publication.

- Do not request names, personal email addresses, phone numbers, employee IDs, salary slips or personal documents.
- Do not submit names or identifying details of managers, HR staff, colleagues or other private individuals.
- Do not include confidential employer information, credentials, customer data, production secrets or internal documents.
- Public pages must show aggregate counts and approved, privacy-safe summaries only. Do not publish raw story text.
- Do not expose raw report tables through public database policies. The browser should use purpose-built Edge Functions.
- New reports default to pending moderation.
- Company responses and policy changes should be approved before display; policy changes should include an evidence URL.
- Provide a way to report abuse, request removal and contact the site operator before public launch.
- Hosting providers, CDNs, browser infrastructure and server logs may process technical metadata. Do not claim that no technical data is ever collected unless hosting settings have been checked.
- Follow applicable Indian privacy, content, intermediary and retention requirements with qualified legal advice.

## Technology and architecture

### Frontend

- Static HTML, CSS and vanilla JavaScript
- Responsive pages in `public/`
- GitHub Pages workflow publishes the static website from `public/`
- The browser does not need direct access to raw report tables

### Backend

- Supabase PostgreSQL stores companies, issue catalogue, reports, report/issue relationships, submission guards, moderation events, company responses and policy changes.
- Supabase Row Level Security (RLS) is intended to keep raw data inaccessible to anonymous direct table access.
- Supabase Edge Functions validate submissions and return public aggregates:
  - `submit-report`
  - `public-trends`
  - `moderate-report`
- SQL migrations live in `supabase/migrations/`.

**Important deployment distinction:** committing HTML, SQL or Edge Function code to GitHub does not deploy the SQL migration or the Edge Functions to Supabase. GitHub Pages and Supabase are separate deployments. The frontend can load while submissions or trends fail if the backend is not configured and deployed.

The repository also contains a small Node.js server (`server.js`) and JSON-file persistence from an earlier MVP. This is a separate local/Node hosting path; it is not the same as the Supabase-backed production architecture. Do not run both storage paths as if they automatically share data.

## Repository structure

```text
.
├── .github/workflows/       # GitHub Actions / Pages workflow
├── public/
│   ├── index.html           # Homepage and section layout
│   ├── dashboard.html       # Employee Trends
│   ├── it-employee-struggles.html
│   ├── feedback.html        # Structured report form
│   ├── about.html
│   ├── moderation.html
│   ├── personal-struggles.html
│   ├── coffee.html
│   ├── demo.html
│   ├── app.js
│   └── styles.css
├── supabase/
│   ├── migrations/          # SQL schema and feature changes
│   └── functions/
│       ├── submit-report/
│       ├── public-trends/
│       └── moderate-report/
├── server.js               # Earlier Node.js + JSON-file MVP
├── package.json
├── SUPABASE_SETUP.md
└── README.md
```

## Run locally

### Static frontend

For a quick frontend-only preview, serve the `public/` directory with a local static server. For example, if Python is installed:

```bash
python -m http.server 5500 --directory public
```

Then open <http://localhost:5500>. Some features will require a configured Supabase project and deployed functions; a static preview alone cannot persist shared reports.

### Node.js MVP

Requires Node.js 20 or newer.

```bash
npm start
```

Open <http://localhost:3000>.

The Node.js server creates `data/site-data.json` on first run. This file-backed MVP is independent of Supabase. Use it only if you specifically intend to run the older Node server; do not assume it writes to the production Supabase database.

For development with automatic restarts:

```bash
npm run dev
```

Optional environment variables for the Node server:

- `PORT`: HTTP port
- `DATA_DIR`: directory for JSON data files

Never commit production data files, credentials or secret keys.

## Deploy the static website

1. Push frontend changes to the `main` branch.
2. Open the repository's **Actions** tab.
3. Confirm the latest Pages workflow for the latest commit completes successfully.
4. Check the live page after deployment; force-refresh with Ctrl+Shift+R if an older cached version remains.
5. Test the homepage and each navigation link at desktop, tablet and phone widths.

The GitHub Pages workflow publishes static files from `public/`. It does not run `server.js`, apply SQL migrations, or deploy Supabase functions.

## Configure Supabase

See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for the full setup guide.

High-level setup:

1. Create a Supabase project for development.
2. Install the Supabase CLI and authenticate.
3. Link the repository to the correct Supabase project.
4. Apply the SQL migrations in order, checking for errors.
5. Set required Edge Function secrets using Supabase's secret management. Never put the service-role key in frontend code or commit it.
6. Deploy each required Edge Function.
7. Configure the frontend's Supabase project URL and publishable/anonymous key using the project's intended configuration. The publishable key is not a substitute for RLS.
8. Test CORS, report validation, moderation, privacy thresholds and public aggregate responses.
9. Repeat the process in a separate production project only after development tests pass.

## Apply database migrations

Migration files are timestamped in `supabase/migrations/`. They include the initial schema, submission guard, IT-only scope, additional issue categories, structured trends and positive/layoff trend fields.

Use the Supabase CLI in the repository root:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Review the CLI output carefully and verify the resulting schema in the Supabase dashboard. If the project is already managed by migration history, reconcile that history rather than blindly re-running SQL in the SQL Editor. Test migrations in development before production.

To inspect migration status, use the Supabase CLI's migration list command supported by your installed CLI version. Keep backups before production schema changes.

## Deploy Edge Functions

From the repository root, after linking the correct project:

```bash
supabase functions deploy submit-report
supabase functions deploy public-trends
supabase functions deploy moderate-report
```

Check each deployment result and test the function URL. Functions must be deployed to the same Supabase project that owns the schema. If secrets are required, set them with the Supabase CLI/dashboard secret manager; never add service-role credentials to the `public/` folder.

### Function responsibilities

- **`submit-report`** — accepts a report, validates its type, text length, issue selection, stage/month, conditional numeric fields and layoff fields; normalizes company names; creates pending records; and applies a seven-day browser/company submission guard.
- **`public-trends`** — reads approved IT reports and computes privacy-thresholded aggregate metrics. The response is configured for five-minute HTTP caching.
- **`moderate-report`** — moderation-related server-side action. Configure and test its authorization requirements before enabling it; do not assume that hiding a moderation page is sufficient security.

## Moderation workflow

Reports should remain pending until a trusted moderator reviews them. A production moderation process should:

1. Review whether a report contains names, personal details, threats, harassment, confidential information or potentially identifying details.
2. Reject or redact content that creates privacy or legal risk.
3. Approve only reports that meet the site's content rules.
4. Record moderation actions in an audit trail.
5. Support report removal and correction requests.
6. Ensure only approved reports count in public trends.
7. Require approval and an evidence URL for policy-change entries.
8. Approve company responses before showing them, and only show them where the corresponding company meets the reporting threshold.

Do not expose moderator credentials or rely on client-side UI checks alone. Authorization must be enforced by the backend. Before public launch, test that an anonymous visitor cannot approve, reject, read raw reports, or modify records by calling an endpoint directly.

## Test before launch

### Submission validation

- Problem report accepts one to three unique active issue categories.
- Good-experience report requires at least one supported positive tag and no problem issue categories.
- Story text under 20 or over 600 characters is rejected.
- Company name, event month and stage are required.
- Future event months and invalid enum values are rejected.
- Conditional notice, hike and offer-delay fields are required only when their corresponding issue is selected.
- Layoff-only fields are accepted only for layoff-stage reports.
- Repeated submissions for the same browser/company are rate-limited as intended.
- Failed submissions do not leave unintended partial reports or permanent rate-limit reservations.

### Privacy and aggregates

- Pending, rejected and removed reports do not affect public aggregates.
- Raw story text and private report identifiers are not returned from `public-trends`.
- Named company patterns and issue buckets below the minimum threshold are suppressed.
- Median values use only eligible reports with valid values.
- Positive metrics count approved positive reports only.
- Layoff metrics use only approved layoff reports with the relevant field supplied.
- API error responses do not leak secrets or raw report data.
- Direct anonymous database access to raw tables is denied by RLS.

### UI and accessibility

- Verify navigation and all form states at 1920px, 1366px, 768px and 375px.
- Check the hero does not overlap the Employee Reality Index.
- Check each homepage section remains in its specified order and stacks vertically below the hero.
- Confirm controls have labels, keyboard focus is visible, and errors are understandable.
- Check the browser console and network requests for errors.
- Confirm there is no sample data presented as actual report data.

## Known limitations and production checklist

This project is under active development. Do not assume every feature is production-ready just because its source exists in the repository.

Before a public launch, confirm:

- [ ] The latest GitHub Pages build is successful and the live UI has been visually checked.
- [ ] All required Supabase migrations are applied to the intended project.
- [ ] All Edge Functions are deployed and integration-tested.
- [ ] The frontend points to the correct Supabase project.
- [ ] RLS prevents public access to raw reports and moderator operations.
- [ ] Moderator authorization and audit logging are tested.
- [ ] Spam protection and rate limiting have been tested against realistic abuse.
- [ ] There is an operator contact, abuse/takedown process and data deletion procedure.
- [ ] Backup and restore have been tested.
- [ ] Privacy notice accurately describes actual database, host, CDN and log retention.
- [ ] Aggregate counts and denominators are displayed accurately.
- [ ] Company aliases, duplicate companies and misleading company comparisons have a review process.
- [ ] Legal review has been completed for the applicable jurisdictions.
- [ ] Production monitoring and incident response are configured.

## Contribution guidelines

- Keep the product focused on IT employee experiences.
- Do not add fabricated numbers, synthetic reports presented as real, or unverified company allegations.
- Never publish raw stories or personal information on public pages.
- Keep all public statistics based on approved records and apply the minimum privacy threshold in backend aggregation, not only in browser code.
- Preserve responsive behavior and the established homepage section order.
- Keep UI copy, database migrations, Edge Function validation and documentation consistent.
- Never commit passwords, Supabase service-role keys, production data, tokens or private company information.
- Include test evidence and deployment status when submitting a change.

## License

No explicit open-source license is declared in this repository. Unless a license is added, assume that normal copyright applies and obtain permission before redistributing or reusing the project beyond rights granted by law.
