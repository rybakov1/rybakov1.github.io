/**
 * Static assets stay on the asset worker. Only /api/* reaches this script
 * (see wrangler.toml → run_worker_first).
 */
import { onRequest, type Env } from '../functions/api/lead';

interface WorkerEnv extends Env {
  ASSETS: { fetch(input: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (path === '/api/lead') {
      return onRequest({ request, env, waitUntil: (promise) => ctx.waitUntil(promise) });
    }
    return env.ASSETS.fetch(request);
  },
};
