import {parseSource} from '../public/core.mjs';
const SOURCE_HOSTNAME = 'jw.org';
export const parseProviderSource = value => parseSource(value, SOURCE_HOSTNAME);
export const MAX_FILE=350*1024*1024;
export function allowedMediaUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='jw-cdn.org'||u.hostname.endsWith('.jw-cdn.org'))&&/\.(mp4|m4a|mp3|vtt|srt)$/i.test(u.pathname)}catch{return false}}
const allowedPage=s=>{try{parseProviderSource(s);return true}catch{return false}};
export async function remote(url,{signal,headers={},validate=()=>true}={}){
 for(let i=0;i<5;i++){
 if(!validate(url))throw Error('invalidSource');
 const r=await fetch(url,{headers,redirect:'manual',signal:AbortSignal.any([AbortSignal.timeout(120000),...(signal?[signal]:[])])});
 if(r.status>=300&&r.status<400&&r.headers.has('location')){url=new URL(r.headers.get('location'),url).href;await r.body?.cancel();continue}return r;
 }throw Error('network');
}
export async function boundedText(response,max=4e6){
 if(!response.ok)throw Error('network');let length=0;const parts=[];
 for await(const b of response.body){length+=b.length;if(length>max)throw Error('tooLarge');parts.push(b)}return Buffer.concat(parts).toString('utf8');
}
export async function resolveSource(value,signal){
 const p=parseProviderSource(value);if(p.key)return p;
 const r=await remote(p.url,{signal,validate:allowedPage}),html=await boundedText(r);
 const keys=[...new Set(html.match(/pub-(?:osg|sjjm|sjj|sjjc)_[A-Za-z0-9_-]*_(?:VIDEO|AUDIO)/g)||[])].map(k=>k.replace(/_AUDIO$/,'_VIDEO'));
 if(new Set(keys).size!==1)throw Error('badLink');return {...p,key:keys[0]};
}
export async function metadata(key,lang,signal){
 if(!/^pub-[A-Za-z0-9_-]{1,100}_VIDEO$/.test(key)||!/^[-A-Z0-9]{1,12}$/.test(lang))throw Error('invalidSource');
 const r=await remote(`https://b.jw-cdn.org/apis/mediator/v1/media-items/${lang}/${key}?clientType=www`,{signal});
 if(r.status===404)throw Error('noVideo');if(!r.ok)throw Error('network');
 const m=JSON.parse(await boundedText(r)).media?.[0];if(!m)throw Error('noVideo');
 const files=(m.files||[]).filter(f=>f.mimetype==='video/mp4'&&allowedMediaUrl(f.progressiveDownloadURL)).map(f=>({label:f.label,frameWidth:f.frameWidth,frameHeight:f.frameHeight,duration:f.duration,filesize:f.filesize,mimetype:f.mimetype,progressiveDownloadURL:f.progressiveDownloadURL,subtitles:f.subtitles?.url&&allowedMediaUrl(f.subtitles.url)?{url:f.subtitles.url}:undefined}));
 if(!files.length)throw Error('noVideo');const duration=Number(m.duration||files[0].duration);if(!Number.isFinite(duration)||duration<15||duration>900)throw Error('durationLimit');return {title:String(m.title||''),duration,key,files};
}
export const vendors={
 '/vendor/ffmpeg.js':['https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/umd/ffmpeg.js','text/javascript'],
 '/vendor/814.ffmpeg.js':['https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/umd/814.ffmpeg.js','text/javascript'],
 '/vendor/ffmpeg-core.js':['https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js','text/javascript'],
 '/vendor/ffmpeg-core.wasm':['https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm','application/wasm']
};
