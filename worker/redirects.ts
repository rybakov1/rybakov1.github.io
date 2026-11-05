/**
 * One permanent redirect per request: https apex, legacy aliases, then a
 * trailing slash. Cloudflare's html_handling redirect is a 307, so the Worker
 * owns this instead (wrangler.toml → html_handling = "none").
 */
const APEX = 'autradeshows.com';

const ALIASES: Record<string, string> = {
  '/contact': '/about/#contact',
  '/builders': '/exhibition-stand-builders/',
  '/guide': '/exhibition-stand-builders/',
};

function barePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

function isFile(pathname: string): boolean {
  const last = pathname.split('/').pop() ?? '';
  return last.includes('.');
}

/** Absolute Location, or null when the request should be served as-is. */
export function permanentTarget(input: URL, scheme: 'http' | 'https'): string | null {
  const url = new URL(input.href);
  const host = url.hostname.toLowerCase();
  const onSite = host === APEX || host === `www.${APEX}`;
  if (onSite && (scheme === 'http' || host === `www.${APEX}`)) {
    url.protocol = 'https:';
    url.hostname = APEX;
  }

  const bare = barePath(url.pathname);
  const alias = ALIASES[bare];
  if (alias) {
    const target = new URL(alias, url.origin);
    return target.href === input.href ? null : target.href;
  }

  if (bare === '/api/lead' || bare.startsWith('/api/')) {
    return url.href === input.href ? null : url.href;
  }

  if (!isFile(url.pathname) && url.pathname !== '/' && !url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`;
  }

  return url.href === input.href ? null : url.href;
}
