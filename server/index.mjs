import http from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile,stat,mkdir,rm,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join,extname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Readable} from 'node:stream';
import {metadata,resolveSource,parseProviderSource,remote,allowedMediaUrl,vendors,MAX_FILE} from './source.mjs';
import {prepareNative,renderNative} from './render.mjs';
import {validatePlan} from '../public/core.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const PUBLIC=join(ROOT,'public');
const HEADERS={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY','permissions-policy':'camera=(), microphone=(), geolocation=()'};
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const knownErrors=new Set(['invalidURL','invalidSource','noVideo','network','badLink','tooLarge','durationLimit','downloadFailed','languageCount','invalidCuts','invalidOffset','noBoundaries','renderFailed','serverMissing','expired','busyServer','canceled']);
export function parseRange(value,size){
 if(!value)return null;const m=/^bytes=(\d*)-(\d*)$/.exec(value);if(!m||(!m[1]&&!m[2]))throw Error('range');
 let start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2])),end=m[2]&&m[1]?Number(m[2]):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)throw Error('range');return {start,end:Math.min(size-1,end)};
}
function json(res,data,status=200){res.writeHead(status,{...HEADERS,'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))}
async function body(req){let chunks=[],n=0;for await(const c of req){n+=c.length;if(n>12000)throw Error('tooLarge');chunks.push(c)}try{return JSON.parse(Buffer.concat(chunks))}catch{throw Error('invalidSource')}}
function authorized(req,password){if(!password)return true;let value='';try{value=Buffer.from((req.headers.authorization||'').replace(/^Basic /,''),'base64').toString().split(':').slice(1).join(':')}catch{}const hash=s=>createHash('sha256').update(s).digest();return timingSafeEqual(hash(value),hash(password))}
export async function createApp({tempRoot=process.env.TEMP_ROOT||join(tmpdir(),'music-langmix'),password=process.env.ACCESS_PASSWORD||'',ttl=3600000}={}){
 await mkdir(tempRoot,{recursive:true,mode:0o700});const catalog=JSON.parse(await readFile(join(PUBLIC,'languages.json'),'utf8')),codes=new Set(catalog.map(x=>x.langcode));
 let nativeAvailable=false;try{const r=await promisify(execFile)(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-encoders'],{timeout:5000});nativeAvailable=r.stdout.includes('libx264')}catch{}
 const jobs=new Map(),queue=[];let running=false,shuttingDown=false;
 for(const dir of await readdir(tempRoot)){if(/^job-[a-f0-9]{64}$/.test(dir)){const p=join(tempRoot,dir);if(Date.now()-(await stat(p)).mtimeMs>ttl)await rm(p,{recursive:true,force:true})}}
 async function cleanup(job){job.controller.abort();await rm(job.dir,{recursive:true,force:true}).catch(()=>{});jobs.delete(job.id)}
 async function pump(){if(running||shuttingDown)return;running=true;try{while(queue.length){const {job,task}=queue.shift();if(job.controller.signal.aborted)continue;job.state=task==='prepare'?'preparing':'rendering';
 try{await(task==='prepare'?prepareNative(job):renderNative(job,catalog));job.updated=Date.now()}
 catch(e){job.state=job.controller.signal.aborted?'canceled':'failed';job.error=knownErrors.has(e.message)?e.message:'renderFailed';job.stage='failed';job.updated=Date.now();await rm(job.dir,{recursive:true,force:true}).catch(()=>{})}
 }}finally{running=false}}
 function enqueue(job,task){job.state='queued';job.stage='queue';queue.push({job,task});void pump()}
 const timer=setInterval(()=>{for(const job of jobs.values()){if((['ready','done','failed','canceled'].includes(job.state)&&Date.now()-job.updated>ttl)||Date.now()-job.created>7200000)void cleanup(job)}},60000);timer.unref();
 function snapshot(j){return {id:j.id,state:j.state,stage:j.stage,progress:j.progress,bytes:j.bytes,totalBytes:j.totalBytes,title:j.title,warnings:j.warnings,error:j.error,resultSize:j.resultSize,options:j.options,expiresAt:j.updated+ttl,...(j.plan?{duration:j.plan.duration,cuts:j.plan.cuts,sources:j.plan.sources.map(s=>({code:s.code,offset:s.offset,confidence:s.confidence,duration:s.duration}))}:{})}}
 const server=http.createServer(async(req,res)=>{
 try{
 if(!authorized(req,password)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Music LangMix", charset="UTF-8"',...HEADERS});return res.end('Authentication required')}
 const origin=`http://${req.headers.host}`,u=new URL(req.url,origin),method=req.method;
 if(!['GET','HEAD','POST','DELETE'].includes(method))return json(res,{error:'invalidSource'},405);
 if(['POST','DELETE'].includes(method)&&req.headers.origin){const sent=new URL(req.headers.origin);if(sent.host!==req.headers.host)return json(res,{error:'invalidSource'},403)}
 if(u.pathname==='/api/config')return json(res,{nativeAvailable,retentionSeconds:ttl/1000});
 if(u.pathname==='/api/resolve'&&method==='GET'){const p=await resolveSource(u.searchParams.get('url')||'');const m=await metadata(p.key,p.locale);return json(res,{...p,...m})}
 if(u.pathname==='/api/media'&&method==='GET')return json(res,await metadata(u.searchParams.get('key')||'',u.searchParams.get('lang')||''));
 if(u.pathname==='/api/asset'&&['GET','HEAD'].includes(method)){
 const target=u.searchParams.get('url');if(!allowedMediaUrl(target))return json(res,{error:'invalidSource'},400);
 const controller=new AbortController();res.on('close',()=>controller.abort());const r=await remote(target,{signal:controller.signal,headers:req.headers.range?{range:req.headers.range}:{},validate:allowedMediaUrl});
 if(!r.ok)throw Error('downloadFailed');if(Number(r.headers.get('content-length'))>MAX_FILE)throw Error('tooLarge');const headers={...HEADERS};for(const k of ['content-type','content-length','content-range','accept-ranges'])if(r.headers.has(k))headers[k]=r.headers.get(k);res.writeHead(r.status,headers);if(method==='HEAD'){await r.body?.cancel();return res.end()}let bytes=0;for await(const chunk of r.body){bytes+=chunk.length;if(bytes>MAX_FILE){controller.abort();break}if(!res.write(chunk))await new Promise(r=>res.once('drain',r))}return res.end();
 }
 if(vendors[u.pathname]&&['GET','HEAD'].includes(method)){const [url,type]=vendors[u.pathname];const r=await remote(url);if(!r.ok)throw Error('network');res.writeHead(200,{...HEADERS,'cache-control':'public, max-age=86400','content-type':type});if(method==='HEAD'){await r.body?.cancel();return res.end()}return Readable.fromWeb(r.body).pipe(res)}
 if(u.pathname==='/api/jobs'&&method==='POST'){
 if(!nativeAvailable)return json(res,{error:'serverMissing'},503);if(jobs.size>=6||queue.length>=3)return json(res,{error:'busyServer'},429);
 const input=await body(req);if(!Array.isArray(input.languages)||input.languages.length<2||input.languages.length>10||new Set(input.languages).size!==input.languages.length||input.languages.some(c=>!codes.has(c)))throw Error('languageCount');
 if(!/^pub-[A-Za-z0-9_-]{1,100}_VIDEO$/.test(input.key)||![360,480,720,1080].includes(input.quality))throw Error('invalidSource');
 let sourceUrl;
 if(input.sourceUrl!==undefined){
  if(typeof input.sourceUrl!=='string')throw Error('invalidSource');
  const source=parseProviderSource(input.sourceUrl);
  if(source.key&&source.key!==input.key)throw Error('invalidSource');
  sourceUrl=source.url;
 }
 const id=randomBytes(32).toString('hex'),dir=join(tempRoot,'job-'+id);await mkdir(dir,{mode:0o700});
 const job={id,dir,created:Date.now(),updated:Date.now(),controller:new AbortController(),progress:0,bytes:0,totalBytes:0,warnings:[],options:{key:input.key,sourceUrl,languages:input.languages,quality:input.quality,locale:input.locale==='de'?'de':'en'},title:String(input.title||'').slice(0,200)};jobs.set(id,job);enqueue(job,'prepare');return json(res,{id},202);
 }
 const jm=/^\/api\/jobs\/([a-f0-9]{64})(?:\/(render|result))?$/.exec(u.pathname);
 if(jm){const j=jobs.get(jm[1]);if(!j)return json(res,{error:'expired'},404);
 if(!jm[2]&&method==='GET')return json(res,snapshot(j));
 if(!jm[2]&&method==='DELETE'){await cleanup(j);return json(res,{deleted:true})}
 if(jm[2]==='render'&&method==='POST'){
 if(j.state!=='ready')return json(res,{error:'invalidSource'},409);const input=await body(req);if(!Array.isArray(input.cuts)||!Array.isArray(input.offsets)||input.cuts.length!==j.plan.sources.length-1||input.offsets.length!==j.plan.sources.length||input.offsets[0]!==0)throw Error('invalidCuts');
 const candidate={duration:j.plan.duration,cuts:input.cuts.map(x=>({time:Math.round(x*24)/24})),sources:j.plan.sources.map((s,i)=>({...s,offset:input.offsets[i]}))};validatePlan(candidate);j.plan=candidate;j.options.locale=input.locale==='de'?'de':'en';j.showLabel=input.showLabel!==false;enqueue(j,'render');return json(res,{id:j.id},202);
 }
 if(jm[2]==='result'&&['GET','HEAD'].includes(method)&&j.state==='done'){
 const file=join(j.dir,'mix.mp4'),size=(await stat(file)).size;let range;try{range=parseRange(req.headers.range,size)}catch{res.writeHead(416,{...HEADERS,'Content-Range':`bytes */${size}`});return res.end()}
 const headers={...HEADERS,'content-type':'video/mp4','accept-ranges':'bytes','content-disposition':`${u.searchParams.has('download')?'attachment':'inline'}; filename="Music-LangMix.mp4"`};
 if(range){headers['content-range']=`bytes ${range.start}-${range.end}/${size}`;headers['content-length']=range.end-range.start+1}else headers['content-length']=size;
 res.writeHead(range?206:200,headers);if(method==='HEAD')return res.end();const stream=createReadStream(file,range||{});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());return stream.pipe(res);
 }return json(res,{error:'invalidSource'},409);
 }
 if(!['GET','HEAD'].includes(method))return json(res,{error:'invalidSource'},405);
 if(u.pathname==='/de'){res.writeHead(308,{location:'/de/'});return res.end()}
 const path=(u.pathname==='/'||u.pathname==='/de/')?'/index.html':u.pathname;
 if(!/^\/[a-zA-Z0-9_.-]+$/.test(path))return json(res,{error:'invalidSource'},404);
 const file=join(PUBLIC,path.slice(1));let data;try{data=await readFile(file)}catch{return json(res,{error:'invalidSource'},404)}
 res.writeHead(200,{...HEADERS,'content-type':types[extname(file)]||'application/octet-stream'});res.end(method==='HEAD'?undefined:data);
 }catch(e){if(!res.headersSent)json(res,{error:knownErrors.has(e.message)?e.message:'network'},e.message==='noVideo'?404:400);else res.destroy()}
 });
 server.requestTimeout=120000;
 async function close(){shuttingDown=true;clearInterval(timer);for(const job of jobs.values())await cleanup(job);await new Promise(r=>server.close(r))}
 return {server,close,jobs,nativeAvailable};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=await createApp();const flag=process.argv.indexOf('--port');const port=Number(flag>=0?process.argv[flag+1]:process.env.PORT||3000);const host=process.env.HOST||'127.0.0.1';
 app.server.listen(port,host,()=>console.log(`Music LangMix: http://${host}:${port} | Native render: ${app.nativeAvailable?'ready':'install FFmpeg'}`));
 for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>void app.close().finally(()=>process.exit(0)));
}
