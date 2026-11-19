import {validateBanner,badgePNG,creditPNG,creditStart} from './banner.mjs';
import {chooseFile,parseVTT,alignIntro,audioFeatures,makePlan,validatePlan} from './core.mjs';
export class BrowserEngine {
 constructor(onProgress,signal){this.onProgress=onProgress;this.signal=signal;this.ff=null;this.context={};this.bytes=0}
 progress(stage,progress){this.onProgress({stage,progress,bytes:this.bytes,totalBytes:this.totalBytes})}
 async start(){
 this.progress('loading',2);
 if(!globalThis.FFmpegWASM)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/vendor/ffmpeg.js';s.onload=resolve;s.onerror=()=>reject(Error('wasmFailed'));document.head.append(s)});
 this.signal.throwIfAborted();const ff=new FFmpegWASM.FFmpeg();this.ff=ff;this.signal.addEventListener('abort',()=>this.close(),{once:true});
 ff.on('progress',({progress:p})=>{if(this.context.span&&p>=0&&p<=1)this.progress(this.context.stage,Math.min(99,this.context.base+p*this.context.span))});
 try{await ff.load({coreURL:location.origin+'/vendor/ffmpeg-core.js',wasmURL:location.origin+'/vendor/ffmpeg-core.wasm'})}catch{throw Error('wasmFailed')}
 }
 close(){try{this.ff?.terminate()}catch{}this.ff=null}
 async exec(args,optional=false){this.signal.throwIfAborted();const code=await this.ff.exec(['-hide_banner','-loglevel','error','-y',...args]);if(code&&!optional)throw Error('renderFailed');return code}
 async remove(...names){for(const n of names)try{await this.ff.deleteFile(n)}catch{}}
 async download(url){const r=await fetch('/api/asset?url='+encodeURIComponent(url),{signal:this.signal,cache:'no-store'});if(!r.ok)throw Error('downloadFailed');const chunks=[];let size=0;for(const reader=r.body.getReader();;){const {value,done}=await reader.read();if(done)break;size+=value.length;this.bytes+=value.length;if(size>350*1048576||this.bytes>450*1048576){await reader.cancel();throw Error('tooLarge')}chunks.push(value);this.progress('downloading',this.base)}return new Blob(chunks,{type:'video/mp4'})}
 async raw(args,file){await this.exec(args.concat(['-ar','8000','-f','f32le',file]));const b=await this.ff.readFile(file);await this.remove(file);return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength))}
 async prepare(key,codes,quality){
 const sources=[];this.warnings=[];
 for(const code of codes){const r=await fetch(`/api/media?key=${encodeURIComponent(key)}&lang=${encodeURIComponent(code)}`,{signal:this.signal,cache:'no-store'}),info=await r.json();if(!r.ok)throw Error(info.error||'unavailable');const file=chooseFile(info.files,quality);if(file.q<quality)this.warnings.push('warnQuality');sources.push({code,info,file,offset:0,confidence:1,duration:info.duration})}
 this.totalBytes=sources.reduce((n,s)=>n+(s.file.filesize||0),0);if(this.totalBytes>450*1048576)throw Error('tooLarge');await this.start();
 let reference,rms,cues=[],cueOffset=0;
 for(let i=0;i<sources.length;i++){
 const s=sources[i];this.base=6+i/sources.length*80;this.progress('downloading',this.base);s.blob=await this.download(s.file.progressiveDownloadURL);await this.ff.writeFile('source.mp4',new Uint8Array(await s.blob.arrayBuffer()));this.progress('analyzing',this.base+3);
 let side=await this.raw(['-i','source.mp4','-map','0:a:0','-vn','-af','aformat=channel_layouts=stereo,pan=mono|c0=0.5*c0-0.5*c1'],'side.raw');let energy=0;for(let j=0;j<Math.min(side.length,160000);j++)energy+=side[j]**2;
 if(energy<.0001)side=await this.raw(['-i','source.mp4','-map','0:a:0','-vn','-ac','1'],'mono.raw');s.duration=Math.min(s.info.duration,side.length/8000);
 if(i===0){reference=side;rms=audioFeatures(await this.raw(['-i','source.mp4','-map','0:a:0','-vn','-ac','1'],'mono.raw'))}else{const a=alignIntro(reference.subarray(0,160000),side.subarray(0,160000));s.offset=a.confidence>=.3?a.offset:0;s.confidence=a.confidence;if(a.confidence<.3)this.warnings.push('warnAlignment');const st=Math.floor(Math.min(reference.length,side.length)*.7),en=Math.min(reference.length,side.length,st+160000),late=alignIntro(reference.subarray(st,en),side.subarray(st,en));if(late.confidence>.45&&Math.abs(late.offset-s.offset)>.12)this.warnings.push('warnDrift')}
 if(!cues.length){try{if(s.file.subtitles?.url){const r=await fetch('/api/asset?url='+encodeURIComponent(s.file.subtitles.url),{signal:this.signal,cache:'no-store'});if(r.ok){cues=parseVTT(await r.text());cueOffset=s.offset}}}catch(e){this.signal.throwIfAborted()}
 if(!cues.length){try{if(await this.exec(['-i','source.mp4','-map','0:s:0','-f','webvtt','timing.vtt'],true)===0){cues=parseVTT(await this.ff.readFile('timing.vtt','utf8'));cueOffset=s.offset}}catch{this.signal.throwIfAborted()}await this.remove('timing.vtt')}}
 await this.remove('source.mp4');
 }
 this.progress('planning',95);const p=makePlan(sources,cues,cueOffset,rms);if(!cues.length)this.warnings.push('warnCaptions');if(p.cuts.some(c=>c.kind==='acoustic'))this.warnings.push('warnAcoustic');p.warnings=[...new Set(this.warnings)];return p;
 }
 async render(p,quality,showLabel,labelFor,options){
 const times=validatePlan(p),ff=this.ff,h=quality,w=Math.round(h*16/9/2)*2,banner=validateBanner(options),scale=h/720;
 await ff.writeFile('credit.png',await creditPNG());
 for(let i=0;i<p.sources.length;i++){
 this.context={stage:'rendering',base:3+i/p.sources.length*80,span:75/p.sources.length};this.progress('rendering',this.context.base);const s=p.sources[i],start=times[i]+s.offset,frames=Math.round((times[i+1]-times[i])*24);await ff.writeFile('source.mp4',new Uint8Array(await s.blob.arrayBuffer()));
 let args=['-ss',start.toFixed(6),'-i','source.mp4'];let filter=`[0:v:0]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=24,setsar=1,setpts=PTS-STARTPTS[v]`;
 if(showLabel){await ff.writeFile('badge.png',await badgePNG(labelFor(s.code),banner.design));args.push('-i','badge.png');filter+=`;[1:v:0]scale=${Math.round(banner.design.width*scale)}:${Math.round(banner.design.height*scale)}[badge];[v][badge]overlay=${Math.round(banner.x*scale)}:${Math.round(banner.y*scale)}:format=auto${banner.duration===null?'':":enable='lt(t,"+banner.duration+")'"}[labeled]`}else filter+=';[v]null[labeled]';
 args.push('-i','credit.png');filter+=`;[${showLabel?2:1}:v:0]scale=${w}:${Math.round(42*scale)}[credit];[labeled][credit]overlay=0:H-h-${Math.round(8*scale)}:format=auto:enable='gte(t,${creditStart(p.duration,times[i]).toFixed(6)})'[out]`;

 await this.exec([...args,'-filter_complex',filter,'-map','[out]','-an','-sn','-frames:v',String(frames),'-c:v','libx264','-preset','ultrafast','-crf','21','-pix_fmt','yuv420p','-threads','1',`v${i}.mp4`]);
 const a=start-(i?.02:0),b=times[i+1]+s.offset+(i<p.sources.length-1?.02:0);await this.exec(['-i','source.mp4','-map','0:a:0','-af',`atrim=start=${Math.max(0,a).toFixed(6)}:end=${b.toFixed(6)},asetpts=PTS-STARTPTS,aresample=48000`,'-ac','2','-c:a','pcm_s16le',`a${i}.wav`]);await this.remove('source.mp4','badge.png');
 }
 this.context={};this.progress('joining',85);const inputs=[],filters=[];let last='0:a:0';for(let i=0;i<p.sources.length;i++)inputs.push('-i',`a${i}.wav`);for(let i=1;i<p.sources.length;i++){filters.push(`[${last}][${i}:a:0]acrossfade=d=0.04:c1=tri:c2=tri[m${i}]`);last=`m${i}`}
 await this.exec([...inputs,'-filter_complex',filters.join(';'),'-map',`[${last}]`,'-c:a','aac','-b:a','192k','audio.m4a']);await ff.writeFile('concat.txt',new TextEncoder().encode(p.sources.map((_,i)=>`file 'v${i}.mp4'`).join('\n')));this.progress('finishing',95);
 await this.exec(['-f','concat','-safe','0','-i','concat.txt','-i','audio.m4a','-map','0:v:0','-map','1:a:0','-c','copy','-t',p.duration.toFixed(6),'-movflags','+faststart','mix.mp4']);const bytes=await ff.readFile('mix.mp4'),blob=new Blob([bytes],{type:'video/mp4'});this.close();p.sources.forEach(s=>{s.blob=null});return blob;
 }
}
