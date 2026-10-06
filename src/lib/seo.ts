/** JSON-LD builders. All URLs are absolute on the production domain. */
import { siteConfig } from '../../site.config';
import type { TradeShow } from '../data/shows';
import { getCityByName } from '../data/taxonomy';

export const abs = (path: string): string => new URL(path, siteConfig.domain).href;

export function organizationLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': abs('/#organization'),
    name: siteConfig.name,
    url: siteConfig.domain,
    logo: abs('/favicon.svg'),
    description: siteConfig.niche,
    areaServed: { '@type': 'Country', name: 'Australia' },
    parentOrganization: { '@type': 'Organization', name: siteConfig.author },
  };
}

export function websiteLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': abs('/#website'),
    name: siteConfig.name,
    url: siteConfig.domain,
    description: siteConfig.niche,
    inLanguage: siteConfig.locale,
    publisher: { '@id': abs('/#organization') },
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: abs(it.path),
    })),
  };
}

const STATUS: Record<string, string> = {
  scheduled: 'https://schema.org/EventScheduled',
  rescheduled: 'https://schema.org/EventRescheduled',
  postponed: 'https://schema.org/EventPostponed',
  cancelled: 'https://schema.org/EventCancelled',
};

export function eventLd(show: TradeShow): Record<string, unknown> {
  const city = getCityByName(show.city);
  const address: Record<string, string> = {
    '@type': 'PostalAddress',
    addressLocality: show.city,
    addressCountry: 'AU',
  };
  if (city) address.addressRegion = city.stateCode;
  if (show.venueAddress) address.streetAddress = show.venueAddress;
  if (show.postcode) address.postalCode = show.postcode;

  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: show.name,
    description: show.blurb,
    startDate: show.startDate,
    endDate: show.endDate,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: STATUS[show.eventStatus ?? 'scheduled'],
    location: {
      '@type': 'Place',
      name: show.venue,
      address,
    },
    image: [abs('/og-default.png')],
    // This page is an independent listing; the official site is the event's own URL.
    url: show.officialSite ?? abs(`/shows/${show.slug}`),
    mainEntityOfPage: abs(`/shows/${show.slug}`),
  };
  if (show.officialSite) {
    ld.organizer = {
      '@type': 'Organization',
      name: show.organiser ?? `${show.name} organisers`,
      url: show.officialSite,
    };
  }
  return ld;
}

export function itemListLd(shows: TradeShow[], name: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: shows.length,
    itemListElement: shows.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: abs(`/shows/${s.slug}`),
      name: s.name,
    })),
  };
}

export function faqLd(items: { question: string; answer: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.answer },
    })),
  };
}
