/**
 * Every request hits this script first so plain HTTP, www and a missing
 * trailing slash can 301 before the static asset is served.
 * See wrangler.toml → run_worker_first. html_handling is "none" so the
 * asset layer does not add a 307; this script 301s and then reads index.html.
 */
import { onRequest, type Env } from '../functions/api/lead';
import { permanentTarget } from './redirects';

interface WorkerEnv extends Env {
  ASSETS: { fetch(input: Request): Promise<Response> };
}

function visitorScheme(request: Request): 'http' | 'https' {
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
    const scheme = visitorScheme(request);
    const target = permanentTarget(url, scheme);
    if (target) {
      return new Response(null, { status: 301, headers: { Location: target } });
    }

    if (url.pathname.endsWith('/index.html')) {
      url.pathname = url.pathname.slice(0, -'index.html'.length) || '/';
      return new Response(null, { status: 301, headers: { Location: url.toString() } });
    }

    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === '/api/lead') {
      return onRequest({ request, env, waitUntil: (promise) => ctx.waitUntil(promise) });
    }

    const assetUrl = new URL(request.url);
    const last = assetUrl.pathname.split('/').pop() ?? '';
    if (!last.includes('.') && assetUrl.pathname.endsWith('/')) {
      assetUrl.pathname = `${assetUrl.pathname}index.html`;
    }
    const assetRequest = new Request(assetUrl.toString(), {
      method: request.method,
      headers: request.headers,
      redirect: 'manual',
    });
    return env.ASSETS.fetch(assetRequest);
  },
};
