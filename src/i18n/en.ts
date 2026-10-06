export const en = {
  skipToContent: 'Skip to content',
  home: 'Home',
  privacy: 'Privacy',
  cookies: 'Cookies',
  relatedTools: 'Related',
  faq: 'Frequently asked questions',
  adLabel: 'Advertisement',
  adPlaceholder: 'Ad',
  estimateDisclaimer:
    'Independent calendar — not an official show organiser. Confirm dates and exhibitor rules on each show’s own site.',
  lastUpdated: 'Last updated',
  poweredBy: 'Built for Brijnco lead capture',
  cookieStubTitle: 'Cookie policy',
  privacyStubTitle: 'Privacy policy',
  calculate: 'Submit',
  reset: 'Reset',
  result: 'Result',
  shows: 'Shows',
  standBrief: 'Stand brief',
  requestBrief: 'Request a stand brief',
  browseShows: 'Browse shows',
  thanks: 'Thank you',
} as const;

export type Strings = typeof en;

export function t(): Strings {
  return en;
}
