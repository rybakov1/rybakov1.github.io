'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function createPopup(overrides={}){
  const elements=new Map(),calls=[];
  function element(id){
    if(!elements.has(id))elements.set(id,{value:'',checked:true,hidden:false,disabled:false,style:{},events:{},textContent:'',className:'',
      addEventListener(type,fn){this.events[type]=fn;},replaceChildren(){},setAttribute(){},append(){},
      focus(){this.focused=true;},select(){this.selected=true;}});
    return elements.get(id);
  }
  const state={status:'running',phase:'delay',queue:[{url:'https://www.ozon.ru/product/123/',status:'pending'}],index:0,settings:{},results:[],errors:[],discovered_count:0,truncated_count:0,...overrides};
  let timer,clipboard='',denyCopy=false;
  const navigator={clipboard:{writeText:async value=>{if(denyCopy)throw Error('denied');clipboard=value;}}};
  const chrome={runtime:{sendMessage:async message=>{calls.push(message.type);return {ok:true,data:message.type==='AUTO_GET_EXPORT_JSON'?{json:'{"observations":[1]}',partial:true,observation_count:1}:state};}},permissions:{request:async()=>{calls.push('PERMISSIONS_REQUEST');return true;}}};
  const context={document:{getElementById:element,createElement:()=>element(Math.random())},
    window:{setInterval(fn){timer=fn;return 1;},addEventListener(){},confirm:()=>true,clearInterval(){}},
    navigator,chrome,CenoskopExtractor:require('./extractor.js'),console,Intl,Date,Set,Object,Number,String,Array,Error};
  vm.runInNewContext(fs.readFileSync(`${__dirname}/popup.js`,'utf8'),context);
  return {element,calls,refresh:()=>timer(),clipboard:()=>clipboard,denyCopy:()=>{denyCopy=true;}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('shows a partial JSON snapshot without downloading and keeps it through status refresh',async()=>{
  const popup=createPopup();await flush();
  popup.element('showJsonButton').events.click();await flush();await flush();
  assert.equal(popup.element('jsonPanel').hidden,false);
  assert.equal(popup.element('jsonText').value,'{"observations":[1]}');
  assert.match(popup.element('jsonState').textContent,/Промежуточные/);
  popup.element('jsonText').selected=true;
  popup.refresh();await flush();
  assert.equal(popup.element('jsonText').value,'{"observations":[1]}');
  assert.equal(popup.element('jsonText').selected,true);
  assert.ok(popup.calls.includes('AUTO_GET_EXPORT_JSON'));
  assert.ok(!popup.calls.includes('AUTO_EXPORT'));
});

test('copies the snapshot on request and selects it manually if clipboard access fails',async()=>{
  const popup=createPopup();await flush();popup.element('showJsonButton').events.click();await flush();await flush();
  popup.element('copyJsonButton').events.click();await flush();
  assert.equal(popup.clipboard(),'{"observations":[1]}');
  assert.match(popup.element('jsonCopyStatus').textContent,/скопирован/);
  popup.denyCopy();popup.element('copyJsonButton').events.click();await flush();
  assert.equal(popup.element('jsonText').focused,true);
  assert.equal(popup.element('jsonText').selected,true);
  assert.match(popup.element('jsonCopyStatus').textContent,/Ctrl\+C/);
});

test('configuration round trip applies and copies complete settings without launching a collection',async()=>{
  const popup=createPopup({status:'idle',queue:[],input_urls:['https://www.ozon.ru/category/videokarty-15721/']});await flush();
  const initial=JSON.parse(popup.element('configJson').value);
  assert.equal(initial.schema_version,'cenoskop.collector-config.v1');
  assert.deepEqual(initial.urls,['https://www.ozon.ru/category/videokarty-15721/']);
  initial.settings.maxPages=110;initial.settings.autoExport=false;initial.partition={count:10,index:4};
  initial.urls=['https://www.ozon.ru/product/msi-2067659662/?tracking=1'];
  popup.element('configJson').value=JSON.stringify(initial);popup.element('configJson').events.input();
  popup.element('configApplyButton').events.click();
  assert.equal(popup.element('sourceUrls').value,'https://www.ozon.ru/product/2067659662/');
  assert.equal(popup.element('maxPages').value,'110');assert.equal(popup.element('autoExport').checked,false);
  assert.equal(popup.element('partitionCount').value,'10');assert.equal(popup.element('partitionIndex').value,'4');
  popup.element('configGenerateButton').events.click();
  const generated=JSON.parse(popup.element('configJson').value);
  assert.equal(generated.settings.maxPages,110);assert.equal(generated.partition.index,4);assert.deepEqual(generated.urls,['https://www.ozon.ru/product/2067659662/']);
  popup.element('configCopyButton').events.click();await flush();assert.equal(popup.clipboard(),popup.element('configJson').value);
  assert.equal(popup.calls.includes('AUTO_START'),false);
  popup.denyCopy();popup.element('configCopyButton').events.click();await flush();
  assert.equal(popup.element('configJson').selected,true);assert.match(popup.element('configStatus').textContent,/Ctrl\+C/);
});

test('invalid configuration never partially changes fields and cannot be applied during a run',async()=>{
  const popup=createPopup({status:'idle',queue:[],input_urls:['https://www.ozon.ru/category/videokarty-15721/']});await flush();
  const original=JSON.parse(popup.element('configJson').value),before=popup.element('sourceUrls').value;
  for(const mutate of [d=>{d.settings.maxPages=201;},d=>{d.settings.autoExport='false';},d=>{d.partition.index=2;},d=>{d.urls=['https://evil.example/'];},d=>{d.token='secret';}]){
    const value=structuredClone(original);mutate(value);popup.element('configJson').value=JSON.stringify(value);popup.element('configApplyButton').events.click();
    assert.equal(popup.element('sourceUrls').value,before);assert.equal(popup.element('maxPages').value,'50');assert.ok(popup.element('configStatus').className.includes('error'));
  }
  const running=createPopup();await flush();const beforeRunning=running.element('sourceUrls').value;
  running.element('configJson').value=JSON.stringify(original);running.element('configApplyButton').events.click();
  assert.equal(running.element('sourceUrls').value,beforeRunning);assert.match(running.element('configStatus').textContent,/остановите/);
});

test('initial hydration retains a typed config and uses original URLs rather than discovered queue',async()=>{
  const input=['https://www.ozon.ru/category/videokarty-15721/'];
  const popup=createPopup({input_urls:input,queue:[{url:'https://www.ozon.ru/product/123/',status:'complete'}]});
  popup.element('configJson').value='{"draft":true}';popup.element('configJson').events.input();await flush();
  assert.equal(popup.element('configJson').value,'{"draft":true}');assert.equal(popup.element('sourceUrls').value,input[0]);
  popup.refresh();await flush();assert.equal(popup.element('configJson').value,'{"draft":true}');
  const legacy=createPopup();await flush();assert.match(legacy.element('configStatus').textContent,/старой очереди/);
});

test('a changed JSON draft cannot start stale settings, and applying it enables the intended start',async()=>{
  const popup=createPopup({status:'idle',queue:[],input_urls:['https://www.ozon.ru/category/videokarty-15721/']});await flush();
  const edited=JSON.parse(popup.element('configJson').value);edited.settings.maxPages=110;
  popup.element('configJson').value=JSON.stringify(edited);popup.element('configJson').events.input();
  popup.element('collectorForm').events.submit({preventDefault(){}});await flush();
  assert.equal(popup.calls.includes('PERMISSIONS_REQUEST'),false);assert.equal(popup.calls.includes('AUTO_START'),false);
  assert.match(popup.element('configStatus').textContent,/Сначала примените JSON/);
  popup.element('configApplyButton').events.click();assert.equal(popup.element('maxPages').value,'110');
  popup.element('collectorForm').events.submit({preventDefault(){}});await flush();await flush();
  assert.equal(popup.calls.includes('PERMISSIONS_REQUEST'),true);assert.equal(popup.calls.includes('AUTO_START'),true);
});
