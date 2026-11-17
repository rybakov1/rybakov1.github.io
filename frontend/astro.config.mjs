import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';
const staticBuild = process.env.EXPORT_STATIC === '1';
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'http://localhost:3000',
  output: staticBuild ? 'static' : 'server',
  adapter: staticBuild ? undefined : node({ mode: 'standalone' }),
  integrations: [react()],
  server: { host: true, port: 3000 },
  vite: { envPrefix: ['PUBLIC_'] },
});
