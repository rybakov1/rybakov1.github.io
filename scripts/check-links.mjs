// Verifies every internal href/src in dist/ resolves to a built file (clean URLs, build.format=file).
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') && files.push(p);
  }
})(DIST);

const resolve = (href) => {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean || clean === '/') return existsSync(join(DIST, 'index.html'));
  const p = join(DIST, clean);
  return existsSync(p) || existsSync(p + '.html') || existsSync(join(p, 'index.html'));
};

const ignore = new Set(['/api/lead']);
let bad = 0;
let checked = 0;
for (const f of files) {
  const html = readFileSync(f, 'utf8');
  for (const m of html.matchAll(/\s(?:href|src|action)="(\/[^"]*)"/g)) {
    const href = m[1];
    if (href.startsWith('//') || ignore.has(href.split('?')[0])) continue;
    checked++;
    if (!resolve(href)) {
      bad++;
      console.log(`BROKEN  ${relative(DIST, f)} → ${href}`);
    }
  }
}
console.log(`${files.length} pages, ${checked} internal links checked, ${bad} broken`);
process.exit(bad ? 1 : 0);
