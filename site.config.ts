/**
 * SITE CONFIG — AU Trade Stands (Brijnco lead-gen)
 */
/**
 * SITE CONFIG — Trade Show Stands (tradeshowstands.com.au)
 * Lead-gen calendar for Australian exhibitors; enquiries routed to Brijnco.
 *
 * Secrets (Resend key, lead inbox) live in Cloudflare Pages env vars — NOT here.
 * See .env.example, README.md and DEPLOY.md.
 */
export const siteConfig = {
  name: 'AU Trade Shows',
  /** Wordmark parts — the mark already says AU, so the name does not repeat it */
  wordmark: { mark: 'AU', name: 'Trade Shows' },
  tagline: 'Australian trade shows & exhibition stand briefs',
  domain: 'https://autradeshows.com',
  /**
   * Google Search Console HTML-tag verification.
   * Paste only the content value, then rebuild. Leave '' until Search Console issues one.
   */
  googleSiteVerification: '',
  language: 'en',
  locale: 'en-AU',
  geo: 'AU',
  niche:
    'Independent calendar of Australian trade shows and a free exhibition stand brief for exhibitors',
  /** Operator / publisher (soft brand) */
  author: 'Brijnco',
  /**
   * Public contact address shown on Privacy page.
   * PLACEHOLDER until the domain + mailbox exist. Set to '' to hide.
   */
  contactEmail: 'hello@autradeshows.com',
  contactEmailIsPlaceholder: true,
  /** Soft brand line in footer — do not oversell */
  poweredByNote:
    'An independent show calendar. Stand enquiries are handled by Brijnco, an Australian exhibition stand builder.',

  /**
   * Lead routing.
   * Production: the form POSTs JSON to `endpoint` (Cloudflare Pages Function
   * functions/api/lead.ts), which emails via Resend using env vars
   * RESEND_API_KEY / LEAD_TO_EMAIL / LEAD_CC_EMAIL and optionally posts to LEAD_WEBHOOK_URL.
   */
  leads: {
    endpoint: '/api/lead',
    /**
     * mailto fallback — used ONLY when the endpoint is unreachable (404/network),
     * e.g. `astro dev` / `astro preview` without Functions. Placeholder address:
     * replace once the sister's lead inbox is known (also set LEAD_TO_EMAIL env).
     */
    mailtoFallbackEmail: 'LEADS-INBOX-TBC@brijnco.example',
    mailtoFallbackEnabled: true,
    /** Only allow the mailto fallback on these hosts (local dev / preview) */
    mailtoFallbackHosts: ['localhost', '127.0.0.1'],
  },

  /**
   * Analytics — OFF by default. Set provider to 'plausible' or 'ga4' (or use
   * PUBLIC_ANALYTICS_PROVIDER / PUBLIC_PLAUSIBLE_DOMAIN / PUBLIC_GA4_ID at build time).
   * Fires a "Lead" event on successful brief submission.
   */
  analytics: {
    provider: 'none' as 'none' | 'plausible' | 'ga4',
    plausible: {
      domain: 'autradeshows.com',
      scriptSrc: 'https://plausible.io/js/script.js',
    },
    ga4: {
      measurementId: '', // e.g. 'G-XXXXXXXXXX'
    },
  },

  ads: {
    /** Off for launch — no ad network configured. */
    enabled: false,
    showPlaceholderLabel: true,
    slots: {
      bannerTop: {
        id: 'ad-banner-top',
        format: 'banner' as const,
        sizes: ['728x90', '320x50'],
      },
      inContent: {
        id: 'ad-in-content',
        format: 'in-content' as const,
        sizes: ['300x250', '336x280'],
      },
      bannerBottom: {
        id: 'ad-banner-bottom',
        format: 'banner' as const,
        sizes: ['728x90', '320x50'],
      },
    },
  },

  nav: [
    { href: '/', label: 'Home' },
    { href: '/shows', label: 'Shows' },
    { href: '/exhibition-stand-builders', label: 'Guide' },
    { href: '/stand-brief', label: 'Stand brief' },
  ],

  /** Internal "further reading" links shown on the home page */
  relatedTools: [
    {
      title: 'Exhibition stand builders — the guide',
      href: '/exhibition-stand-builders',
      description: 'Stand types, what drives cost, and how to brief a builder in Sydney, Melbourne and beyond.',
    },
    {
      title: 'Sydney trade shows',
      href: '/shows/city/sydney',
      description: 'ICC Sydney and Sydney Showground listings through 2027.',
    },
    {
      title: 'Melbourne trade shows',
      href: '/shows/city/melbourne',
      description: 'MCEC, Melbourne Showgrounds and Royal Exhibition Building listings.',
    },
  ],

  faq: [
    {
      question: 'Are you an official trade show organiser?',
      answer:
        '<strong>No.</strong> AU Trade Shows is an independent calendar and stand-brief tool. We are not affiliated with any show organiser or venue. Always confirm dates, booths and exhibitor rules on the show’s official website.',
    },
    {
      question: 'What happens when I submit a stand brief?',
      answer:
        'Your enquiry is passed to <strong>Brijnco</strong>, an Australian exhibition stand builder (NSW-focused), so they can follow up about shell scheme, space-only, or custom builds. We do not sell stands on this site.',
    },
    {
      question: 'Is the show list complete?',
      answer:
        'No — it is a curated set of Australian trade and industry shows, each checked against the organiser’s website. Listings still marked “Verify” have a detail the organiser has not yet confirmed. Treat the calendar as a planning aid and confirm with the organiser before budgeting or booking.',
    },
    {
      question: 'Do you charge exhibitors for the brief?',
      answer:
        'Submitting a brief is free. Any commercial proposal comes directly from the stand builder after they review your requirements.',
    },
  ],
} as const;

export type SiteConfig = typeof siteConfig;
export type AdSlotKey = keyof typeof siteConfig.ads.slots;
