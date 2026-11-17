import type { APIRoute } from 'astro';
import {getProducts} from '../../lib/data';
export const GET:APIRoute=async()=>{
  const origin=(import.meta.env.PUBLIC_SITE_URL||'http://localhost:3000').replace(/\/$/,'');
  const entries:string[]=[];
  if(import.meta.env.PUBLIC_INDEXABLE==='true'){
    entries.push('/','/catalog/','/methodology/');
    const items=(await getProducts()).filter(p=>!p.is_demo&&!p.record_type&&p.price!=null&&p.history.length>=14);
    items.forEach(p=>entries.push(`/product/${p.slug}/`));
    ['ssd','ram','gpu'].forEach(category=>{if(items.filter(p=>p.category===category).length>=3)entries.push(`/category/${category}/`);});
  }
  const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(path=>`<url><loc>${escape(origin+path)}</loc></url>`).join('')}</urlset>`,{headers:{'Content-Type':'application/xml; charset=utf-8'}});
};
