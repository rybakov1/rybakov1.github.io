/**
 * Monthly calendar check. No external API — the catalogue is hand-maintained.
 *
 *   npm run shows:review
 *
 * Exit code 1 when any listed show has already ended, so a stale calendar
 * is obvious before you deploy.
 */
import { register } from 'node:module';

register(new URL('./resolve-ts-hook.mjs', import.meta.url));

const { shows } = await import('../src/data/shows.ts');
const { watchlist } = await import('../src/data/watchlist.ts');
const { cities, industries } = await import('../src/data/taxonomy.ts');

const STALE_DAYS = 90;
const today = new Date().toISOString().slice(0, 10);
const cityNames = new Set(cities.map((c) => c.name));
const industrySlugs = new Set(industries.map((i) => i.slug));

const ageDays = (iso) => {
  const then = new Date(iso + 'T12:00:00Z').getTime();
  const now = new Date(today + 'T12:00:00Z').getTime();
  return Math.round((now - then) / 86400000);
};

const past = shows.filter((s) => s.endDate < today);
const illustrative = shows.filter((s) => s.illustrative);
const stale = shows.filter((s) => !s.illustrative && ageDays(s.verifiedOn) > STALE_DAYS);
const slugs = new Set();
const problems = [];

for (const show of shows) {
  if (slugs.has(show.slug)) problems.push(`duplicate slug: ${show.slug}`);
  slugs.add(show.slug);
  if (!cityNames.has(show.city)) problems.push(`${show.slug}: unknown city “${show.city}”`);
  for (const cat of show.categories) {
    if (!industrySlugs.has(cat)) problems.push(`${show.slug}: unknown category “${cat}”`);
  }
  if (show.startDate > show.endDate) problems.push(`${show.slug}: startDate is after endDate`);
  if (show.illustrative && !show.flagNote) problems.push(`${show.slug}: illustrative without flagNote`);
  if (!show.officialSite) problems.push(`${show.slug}: no officialSite`);
}

const line = (show) =>
  `  ${show.startDate} → ${show.endDate}  ${show.name}  (${show.city})  checked ${show.verifiedOn}`;

console.log(`Trade show calendar — ${today}`);
console.log(`${shows.length} listed, ${shows.length - illustrative.length} verified, ${illustrative.length} flagged`);
console.log('');

console.log(past.length ? `PAST — delete these from src/data/shows.ts (${past.length})` : 'PAST — none');
for (const show of past) console.log(line(show));
console.log('');

console.log(
  stale.length
    ? `RE-CHECK — verifiedOn older than ${STALE_DAYS} days (${stale.length})`
    : `RE-CHECK — nothing older than ${STALE_DAYS} days`,
);
for (const show of stale) console.log(`${line(show)}  (${ageDays(show.verifiedOn)}d)`);
console.log('');

console.log(
  illustrative.length
    ? `UNCONFIRMED — badge “Verify” on the site (${illustrative.length})`
    : 'UNCONFIRMED — none',
);
for (const show of illustrative) console.log(`${line(show)}\n    ${show.flagNote}`);
console.log('');

console.log(`WATCHLIST — next edition not published yet (${watchlist.length})`);
console.log('Open the official page. Add a show only when that page has dates and a venue.');
for (const item of watchlist) {
  console.log(`  ${item.name}`);
  console.log(`    ${item.officialSite}`);
  console.log(`    ${item.note}`);
}
console.log('');

if (problems.length) {
  console.log(`DATA PROBLEMS (${problems.length})`);
  for (const problem of problems) console.log(`  ${problem}`);
  console.log('');
}

console.log('To add a show: copy a nearby object in src/data/shows.ts.');
console.log('Set verifiedOn to today. city must match taxonomy.ts. categories must be industry slugs.');
console.log('If the organiser has announced the show but not the venue, set illustrative: true and a flagNote.');
console.log('Then remove the series from src/data/watchlist.ts.');

process.exit(past.length || problems.length ? 1 : 0);
