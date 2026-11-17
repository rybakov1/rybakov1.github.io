import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const nodeRequire=createRequire(import.meta.url);
const cache=new Map();
function load(relative){
  const path=resolve(root,relative);
  if(cache.has(path))return cache.get(path).exports;
  const source=readFileSync(path,'utf8');
  const mod={exports:{}};
  cache.set(path,mod);
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const requireDependency=name=>{
    if(name.endsWith('.css'))return {};
    if(name.endsWith('/config'))return {PUBLIC_API_URL:'',PUBLIC_API_ENABLED:false,productHref:slug=>`/product/${slug}/`};
    if(name==='./Chart')return {__esModule:true,default:()=>null,Sparkline:()=>null};
    if(name.startsWith('.')){
      const base=resolve(dirname(path),name);
      for(const extension of ['.ts','.tsx']){
        try{return load(base+extension);}catch(error){if(error.code!=='ENOENT')throw error;}
      }
      throw Error(`Cannot resolve ${name}`);
    }
    return nodeRequire(name);
  };
  new Function('require','module','exports',code)(requireDependency,mod,mod.exports);
  return mod.exports;
}

const detail=load('src/components/ProductDetail.tsx');
const card=load('src/components/ProductCard.tsx');
const listing=load('src/components/BrowserListing.tsx');
const fixture=JSON.parse(readFileSync(resolve(root,'lib/demo-catalog.json'),'utf8'))[0];
const config={telegram_enabled:true};
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));

test('old offers retain the historical price but cannot be the best or in stock',()=>{
  const original=fixture.offers[0];
  const stale={...original,id:'old',seller:{...original.seller,name:'Old seller'},price:1000,price_fresh:false,observed_at:'2026-01-01T12:00:00Z'};
  const fresh={...original,id:'fresh',seller:{...original.seller,name:'Fresh seller'},price:2000,price_fresh:true};
  const product={...fixture,offers:[stale,fresh],price:2000,discount_percent:null,price_context:{currency:'RUB',region:'RU-MOW',price_type:'regular',payment_condition:'any_card'}};
  const html=render(detail.default,{product,config});
  const rows=html.split('<article class="offer-row">').slice(1);
  assert.equal(rows.length,2);
  assert.match(rows[0],/Fresh seller/);
  assert.match(rows[0],/Лучшая цена/);
  assert.match(rows[1],/Old seller/);
  assert.match(rows[1],/Последний замер/);
  assert.match(rows[1],/цена и наличие требуют проверки/);
  assert.doesNotMatch(rows[1].split('</article>')[0],/В наличии|Лучшая цена/);
});

test('unknown current price does not invent an alert target',()=>{
  const product={...fixture,price:null,status:'stale_price'};
  const html=render(detail.AlertModal,{product,config,onClose:()=>{}});
  assert.match(html,/Текущая цена не подтверждена/);
  assert.match(html,/<input type="number"[^>]*value=""/);
  assert.match(render(card.default,{product}),/Цена устарела/);
});

test('raw observation displays its old price and preserves unknown prices',()=>{
  const observation={source:{marketplace:'ozon',captured_at:'2026-01-01T12:00:00Z',url:'https://www.ozon.ru/product/1/'},product:{sku:'1',brand:null},offer:{price:1234,currency:'RUB',region:null,payment_condition:null,seller:{name:null}},review_reasons:[]};
  const product={...fixture,record_type:'unverified_listing',browser_observation:observation,browser_observations:[observation],price:null,price_fresh:false};
  for(const component of [card.default,listing.default]){
    const html=render(component,{product});
    assert.match(html,/Последний замер · цена могла измениться/);
    assert.match(html,/1\s?234/);
    const unknown=render(component,{product:{...product,browser_observation:{...observation,offer:{...observation.offer,price:null}}}});
    assert.match(unknown,/Цена не определена/);
  }
});
