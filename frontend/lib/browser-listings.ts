import type { Product } from './types';
export type BrowserListing = Product & {visible:boolean};

/** Fetch admin moderation candidates without bundling the synthetic catalogue. */
export async function loadBrowserListings(baseUrl:string, token:string, fetcher:typeof fetch=fetch):Promise<BrowserListing[]> {
  const collected:BrowserListing[]=[];
  let total:number|undefined;
  for(let page=1;;page++){
    const response=await fetcher(`${baseUrl}/api/admin/browser-listings?page_size=100&page=${page}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('Каталог недоступен. Проверьте подключение API и обновите список.');
    const data=await response.json() as {items?:BrowserListing[];total?:number;page?:number;page_size?:number}|null;
    if(!data||!Array.isArray(data.items)||!Number.isSafeInteger(data.total)||data.total!<0||data.page!==page||data.page_size!==100||(total!==undefined&&data.total!==total))throw Error('Не удалось полностью загрузить каталог. Повторите попытку.');
    total=data.total;
    collected.push(...data.items);
    if(collected.length>total!)throw Error('Не удалось полностью загрузить каталог. Повторите попытку.');
    if(collected.length===total)break;
    if(data.items.length!==100)throw Error('Не удалось полностью загрузить каталог. Повторите попытку.');
  }
  return collected;
}
