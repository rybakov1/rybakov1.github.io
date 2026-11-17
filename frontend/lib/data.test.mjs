import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const fixture = JSON.parse(await readFile(new URL('./demo-catalog.json', import.meta.url), 'utf8'));
const originalSource = await readFile(new URL('./data.ts', import.meta.url), 'utf8');
let moduleId = 0;

// Compile the actual adapter with controlled environment/network dependencies.
// This avoids a running API and keeps tests independent of Astro's build mode.
async function adapter(configured, fetchImplementation, demoFallback = false) {
  const source = originalSource
    .replace(/^import .+;\r?$/gm, '')
    .replace(/^export \{ formatPrice.+;\r?$/gm, '')
    .replaceAll('import.meta.env', '({SSR:true,STATIC_DEMO:""})');
  const declarations = `const demoCatalog=${JSON.stringify([fixture[0]])};\nconst API_BASE_URL="http://api.test", PUBLIC_API_URL="http://api.test", SITE_NAME="Demo", HAS_CONFIGURED_API=${configured}, ALLOW_DEMO_FALLBACK=${demoFallback};\n`;
  const javascript = ts.transpileModule(declarations + source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const previousFetch = globalThis.fetch;
  const previousStatic = process.env.EXPORT_STATIC;
  delete process.env.EXPORT_STATIC;
  globalThis.fetch = fetchImplementation;
  const module = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}#${++moduleId}`);
  return {module,restore(){globalThis.fetch=previousFetch;if(previousStatic===undefined)delete process.env.EXPORT_STATIC;else process.env.EXPORT_STATIC=previousStatic;}};
}

test('a hidden product returning 404 never reappears from the demo fixture', async () => {
  const {module,restore}=await adapter(false,async()=>new Response('{}',{status:404}));
  try {assert.deepEqual(await module.getProductResult(fixture[0].slug),{product:null,available:true});assert.equal(await module.getProduct(fixture[0].slug),null);} finally {restore();}
});

test('product service outages are different from a missing product', async () => {
  const {module,restore}=await adapter(true,async()=>new Response('{}',{status:500}));
  try {assert.deepEqual(await module.getProductResult('sample'),{product:null,available:false});} finally {restore();}
});

test('malformed API payloads are reported as unavailable, not as 404s or empty catalogues', async () => {
  const {module,restore}=await adapter(true,async()=>Response.json(null));
  try {assert.deepEqual(await module.getProductResult('sample'),{product:null,available:false});assert.deepEqual(await module.getProductsResult(),{items:[],available:false});} finally {restore();}
});

test('an explicitly configured unavailable API never becomes a synthetic catalogue', async () => {
  const {module,restore}=await adapter(true,async()=>{throw new TypeError('Network offline');});
  try {
    assert.deepEqual(await module.getProducts(),[]);
    assert.equal(await module.getProduct(fixture[0].slug),null);
    assert.equal((await module.getAppConfig()).data_mode,'unavailable');
  } finally {restore();}
});

test('a standalone site without an API uses demo only when explicitly enabled', async () => {
  const {module,restore}=await adapter(false,async()=>{throw new TypeError('No API configured');},true);
  try {
    const items=await module.getProducts();
    assert.equal(items.length,1);
    assert.equal(items[0].is_demo,true);
    assert.equal((await module.getAppConfig()).data_mode,'demo');
  } finally {restore();}
});

test('a missing API without demo opt-in cannot invent an offline catalogue', async () => {
  const {module,restore}=await adapter(false,async()=>{throw new TypeError('No API configured');});
  try {assert.deepEqual(await module.getProductsResult(),{items:[],available:false});assert.equal((await module.getAppConfig()).data_mode,'unavailable');} finally {restore();}
});

test('an available but empty catalogue stays distinct from an unavailable service', async () => {
  const {module,restore}=await adapter(true,async()=>Response.json({items:[],total:0,page:1,page_size:100}));
  try {assert.deepEqual(await module.getProductsResult(),{items:[],available:true});} finally {restore();}
});

test('server errors do not silently replace a reachable service with demo data', async () => {
  const {module,restore}=await adapter(false,async()=>new Response('{}',{status:500}));
  try {assert.deepEqual(await module.getProducts(),[]);} finally {restore();}
});

test('catalogue fetches all API pages before applying filters and sorting', async () => {
  const all=Array.from({length:215},(_,i)=>({...fixture[0],id:`item-${i}`,slug:`item-${i}`,name:`Товар ${i}`,price:i+1,is_demo:false}));
  const requested=[];
  const {module,restore}=await adapter(true,async address=>{
    const url=new URL(address),page=Number(url.searchParams.get('page')||1),size=Number(url.searchParams.get('page_size'));
    requested.push(page);
    return Response.json({items:all.slice((page-1)*size,page*size),total:all.length,page,page_size:size});
  });
  try {
    const result=await module.getProducts({min_price:200,sort:'price_desc'});
    assert.deepEqual(requested,[1,2,3]);
    assert.equal(result.length,16);
    assert.equal(result[0].id,'item-214');
    assert.equal(result.at(-1).id,'item-199');
  } finally {restore();}
});

test('failure on a later page never returns a partial catalogue or demo fallback', async () => {
  for(const configured of [true,false]){
    for(const failure of ['server','offline']){
      const requested=[];
      const {module,restore}=await adapter(configured,async address=>{
        const page=Number(new URL(address).searchParams.get('page')||1);requested.push(page);
        if(page===2){if(failure==='offline')throw new TypeError('network offline');return new Response('{}',{status:500});}
        return Response.json({items:[fixture[0]],total:101,page:1,page_size:100});
      });
      try {assert.deepEqual(await module.getProductsResult(),{items:[],available:false});assert.deepEqual(requested,[1,2]);} finally {restore();}
    }
  }
});

test('an incomplete or changing paginated response is not displayed as a complete catalogue', async () => {
  for(const changed of [false,true]){
    const {module,restore}=await adapter(true,async address=>{
      const page=Number(new URL(address).searchParams.get('page')||1);
      return Response.json({items:page===1?Array(100).fill(fixture[0]):[],total:changed&&page===2?100:101,page,page_size:100});
    });
    try {assert.deepEqual(await module.getProducts(),[]);} finally {restore();}
  }
});

test('unknown prices stay last in either price sort and are excluded from bounded filters', async () => {
  const {module,restore}=await adapter(false,async()=>new Response('{}',{status:404}));
  try {
    const unknown={...fixture[0],id:'unknown',price:null};
    const cheap={...fixture[0],id:'cheap',price:100};
    const expensive={...fixture[0],id:'expensive',price:200};
    const items=[unknown,expensive,cheap];
    assert.deepEqual(module.filterProducts(items,{sort:'price_asc'}).map(p=>p.id),['cheap','expensive','unknown']);
    assert.deepEqual(module.filterProducts(items,{sort:'price_desc'}).map(p=>p.id),['expensive','cheap','unknown']);
    assert.deepEqual(module.filterProducts(items,{max_price:150}).map(p=>p.id),['cheap']);
    assert.deepEqual(module.filterProducts(items,{min_price:150}).map(p=>p.id),['expensive']);
  } finally {restore();}
});
