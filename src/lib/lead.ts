/**
 * Shared lead logic — used by the Cloudflare Pages Function (functions/api/lead.ts)
 * and unit tests. Pure TypeScript: no Node or Astro APIs.
 */
import {
  qualifyLead,
  BUDGET_LABELS,
  TIMELINE_LABELS,
  STAND_SIZE_LABELS,
  type BudgetBand,
  type TimelineBand,
  type StandSizeBand,
  type Qualification,
} from './qualify';
import { getShowBySlug, formatShowDates } from '../data/shows';

export const STAND_TYPES = ['shell', 'space', 'custom', 'unsure'] as const;
export type StandType = (typeof STAND_TYPES)[number];
export const STAND_TYPE_LABELS: Record<StandType, string> = {
  shell: 'Shell scheme',
  space: 'Space only',
  custom: 'Custom build',
  unsure: 'Unsure',
};
const DESIGN_ASSETS = ['', 'yes', 'partial', 'no'] as const;

const BUDGETS = Object.keys(BUDGET_LABELS) as BudgetBand[];
const TIMELINES = Object.keys(TIMELINE_LABELS) as TimelineBand[];
const SIZES = Object.keys(STAND_SIZE_LABELS) as StandSizeBand[];

/** Name of the hidden honeypot input. Humans never see or fill it. */
export const HONEYPOT_FIELD = 'company_fax';
/** Minimum ms between form render and submit before we suspect a bot */
export const MIN_FILL_MS = 2500;

export interface LeadInput {
  fullName: string;
  email: string;
  phone: string;
  company: string;
  website: string;
  targetShow: string;
  otherShow: string;
  showCity: string;
  standSize: StandSizeBand;
  standType: StandType;
  budget: BudgetBand;
  timeline: TimelineBand;
  designAssets: string;
  message: string;
  heardAbout: string;
  consent: boolean;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  pageUrl: string;
}

export interface Lead extends LeadInput {
  id: string;
  showName: string;
  showStartDate: string | null;
  showDates: string | null;
  showVenue: string | null;
  showOfficialSite: string | null;
  qualification: Qualification;
  score: number;
  qualifyReasons: string[];
  qualified: boolean;
  submittedAt: string;
  ip?: string;
  country?: string;
  userAgent?: string;
}

export type FieldErrors = Partial<Record<keyof LeadInput | 'form', string>>;

const str = (v: unknown, max = 500): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : '';

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
const URL_RE = /^https?:\/\/[^\s<>"]+\.[^\s<>"]+$/i;

export function isTruthy(v: unknown): boolean {
  return v === true || v === 'true' || v === 'on' || v === '1' || v === 'yes';
}

export interface ValidationResult {
  ok: boolean;
  errors: FieldErrors;
  data?: LeadInput;
}

/** Validate and normalise an untrusted payload (JSON or form-encoded → object). */
export function validateLead(raw: Record<string, unknown>): ValidationResult {
  const errors: FieldErrors = {};
  const d: LeadInput = {
    fullName: str(raw.fullName, 120),
    email: str(raw.email, 200).toLowerCase(),
    phone: str(raw.phone, 40),
    company: str(raw.company, 160),
    website: str(raw.website, 300),
    targetShow: str(raw.targetShow, 120),
    otherShow: str(raw.otherShow, 160),
    showCity: str(raw.showCity, 200),
    standSize: str(raw.standSize, 10) as StandSizeBand,
    standType: str(raw.standType, 10) as StandType,
    budget: str(raw.budget, 12) as BudgetBand,
    timeline: str(raw.timeline, 12) as TimelineBand,
    designAssets: str(raw.designAssets, 10),
    message: str(raw.message, 4000),
    heardAbout: str(raw.heardAbout, 200),
    consent: isTruthy(raw.consent),
    utm_source: str(raw.utm_source, 100),
    utm_medium: str(raw.utm_medium, 100),
    utm_campaign: str(raw.utm_campaign, 100),
    pageUrl: str(raw.pageUrl, 500),
  };

  if (d.fullName.length < 2) errors.fullName = 'Enter your full name';
  if (!d.email) errors.email = 'Enter a work email';
  else if (!EMAIL_RE.test(d.email)) errors.email = 'Enter a valid email address';
  const digits = d.phone.replace(/\D/g, '');
  if (!d.phone) errors.phone = 'Enter a phone number';
  else if (digits.length < 8 || digits.length > 15 || /[^\d\s()+.-]/.test(d.phone))
    errors.phone = 'Enter a valid phone number';
  if (d.company.length < 2) errors.company = 'Enter your company name';
  if (d.website && !URL_RE.test(d.website)) errors.website = 'Include http:// or https://';
  if (!d.targetShow) errors.targetShow = 'Select a target show';
  else if (d.targetShow === 'other') {
    if (d.otherShow.length < 2) errors.otherShow = 'Name the show or event';
  } else if (!getShowBySlug(d.targetShow)) {
    errors.targetShow = 'Select a show from the list';
  }
  if (!SIZES.includes(d.standSize)) errors.standSize = 'Select stand size';
  if (!STAND_TYPES.includes(d.standType)) errors.standType = 'Select stand type';
  if (!BUDGETS.includes(d.budget)) errors.budget = 'Select a budget range';
  if (!TIMELINES.includes(d.timeline)) errors.timeline = 'Select a timeline';
  if (!(DESIGN_ASSETS as readonly string[]).includes(d.designAssets)) d.designAssets = '';
  if (!d.consent) errors.consent = 'Consent is required to send your brief';

  const ok = Object.keys(errors).length === 0;
  return ok ? { ok, errors, data: d } : { ok, errors };
}

export interface SpamVerdict {
  spam: boolean;
  reason?: string;
}

/**
 * Cheap, privacy-friendly spam heuristics. Bots get a fake "ok" response
 * (so they don't retry), humans never trip these in practice.
 */
export function checkSpam(raw: Record<string, unknown>, now = Date.now()): SpamVerdict {
  if (str(raw[HONEYPOT_FIELD])) return { spam: true, reason: 'honeypot' };
  const started = Number(raw.formStartedAt);
  if (Number.isFinite(started) && started > 0 && now - started < MIN_FILL_MS)
    return { spam: true, reason: 'too-fast' };
  const text = [raw.message, raw.fullName, raw.company, raw.heardAbout, raw.otherShow]
    .map((v) => str(v, 5000))
    .join(' ');
  const links = (text.match(/https?:\/\/|www\./gi) || []).length;
  if (links > 3) return { spam: true, reason: 'too-many-links' };
  if (/\[url=|<a\s+href|\[link=/i.test(text)) return { spam: true, reason: 'markup' };
  if (/\b(viagra|cialis|casino|crypto ?airdrop|seo services|backlinks?)\b/i.test(text))
    return { spam: true, reason: 'keywords' };
  if (str(raw.fullName) && /https?:\/\//i.test(str(raw.fullName)))
    return { spam: true, reason: 'url-in-name' };
  return { spam: false };
}

export function buildLead(
  d: LeadInput,
  meta: { ip?: string; country?: string; userAgent?: string; now?: Date } = {}
): Lead {
  const now = meta.now ?? new Date();
  const show = d.targetShow !== 'other' ? getShowBySlug(d.targetShow) : undefined;
  const q = qualifyLead({
    budget: d.budget,
    timeline: d.timeline,
    standSize: d.standSize,
    showStartDate: show?.startDate ?? null,
    asOf: now,
  });
  const id =
    'L' +
    now.toISOString().replace(/[-:TZ.]/g, '').slice(2, 14) +
    '-' +
    Math.random().toString(36).slice(2, 6).toUpperCase();
  return {
    ...d,
    id,
    showName: show ? show.name : d.otherShow || 'Other / not listed',
    showStartDate: show?.startDate ?? null,
    showDates: show ? formatShowDates(show) : null,
    showVenue: show ? `${show.venue}, ${show.city}` : d.showCity || null,
    showOfficialSite: show?.officialSite ?? null,
    qualification: q.qualification,
    score: q.score,
    qualifyReasons: q.reasons,
    qualified: q.qualification === 'hot',
    submittedAt: now.toISOString(),
    ip: meta.ip,
    country: meta.country,
    userAgent: meta.userAgent,
  };
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function leadSubject(lead: Lead): string {
  return `[Stand lead · ${lead.qualification.toUpperCase()}] ${lead.company} — ${lead.showName} — ${
    BUDGET_LABELS[lead.budget]
  }`.slice(0, 250);
}

function leadRows(lead: Lead): [string, string][] {
  return [
    ['Qualification', `${lead.qualification.toUpperCase()} (score ${lead.score})`],
    ['Why', lead.qualifyReasons.join('; ')],
    ['Name', lead.fullName],
    ['Email', lead.email],
    ['Phone', lead.phone],
    ['Company', lead.company],
    ['Website', lead.website || '—'],
    ['Show', lead.showName],
    ['Show dates', lead.showDates || '—'],
    ['City / venue', lead.showVenue || lead.showCity || '—'],
    ['Official site', lead.showOfficialSite || '—'],
    ['Stand size', STAND_SIZE_LABELS[lead.standSize]],
    ['Stand type', STAND_TYPE_LABELS[lead.standType]],
    ['Budget', BUDGET_LABELS[lead.budget]],
    ['Timeline', TIMELINE_LABELS[lead.timeline]],
    ['Design assets', lead.designAssets || '—'],
    ['Heard about us', lead.heardAbout || '—'],
    ['UTM', [lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(' / ') || '—'],
    ['Page', lead.pageUrl || '—'],
    ['Submitted', lead.submittedAt],
    ['Lead ID', lead.id],
  ];
}

export function leadText(lead: Lead): string {
  const rows = leadRows(lead).map(([k, v]) => `${k}: ${v}`);
  return [
    'New exhibition stand brief — tradeshowstands.com.au',
    '',
    ...rows,
    '',
    'Message / goals:',
    lead.message || '—',
    '',
    'Reply directly to this email to contact the exhibitor.',
  ].join('\n');
}

export function leadHtml(lead: Lead): string {
  const colour =
    lead.qualification === 'hot' ? '#b4471f' : lead.qualification === 'warm' ? '#8a6d1f' : '#6b6458';
  const rows = leadRows(lead)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6b6458;font:12px/1.4 monospace;text-transform:uppercase;letter-spacing:.06em;vertical-align:top;white-space:nowrap">${esc(
          k
        )}</td><td style="padding:6px 0;font:15px/1.45 Georgia,serif;color:#1b1a17">${esc(v)}</td></tr>`
    )
    .join('');
  return `<!doctype html><html><body style="margin:0;background:#f3efe6;padding:24px">
<div style="max-width:640px;margin:0 auto;background:#fbf9f4;border:1px solid #d6cdbd;border-top:3px solid ${colour};padding:24px">
<p style="margin:0 0 4px;font:12px monospace;letter-spacing:.1em;text-transform:uppercase;color:${colour}">${esc(
    lead.qualification.toUpperCase()
  )} lead · score ${lead.score}</p>
<h1 style="margin:0 0 16px;font:400 24px/1.2 Georgia,serif;color:#1b1a17">${esc(lead.company)} — ${esc(lead.showName)}</h1>
<table style="border-collapse:collapse;width:100%">${rows}</table>
<h2 style="margin:20px 0 6px;font:12px monospace;letter-spacing:.1em;text-transform:uppercase;color:#6b6458">Message / goals</h2>
<p style="margin:0;font:15px/1.5 Georgia,serif;color:#1b1a17;white-space:pre-wrap">${esc(lead.message || '—')}</p>
<p style="margin:20px 0 0;font:12px/1.4 sans-serif;color:#6b6458">Reply to this email to contact ${esc(
    lead.fullName
  )} directly. Sent from the stand brief form on tradeshowstands.com.au.</p>
</div></body></html>`;
}

/** Payload for LEAD_WEBHOOK_URL (Slack/Make/n8n/Zapier/CRM) */
export function webhookPayload(lead: Lead): Record<string, unknown> {
  const { ip: _ip, userAgent: _ua, ...rest } = lead;
  return {
    type: 'stand_brief',
    source: 'tradeshowstands.com.au',
    text: leadSubject(lead), // Slack-compatible summary line
    lead: rest,
  };
}
