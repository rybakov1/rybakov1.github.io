'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {CollectorEngine,STATE_KEY,ALARM_NAME}=require('./collector-engine.js');
const parser=require('./extractor.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const A='https://www.ozon.ru/product/2067659662/',B='https://www.ozon.ru/product/2572917481/';
const CATEGORY='https://www.ozon.ru/category/videokarty-15721/';
const productUrls=(count,start=3000000000)=>Array.from({length:count},(_,index)=>`https://www.ozon.ru/product/${start+index}/`);
const categoryCapture=(links,options={})=>({url:options.url||CATEGORY,mode:'discovery',blocked:false,links,viewport:{scroll_y:options.top||0,scroll_height:options.height||5000,viewport_height:800,at_bottom:options.bottom===true},next_page_url:options.next||null});
function harness(initial={}){
  const h={now:Date.parse('2026-11-15T10:00:00Z'),store:copy(initial),tabs:new Map([[1,{id:1,status:'complete',url:'https://example.com/'}]]),created:[],removed:[],downloads:[],alarms:new Map(),timers:new Map(),captures:new Map(),scans:[],scrolls:[],permissions:true,nextId:10,nextTimer:1};
  const browser={storage:{local:{setAccessLevel:async()=>{},get:async keys=>keys===null?copy(h.store):Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>h.store[k]!==undefined).map(k=>[k,copy(h.store[k])])),set:async values=>{if(h.onSet)await h.onSet(values);Object.assign(h.store,copy(values));},remove:async keys=>(Array.isArray(keys)?keys:[keys]).forEach(k=>delete h.store[k])}},permissions:{contains:async()=>h.permissions,getAll:async()=>({origins:['http://localhost/*','https://www.ozon.ru/*']}),remove:async value=>{h.revoked=value.origins;}},alarms:{clear:async name=>{if(h.onClear)await h.onClear(name);h.alarms.delete(name);return true;},create:async(name,info)=>h.alarms.set(name,info)},tabs:{create:async options=>{const tab={id:h.nextId++,status:'loading',...options};h.tabs.set(tab.id,tab);h.created.push(copy(tab));return copy(tab);},get:async id=>{if(!h.tabs.has(id))throw Error('Missing tab');return copy(h.tabs.get(id));},remove:async id=>{h.removed.push(id);h.tabs.delete(id);},query:async()=>[h.tabs.get(1)]},scripting:{executeScript:async request=>{
    if(request.files)return[];
    if(request.func.name==='scrollCategoryViewport'){
      h.scrolls.push({id:request.target.tabId,at:h.now});
      if(h.onScroll)await h.onScroll(request);
      return[{result:true}];
    }
    h.scans.push({id:request.target.tabId,at:h.now});
    if(h.onCapture)await h.onCapture();
    const tab=h.tabs.get(request.target.tabId);
    const configured=h.captures.get(tab.url),special=typeof configured==='function'?await configured(tab):configured;
    if(special instanceof Error)throw special;
    return [{result:special||{mode:'product',url:tab.url,marketplace:'ozon',blocked:false,title:'Test product',captured_at:new Date(h.now).toISOString(),extractor_version:parser.VERSION,candidates:[{price:100,currency:'RUB',method:'jsonld',matches_page:true,product_name:'Test product',brand:'Test',mpn:'TEST-1',sku:tab.url.match(/\d+/)[0],condition:'unknown',availability:true}]} }];
  }},downloads:{download:async options=>{if(h.downloadFails)throw Error('Downloads unavailable');h.downloads.push({...options,json:JSON.parse(decodeURIComponent(options.url.split(',').slice(1).join(',')))});return h.downloads.length;}}};
  h.engine=new CollectorEngine(browser,parser,{now:()=>h.now,randomId:()=>`run-${h.nextId}`,setTimeout:(fn,delay)=>{const id=h.nextTimer++;h.timers.set(id,{fn,at:h.now+delay});return id;},clearTimeout:id=>h.timers.delete(id)});
  h.start=async(urls=[A,B],settings={},partition)=>h.engine.dispatch({type:'AUTO_START',urls,partition,settings:{delaySeconds:5,renderWaitSeconds:3,pageTimeoutSeconds:45,maxPages:50,autoExport:true,...settings}});
  h.state=()=>h.engine.dispatch({type:'AUTO_GET_STATE'});
  h.advance=async seconds=>{h.now+=seconds*1000;await h.engine.onAlarm({name:ALARM_NAME});};
  h.load=async()=>{const state=await h.state(),tab=h.tabs.get(state.activeTabId);tab.status='complete';await h.engine.onTabUpdated(tab.id,{status:'complete'},copy(tab));};
  h.capture=async()=>{await h.load();await h.advance(3);};
  return h;
}

test('queue automatically navigates, deduplicates SKU, respects pause and exports one valid JSON',async()=>{
  const h=harness();await h.start([A,A+'?tracking=yes',B]);assert.equal(h.created.length,1);assert.equal(h.created[0].active,false);
  await h.capture();let state=await h.state();assert.equal(state.results.length,1);assert.equal(state.queue.length,2);assert.equal(h.created.length,1);
  await Promise.all([h.engine.onAlarm({name:ALARM_NAME}),h.engine.onAlarm({name:ALARM_NAME})]);assert.equal(h.created.length,1);
  await h.advance(5);assert.equal(h.created.length,2);await h.capture();state=await h.state();assert.equal(state.status,'completed');assert.equal(state.results.length,2);assert.equal(h.downloads.length,1);assert.equal(h.downloads[0].saveAs,false);assert.equal(h.downloads[0].json.job.partial,false);
  const Ajv=require('../frontend/node_modules/ajv');const validate=new Ajv({allErrors:true}).compile(require('./export-schema.json'));assert.equal(validate(h.downloads[0].json),true,JSON.stringify(validate.errors));
  await h.engine.onAlarm({name:ALARM_NAME});assert.equal(h.downloads.length,1);assert.ok(h.tabs.has(1));assert.ok(!h.removed.includes(1));
});
test('JSON text reads partial state without downloading or changing the collector and matches a manual file export',async()=>{
  const h=harness();await h.start([A,B],{autoExport:false});await h.capture();
  const before=await h.state(),saved=copy(h.store),created=h.created.length,alarms=copy([...h.alarms]);
  const output=await h.engine.dispatch({type:'AUTO_GET_EXPORT_JSON'}),data=JSON.parse(output.json);
  assert.equal(h.downloads.length,0);assert.deepEqual(await h.state(),before);assert.deepEqual(h.store,saved);
  assert.equal(h.created.length,created);assert.deepEqual([...h.alarms],alarms);
  assert.equal(data.job.status,'running');assert.equal(data.job.partial,true);assert.equal(output.partial,true);assert.equal(output.observation_count,1);
  assert.equal(data.observations[0].source.url,A);assert.equal(data.job.queue.length,2);assert.match(output.filename,/\.json$/);
  const Ajv=require('../frontend/node_modules/ajv'),validate=new Ajv({allErrors:true}).compile(require('./export-schema.json'));
  assert.equal(validate(data),true,JSON.stringify(validate.errors));
  await h.engine.dispatch({type:'AUTO_EXPORT',saveAs:true});assert.deepEqual(h.downloads[0].json,data);
});
test('JSON text reflects completed runs and reports an empty collector without downloading',async()=>{
  const h=harness();await assert.rejects(h.engine.dispatch({type:'AUTO_GET_EXPORT_JSON'}),/Пока нет результатов/);assert.equal(h.downloads.length,0);
  await h.start([A],{autoExport:false});await h.capture();const before=await h.state();
  const output=await h.engine.dispatch({type:'AUTO_GET_EXPORT_JSON'}),data=JSON.parse(output.json);
  assert.equal(output.partial,false);assert.equal(data.job.status,'completed');assert.equal(data.job.partial,false);assert.equal(data.observations.length,1);
  assert.deepEqual(await h.state(),before);assert.equal(h.downloads.length,0);
});
test('pause closes only the owned tab, retains pending item and resumes after delay',async()=>{
  const h=harness();await h.start();const id=(await h.state()).activeTabId;await h.engine.dispatch({type:'AUTO_PAUSE'});assert.equal((await h.state()).status,'paused');assert.ok(h.removed.includes(id));assert.ok(h.tabs.has(1));await h.advance(100);assert.equal(h.created.length,1);
  await h.engine.dispatch({type:'AUTO_RESUME'});await h.advance(5);assert.equal(h.created.length,2);assert.equal((await h.state()).queue[0].attempts,2);
});
test('stop during outstanding script discards the late capture and cannot restart collection',async()=>{
  const h=harness();await h.start();await h.load();let release,entered;const inside=new Promise(r=>entered=r);h.onCapture=()=>{entered();return new Promise(r=>release=r);};
  h.now+=3000;const reading=h.engine.onAlarm({name:ALARM_NAME});await inside;const stopping=h.engine.dispatch({type:'AUTO_STOP'});release();await Promise.all([reading,stopping]);const state=await h.state();assert.equal(state.status,'stopped');assert.equal(state.results.length,0);await h.advance(100);assert.equal(h.created.length,1);assert.equal(h.downloads.length,0);assert.ok(h.tabs.has(1));
});
test('CAPTCHA stops the whole run and preserves partial JSON without automatic retry',async()=>{
  const h=harness();await h.start();await h.capture();await h.advance(5);h.captures.set(B,{url:B,mode:'product',blocked:true});await h.capture();assert.equal((await h.state()).status,'blocked');await h.advance(100);assert.equal(h.created.length,2);assert.equal(h.downloads.length,0);await h.engine.dispatch({type:'AUTO_EXPORT',saveAs:true});assert.equal(h.downloads[0].json.observations.length,1);assert.equal(h.downloads[0].json.job.partial,true);assert.equal(h.downloads[0].json.errors[0].code,'captcha_or_challenge');
});
test('redirect to challenge URL blocks without reading the page or opening the next URL',async()=>{
  const h=harness();await h.start();const tab=h.tabs.get((await h.state()).activeTabId);tab.url='https://www.ozon.ru/captcha/?secret=do-not-export';await h.load();const state=await h.state();assert.equal(state.status,'blocked');assert.doesNotMatch(JSON.stringify(state),/do-not-export/);await h.advance(100);assert.equal(h.created.length,1);
});
test('page timeout is recorded and following URL starts only after the configured delay',async()=>{
  const h=harness();await h.start();await h.advance(46);assert.equal((await h.state()).errors[0].code,'page_timeout');assert.equal(h.created.length,1);await h.advance(5);assert.equal(h.created.length,2);
});
test('service-worker wake resumes saved work; browser restart pauses and never closes a reused user tab ID',async()=>{
  const h=harness();await h.start([A]);await h.load();const saved=copy(h.store);const resumed=harness(saved);resumed.now=h.now;resumed.tabs.set(saved[STATE_KEY].activeTabId,copy(h.tabs.get(saved[STATE_KEY].activeTabId)));await resumed.engine.initialize();await resumed.advance(3);assert.equal((await resumed.state()).status,'completed');
  const restarted=harness(saved);restarted.tabs.set(saved[STATE_KEY].activeTabId,{id:saved[STATE_KEY].activeTabId,url:'https://example.com/user-page',status:'complete'});await restarted.engine.onBrowserStartup();assert.equal((await restarted.state()).status,'paused');assert.deepEqual(restarted.removed,[]);assert.equal((await restarted.state()).activeTabId,null);
});
test('category links are queued automatically with dedupe, bounds and truncation count',async()=>{
  const h=harness(),category='https://www.ozon.ru/category/videokarty-15721/';h.captures.set(category,{url:category,mode:'discovery',links:[{url:A},{url:A+'?dup=1'},{url:B},{url:'https://evil.test/'}]});await h.start([category],{maxPages:2});await h.capture();const state=await h.state();assert.equal(state.queue.length,2);assert.equal(state.queue[1].url,A);assert.equal(state.discovered_count,2);assert.equal(state.truncated_count,1);assert.equal(state.results.length,0);
});
test('legacy API credentials and grants are removed; export contains no legacy state',async()=>{
  const h=harness({collectorSettings:{token:'secret-legacy',apiOrigin:'http://localhost:8000'},collectorJob:{lease_token:'secret-lease'}});await h.start([A]);await h.capture();assert.equal(h.store.collectorSettings,undefined);assert.ok(h.revoked.includes('http://localhost/*'));assert.doesNotMatch(JSON.stringify(h.downloads),/secret-legacy|secret-lease|localhost:8000/);
});
test('download failure keeps completed results and allows an explicit retry',async()=>{
  const h=harness();h.downloadFails=true;await h.start([A]);await h.capture();assert.equal((await h.state()).status,'completed');assert.equal((await h.state()).results.length,1);assert.ok((await h.state()).last_export.error);h.downloadFails=false;await h.engine.dispatch({type:'AUTO_EXPORT',saveAs:true});assert.equal(h.downloads.length,1);
});
test('stop at completion storage boundary prevents late automatic download',async()=>{
  const h=harness();await h.start([A]);await h.load();let release,entered;const inside=new Promise(r=>entered=r);let once=true;
  h.onSet=values=>{if(once&&values[STATE_KEY]?.status==='completed'){once=false;entered();return new Promise(r=>release=r);}};
  h.now+=3000;const finishing=h.engine.onAlarm({name:ALARM_NAME});await inside;const stop=h.engine.dispatch({type:'AUTO_STOP'});release();await Promise.all([finishing,stop]);assert.equal((await h.state()).status,'stopped');assert.equal(h.downloads.length,0);
});

test('category autoscroll retains nine initial cards and twelve new virtualized cards',async()=>{
  const h=harness(),first=productUrls(9),second=productUrls(12,4000000000);
  let pass=0;h.captures.set(CATEGORY,()=>categoryCapture(pass++===0?first:second,{top:640}));
  await h.start([CATEGORY],{maxPages:100,categoryScrollRounds:1});await h.capture();
  let state=await h.state();assert.equal(state.phase,'discovering');assert.equal(state.queue.length,10);assert.equal(h.scrolls.length,1);
  await h.advance(1);assert.equal(h.scans.length,1);
  await h.advance(1);state=await h.state();
  assert.equal(state.queue[0].status,'complete');assert.equal(state.queue[0].discovery.stop_reason,'round_limit');assert.equal(state.discovered_count,21);
  assert.deepEqual(new Set(state.queue.slice(1).map(row=>row.url)),new Set([...first,...second]));
  assert.equal(state.queue[0].discovery.rounds,2);assert.equal(h.scrolls.length,1);assert.equal(h.created.length,1);
});

test('a suspended worker resumes category discovery with its saved links and scroll count',async()=>{
  const h=harness(),first=productUrls(9),second=productUrls(12,4000000000);h.captures.set(CATEGORY,categoryCapture(first));
  await h.start([CATEGORY],{maxPages:100,categoryScrollRounds:1});await h.capture();
  const saved=copy(h.store),resumed=harness(saved),id=saved[STATE_KEY].activeTabId;
  resumed.now=h.now;resumed.tabs.set(id,copy(h.tabs.get(id)));resumed.captures.set(CATEGORY,categoryCapture(second,{top:640}));
  await resumed.engine.initialize();await resumed.advance(2);const state=await resumed.state();
  assert.equal(state.discovered_count,21);assert.equal(state.queue.length,22);assert.equal(state.queue[0].status,'complete');assert.equal(resumed.scrolls.length,0);
});

test('category honors an explicitly configured one-second lazy-load pause',async()=>{
  const h=harness();h.captures.set(CATEGORY,categoryCapture([A]));
  await h.start([CATEGORY],{categoryScrollRounds:1,categoryScrollPauseSeconds:1});await h.capture();
  await h.advance(0.5);assert.equal(h.scans.length,1);
  h.captures.set(CATEGORY,categoryCapture([A,B],{top:640}));
  await h.advance(0.5);assert.equal(h.scans.length,2);
  assert.equal((await h.state()).queue[0].status,'complete');
  assert.equal((await h.state()).discovered_count,2);
});

test('category product cap bounds queued products and counts omitted unique cards once',async()=>{
  const h=harness();h.captures.set(CATEGORY,categoryCapture(productUrls(21)));
  await h.start([CATEGORY],{maxPages:100,categoryMaxProducts:10});await h.capture();const state=await h.state();
  assert.equal(state.queue.length,11);assert.equal(state.discovered_count,21);assert.equal(state.truncated_count,11);assert.equal(state.queue[0].discovery.found_count,10);assert.equal(state.queue[0].discovery.stop_reason,'product_limit');assert.equal(h.scrolls.length,0);
});

test('three unchanged bottom passes finish discovery, while growing page height resets stability',async()=>{
  const h=harness();let pass=0;
  h.captures.set(CATEGORY,()=>categoryCapture([A],{bottom:true,height:pass++<2?1000:1500,top:700}));
  await h.start([CATEGORY],{categoryScrollRounds:12});await h.capture();
  await h.advance(2);assert.equal((await h.state()).queue[0].discovery.stable_passes,1);
  await h.advance(2);assert.equal((await h.state()).queue[0].discovery.stable_passes,0);
  await h.advance(2);await h.advance(2);assert.equal((await h.state()).phase,'discovering');
  await h.advance(2);const state=await h.state();assert.equal(state.queue[0].status,'complete');assert.equal(state.queue[0].discovery.stop_reason,'no_growth');assert.equal(h.scrolls.length,5);
});

test('unchanged cards away from the bottom continue only until the configured round cap',async()=>{
  const h=harness();h.captures.set(CATEGORY,categoryCapture([A]));
  await h.start([CATEGORY],{categoryScrollRounds:3});await h.capture();await h.advance(2);await h.advance(2);await h.advance(2);
  const state=await h.state();assert.equal(state.queue[0].status,'complete');assert.equal(state.queue[0].discovery.stop_reason,'round_limit');assert.equal(state.queue[0].discovery.rounds,4);assert.equal(h.scrolls.length,3);
});

test('category scan budget remains separate from the page loading timeout',async()=>{
  const h=harness();h.captures.set(CATEGORY,categoryCapture([A]));
  await h.start([CATEGORY],{categoryScrollRounds:30});await h.capture();
  for(let pass=0;pass<30;pass++)await h.advance(2);
  const state=await h.state();assert.equal(state.queue[0].status,'complete');assert.equal(state.errors.length,0);assert.equal(state.queue[0].discovery.rounds,31);assert.equal(h.scrolls.length,30);
});

test('the category deadline also allows durable thirty-second MV3 alarm wakes',async()=>{
  const h=harness();h.captures.set(CATEGORY,categoryCapture([A]));
  await h.start([CATEGORY],{categoryScrollRounds:12});await h.capture();
  for(let pass=0;pass<12;pass++)await h.advance(30);
  const state=await h.state();assert.equal(state.queue[0].status,'complete');assert.equal(state.errors.length,0);assert.equal(state.queue[0].discovery.rounds,13);
});

test('stop during scrolling keeps committed discoveries and discards the late scroll result',async()=>{
  const h=harness();h.captures.set(CATEGORY,categoryCapture([A]));await h.start([CATEGORY]);await h.load();
  let release,entered;const inside=new Promise(resolve=>entered=resolve);
  h.onScroll=()=>{entered();return new Promise(resolve=>release=resolve);};
  h.now+=3000;const scanning=h.engine.onAlarm({name:ALARM_NAME});await inside;
  const stopping=h.engine.dispatch({type:'AUTO_STOP'});release();await Promise.all([scanning,stopping]);
  const state=await h.state();assert.equal(state.status,'stopped');assert.equal(state.queue[0].status,'pending');assert.equal(state.discovered_count,1);assert.equal(state.queue[1].url,A);assert.equal(state.queue[0].discovery.scrolls,0);assert.equal(state.activeTabId,null);
  await h.advance(100);assert.equal(h.scans.length,1);assert.equal(h.created.length,1);assert.equal(h.alarms.size,0);assert.ok(h.tabs.has(1));
});

test('pause and reopen preserve category discoveries without duplicating the first viewport',async()=>{
  const h=harness();h.captures.set(CATEGORY,categoryCapture([A]));await h.start([CATEGORY],{categoryScrollRounds:1});await h.capture();
  await h.engine.dispatch({type:'AUTO_PAUSE'});await h.engine.dispatch({type:'AUTO_RESUME'});await h.advance(5);await h.capture();
  h.captures.set(CATEGORY,categoryCapture([B]));await h.advance(2);const state=await h.state();
  assert.equal(state.queue[0].attempts,2);assert.equal(state.discovered_count,2);assert.deepEqual(state.queue.slice(1).map(row=>row.url),[A,B]);assert.equal(state.queue[0].status,'complete');
});

test('CAPTCHA after an initial category pass stops the entire run and keeps partial discoveries',async()=>{
  const h=harness();let pass=0;h.captures.set(CATEGORY,()=>pass++===0?categoryCapture([A]):{url:CATEGORY,mode:'discovery',blocked:true});
  await h.start([CATEGORY]);await h.capture();await h.advance(2);let state=await h.state();
  assert.equal(state.status,'blocked');assert.equal(state.queue[0].error,'captcha_or_challenge');assert.equal(state.queue[1].url,A);assert.equal(state.discovered_count,1);assert.equal(h.created.length,1);assert.equal(h.scrolls.length,1);
  await h.advance(100);assert.equal(h.scans.length,2);assert.equal(h.downloads.length,0);
  await h.engine.dispatch({type:'AUTO_EXPORT'});const json=h.downloads[0].json;assert.equal(json.job.partial,true);assert.equal(json.job.queue[0].discovery.found_count,1);assert.equal(json.job.queue[0].discovery.stop_reason,null);assert.equal(json.job.queue[0].discovery.seen_urls,undefined);
  const Ajv=require('../frontend/node_modules/ajv'),validate=new Ajv({allErrors:true}).compile(require('./export-schema.json'));assert.equal(validate(json),true,JSON.stringify(validate.errors));
});

test('a category redirect after scrolling stops instead of advancing to discovered products',async()=>{
  const h=harness();h.captures.set(CATEGORY,categoryCapture([A]));await h.start([CATEGORY]);await h.capture();
  h.tabs.get((await h.state()).activeTabId).url='https://www.ozon.ru/captcha/?secret=hidden';await h.advance(2);const state=await h.state();
  assert.equal(state.status,'blocked');assert.equal(state.errors[0].code,'unexpected_redirect_or_block');assert.doesNotMatch(JSON.stringify(state),/secret=hidden/);assert.equal(h.created.length,1);
});

test('verified consecutive category pages run before products and respect the category page cap',async()=>{
  const h=harness(),page2=CATEGORY+'?page=2',page3=CATEGORY+'?page=3';
  h.captures.set(CATEGORY,categoryCapture([A],{next:page2}));h.captures.set(page2,categoryCapture([A,B],{url:page2,next:page3}));
  await h.start([CATEGORY],{categoryScrollRounds:0,categoryMaxPages:2});await h.capture();let state=await h.state();assert.equal(state.queue[1].url,page2);
  await h.advance(5);assert.equal(h.created[1].url,page2);await h.capture();state=await h.state();
  assert.deepEqual(state.queue.map(row=>row.url),[CATEGORY,page2,A,B]);assert.equal(state.discovered_count,2);assert.equal(state.queue[1].discovery.page_number,2);assert.equal(state.queue[1].discovery.found_count,1);assert.ok(!state.queue.some(row=>row.url===page3));
});

test('category pagination rejects another category, another host, skipped pages and extra query keys',async()=>{
  for(const next of ['https://www.ozon.ru/category/processory-15722/?page=2','https://evil.test/category/videokarty-15721/?page=2',CATEGORY+'?page=3',CATEGORY+'?page=2&redirect=https://evil.test/',CATEGORY+'?page=2&page=2']){
    const h=harness();h.captures.set(CATEGORY,categoryCapture([A],{next}));await h.start([CATEGORY],{categoryScrollRounds:0});await h.capture();const state=await h.state();assert.deepEqual(state.queue.map(row=>row.url),[CATEGORY,A],next);
  }
});

test('ten independent profiles divide category products without overlap and export separate files',async()=>{
  const products=productUrls(100),assigned=new Set();
  for(let index=1;index<=10;index++){
    const h=harness();h.captures.set(CATEGORY,categoryCapture([...products,...products.slice(0,3)]));
    await h.start([CATEGORY],{maxPages:200,categoryMaxProducts:100,categoryScrollRounds:0},{index,count:10});await h.capture();
    const state=await h.state();assert.deepEqual(state.partition,{index,count:10});
    assert.equal(state.queue[0].url,CATEGORY);
    for(const row of state.queue.slice(1)){assert.equal(assigned.has(row.url),false,`duplicate ${row.url}`);assigned.add(row.url);}
    await h.engine.dispatch({type:'AUTO_EXPORT'});assert.match(h.downloads[0].filename,new RegExp(`-part${index}of10\\.json$`));
    const Ajv=require('../frontend/node_modules/ajv');const validate=new Ajv({allErrors:true}).compile(require('./export-schema.json'));assert.equal(validate(h.downloads[0].json),true,JSON.stringify(validate.errors));
  }
  assert.deepEqual(assigned,new Set(products));
});

test('direct product URLs use the same partition mapping as discovery, including SKU canonicalization',async()=>{
  const products=productUrls(30),assigned=new Set();
  for(let index=1;index<=3;index++){
    const h=harness();await h.start([CATEGORY,...products,products[0]+'?tracking=1'],{maxPages:200,categoryScrollRounds:0},{index,count:3});
    const initial=(await h.state()).queue.slice(1).map(row=>row.url);h.captures.set(CATEGORY,categoryCapture(products));await h.capture();
    const after=(await h.state()).queue.slice(1).map(row=>row.url);assert.deepEqual(after,initial);
    for(const url of after){assert.equal(assigned.has(url),false);assigned.add(url);}
  }
  assert.deepEqual(assigned,new Set(products));
});

test('original inputs persist before sharding and queue limits, including after worker restart',async()=>{
  const h=harness(),products=productUrls(40);
  await h.start([CATEGORY+'?track=1',...products,products[0]+'?duplicate=yes'],{maxPages:2},{index:1,count:10});
  const expected=[CATEGORY,...products],state=await h.state();
  assert.deepEqual(state.input_urls,expected);
  assert.ok(state.queue.length<expected.length);
  assert.ok(state.truncated_count>0);
  const saved=copy(h.store),resumed=harness(saved),id=state.activeTabId;
  resumed.now=h.now;resumed.tabs.set(id,copy(h.tabs.get(id)));await resumed.engine.initialize();
  assert.deepEqual((await resumed.state()).input_urls,expected);
  const json=JSON.parse((await resumed.engine.dispatch({type:'AUTO_GET_EXPORT_JSON'})).json);
  assert.equal(json.job.input_urls,undefined);
  assert.equal(json.input_urls,undefined);
});

test('expanded discovery queue never replaces original inputs, and old states remain readable',async()=>{
  const h=harness(),found=productUrls(15);
  h.captures.set(CATEGORY,categoryCapture(found));
  await h.start([CATEGORY],{categoryScrollRounds:0,maxPages:100},{index:1,count:3});await h.capture();
  const state=await h.state();assert.deepEqual(state.input_urls,[CATEGORY]);assert.ok(state.queue.length>1);
  const saved=copy(h.store);delete saved[STATE_KEY].input_urls;
  const legacy=harness(saved);legacy.now=h.now;
  if(state.activeTabId!=null)legacy.tabs.set(state.activeTabId,copy(h.tabs.get(state.activeTabId)));
  await legacy.engine.initialize();assert.equal((await legacy.state()).input_urls,undefined);
});

test('original inputs cannot silently exceed the 200 URL configuration limit',async()=>{
  const h=harness();await assert.rejects(h.start([CATEGORY,...productUrls(200)]),/не более 200/);
  assert.equal(h.created.length,0);
});

test('every profile visits category pagination while products remain disjoint',async()=>{
  const products=productUrls(36),page2=CATEGORY+'?page=2',assigned=new Set();
  for(let index=1;index<=3;index++){
    const h=harness();h.captures.set(CATEGORY,categoryCapture(products.slice(0,18),{next:page2}));
    h.captures.set(page2,categoryCapture(products.slice(9),{url:page2}));
    await h.start([CATEGORY],{maxPages:100,categoryScrollRounds:0,categoryMaxPages:2},{index,count:3});
    await h.capture();await h.advance(5);assert.equal(h.created[1].url,page2);await h.capture();
    for(const row of (await h.state()).queue.filter(row=>row.kind==='product')){assert.equal(assigned.has(row.url),false);assigned.add(row.url);}
  }
  assert.deepEqual(assigned,new Set(products));
});

test('invalid partition settings fail and pause/resume retains valid partition',async()=>{
  for(const part of [{index:0,count:10},{index:11,count:10},{index:1,count:33},{index:1.5,count:10}]){
    const h=harness();await assert.rejects(h.start([CATEGORY],{},part),/Номер экземпляра/);assert.equal(h.created.length,0);
  }
  const h=harness();await h.start([CATEGORY],{},{index:3,count:10});await h.engine.dispatch({type:'AUTO_PAUSE'});await h.engine.dispatch({type:'AUTO_RESUME'});
  assert.deepEqual((await h.state()).partition,{index:3,count:10});await h.advance(5);assert.deepEqual((await h.state()).partition,{index:3,count:10});
});
