// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { siteConfig } from './site.config.ts';

// https://astro.build/config
export default defineConfig({
  site: siteConfig.domain, // https://rybakov1.github.io
  // GitHub Pages serves each route as a folder with index.html (/shows/ → shows/index.html).
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [
    sitemap({
      filter: (page) => !/\/(thanks|contact)(\/|$)/.test(page),
      changefreq: 'weekly',
      lastmod: new Date(),
    }),
  ],
});
