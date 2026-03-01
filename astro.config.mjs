import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://rybakov1.github.io',
  integrations: [
    tailwind(),
    sitemap(),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
  compressHTML: true,
});
