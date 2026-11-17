import type { APIRoute } from 'astro';
export const prerender=true;
export const GET:APIRoute=()=>new Response(`User-agent: *\n${import.meta.env.PUBLIC_INDEXABLE==='true'?'Allow: /\nDisallow: /admin/\nDisallow: /tracking/\nDisallow: /*?':'Disallow: /'}\nSitemap: ${import.meta.env.PUBLIC_SITE_URL||'http://localhost:3000'}/sitemap.xml\n`,{headers:{'Content-Type':'text/plain; charset=utf-8'}});
