/**
 * Every request hits this script first so plain HTTP (and www) can redirect
 * before the static asset is served. See wrangler.toml → run_worker_first.
 */
import { onRequest, type Env } from '../functions/api/lead';

const APEX = 'autradeshows.com';

interface WorkerEnv extends Env {
  ASSETS: { fetch(input: Request): Promise<Response> };
}

function visitorScheme(request: Request): string {
  const raw = request.headers.get('cf-visitor');
  if (raw) {
    try {
      const scheme = (JSON.parse(raw) as { scheme?: string }).scheme;
      if (scheme === 'http' || scheme === 'https') return scheme;
    } catch {
      /* ignore malformed CF-Visitor */
    }
  }
  return new URL(request.url).protocol === 'http:' ? 'http' : 'https';
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const onSite = host === APEX || host === `www.${APEX}`;
    if (onSite && (visitorScheme(request) === 'http' || host === `www.${APEX}`)) {
      url.protocol = 'https:';
      url.hostname = APEX;
      return Response.redirect(url.toString(), 301);
    }

    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === '/api/lead') {
      return onRequest({ request, env, waitUntil: (promise) => ctx.waitUntil(promise) });
    }
    return env.ASSETS.fetch(request);
  },
};
