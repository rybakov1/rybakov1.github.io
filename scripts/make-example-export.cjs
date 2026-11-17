'use strict';
// Convert previously recorded facts to a documented example, without opening
// marketplace pages or changing the original observation timestamp.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const parser=require(path.join(root,'browser-extension/extractor.js'));
const recorded=JSON.parse(fs.readFileSync(path.join(root,'data/initial-browser-observations.json'),'utf8'));
const observations=recorded.items.map(({canonical,observation:o})=>parser.buildObservation({
  mode:'product',url:o.page_url,marketplace:'ozon',blocked:false,title:canonical.name,
  captured_at:recorded.captured_at,extractor_version:'recorded-observation-example-0.2',
  candidates:[{method:'jsonld',matches_page:true,price:o.price,currency:o.currency,raw:String(o.price),label:'Recorded JSON-LD Offer',product_name:canonical.name,brand:canonical.brand,sku:parser.marketplacePage(o.page_url).url.match(/\d+/)[0],seller_name:o.seller_name||'',seller_id:o.seller_id||'',availability:o.availability,condition:'unknown'}],
  specifications:{'Партномер':canonical.mpn,'Комплектация':canonical.bundle,'Объём памяти':canonical.capacity,...(o.warranty_months?{'Гарантия':`${o.warranty_months} месяцев`}:{})},
  ordinary_evidence:[{price:o.price,currency:o.currency,price_type:o.price_type,payment_condition:o.payment_condition,evidence:o.extracted_price_text}],
  region_evidence:{region:o.region,evidence:'Санкт-Петербург'},
},{requested_url:o.page_url}));
const example={schema_version:'cenoskop.browser-export.v1',job:{run_id:'recorded-observations-example',status:'completed',partial:false,started_at:recorded.captured_at,updated_at:recorded.captured_at,exported_at:recorded.captured_at,settings:{delaySeconds:12,renderWaitSeconds:8,pageTimeoutSeconds:45,maxPages:50,autoExport:true},queue:observations.map(o=>({url:o.source.url,kind:'product',status:'complete',attempts:1})),processed_pages:2,discovered_count:0,truncated_count:0},observations,errors:[]};
const Ajv=require(path.join(root,'frontend/node_modules/ajv'));
const validate=new Ajv({allErrors:true}).compile(JSON.parse(fs.readFileSync(path.join(root,'browser-extension/export-schema.json'),'utf8')));
if(!validate(example))throw Error(JSON.stringify(validate.errors));
fs.writeFileSync(path.join(root,'browser-extension/example-export.json'),JSON.stringify(example,null,2)+'\n');
process.stdout.write('Example JSON: 2 recorded observations; schema validation passed.\n');
