/**
 * POST /api/lead — Cloudflare Pages Function
 *
 * Validates a stand brief, recomputes hot/warm/cold server-side, emails it via
 * Resend and (optionally) forwards it to a webhook. Returns JSON.
 * Also accepts classic form posts (application/x-www-form-urlencoded) and
 * answers them with a 303 redirect, so the form works without JavaScript.
 *
 * Env (Cloudflare Pages → Settings → Variables and Secrets):
 *   RESEND_API_KEY      secret  — Resend API key (required for email)
 *   LEAD_TO_EMAIL       text    — lead inbox; comma-separate for several (required for email)
 *   LEAD_CC_EMAIL       text    — optional CC (comma-separated)
 *   LEAD_FROM_EMAIL     text    — optional; default "Trade Show Stands <leads@tradeshowstands.com.au>"
 *                                 (domain must be verified in Resend)
 *   LEAD_WEBHOOK_URL    secret  — optional; JSON POST of every lead (Slack/Make/n8n/CRM)
 *   LEAD_WEBHOOK_SECRET secret  — optional; sent as X-Lead-Secret header
 *   ALLOWED_ORIGINS     text    — optional extra allowed origins, comma-separated
 *   LEAD_RATE_LIMIT     KV      — optional KV namespace binding for cross-isolate rate limiting
 *   RESEND_API_URL      text    — optional override (tests/mocks only)
 */
import {
  validateLead,
  checkSpam,
  buildLead,
  leadSubject,
  leadText,
  leadHtml,
  webhookPayload,
  type FieldErrors,
} from '../../src/lib/lead';

interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export interface Env {
  RESEND_API_KEY?: string;
  LEAD_TO_EMAIL?: string;
  LEAD_CC_EMAIL?: string;
  LEAD_FROM_EMAIL?: string;
  LEAD_WEBHOOK_URL?: string;
  LEAD_WEBHOOK_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  RESEND_API_URL?: string;
  LEAD_RATE_LIMIT?: KVLike;
}

interface Ctx {
  request: Request;
  env: Env;
  waitUntil?: (p: Promise<unknown>) => void;
}

const DEFAULT_FROM = 'Trade Show Stands <leads@tradeshowstands.com.au>';
const MAX_BODY_BYTES = 32 * 1024;
const RATE_WINDOW_S = 10 * 60;
const RATE_MAX = 5;

const SITE_ORIGINS = [
  'https://tradeshowstands.com.au',
  'https://www.tradeshowstands.com.au',
];

// Best-effort per-isolate memory limiter (backed by KV when bound).
const memHits = new Map<string, number[]>();

export async function rateLimited(key: string, env: Env, now = Date.now()): Promise<boolean> {
  const windowStart = now - RATE_WINDOW_S * 1000;
  if (env.LEAD_RATE_LIMIT) {
    const k = `rl:${key}`;
    const prev = JSON.parse((await env.LEAD_RATE_LIMIT.get(k)) || '[]') as number[];
    const hits = prev.filter((t) => t > windowStart);
    if (hits.length >= RATE_MAX) return true;
    hits.push(now);
    await env.LEAD_RATE_LIMIT.put(k, JSON.stringify(hits), { expirationTtl: RATE_WINDOW_S + 60 });
    return false;
  }
  const hits = (memHits.get(key) || []).filter((t) => t > windowStart);
  if (hits.length >= RATE_MAX) {
    memHits.set(key, hits);
    return true;
  }
  hits.push(now);
  memHits.set(key, hits);
  if (memHits.size > 5000) memHits.clear();
  return false;
}

/** Test helper */
export function _resetRateLimit(): void {
  memHits.clear();
}

function originAllowed(origin: string | null, requestUrl: string, env: Env): boolean {
  if (!origin) return true; // non-browser or same-origin form post without Origin
  const self = new URL(requestUrl).origin;
  if (origin === self) return true;
  const extra = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if ([...SITE_ORIGINS, ...extra].includes(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    if (u.hostname.endsWith('.pages.dev')) return true; // CF preview deployments
  } catch {
    return false;
  }
  return false;
}

const list = (v?: string): string[] =>
  (v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    // Ignore unfilled placeholders (e.g. LEADS-INBOX-TBC@brijnco.example) so a half-configured
    // deploy returns 503 instead of silently mailing a dead address.
    .filter((s) => !/\.example$|TBC/i.test(s));

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      ...extra,
    },
  });
}

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } });
}

async function readBody(request: Request): Promise<{ data: Record<string, unknown>; isForm: boolean } | null> {
  const len = Number(request.headers.get('content-length') || '0');
  if (len > MAX_BODY_BYTES) return null;
  const type = (request.headers.get('content-type') || '').toLowerCase();
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  if (type.includes('application/json')) {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? { data: parsed as Record<string, unknown>, isForm: false }
        : null;
    } catch {
      return null;
    }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return { data: Object.fromEntries(new URLSearchParams(text)), isForm: true };
  }
  return null;
}

async function sendResend(env: Env, lead: ReturnType<typeof buildLead>): Promise<{ ok: boolean; id?: string; error?: string }> {
  const to = list(env.LEAD_TO_EMAIL);
  if (!env.RESEND_API_KEY || to.length === 0) return { ok: false, error: 'email_not_configured' };
  const body: Record<string, unknown> = {
    from: env.LEAD_FROM_EMAIL || DEFAULT_FROM,
    to,
    subject: leadSubject(lead),
    text: leadText(lead),
    html: leadHtml(lead),
    reply_to: lead.email,
    tags: [
      { name: 'qualification', value: lead.qualification },
      { name: 'source', value: 'stand_brief' },
    ],
  };
  const cc = list(env.LEAD_CC_EMAIL);
  if (cc.length) body.cc = cc;
  try {
    const res = await fetch(env.RESEND_API_URL || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': lead.id,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      console.error('[lead] Resend error', res.status, detail);
      return { ok: false, error: `resend_${res.status}` };
    }
    const out = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: out.id };
  } catch (err) {
    console.error('[lead] Resend fetch failed', err);
    return { ok: false, error: 'resend_unreachable' };
  }
}

async function sendWebhook(env: Env, lead: ReturnType<typeof buildLead>): Promise<{ ok: boolean; error?: string }> {
  if (!env.LEAD_WEBHOOK_URL) return { ok: false, error: 'webhook_not_configured' };
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (env.LEAD_WEBHOOK_SECRET) headers['X-Lead-Secret'] = env.LEAD_WEBHOOK_SECRET;
    const res = await fetch(env.LEAD_WEBHOOK_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(webhookPayload(lead)),
    });
    if (!res.ok) {
      console.error('[lead] webhook error', res.status);
      return { ok: false, error: `webhook_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('[lead] webhook failed', err);
    return { ok: false, error: 'webhook_unreachable' };
  }
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;

  if (!originAllowed(request.headers.get('origin'), request.url, env)) {
    return json({ ok: false, error: 'forbidden_origin' }, 403);
  }

  const body = await readBody(request);
  if (!body) {
    return json({ ok: false, error: 'bad_request', message: 'Send the brief as JSON or a form post (max 32 KB).' }, 400);
  }
  const { data: raw, isForm } = body;
  const fail = (status: number, payload: Record<string, unknown>) =>
    isForm ? redirect(`/stand-brief?error=${encodeURIComponent(String(payload.error))}`) : json(payload, status);

  // Spam → pretend success so bots don't learn or retry.
  const spam = checkSpam(raw);
  if (spam.spam) {
    console.warn('[lead] dropped spam:', spam.reason);
    return isForm ? redirect('/thanks') : json({ ok: true, qualification: 'cold', id: 'dropped' });
  }

  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  if (await rateLimited(ip, env)) {
    return fail(429, {
      ok: false,
      error: 'rate_limited',
      message: 'Too many briefs from this connection. Please wait a few minutes and try again.',
    });
  }

  const v = validateLead(raw);
  if (!v.ok || !v.data) {
    return fail(422, {
      ok: false,
      error: 'validation',
      message: 'Please fix the highlighted fields.',
      fields: v.errors as FieldErrors,
    });
  }

  const lead = buildLead(v.data, {
    ip,
    country: request.headers.get('cf-ipcountry') || undefined,
    userAgent: (request.headers.get('user-agent') || '').slice(0, 200),
  });

  const emailConfigured = Boolean(env.RESEND_API_KEY && list(env.LEAD_TO_EMAIL).length);
  const webhookConfigured = Boolean(env.LEAD_WEBHOOK_URL);
  if (!emailConfigured && !webhookConfigured) {
    console.error('[lead] No delivery configured — set RESEND_API_KEY + LEAD_TO_EMAIL or LEAD_WEBHOOK_URL');
    return fail(503, {
      ok: false,
      error: 'not_configured',
      message: 'The brief service is not configured yet. Please try again later.',
    });
  }

  const [email, hook] = await Promise.all([
    emailConfigured ? sendResend(env, lead) : Promise.resolve({ ok: false, error: 'email_not_configured' }),
    webhookConfigured ? sendWebhook(env, lead) : Promise.resolve({ ok: false, error: 'webhook_not_configured' }),
  ]);

  if (!email.ok && !hook.ok) {
    return fail(502, {
      ok: false,
      error: 'delivery_failed',
      message: 'We couldn’t deliver your brief just now. Please try again in a minute.',
    });
  }

  const q = encodeURIComponent(lead.qualification);
  if (isForm) return redirect(`/thanks?q=${q}`);
  return json({
    ok: true,
    id: lead.id,
    qualification: lead.qualification,
    delivered: { email: email.ok, webhook: hook.ok },
    redirect: `/thanks?q=${q}`,
  });
}

export async function onRequest(ctx: Ctx): Promise<Response> {
  if (ctx.request.method === 'POST') return onRequestPost(ctx);
  if (ctx.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } });
  }
  return json({ ok: false, error: 'method_not_allowed' }, 405, { Allow: 'POST, OPTIONS' });
}
