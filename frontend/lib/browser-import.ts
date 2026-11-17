/** Offline browser-export reader. Never promotes raw observations to canonical products. */
type NullableText = string | null;
type Obj = Record<string, unknown>;
export interface BrowserCandidate {
  price:number|null; currency:NullableText; method:'jsonld'|'dom'; raw:NullableText;
  label:NullableText; matches_page:boolean|null; seller_id:NullableText; seller_name:NullableText;
}
export interface BrowserObservation {
  source:{marketplace:'ozon'|'wildberries';url:string;requested_url?:string;captured_at:string;extraction_method:'jsonld'|'dom'|'none';extractor_version:string};
  product:{title:NullableText;brand:NullableText;model:NullableText;mpn:NullableText;sku:string;capacity:NullableText;bundle:NullableText;condition:'new'|'used'|'refurbished'|'unknown'};
  offer:{price:number|null;currency:NullableText;region:NullableText;price_type:NullableText;payment_condition:NullableText;availability:boolean|null;seller:{id:NullableText;name:NullableText};warranty_months:number|null;evidence:{region:NullableText;payment_condition:NullableText}};
  candidates:BrowserCandidate[]; needs_review:boolean;review_reasons:string[];identity_confirmed:false;
  images?:string[];specifications?:{name:string;value:string}[];
  rating?:{value:number|null;rating_count:number|null;review_count:number|null;scope:'product'|'unknown'}|null;
}
export function safeImageUrl(value:unknown):string|null {
  if(typeof value!=='string'||value.length>2000||/[\\\x00-\x20]/.test(value))return null;
  try {const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&/(?:^|\.)(?:ozone\.ru|ozon\.ru|wbbasket\.ru|wb\.ru)$/.test(u.hostname)?u.href:null;} catch{return null;}
}
export interface BrowserImportError {url:string|null;code:string;message:string;occurred_at:string}
interface BrowserJobSettings {
  delaySeconds:number;renderWaitSeconds:number;pageTimeoutSeconds:number;maxPages:number;autoExport:boolean;
  categoryScrollRounds?:number;categoryScrollPauseSeconds?:number;categoryMaxProducts?:number;categoryMaxPages?:number;
}
interface BrowserDiscovery {
  rounds:number;scrolls:number;found_count:number;
  stop_reason:'round_limit'|'product_limit'|'queue_limit'|'end'|'no_growth'|null;page_number:number;
}
export interface BrowserExportFile {
  schema_version:'cenoskop.browser-export.v1';
  job:{run_id:string|null;status:'idle'|'running'|'paused'|'completed'|'stopped'|'blocked';partial:boolean;started_at:string|null;updated_at:string;exported_at:string;settings:BrowserJobSettings;queue:{url:string;kind:'product'|'discovery';status:'pending'|'loading'|'waiting'|'complete'|'error';attempts:number;discovery?:BrowserDiscovery}[];processed_pages:number;discovered_count:number;truncated_count:number};
  observations:BrowserObservation[]; errors:BrowserImportError[];
}
function object(value:unknown,label:string):Obj {
  if(value===null||typeof value!=='object'||Array.isArray(value))throw Error(`${label}: ожидался объект.`);
  return value as Obj;
}
function text(value:unknown,label:string,max=300,nullable=false):string|null {
  if(nullable&&value===null)return null;
  if(typeof value!=='string'||value.length>max||(!nullable&&!value.trim()))throw Error(`${label}: неверная строка.`);
  return value;
}
function number(value:unknown,label:string,min=0,max=100000000,nullable=false):number|null {
  if(nullable&&value===null)return null;
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error(`${label}: неверное число.`);
  return value;
}
function integer(value:unknown,label:string,min:number,max:number):number {
  const result=number(value,label,min,max)!;
  if(!Number.isInteger(result))throw Error(`${label}: ожидалось целое число.`);
  return result;
}
function discovery(value:unknown):BrowserDiscovery {
  const d=object(value,'queue.discovery');
  return {rounds:integer(d.rounds,'discovery.rounds',0,51),scrolls:integer(d.scrolls,'discovery.scrolls',0,50),found_count:integer(d.found_count,'discovery.found_count',0,100000),stop_reason:d.stop_reason===null?null:choice(d.stop_reason,['round_limit','product_limit','queue_limit','end','no_growth'] as const,'discovery.stop_reason'),page_number:integer(d.page_number,'discovery.page_number',1,10)};
}
function bool(value:unknown,label:string,nullable=false):boolean|null {
  if(nullable&&value===null)return null;
  if(typeof value!=='boolean')throw Error(`${label}: ожидалось логическое значение.`);
  return value;
}
function choice<T extends string>(value:unknown,values:readonly T[],label:string):T {
  if(typeof value!=='string'||!values.includes(value as T))throw Error(`${label}: неподдерживаемое значение.`);
  return value as T;
}
function array(value:unknown,label:string,max:number):unknown[] {
  if(!Array.isArray(value)||value.length>max)throw Error(`${label}: ожидался массив до ${max} записей.`);
  return value;
}
function date(value:unknown,label:string,nullable=false):string|null {
  if(nullable&&value===null)return null;
  const result=text(value,label,50)!;
  if(!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(result)||!Number.isFinite(Date.parse(result)))throw Error(`${label}: нужна дата ISO 8601 с часовым поясом.`);
  return result;
}
function url(value:unknown,label:string,category=false):string {
  const raw=text(value,label,2000)!;let parsed:URL;
  try{parsed=new URL(raw);}catch{throw Error(`${label}: неверный URL.`);}
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||/[\\\x00-\x20]/.test(raw))throw Error(`${label}: нужен безопасный HTTPS URL.`);
  if(['ozon.ru','www.ozon.ru'].includes(parsed.hostname)){
    const product=parsed.pathname.match(/^\/product\/(?:[a-zA-Z0-9_-]+-)?([0-9]{1,20})\/?$/);
    if(product)return `https://www.ozon.ru/product/${product[1]}/`;
    if(category&&/^\/category\/[a-zA-Z0-9_-]+-\d+\/?$/.test(parsed.pathname)){
      if(parsed.search&&!/^\?page=(?:[2-9]|[1-9][0-9]{1,2}|1000)$/.test(parsed.search))throw Error(`${label}: неподдерживаемый номер страницы категории.`);
      return `https://www.ozon.ru${parsed.pathname.replace(/\/?$/,'/')}${parsed.search}`;
    }
  }
  if(['wildberries.ru','www.wildberries.ru'].includes(parsed.hostname)&&/^\/catalog\/\d{1,20}\/detail\.aspx$/.test(parsed.pathname))return `https://www.wildberries.ru${parsed.pathname}`;
  throw Error(`${label}: поддерживаются карточки Ozon/Wildberries${category?' и категории Ozon':''}.`);
}
export function parseBrowserExport(content:string):BrowserExportFile {
  if(new TextEncoder().encode(content).length>5_000_000)throw Error('Файл больше 5 МБ. Разделите сбор на несколько проходов.');
  let raw:unknown;
  try{raw=JSON.parse(content.replace(/^\uFEFF/,''));}catch{throw Error('Не удалось прочитать JSON. Выберите файл выгрузки расширения.');}
  const root=object(raw,'Файл');
  if(root.schema_version!=='cenoskop.browser-export.v1')throw Error('Нужен JSON расширения с schema_version: cenoskop.browser-export.v1.');
  const j=object(root.job,'job'),s=object(j.settings,'job.settings');
  const jobSettings:BrowserJobSettings={
    delaySeconds:number(s.delaySeconds,'delaySeconds',0,3600)!,
    renderWaitSeconds:number(s.renderWaitSeconds,'renderWaitSeconds',0,300)!,
    pageTimeoutSeconds:number(s.pageTimeoutSeconds,'pageTimeoutSeconds',1,600)!,
    maxPages:integer(s.maxPages,'maxPages',1,200),autoExport:bool(s.autoExport,'autoExport')!,
  };
  for(const [key,min,max] of [
    ['categoryScrollRounds',0,50],['categoryScrollPauseSeconds',1,10],
    ['categoryMaxProducts',1,200],['categoryMaxPages',1,10],
  ] as const){if(s[key]!==undefined)jobSettings[key]=integer(s[key],key,min,max);}
  const job:BrowserExportFile['job']={
    run_id:text(j.run_id,'job.run_id',100,true),status:choice(j.status,['idle','running','paused','completed','stopped','blocked'],'job.status'),
    partial:bool(j.partial,'job.partial')!,started_at:date(j.started_at,'job.started_at',true),
    updated_at:date(j.updated_at,'job.updated_at')!,exported_at:date(j.exported_at,'job.exported_at')!,settings:jobSettings,
    queue:array(j.queue,'job.queue',200).map((value,i)=>{
      const q=object(value,`queue[${i}]`);
      return {url:url(q.url,'queue.url',true),kind:choice(q.kind,['product','discovery'],'queue.kind'),
        status:choice(q.status,['pending','loading','waiting','complete','error'],'queue.status'),attempts:integer(q.attempts,'queue.attempts',0,100),
        ...(q.discovery!==undefined?{discovery:discovery(q.discovery)}:{})};
    }),
    processed_pages:integer(j.processed_pages,'processed_pages',0,200),
    discovered_count:integer(j.discovered_count,'discovered_count',0,100000),
    truncated_count:integer(j.truncated_count,'truncated_count',0,100000),
  };
  const observations=array(root.observations,'observations',200).map((value,i):BrowserObservation=>{
    const row=object(value,`observations[${i}]`),source=object(row.source,'source'),product=object(row.product,'product'),offer=object(row.offer,'offer'),seller=object(offer.seller,'offer.seller'),evidence=object(offer.evidence,'offer.evidence');
    const sourceUrl=url(source.url,'source.url');
    const marketplace=choice(source.marketplace,['ozon','wildberries'],'source.marketplace');
    if((new URL(sourceUrl).hostname==='www.ozon.ru')!==(marketplace==='ozon'))throw Error(`Запись ${i+1}: площадка не соответствует URL.`);
    const sku=text(product.sku,'product.sku',100)!;
    if(!sourceUrl.includes(marketplace==='ozon'?`/product/${sku}/`:`/catalog/${sku}/`))throw Error(`Запись ${i+1}: SKU не соответствует URL.`);
    if(row.identity_confirmed!==false)throw Error(`Запись ${i+1}: автоматическая выгрузка не подтверждает совпадение модели.`);
    const reasons=array(row.review_reasons,'review_reasons',20).map(v=>text(v,'review_reason',120)!);
    const images=row.images===undefined?undefined:array(row.images,'images',10).map(v=>{const image=safeImageUrl(v);if(!image)throw Error('images: неподдерживаемая ссылка на изображение.');return image;});
    const specifications=row.specifications===undefined?undefined:array(row.specifications,'specifications',40).map(v=>{const spec=object(v,'specification');return{name:text(spec.name,'specification.name',100)!,value:text(spec.value,'specification.value',300)!};});
    let rating:BrowserObservation['rating'];
    if(row.rating===null)rating=null;
    else if(row.rating!==undefined){const r=object(row.rating,'rating');rating={value:number(r.value,'rating.value',0,5,true),rating_count:r.rating_count===null?null:integer(r.rating_count,'rating.rating_count',0,100000000),review_count:r.review_count===null?null:integer(r.review_count,'rating.review_count',0,100000000),scope:choice(r.scope,['product','unknown'] as const,'rating.scope')};}
    return {source:{marketplace,url:sourceUrl,...(source.requested_url?{requested_url:url(source.requested_url,'requested_url')}:{}),captured_at:date(source.captured_at,'captured_at')!,extraction_method:choice(source.extraction_method,['jsonld','dom','none'],'extraction_method'),extractor_version:text(source.extractor_version,'extractor_version',40)!},product:{title:text(product.title,'product.title',300,true),brand:text(product.brand,'product.brand',80,true),model:text(product.model,'product.model',150,true),mpn:text(product.mpn,'product.mpn',120,true),sku,capacity:text(product.capacity,'capacity',80,true),bundle:text(product.bundle,'bundle',200,true),condition:choice(product.condition,['new','used','refurbished','unknown'],'condition')},offer:{price:number(offer.price,'price',0.01,100000000,true),currency:text(offer.currency,'currency',8,true),region:text(offer.region,'region',80,true),price_type:text(offer.price_type,'price_type',40,true),payment_condition:text(offer.payment_condition,'payment_condition',80,true),availability:bool(offer.availability,'availability',true),seller:{id:text(seller.id,'seller.id',100,true),name:text(seller.name,'seller.name',150,true)},warranty_months:number(offer.warranty_months,'warranty_months',0,240,true),evidence:{region:text(evidence.region,'evidence.region',120,true),payment_condition:text(evidence.payment_condition,'evidence.payment',120,true)}},candidates:array(row.candidates,'candidates',30).map(value=>{const c=object(value,'candidate');return{price:number(c.price,'candidate.price',0.01,100000000,true),currency:text(c.currency,'candidate.currency',8,true),method:choice(c.method,['jsonld','dom'],'candidate.method'),raw:text(c.raw,'candidate.raw',120,true),label:text(c.label,'candidate.label',120,true),matches_page:bool(c.matches_page,'candidate.matches_page',true),seller_id:text(c.seller_id,'candidate.seller_id',100,true),seller_name:text(c.seller_name,'candidate.seller_name',150,true)};}),needs_review:bool(row.needs_review,'needs_review')!,review_reasons:reasons,identity_confirmed:false,...(images!==undefined?{images}:{}),...(specifications!==undefined?{specifications}:{}),...(rating!==undefined?{rating}:{})};
  });
  const errors=array(root.errors,'errors',500).map(value=>{const e=object(value,'error');return{url:e.url===null?null:url(e.url,'error.url',true),code:text(e.code,'error.code',100)!,message:text(e.message,'error.message',300)!,occurred_at:date(e.occurred_at,'error.occurred_at')!};});
  return {schema_version:'cenoskop.browser-export.v1',job,observations,errors};
}
const issueLabels:Record<string,string>={condition_unconfirmed:'Состояние неизвестно',seller_unavailable:'Продавец неизвестен',mpn_unavailable:'MPN неизвестен',payment_condition_unconfirmed:'Условия оплаты неизвестны',region_unconfirmed:'Регион неизвестен',availability_unconfirmed:'Наличие неизвестно',price_unresolved:'Цена не определена',matching_jsonld_offer_unavailable:'Нет совпавшего JSON-LD Offer',ambiguous_matching_offers:'Несколько предложений',dom_price_requires_review:'Цена DOM требует проверки',condition_conflict:'Противоречивое состояние'};
export function formatIssue(reason:string):string{return issueLabels[reason]||reason;}
