import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createApp,parseRange} from '../server/index.mjs';
test('Safari byte ranges include suffix requests and reject invalid ranges',()=>{assert.deepEqual(parseRange('bytes=0-1',100),{start:0,end:1});assert.deepEqual(parseRange('bytes=80-',100),{start:80,end:99});assert.deepEqual(parseRange('bytes=-20',100),{start:80,end:99});assert.throws(()=>parseRange('bytes=100-200',100));assert.throws(()=>parseRange('bytes=90-50',100))});
test('self-hosted routes, privacy headers and input restrictions',async()=>{
 const tmp=await mkdtemp(join(tmpdir(),'langmix-test-'));const app=await createApp({tempRoot:tmp});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 try{for(const path of ['/','/de/']){const r=await fetch(base+path);assert.equal(r.status,200);assert((await r.text()).includes('Music LangMix'));assert.equal(r.headers.get('cache-control'),'no-store')}
 const list=await(await fetch(base+'/languages.json')).json();assert(list.length>1000);assert(list.every(l=>Object.keys(l).sort().join(',')==='langcode,name'));
 assert.equal((await fetch(base+'/api/asset?url=https%3A%2F%2Fevil.test%2Ffile.mp4')).status,400);
 assert.equal((await fetch(base+'/api/jobs',{method:'POST',headers:{Origin:'https://evil.test','content-type':'application/json'},body:'{}'})).status,403);
 const config=await(await fetch(base+'/api/config')).json();if(config.nativeAvailable){const r=await fetch(base+'/api/jobs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({languages:['X','X'],quality:720,key:'pub-test_999_VIDEO'})});assert.equal((await r.json()).error,'languageCount')}
 }finally{await app.close();await rm(tmp,{recursive:true,force:true})}
});
