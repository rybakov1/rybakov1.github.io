import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('./browser-import.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {parseBrowserExport}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const example=JSON.parse(await readFile(new URL('../../browser-extension/example-export.json',import.meta.url),'utf8'));
const fresh=()=>structuredClone(example);

test('preserves enriched facts and rejects unsafe image links',()=>{
  const d=fresh();
  Object.assign(d.observations[0],{images:['https://ir.ozone.ru/s3/multimedia-a/image.jpg'],specifications:[{name:'Объём памяти',value:'16 ГБ'}],rating:{value:4.8,rating_count:12,review_count:5,scope:'unknown'}});
  const row=parseBrowserExport(JSON.stringify(d)).observations[0];
  assert.equal(row.images[0],d.observations[0].images[0]);
  assert.equal(row.specifications[0].value,'16 ГБ');assert.equal(row.rating.review_count,5);
  for(const src of ['https://ozone.ru.evil.test/photo','http://ir.ozone.ru/photo','https://ir.ozone.ru/photo?token=secret','https://user@ir.ozone.ru/photo']){
    d.observations[0].images=[src];assert.throws(()=>parseBrowserExport(JSON.stringify(d)));
  }
});

test('browser export imports without inventing product metadata or canonical identity',()=>{
  const parsed=parseBrowserExport(JSON.stringify(example));
  assert.equal(parsed.observations.length,2);
  assert.equal(parsed.observations[0].offer.price,367583);
  assert.equal(parsed.observations[0].product.model,null);
  assert.equal(parsed.observations[1].offer.seller.name,null);
  assert.equal(parsed.observations[0].identity_confirmed,false);
  assert.equal(parsed.observations[0].product.condition,'unknown');
  assert.equal(parsed.observations[0].source.captured_at,example.observations[0].source.captured_at);
});
test('unknown conditions and missing prices remain null',()=>{
  const d=fresh();Object.assign(d.observations[0].offer,{price:null,region:null,price_type:null,payment_condition:null,availability:null});
  const row=parseBrowserExport(JSON.stringify(d)).observations[0];
  for(const field of ['price','region','price_type','payment_condition','availability'])assert.equal(row.offer[field],null);
});
test('malformed, wrong-version and oversize inputs leave caller storage untouched',()=>{
  for(const input of ['{oops','[]','{"schema_version":"future"}',' '.repeat(5_000_001)])assert.throws(()=>parseBrowserExport(input));
  const d=fresh();d.observations=Array(201).fill(d.observations[0]);assert.throws(()=>parseBrowserExport(JSON.stringify(d)));
});
test('links are restricted and SKU must match the source page',()=>{
  for(const target of ['javascript:alert(1)','https://ozon.ru.evil.test/product/2067659662/','https://user:pass@www.ozon.ru/product/2067659662/']){
    const d=fresh();d.observations[0].source.url=target;assert.throws(()=>parseBrowserExport(JSON.stringify(d)));
  }
  const d=fresh();d.observations[0].product.sku='999';assert.throws(()=>parseBrowserExport(JSON.stringify(d)));
});
test('untrusted extra fields are discarded; titles are literal text, never instructions',()=>{
  const d=fresh();d.cookies='not-imported';d.observations[0].html='<script>bad()</script>';d.observations[0].product.title='<img src=x onerror=alert(1)>';
  const result=parseBrowserExport(JSON.stringify(d));assert.equal(result.cookies,undefined);assert.equal(result.observations[0].html,undefined);assert.equal(result.observations[0].product.title,d.observations[0].product.title);
});
test('claim of confirmed canonical identity and invalid times are rejected',()=>{
  let d=fresh();d.observations[0].identity_confirmed=true;assert.throws(()=>parseBrowserExport(JSON.stringify(d)));
  d=fresh();d.observations[0].source.captured_at='2026-11-15 12:00';assert.throws(()=>parseBrowserExport(JSON.stringify(d)));
});
test('scrolling collector exports retain bounded settings, discovery progress and page URLs',()=>{
  const d=fresh();
  Object.assign(d.job.settings,{categoryScrollRounds:12,categoryScrollPauseSeconds:2,categoryMaxProducts:100,categoryMaxPages:3});
  d.job.queue.unshift({url:'https://www.ozon.ru/category/videokarty-15721/?page=2',kind:'discovery',status:'waiting',attempts:1,discovery:{rounds:4,scrolls:3,found_count:27,stop_reason:null,page_number:2}});
  const parsed=parseBrowserExport(JSON.stringify(d));
  assert.equal(parsed.job.queue[0].url,d.job.queue[0].url);
  assert.deepEqual(parsed.job.settings,d.job.settings);
  assert.deepEqual(parsed.job.queue[0].discovery,d.job.queue[0].discovery);
  for(const value of [0,201,1.5]){
    const bad=fresh();bad.job.settings.categoryMaxProducts=value;
    assert.throws(()=>parseBrowserExport(JSON.stringify(bad)));
  }
  for(const query of ['?page=1001','?page=2&token=secret','?page=-2']){
    d.job.queue[0].url=`https://www.ozon.ru/category/videokarty-15721/${query}`;
    assert.throws(()=>parseBrowserExport(JSON.stringify(d)));
  }
});
