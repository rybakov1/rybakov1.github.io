import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('./browser-listings.ts',import.meta.url),'utf8');
const javascript=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {loadBrowserListings}=await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

test('moderation loads all pages including hidden imported cards with administrator auth',async()=>{
  const rows=Array.from({length:205},(_,i)=>({id:String(i),record_type:'unverified_listing',visible:i%2===0})),calls=[];
  const data=await loadBrowserListings('https://site.example','test-token',async (address,options)=>{
    const page=Number(new URL(address).searchParams.get('page'));calls.push(page);
    assert.equal(new URL(address).pathname,'/api/admin/browser-listings');assert.equal(options.headers.Authorization,'Bearer test-token');
    return Response.json({items:rows.slice((page-1)*100,page*100),total:rows.length,page,page_size:100});
  });
  assert.deepEqual(calls,[1,2,3]);assert.equal(data.length,205);assert.equal(data[1].visible,false);
});
test('moderation refuses partial or changing pages instead of silently hiding cards',async()=>{
  for(const broken of ['offline','short','changed']){
    await assert.rejects(()=>loadBrowserListings('https://site.example','test-token',async address=>{
      const page=Number(new URL(address).searchParams.get('page'));
      if(page===2&&broken==='offline')return new Response('{}',{status:503});
      const items=page===1?Array(100).fill({id:'x'}):broken==='short'?[]:[{id:'y'}];
      return Response.json({items,total:page===2&&broken==='changed'?102:101,page,page_size:100});
    }));
  }
});
