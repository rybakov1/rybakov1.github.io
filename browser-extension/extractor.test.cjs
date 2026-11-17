'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {marketplacePage,marketplaceCategory,parsePrice,parseJSONLD,extract,buildObservation}=require('./extractor.js');
const MSI_URL='https://www.ozon.ru/product/msi-videokarta-geforce-rtx-5080-msi-rtx5080-ventus-3x-oc-16-gb-msi-rtx5080-ventus-3x-oc-2067659662/';
const PALIT_URL='https://www.ozon.ru/product/palit-videokarta-geforce-rtx-5050-dual-8-gb-ne65050019p1-gb2070d-2572917481/';
function visible(text){return {innerText:text,getClientRects:()=>[{}],closest:()=>null};}
function mockDocument({jsonld=[],prices=[],webPrices=[],regionNodes=[],anchors=[],nextLinks=[],sellerAnchors=[],specifications=[],blocked=false,body='Описание товара',scrollY=0,viewportHeight=800,scrollHeight=2400}={}){
  const scrollingElement={scrollTop:scrollY,scrollHeight,clientHeight:viewportHeight};
  return {title:blocked?'Проверка безопасности':'Карточка видеокарты',body:{innerText:blocked?'Подтвердите, что вы не робот':body,scrollHeight},scrollingElement,documentElement:scrollingElement,defaultView:{scrollY,innerHeight:viewportHeight,getComputedStyle:()=>({display:'block',visibility:'visible'})},querySelectorAll(selector){
    if(selector==='script[type="application/ld+json"]')return jsonld.map(data=>({textContent:typeof data==='string'?data:JSON.stringify(data)}));
    if(selector==='dl dt'||selector==='[data-widget="webCharacteristics"] dl dt')return specifications.map(([key,value])=>({...visible(key),nextElementSibling:{...visible(value),tagName:'DD'}}));
    if(selector==='a[href*="/seller/"]')return anchors.filter(anchor=>anchor.href.includes('/seller/'));
    if(selector==='[data-widget="webStickyProducts"] a[href*="/seller/"]')return sellerAnchors;
    if(selector==='a[href]')return anchors;
    if(selector==='link[rel="next"][href]')return nextLinks;
    if(selector==='[data-widget="webPrice"]')return webPrices;
    if(selector.includes('addressBookBarWeb'))return regionNodes;
    if(selector.includes('[class*="price"]'))return [...prices,...webPrices];
    return [];
  }};
}
function anchor(href,text,shown=true,attributes={},pagination=false){return {...visible(text),href,getAttribute:key=>key==='href'?href:attributes[key]||null,getClientRects:()=>shown?[{}]:[],closest:selector=>pagination&&selector.includes('Paginator')?{}:null};}

test('same Ozon SKU keeps one canonical identity through slug redirects and tracking',()=>{
  const expected={url:'https://www.ozon.ru/product/2067659662/',marketplace:'ozon'};
  assert.deepEqual(marketplacePage(MSI_URL+'?from=search#offers'),expected);
  assert.deepEqual(marketplacePage('https://ozon.ru/product/2067659662'),expected);
  assert.deepEqual(marketplacePage('https://wildberries.ru/catalog/123/detail.aspx?target=ads'),{url:'https://www.wildberries.ru/catalog/123/detail.aspx',marketplace:'wildberries'});
});
test('unsupported hosts, deceptive hosts, credentials and nonproduct paths are rejected',()=>{
  for(const value of ['http://www.ozon.ru/product/test-123/','https://ozon.ru.evil.test/product/test-123/','https://user:pass@ozon.ru/product/test-123/','https://ozon.ru/category/videokarty-15721/','https://ozon.ru/product/test-123/reviews/','https://example.com/product/test-123/','https://ozon.ru:443/product/test-123/evil'])assert.throws(()=>marketplacePage(value));
});
test('price parser handles narrow spaces but rejects ranges, negatives and ambiguous separators',()=>{
  assert.equal(parsePrice('367\u202f583 ₽'),367583);
  assert.equal(parsePrice('1 234,56 RUB'),1234.56);
  for(const value of ['от 100 до 200 ₽','-500 ₽','1,234.56','1.234.567',0,Infinity,'999999999'])assert.equal(parsePrice(value),null);
});
test('AggregateOffer lowPrice is never treated as a concrete price',()=>{
  assert.deepEqual(parseJSONLD({'@type':'Product',offers:{'@type':'AggregateOffer',lowPrice:'100',highPrice:'200',priceCurrency:'RUB'}}),[]);
  assert.equal(parseJSONLD({'@graph':[{'@type':'Product',offers:{'@type':'AggregateOffer',lowPrice:'1',offers:{'@type':'Offer',price:'150',priceCurrency:'RUB'}}}]} )[0].price,150);
});
test('MSI verified structure keeps ordinary JSON-LD price separate from lower bank-card DOM price',()=>{
  const document=mockDocument({jsonld:[{'@type':'Product',name:'MSI Видеокарта GeForce RTX 5080 VENTUS 3X OC 16 ГБ',brand:'MSI',sku:'2067659662',description:'Not collected',image:'https://example.test/not-collected.jpg',aggregateRating:{ratingValue:'4.9',reviewCount:412},offers:{'@type':'Offer',price:367583,priceCurrency:'RUB',availability:'https://schema.org/InStock'}}],prices:[visible('330\u2009825\u2009₽ С банками 367\u2009583\u2009₽ С другими банками')],sellerAnchors:[anchor('https://www.ozon.ru/seller/topcomputer/',''),anchor('https://www.ozon.ru/seller/topcomputer/','TopComputer')],specifications:[['Партномер','MSI RTX5080 VENTUS 3X OC'],['Комплектация','видеокарта, документация'],['Гарантия','1 год']]});
  const capture=extract(document,MSI_URL);
  assert.equal(capture.candidates[0].method,'jsonld');assert.equal(capture.candidates[0].price,367583);
  assert.ok(capture.candidates.some(candidate=>candidate.method==='dom'&&candidate.price===330825));
  assert.equal(capture.candidates[0].seller_name,'TopComputer');assert.equal(capture.candidates[0].seller_id,'/seller/topcomputer/');
  assert.equal(capture.specifications['Партномер'],'MSI RTX5080 VENTUS 3X OC');
  for(const field of ['description','image','aggregateRating','reviews','rating','region','payment_condition','condition'])assert.equal(capture[field],undefined);
});
test('Palit verified structure preserves unknown seller and never manufactures aggregate reviews',()=>{
  const capture=extract(mockDocument({jsonld:[{'@type':'Product',name:'Palit GeForce RTX 5050 Dual 8 ГБ NE65050019P1-GB2070D',brand:{name:'Palit'},sku:'2572917481',aggregateRating:{ratingValue:4.9,reviewCount:412},offers:{'@type':'Offer',price:'47999',priceCurrency:'RUB',availability:'https://schema.org/InStock'}}],prices:[visible('47 519 ₽ С банками 47 999 ₽ С другими банками')]}),PALIT_URL);
  assert.equal(capture.candidates[0].price,47999);assert.equal(capture.candidates[0].seller_name,'');assert.equal(capture.candidates[0].seller_id,'');
  assert.equal(capture.candidates[0].rating,undefined);assert.equal(capture.candidates[0].reviews,undefined);
});
test('malformed JSON-LD and hidden or struck-out DOM prices do not break extraction',()=>{
  const hidden={...visible('100 ₽'),getClientRects:()=>[]};const struck={...visible('200 ₽'),closest:()=>({})};
  const capture=extract(mockDocument({jsonld:['{malformed'],prices:[hidden,struck,visible('300 ₽')]}),PALIT_URL);
  assert.deepEqual(capture.candidates.map(candidate=>candidate.price),[300]);
});
test('category discovery returns all rendered allowlisted product links beyond the old 30-link limit',()=>{
  const anchors=[anchor(MSI_URL+'?tracking=1','MSI'),anchor('https://ozon.ru/product/2067659662/','duplicate'),anchor(PALIT_URL,'hidden',false),anchor('https://evil.test/product/card-123/','evil'),...Array.from({length:40},(_,i)=>anchor(`https://www.ozon.ru/product/card-${i+100}/`,`Product ${i}`))];
  const capture=extract(mockDocument({anchors}),'https://www.ozon.ru/category/videokarty-15721/?sorting=rating');
  assert.equal(capture.mode,'discovery');assert.equal(capture.links.length,41);assert.equal(capture.links[0].url,'https://www.ozon.ru/product/2067659662/');assert.equal(new Set(capture.links.map(link=>link.url)).size,41);
  assert.throws(()=>marketplaceCategory('https://www.ozon.ru/product/item-123/'));
});
test('category URL keeps only a bounded page number and normalizes its identity',()=>{
  assert.equal(marketplaceCategory('https://ozon.ru/category/videokarty-15721?page=2&tracking=private#reviews').url,'https://www.ozon.ru/category/videokarty-15721/?page=2');
  assert.equal(marketplaceCategory('https://ozon.ru/category/videokarty-15721/?page=1&sorting=rating').url,'https://www.ozon.ru/category/videokarty-15721/');
  for(const query of ['page=0','page=-1','page=2.5','page=1001','page=01','page=2&page=3','page=Infinity'])assert.throws(()=>marketplaceCategory(`https://www.ozon.ru/category/videokarty-15721/?${query}`));
});
test('successive scans see lazy loaded and virtualized cards and report real scroll position',()=>{
  const cards=Array.from({length:9},(_,i)=>anchor(`https://www.ozon.ru/product/card-${i+100}/`,`Product ${i}`));
  const document=mockDocument({anchors:cards,viewportHeight:800,scrollHeight:2400});
  const first=extract(document,'https://www.ozon.ru/category/videokarty-15721/');
  assert.equal(first.links.length,9);assert.deepEqual(first.viewport,{scroll_y:0,viewport_height:800,scroll_height:2400,at_bottom:false});
  // A virtualized category removes the first screen when it renders the next one.
  cards.splice(0,cards.length,...Array.from({length:18},(_,i)=>anchor(`https://www.ozon.ru/product/card-${i+109}/`,`Later ${i}`)));
  document.defaultView.scrollY=1600;document.scrollingElement.scrollTop=1600;
  const later=extract(document,'https://www.ozon.ru/category/videokarty-15721/');
  assert.equal(later.links.length,18);assert.equal(later.viewport.at_bottom,true);
  assert.equal(new Set([...first.links,...later.links].map(link=>link.url)).size,27);
  document.body.scrollHeight=4800;
  assert.equal(extract(document,'https://www.ozon.ru/category/videokarty-15721/').viewport.at_bottom,false);
});
test('large category scans remain bounded at 500 unique products',()=>{
  const anchors=Array.from({length:700},(_,i)=>anchor(`https://www.ozon.ru/product/card-${i+100}/`,`Product ${i}`));
  assert.equal(extract(mockDocument({anchors}),'https://www.ozon.ru/category/videokarty-15721/').links.length,500);
});
test('next page comes from explicit same-category DOM navigation without carrying tracking query',()=>{
  const page='https://www.ozon.ru/category/videokarty-15721/?page=2';
  for(const navigation of [
    {anchors:[anchor('/category/videokarty-15721/?page=3&tracking=secret','',true,{rel:'next'})]},
    {anchors:[anchor('/category/videokarty-15721/?page=3&tracking=secret','Дальше')]},
    {anchors:[anchor('/category/videokarty-15721/?page=3','3',true,{},true)]},
    {nextLinks:[anchor('/category/videokarty-15721/?page=3&tracking=secret','')]}
  ])assert.equal(extract(mockDocument(navigation),page).next_page_url,'https://www.ozon.ru/category/videokarty-15721/?page=3');
});
test('pagination ignores hidden, disabled, unrelated, backward and unlabelled links',()=>{
  const anchors=[
    anchor('/category/videokarty-15721/?page=2','2'),
    anchor('/category/videokarty-15721/?page=2','Дальше',false),
    anchor('/category/videokarty-15721/?page=2','Дальше',true,{'aria-disabled':'true'}),
    anchor('https://ozon.ru.evil.test/category/videokarty-15721/?page=2','Дальше'),
    anchor('/category/telefony-15502/?page=2','Дальше'),
    anchor('/category/videokarty-15721/?page=3','Дальше'),
    anchor('/category/videokarty-15721/?page=1','Дальше'),
    anchor('/category/videokarty-15721/?page=2&page=3','Дальше'),
    anchor('/product/card-123/','Дальше')
  ];
  assert.equal(extract(mockDocument({anchors}),'https://www.ozon.ru/category/videokarty-15721/').next_page_url,null);
});
test('challenge detection runs again after a category has lazily loaded cards',()=>{
  const document=mockDocument({anchors:[anchor(MSI_URL,'MSI')]});
  assert.equal(extract(document,'https://www.ozon.ru/category/videokarty-15721/').blocked,false);
  document.body.innerText='Подтвердите, что вы не робот';
  const blocked=extract(document,'https://www.ozon.ru/category/videokarty-15721/');
  assert.equal(blocked.blocked,true);assert.equal(blocked.links,undefined);assert.equal(blocked.next_page_url,undefined);
});
test('a challenge stops extraction instead of attempting a bypass',()=>{
  const capture=extract(mockDocument({blocked:true,prices:[visible('100 ₽')]}),MSI_URL);
  assert.equal(capture.blocked,true);assert.deepEqual(capture.candidates,[]);
});

function msiProduct(extra={}){return {'@type':'Product',name:'MSI GeForce RTX 5080 VENTUS 3X OC 16 ГБ',brand:'MSI',sku:'2067659662',offers:{'@type':'Offer',price:367583,priceCurrency:'RUB',availability:'https://schema.org/InStock'},...extra};}
test('automatic observation chooses matching SKU and ignores cheaper recommended product JSON-LD',()=>{
  const capture=extract(mockDocument({jsonld:[{'@graph':[msiProduct({sku:'2572917481',name:'Recommended',offers:{'@type':'Offer',price:100,priceCurrency:'RUB'}}),msiProduct()]}]}),MSI_URL);
  const observation=buildObservation(capture);
  assert.equal(observation.offer.price,367583);assert.equal(observation.product.sku,'2067659662');assert.equal(observation.product.brand,'MSI');
  assert.ok(!observation.candidates.some(candidate=>candidate.price===100));assert.equal(observation.identity_confirmed,false);
});
test('product URL can match without SKU, but an explicit contradictory SKU or offer URL is rejected',()=>{
  const withoutSku=msiProduct({sku:undefined,url:MSI_URL});
  assert.equal(parseJSONLD(withoutSku,MSI_URL)[0].matches_page,true);
  assert.deepEqual(parseJSONLD(msiProduct({sku:'999',url:MSI_URL}),MSI_URL),[]);
  assert.deepEqual(parseJSONLD(msiProduct({url:MSI_URL,offers:{'@type':'Offer',price:1,priceCurrency:'RUB',url:PALIT_URL}}),MSI_URL),[]);
});
test('unmatched JSON-LD identity does not silently become the current product',()=>{
  const capture=extract(mockDocument({jsonld:[msiProduct({sku:undefined})]}),MSI_URL),observation=buildObservation(capture);
  assert.equal(observation.offer.price,null);assert.equal(observation.product.brand,null);assert.equal(observation.needs_review,true);
  assert.ok(observation.review_reasons.includes('matching_jsonld_offer_unavailable'));
});
test('multiple concrete matching offers stay ambiguous even when amounts coincide',()=>{
  for(const offers of [[367583,367583],[367583,330825]]){
    const capture=extract(mockDocument({jsonld:[msiProduct({offers:offers.map(price=>({'@type':'Offer',price,priceCurrency:'RUB'}))})]}),MSI_URL),observation=buildObservation(capture);
    assert.equal(observation.offer.price,null);assert.equal(observation.needs_review,true);assert.ok(observation.review_reasons.includes('ambiguous_matching_offers'));
    assert.equal(observation.candidates.length,2);
  }
});
test('ordinary other-bank evidence is tied to the exact JSON-LD amount, not the lower bank amount',()=>{
  const capture=extract(mockDocument({jsonld:[msiProduct()],webPrices:[visible('330 825 ₽ С банками 367 583 ₽ С другими банками Возврат товара')],regionNodes:[visible('Доставка: Санкт-Петербург, Невский проспект, дом 1')],specifications:[['Партномер','MSI RTX5080 VENTUS 3X OC'],['Гарантия','1 год'],['Комплектация','видеокарта, документация']]}),MSI_URL);
  const observation=buildObservation(capture,{requested_url:MSI_URL});
  assert.equal(observation.offer.price,367583);assert.equal(observation.offer.price_type,'regular');assert.equal(observation.offer.payment_condition,'other_bank_card');
  assert.equal(observation.offer.region,'RU-SPE');assert.equal(observation.offer.evidence.region,'Санкт-Петербург');
  assert.ok(!JSON.stringify(observation).includes('Невский'));assert.ok(observation.offer.evidence.payment_condition.includes('367 583'));
  assert.equal(observation.product.capacity,'16 ГБ');assert.equal(observation.product.mpn,'MSI RTX5080 VENTUS 3X OC');assert.equal(observation.offer.warranty_months,12);
});
test('a bare JSON-LD amount never implies ordinary payment, Moscow or new condition',()=>{
  const observation=buildObservation(extract(mockDocument({jsonld:[msiProduct()],body:'Отзывы: мне доставили в Москву. Доставка из Санкт-Петербурга.'}),MSI_URL));
  assert.equal(observation.offer.price,367583);assert.equal(observation.offer.region,null);assert.equal(observation.offer.payment_condition,null);assert.equal(observation.offer.price_type,null);assert.equal(observation.product.condition,'unknown');
  assert.equal(observation.offer.seller.name,null);assert.equal(observation.offer.warranty_months,null);assert.equal(observation.needs_review,true);
});
test('generic DOM-only prices remain unresolved and need review',()=>{
  const observation=buildObservation(extract(mockDocument({prices:[visible('100 ₽'),visible('200 ₽')]}),MSI_URL));
  assert.equal(observation.offer.price,null);assert.equal(observation.offer.currency,null);assert.equal(observation.candidates.length,2);assert.equal(observation.needs_review,true);
});
test('a single exact ordinary-price widget permits a DOM amount but remains marked for review',()=>{
  const observation=buildObservation(extract(mockDocument({webPrices:[visible('47 519 ₽ С банками 47 999 ₽ С другими банками')]}),PALIT_URL));
  assert.equal(observation.offer.price,47999);assert.equal(observation.offer.payment_condition,'other_bank_card');assert.equal(observation.needs_review,true);assert.ok(observation.review_reasons.includes('dom_price_requires_review'));
});
test('unrelated recommendation seller links never attach to the current offer',()=>{
  const observation=buildObservation(extract(mockDocument({jsonld:[msiProduct()],anchors:[anchor('https://www.ozon.ru/seller/recommendations/','Unrelated seller')]}),MSI_URL));
  assert.deepEqual(observation.offer.seller,{id:null,name:null});
});
test('explicit schema condition is used, conflicting visible condition remains unknown',()=>{
  const product=msiProduct({itemCondition:'https://schema.org/UsedCondition'});
  const first=buildObservation(extract(mockDocument({jsonld:[product]}),MSI_URL));assert.equal(first.product.condition,'used');
  const conflict=buildObservation(extract(mockDocument({jsonld:[product],specifications:[['Состояние','Новый']]}),MSI_URL));assert.equal(conflict.product.condition,'unknown');assert.ok(conflict.review_reasons.includes('condition_conflict'));
});
test('category discovery skips CSS-hidden links as well as zero-size links',()=>{
  const document=mockDocument({anchors:[anchor(MSI_URL,'CSS hidden'),anchor(PALIT_URL,'visible')]});
  document.defaultView.getComputedStyle=node=>({display:'block',visibility:node.innerText==='CSS hidden'?'hidden':'visible'});
  const capture=extract(document,'https://www.ozon.ru/category/videokarty-15721/');assert.equal(capture.links.length,1);assert.equal(capture.links[0].url,marketplacePage(PALIT_URL).url);
});
test('export builder whitelists bounded observed fields and drops unrelated sensitive blobs',()=>{
  const capture=extract(mockDocument({jsonld:[msiProduct({description:'PRIVATE_DESCRIPTION',image:'PRIVATE_IMAGE',aggregateRating:{ratingValue:4.9,reviewCount:412}})]}),MSI_URL);
  Object.assign(capture,{html:'PRIVATE_HTML',cookies:'PRIVATE_COOKIES',token:'PRIVATE_KEY',reviews:['PRIVATE_REVIEW']});
  const observation=buildObservation(capture),serialized=JSON.stringify(observation);
  for(const value of ['PRIVATE_DESCRIPTION','PRIVATE_IMAGE','PRIVATE_HTML','PRIVATE_COOKIES','PRIVATE_KEY','PRIVATE_REVIEW'])assert.ok(!serialized.includes(value));
  assert.equal(observation.identity_confirmed,false);assert.equal(observation.candidates.length,1);assert.equal(observation.product.title.length<=300,true);
});
const enrichedProduct=(extra={})=>msiProduct({offers:undefined,image:['https://ir.ozone.ru/s3/item.jpg?token=secret#x','https://ir.ozone.ru/s3/side.jpg'],aggregateRating:{ratingValue:'4.8',ratingCount:'400',reviewCount:'153'},additionalProperty:[{'@type':'PropertyValue',name:'Частота',value:'2500 МГц'}],...extra});
test('matched product metadata survives missing price and remains distinct from seller ratings',()=>{
  const current=enrichedProduct(),recommendation=msiProduct({sku:'999',image:'https://ir.ozone.ru/other.jpg',aggregateRating:{ratingValue:1,reviewCount:999},additionalProperty:[{name:'Wrong',value:'Wrong'}]});
  const observation=buildObservation(extract(mockDocument({jsonld:[{'@graph':[recommendation,current]}],specifications:[['Объём памяти','16 ГБ'],['Интерфейс','PCI-E']]}),MSI_URL));
  assert.equal(observation.offer.price,null);assert.equal(observation.product.brand,'MSI');assert.equal(observation.product.title,current.name);
  assert.deepEqual(observation.images,['https://ir.ozone.ru/s3/item.jpg','https://ir.ozone.ru/s3/side.jpg']);
  assert.deepEqual(observation.rating,{value:4.8,rating_count:400,review_count:153,scope:'unknown'});
  assert.deepEqual(observation.specifications,[{name:'Частота',value:'2500 МГц'},{name:'Объём памяти',value:'16 ГБ'},{name:'Интерфейс',value:'PCI-E'}]);
  assert.doesNotMatch(JSON.stringify(observation),/other\.jpg|token=secret|Wrong/);
});
test('unknown, conflicting and malformed rating facts do not become invented values',()=>{
  let observation=buildObservation(extract(mockDocument({jsonld:[enrichedProduct({aggregateRating:{ratingValue:'8',reviewCount:'abc'}})]}),MSI_URL));
  assert.equal(observation.rating,null);
  observation=buildObservation(extract(mockDocument({jsonld:[enrichedProduct(),enrichedProduct({aggregateRating:{ratingValue:3,reviewCount:22}})]}),MSI_URL));
  assert.equal(observation.rating,null);
  observation=buildObservation(extract(mockDocument({jsonld:[enrichedProduct({aggregateRating:{ratingValue:4,bestRating:10,reviewCount:3}})]}),MSI_URL));
  assert.equal(observation.rating,null);
});
test('photo export accepts trusted HTTPS CDN addresses only and strips query parameters',()=>{
  const images=['http://ir.ozone.ru/no.jpg','https://ir.ozone.ru.evil.test/no.jpg','https://user:pass@ir.ozone.ru/no.jpg','https://127.0.0.1/no.jpg','https://basket-01.wbbasket.ru/a.jpg?x=private','https://ir.ozone.ru/safe.jpg#fragment'];
  const observation=buildObservation(extract(mockDocument({jsonld:[enrichedProduct({image:images})]}),MSI_URL));
  assert.deepEqual(observation.images,['https://basket-01.wbbasket.ru/a.jpg','https://ir.ozone.ru/safe.jpg']);
});

test('verified Ozon product score and gallery DOM are read without mixing recommendations',()=>{
  const d=mockDocument({jsonld:[enrichedProduct({image:'https://ir.ozone.ru/s3/item.jpg',aggregateRating:undefined})]});
  const original=d.querySelectorAll.bind(d);
  d.querySelectorAll=selector=>selector==='[data-widget="webSingleProductScore"]'?[visible('4.9 • 414 отзывов')]:selector==='[data-widget="webGallery"] img'?[{...visible(''),src:'https://ir.ozone.ru/s3/wc50/item.jpg'},{...visible(''),src:'https://ir.ozone.ru/s3/wc50/side.jpg'}]:original(selector);
  const row=buildObservation(extract(d,MSI_URL));
  assert.deepEqual(row.rating,{value:4.9,rating_count:null,review_count:414,scope:'unknown'});
  assert.deepEqual(row.images,['https://ir.ozone.ru/s3/item.jpg','https://ir.ozone.ru/s3/wc50/side.jpg']);
  d.querySelectorAll=selector=>selector==='[data-widget="webSingleProductScore"]'?[visible('Нет отзывов')]:original(selector);
  assert.equal(buildObservation(extract(d,MSI_URL)).rating.review_count,0);
});

test('conflicting matching JSON-LD ratings stay unknown even if the visible score agrees with one',()=>{
  const d=mockDocument({jsonld:[enrichedProduct(),enrichedProduct({aggregateRating:{ratingValue:3,reviewCount:22}})]}), original=d.querySelectorAll.bind(d);
  d.querySelectorAll=selector=>selector==='[data-widget="webSingleProductScore"]'?[visible('4.8 • 153 отзыва')]:original(selector);
  assert.equal(buildObservation(extract(d,MSI_URL)).rating,null);
});
