import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { onRequest, onRequestPost, _resetRateLimit, type Env } from '../functions/api/lead';
import { validateLead, checkSpam, buildLead, HONEYPOT_FIELD } from '../src/lib/lead';
import { shows } from '../src/data/shows';

const upcoming = shows.find((s) => s.startDate > new Date().toISOString().slice(0, 10))!;

const valid = () => ({
  fullName: 'Jane Exhibitor',
  email: 'jane@example.com.au',
  phone: '0412 345 678',
  company: 'Acme Pty Ltd',
  website: 'https://acme.example',
  targetShow: upcoming.slug,
  otherShow: '',
  showCity: '',
  standSize: '36-54',
  standType: 'custom',
  budget: '80k+',
  timeline: 'ready',
  designAssets: 'partial',
  message: 'Need a custom stand with a meeting room.',
  heardAbout: 'Google',
  consent: true,
  formStartedAt: Date.now() - 60_000,
  utm_source: 'test',
});

const ENV: Env = {
  RESEND_API_KEY: 're_test_123',
  LEAD_TO_EMAIL: 'leads@example.com',
  LEAD_CC_EMAIL: 'cc@example.com',
};

function req(body: unknown, opts: { ip?: string; origin?: string; type?: string; method?: string } = {}) {
  const type = opts.type ?? 'application/json';
  const payload =
    typeof body === 'string'
      ? body
      : type.includes('json')
        ? JSON.stringify(body)
        : new URLSearchParams(body as Record<string, string>).toString();
  const headers: Record<string, string> = { 'content-type': type, 'cf-connecting-ip': opts.ip ?? '203.0.113.7' };
  if (opts.origin) headers.origin = opts.origin;
  return new Request('https://tradeshowstands.com.au/api/lead', {
    method: opts.method ?? 'POST',
    headers,
    body: opts.method === 'GET' ? undefined : payload,
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  _resetRateLimit();
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('resend')) return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
    return new Response('ok', { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('validateLead', () => {
  it('accepts a complete brief', () => {
    expect(validateLead(valid()).ok).toBe(true);
  });
  it('flags missing and malformed fields', () => {
    const r = validateLead({ ...valid(), email: 'nope', phone: 'abc', consent: false, budget: 'lots', targetShow: 'made-up' });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(['budget', 'consent', 'email', 'phone', 'targetShow']);
  });
  it('requires otherShow when targetShow=other', () => {
    expect(validateLead({ ...valid(), targetShow: 'other' }).errors.otherShow).toBeTruthy();
    expect(validateLead({ ...valid(), targetShow: 'other', otherShow: 'Hobart Expo' }).ok).toBe(true);
  });
});

describe('checkSpam', () => {
  it('catches honeypot, speed and link spam', () => {
    expect(checkSpam({ ...valid(), [HONEYPOT_FIELD]: 'x' }).reason).toBe('honeypot');
    expect(checkSpam({ ...valid(), formStartedAt: Date.now() - 500 }).reason).toBe('too-fast');
    expect(checkSpam({ ...valid(), message: 'http://a http://b http://c http://d' }).reason).toBe('too-many-links');
    expect(checkSpam(valid()).spam).toBe(false);
  });
});

describe('qualification', () => {
  it('scores a big, ready brief for a near show as hot (server-side)', () => {
    const v = validateLead(valid());
    const lead = buildLead(v.data!, { now: new Date(new Date(upcoming.startDate).getTime() - 30 * 864e5) });
    expect(lead.qualification).toBe('hot');
  });
  it('scores a small researching brief as cold', () => {
    const v = validateLead({ ...valid(), budget: '<15k', timeline: 'researching', standSize: '<18', targetShow: 'other', otherShow: 'X Expo' });
    expect(buildLead(v.data!).qualification).toBe('cold');
  });
});

describe('POST /api/lead', () => {
  it('emails via Resend and returns JSON with qualification + redirect', async () => {
    const res = await onRequestPost({ request: req(valid()), env: ENV });
    expect(res.status).toBe(200);
    const out = (await res.json()) as Record<string, any>;
    expect(out.ok).toBe(true);
    expect(['hot', 'warm', 'cold']).toContain(out.qualification);
    expect(out.redirect).toMatch(/^\/thanks\?q=/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_test_123');
    const sent = JSON.parse(init.body);
    expect(sent.to).toEqual(['leads@example.com']);
    expect(sent.cc).toEqual(['cc@example.com']);
    expect(sent.reply_to).toBe('jane@example.com.au');
    expect(sent.subject).toContain('Acme Pty Ltd');
    expect(sent.html).toContain('Jane Exhibitor');
  });

  it('also posts to LEAD_WEBHOOK_URL when set', async () => {
    const res = await onRequestPost({
      request: req(valid()),
      env: { ...ENV, LEAD_WEBHOOK_URL: 'https://hooks.example/lead', LEAD_WEBHOOK_SECRET: 's3cret' },
    });
    expect(res.status).toBe(200);
    const hook = fetchMock.mock.calls.find((c) => String(c[0]).includes('hooks.example'))!;
    expect(hook[1].headers['X-Lead-Secret']).toBe('s3cret');
    const body = JSON.parse(hook[1].body);
    expect(body.lead.company).toBe('Acme Pty Ltd');
    expect(body.lead.ip).toBeUndefined();
  });

  it('succeeds with webhook only (no Resend)', async () => {
    const res = await onRequestPost({ request: req(valid()), env: { LEAD_WEBHOOK_URL: 'https://hooks.example/lead' } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).delivered).toEqual({ email: false, webhook: true });
  });

  it('returns 422 with field errors for invalid input', async () => {
    const res = await onRequestPost({ request: req({ ...valid(), email: 'bad' }), env: ENV });
    expect(res.status).toBe(422);
    const out = (await res.json()) as any;
    expect(out.fields.email).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('silently drops honeypot spam with a fake 200', async () => {
    const res = await onRequestPost({ request: req({ ...valid(), [HONEYPOT_FIELD]: 'bot' }), env: ENV });
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rate-limits after 5 briefs per IP', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await onRequestPost({ request: req(valid(), { ip: '198.51.100.1' }), env: ENV })).status).toBe(200);
    }
    expect((await onRequestPost({ request: req(valid(), { ip: '198.51.100.1' }), env: ENV })).status).toBe(429);
    expect((await onRequestPost({ request: req(valid(), { ip: '198.51.100.2' }), env: ENV })).status).toBe(200);
  });

  it('rejects foreign origins', async () => {
    const res = await onRequestPost({ request: req(valid(), { origin: 'https://evil.example' }), env: ENV });
    expect(res.status).toBe(403);
  });

  it('returns 503 when no delivery is configured', async () => {
    const res = await onRequestPost({ request: req(valid()), env: {} });
    expect(res.status).toBe(503);
  });

  it('treats the placeholder inbox as unconfigured (503, no send)', async () => {
    const res = await onRequestPost({
      request: req(valid()),
      env: { RESEND_API_KEY: 're_test', LEAD_TO_EMAIL: 'LEADS-INBOX-TBC@brijnco.example' },
    });
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 502 when Resend fails and there is no webhook', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"message":"bad key"}', { status: 401 }));
    const res = await onRequestPost({ request: req(valid()), env: ENV });
    expect(res.status).toBe(502);
  });

  it('handles no-JS form posts with a 303 redirect', async () => {
    const form = Object.fromEntries(Object.entries(valid()).map(([k, v]) => [k, String(v)]));
    form.consent = 'on';
    const res = await onRequestPost({ request: req(form, { type: 'application/x-www-form-urlencoded' }), env: ENV });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(/^\/thanks\?q=/);
  });

  it('rejects non-JSON garbage and other methods', async () => {
    expect((await onRequestPost({ request: req('{not json', {}), env: ENV })).status).toBe(400);
    expect((await onRequest({ request: req(null, { method: 'GET' }), env: ENV })).status).toBe(405);
  });
});
