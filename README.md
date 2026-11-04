# Trade Show Stands — tradeshowstands.com.au

Australian **trade-show calendar** + **exhibition stand brief** lead-gen site, run with **Brijnco**
(Australian exhibition stand builder).

- **Public face:** an independent calendar of Australian trade shows (dates, venues, official links),
  city and industry landing pages, and a stand-builder guide.
- **Commercial:** one structured stand brief → qualified **hot / warm / cold** → emailed straight to
  Brijnco, with no middleman. The site is **not** an official organiser of any show, and it never says it is.

Static Astro site + one Cloudflare Pages Function (`functions/api/lead.ts`). Deploy steps: **[DEPLOY.md](./DEPLOY.md)**.

## Quick start

```bash
export PATH=~/.local/bin:$PATH   # Node 22 (see .nvmrc)
npm install
npm run dev          # http://localhost:4321 (Astro only; /api/lead not running → mailto fallback)
npm run build        # → dist/
npm test             # vitest: lead handler unit tests
npm run check:links  # every internal link in dist/ resolves
npm run pages:dev    # build + wrangler pages dev on :8788 (static site + /api/lead together)
```

For `pages:dev`, copy `.dev.vars.example` → `.dev.vars` and fill it in. Without it, the endpoint answers
`503 not_configured`.

## Pages

| Path | Purpose |
|------|---------|
| `/` | Value prop, next show, featured shows, city + industry index. Organization + WebSite JSON-LD |
| `/shows` | Full calendar with city / industry / upcoming filters. ItemList JSON-LD |
| `/shows/[slug]` | 44 show pages: facts, official link, planning notes, related shows, Event JSON-LD |
| `/shows/city/[city]` | 8 city pages (Sydney, Melbourne, Brisbane, Perth, Adelaide, Gold Coast, Canberra, Darwin) |
| `/shows/industry/[industry]` | 11 industry pages |
| `/exhibition-stand-builders` | Guide: stand types, sourced cost example, builders by city, checklist, timeline, FAQ |
| `/stand-brief` | Lead form (the conversion page; no ads) |
| `/thanks` | Confirmation (`noindex`, excluded from the sitemap) |
| `/privacy`, `/cookies` | Policies (mention Brijnco, Cloudflare and Resend; review before launch) |
| `/404` | Not-found page (Cloudflare Pages serves it for unknown paths) |

URLs are clean, with no trailing slash (`build.format: 'file'`, `trailingSlash: 'never'`). Landing-page copy
lives in `src/data/taxonomy.ts`.

## Show data — `src/data/shows.ts`

There is no exhibition API. The calendar is edited by hand, about once a month.

```bash
npm run shows:review
```

The script prints four lists:

- **PAST** — the edition has ended. Delete that object.
- **RE-CHECK** — `verifiedOn` is older than 90 days. Open `officialSite` and correct dates, or bump `verifiedOn` if they still match.
- **UNCONFIRMED** — `illustrative: true`. The page shows a Verify badge until the organiser confirms the detail in `flagNote`.
- **WATCHLIST** — series in `src/data/watchlist.ts` whose next edition is not published yet. Open the official URL. When dates and a venue are on that page, copy a nearby object into `shows.ts`, set `verifiedOn` to today, and remove the watchlist row. Do not take dates from EventsEye, 10times or similar directories.

`city` must be a city name from `taxonomy.ts` (`Sydney`, not `sydney`). `categories` must be industry slugs from `taxonomy.ts`. A new city or industry needs copy there first, otherwise the landing page will not build.

Rules:
1. Set `officialSite` **only** to a URL you have opened and checked. **Never invent URLs.**
2. Set `verifiedOn: 'YYYY-MM-DD'` each time you check a show against its official site.
3. If dates or venue are not confirmed, set `illustrative: true` and give a `flagNote` explaining why.
4. Remove past editions. Add the next edition only once the organiser publishes it.

## Lead delivery

```
form (/stand-brief) ──JSON──▶ POST /api/lead (Cloudflare Pages Function)
                                 ├─ origin allowlist, 32 KB limit, rate limit (5 / 10 min / IP)
                                 ├─ spam: honeypot `company_fax`, <2.5 s fill time, link/markup/keyword checks
                                 ├─ validate (src/lib/lead.ts) → 422 with per-field errors
                                 ├─ qualify hot/warm/cold server-side (src/lib/qualify.ts)
                                 ├─ Resend email → LEAD_TO_EMAIL (+ LEAD_CC_EMAIL), reply-to = exhibitor
                                 └─ optional webhook → LEAD_WEBHOOK_URL (JSON, X-Lead-Secret header)
                              ◀── { ok, qualification, redirect: "/thanks?q=hot" }
```

- **JS on:** the form posts JSON, then redirects to `/thanks` on success. Server field errors appear inline
  next to the fields; delivery errors appear in an inline box above the submit button.
- **JS off:** the plain `<form method="post" action="/api/lead">` gets a `303` to `/thanks` or back to
  `/stand-brief?error=…`.
- **Local dev without the function** (`astro dev`/`preview`): when the endpoint returns 404/405 or isn't
  reachable *on localhost only*, the form opens a pre-filled `mailto:` to `leads.mailtoFallbackEmail`.
  It never falls back like this in production.
- The delivery works if **either** email or webhook succeeds. If neither is configured: `503`. If both fail: `502`.
- Placeholder addresses (`*.example`, anything containing `TBC`) count as *not configured*, so a
  half-finished deploy returns 503 instead of mailing a dead address.
- Spam gets a fake `200`, so bots learn nothing.

### Environment variables

Set in Cloudflare Pages → Settings → Variables and Secrets. Locally, use `.dev.vars`. Full list with
comments: [`.env.example`](./.env.example).

| Variable | Required | Notes |
|----------|----------|-------|
| `RESEND_API_KEY` | yes (for email) | Secret. Resend API key |
| `LEAD_TO_EMAIL` | yes (for email) | Sister’s lead inbox, **TBC**. Comma-separated for several |
| `LEAD_CC_EMAIL` | no | e.g. Vladislav |
| `LEAD_FROM_EMAIL` | no | Default `Trade Show Stands <leads@tradeshowstands.com.au>`. The domain must be verified in Resend |
| `LEAD_WEBHOOK_URL` | no | Secret. Also POST each lead as JSON (Slack / Make / n8n / CRM) |
| `LEAD_WEBHOOK_SECRET` | no | Secret. Sent as `X-Lead-Secret` |
| `ALLOWED_ORIGINS` | no | Extra browser origins. The site domain, www, `*.pages.dev` and localhost are built in |
| `LEAD_RATE_LIMIT` | no | **KV binding** (not a var) for rate limiting across isolates. Without it, rate limiting is per-isolate in memory |
| `PUBLIC_ANALYTICS_PROVIDER` | no | Build-time: `plausible` / `ga4` / `none` (default none) |
| `PUBLIC_PLAUSIBLE_DOMAIN`, `PUBLIC_GA4_ID` | no | Build-time analytics IDs |

## Config — `site.config.ts`

- `domain`, `name`, `wordmark`, `contactEmail` (`contactEmailIsPlaceholder: true` until a real mailbox exists).
- `leads.endpoint` (`/api/lead`), `leads.mailtoFallbackEmail` (**placeholder** `LEADS-INBOX-TBC@brijnco.example`;
  used only for the local fallback).
- `analytics.provider`: `'none'` (default), `'plausible'` or `'ga4'`. When enabled, a `Lead` event fires
  on successful submit. Env vars override this at build time. Update `/cookies` and `/privacy` when you switch analytics on.
- `ads.enabled: false`.

## Testing

- `npm test`: 18 vitest unit tests for the handler (validation, honeypot, timing trap, origin, rate limit,
  Resend payload, webhook, 422/503/502, form-post redirects, placeholder guard).
- `scripts/e2e/`: headless end-to-end run. Start `mock_resend.py` (fake Resend on :8799), then run
  `wrangler pages dev dist --port 8788 --binding RESEND_API_KEY=re_test --binding LEAD_TO_EMAIL=you@test.local --binding RESEND_API_URL=http://127.0.0.1:8799/emails`.
  After that, `python3 scripts/e2e/e2e.py` fills in the real form in Chrome, and `e2e_err.py` checks the inline-error and mailto paths.
- `npm run check:links`.

## Design (do not restyle)

Editorial trade-catalogue look: light, paper-toned, one accent.

- **Type:** Fraunces Variable (display + italics), Instrument Sans Variable (body/UI), IBM Plex Mono 500
  (labels/meta). Self-hosted via `@fontsource`.
- **Palette:** paper `#f3efe6`, sheet `#fbf9f4`, ink `#1b1a17`, rules `#d6cdbd`, accent **ochre** `#b4471f`.
  Tokens are in `src/styles/global.css`.
- `public/og-default.png` (1200×630) uses the same type and palette.

## Positioning checklist

- Never claim to be an official organiser. Always link out to the official show site.
- Brijnco is credited softly as the stand partner that receives briefs.
- The privacy policy must name the real entity and ABN, and the retention period, before launch.
