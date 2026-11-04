/**
 * Series we follow whose next edition is not on the calendar yet.
 * `npm run shows:review` prints this list. Open the official page.
 * Add an object to shows.ts only after that page publishes dates and a venue.
 * Do not copy dates from directories (EventsEye, 10times, Showseye).
 */

export interface WatchItem {
  name: string;
  officialSite: string;
  note: string;
}

export const watchlist: WatchItem[] = [
  {
    name: 'Roads & Traffic AU',
    officialSite: 'https://www.terrapinn.com/exhibition/roads-traffic-au/index.stm',
    note: '2026 edition (14–15 Oct, ICC Sydney) has ended. Terrapinn has not published 2027 dates.',
  },
  {
    name: 'MOVE AU',
    officialSite: 'https://www.terrapinn.com/exhibition/move-au/index.stm',
    note: 'Co-located with Roads & Traffic AU. 2027 dates are not on the organiser site yet.',
  },
  {
    name: 'Adelaide 4WD & Adventure Show',
    officialSite: 'https://adelaide.4wdshow.com.au/visitors/event-info/',
    note: 'The official page still describes 23–25 October 2026 at Adelaide Showground. Add 2027 only when that page changes.',
  },
];
