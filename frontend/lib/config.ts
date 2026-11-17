const env = import.meta.env;
function serverEnv(key: string): string | undefined {
  return typeof process !== 'undefined' ? process.env[key] : undefined;
}

export const SITE_NAME = env.PUBLIC_SITE_NAME || serverEnv('PUBLIC_SITE_NAME') || 'Ценоскоп';
export const SITE_URL = (env.PUBLIC_SITE_URL || serverEnv('PUBLIC_SITE_URL') || 'http://localhost:3000').replace(/\/$/, '');
export const API_BASE_URL = (env.API_BASE_URL || serverEnv('API_BASE_URL') || 'http://127.0.0.1:8000').replace(/\/$/, '');
export const PUBLIC_API_URL = (env.PUBLIC_API_URL || serverEnv('PUBLIC_API_URL') || 'http://localhost:8000').replace(/\/$/, '');
// Explicit API configuration means the service is authoritative; outages must never load a synthetic replacement.
export const HAS_CONFIGURED_API = Boolean(env.API_BASE_URL || serverEnv('API_BASE_URL') || env.PUBLIC_API_URL || serverEnv('PUBLIC_API_URL'));
// Offline demonstration is explicit; a failed API must not silently invent inventory.
export const ALLOW_DEMO_FALLBACK = (env.PUBLIC_DEMO_FALLBACK || serverEnv('PUBLIC_DEMO_FALLBACK')) === 'true';
export const siteConfig = {
  name: SITE_NAME,
  url: SITE_URL,
  description: 'Сравнивайте предложения, проверяйте историю цен и замечайте изменения в свежих отзывах.',
  apiBaseUrl: API_BASE_URL,
  publicApiUrl: PUBLIC_API_URL,
};
export default siteConfig;

export const PUBLIC_API_ENABLED = env.PUBLIC_API_ENABLED !== 'false';
