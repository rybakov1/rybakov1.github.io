# Deploying tradeshowstands.com.au (Cloudflare Pages)

Nothing has been deployed yet. Every step below is a one-off and can be done by Vladislav with access to
Brijnco's details. Rough total time: ~1 hour, plus DNS/verification waits.

## 0. Prerequisites

- Brijnco's **ABN** (or ACN), plus the legal entity name.
- A Cloudflare account (free plan is fine).
- A Resend account (free tier: 3,000 emails/month, 100/day, which is plenty for leads).
- The sister's **lead inbox address** (+ optional CC).
- Optional: this project in a GitHub/GitLab repo, for automatic deploys.

## 1. Buy the domain on Brijnco's ABN

`.com.au` names need an Australian presence (an ABN/ACN). The name must match the entity's name or
trade mark, **or** a service/goods the registrant provides. *Trade show stands* is Brijnco's service, so
register it **in Brijnco's name with Brijnco's ABN**, not personally.

- Cloudflare Registrar **does not sell .com.au**. Buy it at an auDA-accredited registrar
  (e.g. VentraIP, Crazy Domains, GoDaddy AU, Netregistry).
- Optional: also register `tradeshowstands.au` (same eligibility rules) to protect the name.
- Turn on auto-renew. Keep the ABN active, because the licence depends on it.

## 2. Put the domain on Cloudflare DNS

1. Cloudflare dashboard → **Add a domain** → `tradeshowstands.com.au` → Free plan.
2. Copy the two Cloudflare nameservers. At the registrar, replace the nameservers with them.
3. Wait for the zone to become **Active** (minutes to a few hours).
4. SSL/TLS → set mode to **Full (strict)**. Turn on **Always Use HTTPS**.

## 3. Create the Pages project

The project is static Astro output in `dist/` plus `functions/api/lead.ts` (Pages Functions).

**Option A — Git integration (recommended: deploys on every push)**

1. Push this folder to a GitHub/GitLab repo (`.gitignore` already excludes `dist`, `.dev.vars`, `.wrangler`).
2. Workers & Pages → **Create** → **Pages** → **Connect to Git** → pick the repo.
3. Build settings:
   - Framework preset: **Astro**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: *(repo root, or the folder containing `package.json`)*
   - Environment variable: `NODE_VERSION` = `22` (`.nvmrc`/`.node-version` also pin 22)
4. Project name: `tradeshowstands`. The `functions/` folder is detected automatically.

**Option B — Direct upload with Wrangler (no repo)**

```bash
export PATH=~/.local/bin:$PATH
npx wrangler login                          # opens browser once
npm run build
npx wrangler pages project create tradeshowstands --production-branch main
npm run pages:deploy                        # = wrangler pages deploy dist --project-name tradeshowstands
```

Run it from the project root so Wrangler bundles `functions/`. The dashboard drag-and-drop upload does
**not** include Functions, so don't use it. A Direct Upload project can't later switch to Git; you'd need a new project.

`wrangler.toml` already declares `name = "tradeshowstands"` and `pages_build_output_dir = "./dist"`.

## 4. Set environment variables and secrets

Pages project → **Settings → Variables and Secrets**. Add them to **Production** (and to Preview if you
want preview deploys to send email).

| Name | Type | Value |
|------|------|-------|
| `RESEND_API_KEY` | Secret | from Resend → API Keys (Sending access, this domain only) |
| `LEAD_TO_EMAIL` | Text | **sister's inbox — TBC** |
| `LEAD_CC_EMAIL` | Text | optional, e.g. Vladislav |
| `LEAD_FROM_EMAIL` | Text | `Trade Show Stands <leads@tradeshowstands.com.au>` (already the default in `wrangler.toml`) |
| `LEAD_WEBHOOK_URL` | Secret | optional (Slack / Make / n8n / CRM) |
| `LEAD_WEBHOOK_SECRET` | Secret | optional |
| `PUBLIC_ANALYTICS_PROVIDER` | Text | optional, build-time: `plausible` or `ga4` |
| `PUBLIC_PLAUSIBLE_DOMAIN` / `PUBLIC_GA4_ID` | Text | optional, build-time |

CLI alternative: `npx wrangler pages secret put RESEND_API_KEY --project-name tradeshowstands`.

**Redeploy after changing variables.** They only apply to new deployments.

Optional, for stronger rate limiting: Workers & Pages → KV → create namespace `lead-rate-limit`. Then go to
Pages project → Settings → Bindings → KV namespace, with variable name **`LEAD_RATE_LIMIT`**.

## 5. Verify the sending domain in Resend

1. Resend → **Domains → Add domain** → `tradeshowstands.com.au` (region: Tokyo `ap-northeast-1` is closest).
2. Add the DNS records Resend shows (a DKIM TXT at `resend._domainkey`, plus SPF MX + TXT on the `send`
   subdomain) in Cloudflare DNS, set to **DNS only** (grey cloud). Or use Resend's one-click Cloudflare setup.
3. Recommended: add a DMARC TXT at `_dmarc` with value `v=DMARC1; p=none; rua=mailto:<sister's inbox>`.
4. Wait for **Verified**, then create the API key used in step 4.

Until the domain is verified, Resend refuses to send from `@tradeshowstands.com.au`. In that case the
endpoint returns 502, unless a webhook is configured.

## 6. Custom domain + www redirect

1. Pages project → **Custom domains** → add `tradeshowstands.com.au` (Cloudflare creates the DNS record).
2. Add `www.tradeshowstands.com.au` too.
3. Rules → **Redirect Rules** → create rule "www → apex":
   - When hostname equals `www.tradeshowstands.com.au`
   - Then dynamic redirect to `concat("https://tradeshowstands.com.au", http.request.uri.path)`
   - Status **301**, preserve query string.
4. Optional: in Email → **Email Routing**, forward `hello@tradeshowstands.com.au` (shown on the site as
   contact) and `leads@` to the sister's inbox. Afterwards set `contactEmailIsPlaceholder: false` in `site.config.ts`.

## 7. Post-deploy checks

```bash
# endpoint alive (expects 405 JSON)
curl -i https://tradeshowstands.com.au/api/lead
# validation alive (expects 422 with field errors)
curl -i -X POST https://tradeshowstands.com.au/api/lead -H 'content-type: application/json' -d '{}'
```

If a real brief shows "not configured yet", the endpoint returned 503: `RESEND_API_KEY`/`LEAD_TO_EMAIL`
(or the webhook) are missing or still the placeholder. Set them, then redeploy. "Couldn't deliver" (502)
usually means the Resend domain isn't verified yet or the API key is wrong. Check the Functions logs.

- Submit a real brief on `/stand-brief` (wait a few seconds before submitting) → should land on `/thanks` and
  the email should arrive with the HOT/WARM/COLD subject. Reply to it and check the reply goes to the exhibitor.
- `https://tradeshowstands.com.au/sitemap-index.xml` loads. `/thanks` is noindex. Unknown URLs show the 404 page.
- Google Search Console → add a Domain property (DNS TXT via Cloudflare) → submit `sitemap-index.xml`.
- Test the home page and a show page with the Rich Results Test (Event + Organization JSON-LD).
- Functions logs: Pages project → Deployments → (deployment) → **Functions → Real-time logs**.

## Rollback

Pages project → Deployments → pick an earlier deployment → **Rollback to this deployment**.
