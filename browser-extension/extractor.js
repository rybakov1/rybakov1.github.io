(function (root) {
  'use strict';
  const VERSION='0.4.0';
  const clip=(value,max=200)=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,max):'';
  const nullable=(value,max)=>clip(value,max)||null;
  function marketplacePage(value){
    let url;try{url=new URL(value);}catch{throw new Error('Некорректный адрес страницы.');}
    if(url.protocol!=='https:'||url.username||url.password||url.port||/[\\\x00-\x20]/.test(String(value)))throw new Error('Нужна HTTPS-карточка Ozon или Wildberries.');
    let marketplace,match;
    if(['ozon.ru','www.ozon.ru'].includes(url.hostname)&&(match=url.pathname.match(/^\/product\/(?:[a-zA-Z0-9_-]+-)?([0-9]{1,20})\/?$/)))marketplace='ozon';
    if(['wildberries.ru','www.wildberries.ru'].includes(url.hostname)&&(match=url.pathname.match(/^\/catalog\/([0-9]{1,20})\/detail\.aspx$/)))marketplace='wildberries';
    if(!marketplace)throw new Error('Поддерживаются только конкретные карточки Ozon /product/…-123/ и Wildberries /catalog/123/detail.aspx.');
    return {url:marketplace==='ozon'?`https://www.ozon.ru/product/${match[1]}/`:`https://www.wildberries.ru/catalog/${match[1]}/detail.aspx`,marketplace};
  }
  function marketplaceCategory(value){
    let url;try{url=new URL(value);}catch{throw new Error('Некорректный адрес категории.');}
    if(url.protocol!=='https:'||url.username||url.password||url.port||/[\\\x00-\x20]/.test(String(value))||!['ozon.ru','www.ozon.ru'].includes(url.hostname)||!/^\/category\/[a-zA-Z0-9_-]+-\d+\/?$/.test(url.pathname))throw new Error('Категория: поддерживается Ozon /category/…-123/.');
    const pages=url.searchParams.getAll('page');
    if(pages.length>1||(pages.length&&(!/^[1-9]\d{0,3}$/.test(pages[0])||Number(pages[0])>1000)))throw new Error('Номер страницы категории должен быть от 1 до 1000.');
    const number=Number(pages[0]||1);
    url.hostname='www.ozon.ru';url.pathname=url.pathname.replace(/\/?$/,'/');url.search='';url.hash='';if(number>1)url.searchParams.set('page',String(number));return {url:url.href,marketplace:'ozon'};
  }
  function supportedPage(value){try{return {...marketplacePage(value),mode:'product'};}catch{return {...marketplaceCategory(value),mode:'discovery'};}}
  function skuFromUrl(value){const page=marketplacePage(value);return page.url.match(page.marketplace==='ozon'?/\/product\/(\d+)\//:/\/catalog\/(\d+)\//)[1];}
  function parsePrice(value){
    if(typeof value==='number')return Number.isFinite(value)&&value>0&&value<=100000000?value:null;
    if(typeof value!=='string')return null;
    const text=value.trim().replace(/\s/g,'').replace(/(?:₽|руб\.?|RUB)$/i,'');
    if(!/^\d+(?:[.,]\d{1,2})?$/.test(text))return null;
    const price=Number(text.replace(',','.'));return Number.isFinite(price)&&price>0&&price<=100000000?price:null;
  }
  function hasType(node,name){return [node?.['@type']].flat().some(type=>String(type).split(/[\/#]/).pop()===name);}
  function entityName(value){return typeof value==='string'?value:(typeof value?.name==='string'?value.name:'');}
  function schemaCondition(value){const condition=String(value||'').split(/[\/#]/).pop();return {NewCondition:'new',UsedCondition:'used',RefurbishedCondition:'refurbished'}[condition]||'unknown';}
  function jsonldProducts(value){
    const found=[];
    function walk(node,depth=0){
      if(!node||typeof node!=='object'||depth>12||found.length>=100)return;
      if(Array.isArray(node)){node.slice(0,150).forEach(item=>walk(item,depth+1));return;}
      if(hasType(node,'Product'))found.push(node);
      for(const key of ['@graph','mainEntity','itemListElement','item'])if(node[key])walk(node[key],depth+1);
    }
    walk(value);return found;
  }
  function pageMatch(product,offer,pageUrl){
    if(!pageUrl)return null;
    const wanted=marketplacePage(pageUrl),sku=skuFromUrl(pageUrl);
    const statedSku=typeof product.sku==='number'?String(product.sku):clip(product.sku,100);
    // An explicit different marketplace SKU overrides a coincidentally copied URL.
    if(/^\d{1,20}$/.test(statedSku)&&statedSku!==sku)return false;
    if(typeof offer.url==='string'){try{if(marketplacePage(offer.url).url!==wanted.url)return false;}catch{/* Unrecognized identifiers provide no matching evidence. */}}
    const urls=[product.url,product['@id'],product.mainEntityOfPage?.['@id'],typeof product.mainEntityOfPage==='string'?product.mainEntityOfPage:null,offer.url];
    let matchingUrl=false,differentUrl=false;
    for(const value of urls){if(typeof value!=='string')continue;try{const candidate=marketplacePage(value);if(candidate.url===wanted.url)matchingUrl=true;else differentUrl=true;}catch{/* Non-product schema identifiers are not evidence. */}}
    if(differentUrl&&!matchingUrl)return false;
    return statedSku===sku||matchingUrl?true:null;
  }
  function parseJSONLD(value,pageUrl){
    const candidates=[];
    for(const product of jsonldProducts(value)){
      function offers(value,depth=0){
        if(depth>6||candidates.length>=150)return;
        for(const offer of [value].flat().slice(0,100)){
          if(!offer||typeof offer!=='object')continue;
          if(hasType(offer,'AggregateOffer')){if(offer.offers)offers(offer.offers,depth+1);continue;}
          if(offer.offers)offers(offer.offers,depth+1);
          const price=parsePrice(offer.price),currency=clip(offer.priceCurrency,8).toUpperCase();
          if(price===null||!currency||!hasType(offer,'Offer'))continue;
          const matches=pageMatch(product,offer,pageUrl);
          // A recommendation for a different SKU never becomes a candidate for this page.
          if(matches===false)continue;
          const seller=offer.seller||product.seller,rawId=typeof seller==='object'?(seller?.identifier||seller?.['@id']||''):'';
          const availability=String(offer.availability||'').split(/[\/#]/).pop();
          candidates.push({price,currency,raw:clip(String(offer.price),120),method:'jsonld',label:'JSON-LD Offer',matches_page:matches,seller_name:clip(entityName(seller),150),seller_id:typeof rawId==='string'&&rawId.length<=100?clip(rawId,100):'',availability:['InStock','LimitedAvailability','OnlineOnly'].includes(availability)?true:['OutOfStock','SoldOut','Discontinued'].includes(availability)?false:null,product_name:clip(entityName(product.name),300),brand:clip(entityName(product.brand),80),model:clip(product.model,150),mpn:clip(product.mpn,120),sku:clip(typeof product.sku==='number'?String(product.sku):product.sku,100),condition:schemaCondition(offer.itemCondition||product.itemCondition)});
        }
      }
      offers(product.offers);
    }
    return candidates;
  }
  // CDN URLs are restricted and stripped of tracking/session parameters before export.
  function imageUrl(raw){
    if(typeof raw!=='string'||raw.length>2000||/[\\\x00-\x20]/.test(raw))return null;
    try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port||!/^(?:[a-z0-9-]+\.)*(?:ozone\.ru|ozon\.ru|wbbasket\.ru|wb\.ru)$/i.test(u.hostname))return null;u.search='';u.hash='';return u.href.length<=2000?u.href:null;}catch{return null;}
  }
  function countValue(raw){
    if(raw===null||raw===undefined||raw==='')return null;
    const n=typeof raw==='number'?raw:(typeof raw==='string'&&/^\d{1,9}$/.test(raw)?Number(raw):NaN);
    return Number.isInteger(n)&&n>=0&&n<=100000000?n:null;
  }
  function ratingValue(raw){
    if(!raw||typeof raw!=='object')return null;
    if(raw.bestRating!=null&&Number(raw.bestRating)!==5)return null;
    if(raw.worstRating!=null&&Number(raw.worstRating)!==1)return null;
    const v=(typeof raw.ratingValue==='number'||typeof raw.ratingValue==='string')?Number(String(raw.ratingValue).replace(',','.')):NaN;
    const value=Number.isFinite(v)&&v>=1&&v<=5?v:null;
    const rating_count=countValue(raw.ratingCount),review_count=countValue(raw.reviewCount);
    return value!==null||rating_count!==null||review_count!==null?{value,rating_count,review_count,scope:'unknown'}:null;
  }
  function productDetails(products,pageUrl){
    const matched=products.filter(product=>pageMatch(product,{},pageUrl)===true),images=[],ratings=new Map(),specs=[];
    for(const product of matched){
      for(const raw of [product.image].flat().slice(0,30)){
        const url=imageUrl(typeof raw==='string'?raw:raw?.url||raw?.contentUrl);
        if(url&&!images.includes(url)&&images.length<10)images.push(url);
      }
      const rating=ratingValue(product.aggregateRating);if(rating)ratings.set(JSON.stringify(rating),rating);
      for(const property of [product.additionalProperty].flat().slice(0,80)){
        const name=clip(property?.name,80),value=clip(typeof property?.value==='number'?String(property.value):property?.value,200);
        if(name&&value&&!specs.some(item=>item.name===name)&&specs.length<40)specs.push({name,value});
      }
    }
    const first=matched.length===1?matched[0]:null;
    return {images,rating:ratings.size===1?[...ratings.values()][0]:null,rating_conflict:ratings.size>1,specs,identity:first?{product_name:clip(entityName(first.name),300),brand:clip(entityName(first.brand),80),model:clip(first.model,150),mpn:clip(first.mpn,120),condition:schemaCondition(first.itemCondition)}:null};
  }
  function visible(document,node){
    if(!node||!node.getClientRects?.().length||node.closest?.('del,s,[aria-hidden="true"]'))return false;
    const style=document.defaultView?.getComputedStyle(node);return style?.display!=='none'&&style?.visibility!=='hidden';
  }
  function ozonVisibleDetails(document,details){
    const imageKey=url=>url.replace(/\/wc\d+\//,'/');
    const keys=new Set(details.images.map(imageKey));
    for(const node of [...document.querySelectorAll('[data-widget="webGallery"] img')].slice(0,100)){
      if(!visible(document,node))continue;
      const url=imageUrl(node.currentSrc||node.src||node.getAttribute?.('src'));
      if(url&&!keys.has(imageKey(url))&&details.images.length<10){keys.add(imageKey(url));details.images.push(url);}
    }
    const scores=[...document.querySelectorAll('[data-widget="webSingleProductScore"]')].filter(node=>visible(document,node));
    if(scores.length!==1)return;
    const text=clip(scores[0].innerText,100),match=text.match(/^([1-5](?:[.,]\d+)?)\s*[•·]\s*([\d\s\u00a0\u202f]+)\s+отзыв(?:ов|а)?$/i);
    let fact=null;
    if(/^нет отзывов$/i.test(text))fact={value:null,rating_count:null,review_count:0,scope:'unknown'};
    else if(match)fact=ratingValue({ratingValue:match[1],reviewCount:match[2].replace(/\s/g,'')});
    if(!fact||details.rating_conflict)return;
    if(!details.rating){details.rating=fact;return;}
    if((fact.value!==null&&details.rating.value!==null&&fact.value!==details.rating.value)||(fact.review_count!==null&&details.rating.review_count!==null&&fact.review_count!==details.rating.review_count)){details.rating=null;return;}
    details.rating={value:details.rating.value??fact.value,rating_count:details.rating.rating_count,review_count:details.rating.review_count??fact.review_count,scope:'unknown'};
  }
  function discoveryViewport(document){
    const view=document.defaultView,root=document.scrollingElement||document.documentElement||document.body;
    const finite=value=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(100000000,value)):0;
    const scroll_y=Math.max(finite(view?.scrollY),finite(view?.pageYOffset),finite(root?.scrollTop));
    const viewport_height=Math.max(finite(view?.innerHeight),finite(document.documentElement?.clientHeight));
    const scroll_height=Math.max(finite(root?.scrollHeight),finite(document.documentElement?.scrollHeight),finite(document.body?.scrollHeight));
    return {scroll_y,viewport_height,scroll_height,at_bottom:viewport_height>0&&scroll_height>0&&scroll_y+viewport_height>=scroll_height-8};
  }
  function nextCategoryPage(document,page){
    const current=new URL(page.url),number=Number(current.searchParams.get('page')||1),candidates=new Set();
    const accept=node=>{
      try{
        const raw=node.getAttribute('href');if(!raw)return;
        const target=new URL(marketplaceCategory(new URL(raw,page.url).href).url);
        if(target.origin===current.origin&&target.pathname===current.pathname&&Number(target.searchParams.get('page')||1)===number+1)candidates.add(target.href);
      }catch{/* Navigation never leaves the current allowlisted category. */}
    };
    for(const node of [...document.querySelectorAll('link[rel="next"][href]')].slice(0,10))accept(node);
    for(const node of [...document.querySelectorAll('a[href]')].slice(0,10000)){
      if(!visible(document,node)||node.getAttribute('aria-disabled')==='true')continue;
      const rel=String(node.getAttribute('rel')||''),label=clip(node.getAttribute('aria-label')||node.getAttribute('title')||node.innerText,100);
      const nextLabel=/^(?:дальше|далее|следующая(?:\s+страница)?|на\s+следующую\s+страницу|next(?:\s+page)?|go\s+to\s+(?:the\s+)?next\s+page)[\s›»→>]*$/i.test(label);
      const pagination=node.closest?.('[data-widget*="Paginator"],[data-widget*="paginator"],nav[aria-label*="pagination" i],nav[aria-label*="пагинац" i],[role="navigation"][aria-label*="страниц" i]');
      if(/(?:^|\s)next(?:\s|$)/i.test(rel)||nextLabel||(pagination&&label===String(number+1)))accept(node);
    }
    return candidates.size===1?[...candidates][0]:null;
  }
  function priceSegments(text){
    const matches=[...text.matchAll(/\d[\d \u00a0\u202f]*(?:[.,]\d{1,2})?\s*(?:₽|руб\.?|RUB)/gi)],result=[];
    matches.slice(0,10).forEach((match,index)=>{
      const price=parsePrice(match[0]);if(price===null)return;
      const suffix=clip(text.slice(match.index+match[0].length,matches[index+1]?.index??text.length),80);
      const ordinary=/^(?:с другими банками|обычная цена|без карты(?: маркетплейса)?|при оплате любой картой)(?:\s|$|[.,:;])/i.test(suffix);
      result.push({price,currency:'RUB',raw:clip(match[0],120),suffix,price_type:ordinary?'regular':null,payment_condition:ordinary?(/^с другими банками/i.test(suffix)?'other_bank_card':'any_card'):null,evidence:ordinary?clip(`${match[0]} ${suffix}`,120):null});
    });return result;
  }
  function regionEvidence(document){
    const cities=[{pattern:/санкт[- ]петербург/i,region:'RU-SPE',evidence:'Санкт-Петербург'},{pattern:/(?:^|[^а-яё])москва(?:$|[^а-яё])/i,region:'RU-MOW',evidence:'Москва'}],found=new Map();
    const selector='[data-widget="addressBookBarWeb"],[data-widget="webLocation"],[data-testid="delivery-region"],[data-testid="header-location"]';
    for(const node of [...document.querySelectorAll(selector)].slice(0,20)){
      if(!visible(document,node))continue;const text=clip(node.innerText,200);if(!text||text.length>160)continue;
      // Preserve the city only; delivery widgets may also contain a private street address.
      for(const city of cities)if(city.pattern.test(text))found.set(city.region,city.evidence);
    }
    return found.size===1?{region:[...found.keys()][0],evidence:[...found.values()][0]}:{region:null,evidence:null};
  }
  function extract(document,pageUrl){
    const page=supportedPage(pageUrl),title=clip(document.title,300);
    const bodyText=(document.body?.innerText||'').slice(0,5000);
    const blocked=/провер(?:яем|ка|ьте).{0,35}(?:человек|безопасност)|подтвердите.{0,35}не робот|captcha|access denied|доступ.{0,15}ограничен/i.test(`${title} ${bodyText}`);
    if(blocked)return {...page,blocked:true,title,candidates:[],captured_at:new Date().toISOString(),extractor_version:VERSION};
    if(page.mode==='discovery'){
      const links=[],seen=new Set();
      for(const anchor of [...document.querySelectorAll('a[href]')].slice(0,10000)){
        if(!visible(document,anchor))continue;
        try{const product=marketplacePage(new URL(anchor.getAttribute('href'),page.url).href);if(product.marketplace!==page.marketplace||seen.has(product.url))continue;seen.add(product.url);links.push({url:product.url,title:clip(anchor.innerText||anchor.getAttribute('aria-label')||anchor.getAttribute('title')||'Карточка товара',180)});if(links.length===500)break;}catch{/* Non-product links are ignored. */}
      }
      return {...page,blocked:false,title,links,viewport:discoveryViewport(document),next_page_url:nextCategoryPage(document,page),candidates:[],captured_at:new Date().toISOString(),extractor_version:VERSION};
    }
    const candidates=[],products=[];
    for(const script of [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0,30)){
      const text=script.textContent||'';if(text.length>1500000)continue;
      try{const data=JSON.parse(text);candidates.push(...parseJSONLD(data,page.url));products.push(...jsonldProducts(data));}catch{/* Data is parsed, never executed. */}
    }
    const ordinaryEvidence=[];
    for(const node of [...document.querySelectorAll('[data-widget="webPrice"]')].slice(0,5)){
      if(!visible(document,node))continue;const text=clip(node.innerText,600);
      for(const segment of priceSegments(text))if(segment.price_type)ordinaryEvidence.push(segment);
    }
    const selector='[data-widget*="price"],[data-widget="webPrice"],[data-testid*="price"],[class*="price"],[class*="Price"],[itemprop="price"]';
    for(const node of [...document.querySelectorAll(selector)].slice(0,1500)){
      if(!visible(document,node))continue;const text=clip(node.innerText,601);if(!text||text.length>600)continue;
      for(const segment of priceSegments(text).slice(0,5))candidates.push({price:segment.price,currency:'RUB',raw:segment.raw,method:'dom',label:clip(`${segment.raw} ${segment.suffix}`,120),matches_page:null,seller_name:'',seller_id:'',availability:null});
    }
    const details=productDetails(products,page.url),specifications={};
    if(page.marketplace==='ozon')ozonVisibleDetails(document,details);
    for(const property of details.specs)specifications[property.name]=property.value;
    const specSelector=page.marketplace==='ozon'?'[data-widget="webCharacteristics"] dl dt':'dl dt';
    for(const term of [...document.querySelectorAll(specSelector)].slice(0,120)){
      if(!visible(document,term))continue;
      const key=clip(term.innerText,80);let description=term.nextElementSibling;
      if(description?.tagName!=='DD')description=term.parentElement?.querySelector('dd');
      if(!visible(document,description))continue;const value=clip(description?.innerText,200);
      if(key&&value&&(page.marketplace==='ozon'||/партномер|артикул производителя|комплектац|гаранти|объ[её]м|состоян|памят|процессор|интерфейс|охлажден|питан|размер|разрешен|частот|разъ[её]м|тип|бренд|модель/i.test(key)))specifications[key]=value;
    }
    let seller_name='',seller_id='';
    // This current-product widget was verified on the supplied Ozon page.
    // Unscoped seller links can belong to recommendations and are not evidence.
    for(const node of [...document.querySelectorAll('[data-widget="webStickyProducts"] a[href*="/seller/"]')].slice(0,20)){
      if(!visible(document,node))continue;
      try{const sellerUrl=new URL(node.href,page.url);if(sellerUrl.protocol!=='https:'||sellerUrl.hostname.replace(/^www\./,'')!==new URL(page.url).hostname.replace(/^www\./,''))continue;const name=clip(node.innerText,151);if(name&&name.length<=150){seller_name=name;seller_id=clip(sellerUrl.pathname,100);break;}}catch{/* Ignore malformed links. */}
    }
    const unique=[],seenDom=new Set();
    for(const candidate of candidates){
      // Do not collapse distinct concrete JSON-LD offers into a false single offer.
      const key=`${candidate.price}|${candidate.currency}|${candidate.method}`;
      if(candidate.method==='dom'&&seenDom.has(key))continue;if(candidate.method==='dom')seenDom.add(key);
      unique.push({...candidate,seller_name:candidate.seller_name||seller_name,seller_id:candidate.seller_id||seller_id});if(unique.length===30)break;
    }
    return {...page,blocked:false,title,candidates:unique,specifications,product_data:details,ordinary_evidence:ordinaryEvidence.slice(0,10),region_evidence:regionEvidence(document),captured_at:new Date().toISOString(),extractor_version:VERSION};
  }
  function warrantyMonths(value){const match=clip(value,100).match(/^(\d{1,3})\s*(месяц(?:а|ев)?|мес\.?|год(?:а)?|лет)$/i);if(!match)return null;const months=Number(match[1])*(/год|лет/i.test(match[2])?12:1);return months<=240?months:null;}
  function capacityFromTitle(title){const values=[...clip(title,300).matchAll(/(?:^|[^\d])(\d+(?:[.,]\d+)?)\s*(ГБ|ТБ|GB|TB)(?=$|[^A-Za-zА-Яа-яЁё])/gi)].map(match=>`${match[1]} ${match[2]}`);return new Set(values.map(value=>value.toUpperCase())).size===1?values[0]:null;}
  function buildObservation(capture,options={}){
    if(!capture||capture.mode==='discovery')throw new Error('Наблюдение создаётся только для карточки товара.');
    const page=marketplacePage(capture.url),reasons=[],candidates=(Array.isArray(capture.candidates)?capture.candidates:[]).slice(0,30).map(candidate=>({price:parsePrice(candidate.price),currency:nullable(candidate.currency,8),method:candidate.method==='jsonld'?'jsonld':'dom',raw:nullable(candidate.raw,120),label:nullable(candidate.label,120),matches_page:candidate.matches_page===true?true:candidate.matches_page===false?false:null,seller_id:nullable(candidate.seller_id,100),seller_name:nullable(candidate.seller_name,150)}));
    const matching=(capture.candidates||[]).filter(candidate=>candidate.method==='jsonld'&&candidate.matches_page===true&&candidate.currency==='RUB'&&parsePrice(candidate.price)!==null);
    let selected=matching.length===1?matching[0]:null;
    if(capture.blocked){selected=null;reasons.push('page_blocked');}
    else if(matching.length>1)reasons.push('ambiguous_matching_offers');
    else if(!matching.length){
      reasons.push('matching_jsonld_offer_unavailable');
      const ordinary=(capture.ordinary_evidence||[]).filter(item=>item.price_type==='regular'&&item.payment_condition&&parsePrice(item.price)!==null);
      const unique=new Map(ordinary.map(item=>[`${item.price}|${item.payment_condition}`,item]));
      if(unique.size===1){const fact=[...unique.values()][0],dom=(capture.candidates||[]).find(candidate=>candidate.method==='dom'&&candidate.price===fact.price&&candidate.currency==='RUB');if(dom){selected=dom;reasons.push('dom_price_requires_review');}}
    }
    const identity=capture.product_data?.identity||(matching.length===1?matching[0]:null),specifications=capture.specifications||{};
    const spec=pattern=>Object.entries(specifications).find(([key])=>pattern.test(key))?.[1]||null;
    const statedCondition=spec(/^состояние$/i),conditionMap={'новый':'new','новое':'new','б/у':'used','бывший в употреблении':'used','восстановленный':'refurbished','восстановленное':'refurbished'};
    const domCondition=conditionMap[String(statedCondition||'').toLowerCase()],schemaState=identity?.condition;
    const stateConflict=domCondition&&schemaState&&schemaState!=='unknown'&&domCondition!==schemaState;
    const condition=stateConflict?'unknown':domCondition||schemaState||'unknown';if(stateConflict)reasons.push('condition_conflict');
    const context=(capture.ordinary_evidence||[]).filter(item=>selected&&item.price===selected.price&&item.price_type==='regular'&&item.payment_condition);
    const contexts=new Map(context.map(item=>[`${item.price_type}|${item.payment_condition}`,item])),payment=contexts.size===1?[...contexts.values()][0]:null;
    const region=capture.region_evidence?.region==='RU-MOW'||capture.region_evidence?.region==='RU-SPE'?capture.region_evidence:null;
    const price=selected?parsePrice(selected.price):null,currency=selected?nullable(selected.currency,8):null;
    const title=nullable(identity?.product_name||capture.title,300),mpn=nullable(identity?.mpn||spec(/партномер|артикул производителя/i),120);
    const seller={id:nullable(selected?.seller_id,100),name:nullable(selected?.seller_name,150)};
    if(price===null)reasons.push('price_unresolved');if(!region)reasons.push('region_unconfirmed');if(!payment)reasons.push('payment_condition_unconfirmed');if(condition==='unknown')reasons.push('condition_unconfirmed');if(!seller.name)reasons.push('seller_unavailable');if(!mpn)reasons.push('mpn_unavailable');
    const availability=typeof selected?.availability==='boolean'?selected.availability:null;if(availability===null)reasons.push('availability_unconfirmed');
    const source={marketplace:page.marketplace,url:page.url,extraction_method:selected?.method||((capture.candidates||[]).some(candidate=>candidate.method==='dom')?'dom':'none'),extractor_version:clip(capture.extractor_version||VERSION,40),captured_at:nullable(capture.captured_at,40)};
    if(options.requested_url){try{source.requested_url=marketplacePage(options.requested_url).url;}catch{/* Invalid requested seed URLs are omitted. */}}
    return {images:[...new Set((capture.product_data?.images||[]).map(imageUrl).filter(Boolean))].slice(0,10),specifications:Object.entries(specifications).slice(0,40).map(([name,value])=>({name:clip(name,80),value:clip(value,200)})).filter(item=>item.name&&item.value),rating:ratingValue(capture.product_data?.rating&&{ratingValue:capture.product_data.rating.value,ratingCount:capture.product_data.rating.rating_count,reviewCount:capture.product_data.rating.review_count}),source,product:{title,brand:nullable(identity?.brand,80),model:nullable(identity?.model,150),mpn,sku:skuFromUrl(page.url),capacity:nullable(spec(/объ[её]м/i),80)||capacityFromTitle(title),bundle:nullable(spec(/комплектац/i),200),condition},offer:{price,currency,region:region?.region||null,price_type:payment?.price_type||null,payment_condition:payment?.payment_condition||null,availability,seller,warranty_months:warrantyMonths(spec(/гаранти/i)),evidence:{region:nullable(region?.evidence,120),payment_condition:nullable(payment?.evidence,120)}},candidates,needs_review:reasons.length>0,review_reasons:[...new Set(reasons)].slice(0,20),identity_confirmed:false};
  }
  const exported={VERSION,marketplacePage,marketplaceCategory,supportedPage,parsePrice,parseJSONLD,extract,buildObservation};
  root.CenoskopExtractor=exported;if(typeof module!=='undefined'&&module.exports)module.exports=exported;
})(globalThis);
