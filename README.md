# Behind the Paycheck — MVP

An anonymous, employee-reported IT workforce reality index for India. This is a separate project from MR.Career.

## What's included

- `public/index.html`: main dashboard, issue categories, anonymous submission form, public stories, daily activity totals.
- `public/about.html`: purpose, privacy principles, methodology, limitations.
- `public/styles.css`: responsive visual design using a light background, navy text, blue accents, coral highlights and white cards.
- `public/app.js`: browser interactions and API calls.
- `server.js`: small Node.js HTTP server and JSON-file persistence; no external packages required.

## Run locally

Requires Node.js 20 or newer.

```bash
npm start
```

Open <http://localhost:3000>.

The server creates `data/site-data.json` on first run. It stores published story text, selected issue categories, timestamps and aggregate daily page-visit counts. It does **not** intentionally store IP addresses, visitor identifiers, names, emails or account profiles.

## Important counting definitions

- **Page visits** count requests to the main page. They are not unique people.
- **Reports today / all-time reports** count submitted stories.
- **Issue counts** count the number of reports that selected each issue. A report can count under several issues.
- These are voluntary, self-reported submissions, not independently verified cases or a representative survey of all IT employees.
- A visitor can submit more than one report. Do not describe these figures as unique employees.

## Before public launch

This is a functional MVP, not a hardened production service. Before opening it to the public:

1. Add request rate limits and spam/bot controls without retaining personal identifiers unnecessarily.
2. Provide a moderation and removal workflow. Public stories can contain identifying details even when no identity fields are requested.
3. Add backups, data retention/deletion procedures, and secure deployment (HTTPS, restrictive permissions, monitored disk usage).
4. Review logs at the hosting provider, reverse proxy, CDN, and platform. They can retain technical data even if the application does not.
5. Review applicable Indian privacy, intermediary, content, and data-retention obligations with qualified counsel.
6. Add a clear operator contact for abuse reports and takedown requests.
7. Keep any small or potentially identifying aggregate data from being presented in a way that could expose a person.
8. Consider moderation before publication. This MVP publishes accepted submissions immediately and does not currently include an admin/moderation panel.

## Deployment notes

This requires a Node.js host with a persistent writable disk (or a separately configured persistent data volume). Static-only hosting such as GitHub Pages cannot run `server.js` or collect shared submissions by itself. Set `PORT` and optionally `DATA_DIR` through the hosting environment.

## Project principles

- No accounts or user profiles.
- Do not request names, phone numbers, emails, salary slips, account numbers or personal documents.
- No advice, donations, job services, comments, or likes in this MVP.
- Data should be presented as employee-reported concerns, not as proof that a named company or government body has done something wrong.
