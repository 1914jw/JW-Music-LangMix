import {validateBanner,CREDIT,creditStart} from '../public/banner.mjs';
import {spawn} from 'node:child_process';
import {readFile,writeFile,unlink,stat,open,access} from 'node:fs/promises';
import {join} from 'node:path';
import {metadata,remote,allowedMediaUrl,boundedText,MAX_FILE} from './source.mjs';
import {chooseFile,parseVTT,alignIntro,audioFeatures,makePlan,validatePlan,LABELS} from '../public/core.mjs';
export function runFFmpeg(job,args,{optional=false,onTime}={}){
 return new Promise((resolve,reject)=>{
 if(job.controller.signal.aborted)return reject(Error('canceled'));
 const p=spawn(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-nostdin','-loglevel','error','-y',...args],{cwd:job.dir,stdio:['ignore','pipe','pipe']});job.child=p;let logs='',progress='';
 const abort=()=>p.kill('SIGKILL');job.controller.signal.addEventListener('abort',abort,{once:true});
 p.stderr.on('data',b=>{logs=(logs+b).slice(-4000)});
 p.stdout.on('data',b=>{progress+=b;let idx;while((idx=progress.indexOf('\n'))>=0){const line=progress.slice(0,idx);progress=progress.slice(idx+1);if(line.startsWith('out_time_us='))onTime?.(Number(line.split('=')[1])/1e6)}});
 const finish=()=>{job.controller.signal.removeEventListener('abort',abort);if(job.child===p)job.child=null};
 p.once('error',()=>{finish();reject(Error('serverMissing'))});
 p.once('close',code=>{finish();if(job.controller.signal.aborted)reject(Error('canceled'));else if(code!==0&&!optional){job.diagnostic=logs;reject(Error('renderFailed'))}else resolve(code)});
 });
}
const floats=b=>new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
async function discard(job,...names){await Promise.all(names.map(n=>unlink(join(job.dir,n)).catch(()=>{})))}
export async function downloadFile(job,url,name){
 if(!allowedMediaUrl(url))throw Error('invalidSource');const r=await remote(url,{signal:job.controller.signal,validate:allowedMediaUrl});if(!r.ok)throw Error('downloadFailed');if(Number(r.headers.get('content-length'))>MAX_FILE)throw Error('tooLarge');
 const file=await open(join(job.dir,name),'w',0o600);let size=0;
 try{for await(const chunk of r.body){job.controller.signal.throwIfAborted();size+=chunk.length;job.bytes+=chunk.length;if(size>MAX_FILE||job.bytes>450*1024*1024)throw Error('tooLarge');await file.write(chunk)}}finally{await file.close()}
}
export async function prepareNative(job){
 job.stage='checkingStage';job.progress=1;const sources=[];job.warnings=[];
 for(const code of job.options.languages){const info=await metadata(job.options.key,code,job.controller.signal),file=chooseFile(info.files,job.options.quality);if(file.q<job.options.quality)job.warnings.push('warnQuality');sources.push({code,info,file,offset:0,confidence:1,duration:info.duration})}
 job.totalBytes=sources.reduce((n,s)=>n+(s.file.filesize||0),0);if(job.totalBytes>450*1024*1024)throw Error('tooLarge');
 let reference,rms,cues=[],cueOffset=0;
 for(let i=0;i<sources.length;i++){
 const s=sources[i];s.path=`source${i}.mp4`;job.stage='downloading';job.progress=5+i/sources.length*75;await downloadFile(job,s.file.progressiveDownloadURL,s.path);
 job.stage='analyzing';
 await runFFmpeg(job,['-i',s.path,'-map','0:a:0','-vn','-af','aformat=channel_layouts=stereo,pan=mono|c0=0.5*c0-0.5*c1','-ar','8000','-f','f32le','side.raw']);
 let side=floats(await readFile(join(job.dir,'side.raw')));await discard(job,'side.raw');let energy=0;for(let j=0;j<Math.min(side.length,160000);j++)energy+=side[j]**2;
 if(energy<.0001){await runFFmpeg(job,['-i',s.path,'-map','0:a:0','-vn','-ac','1','-ar','8000','-f','f32le','mono.raw']);side=floats(await readFile(join(job.dir,'mono.raw')));await discard(job,'mono.raw')}
 s.duration=Math.min(s.info.duration,side.length/8000);
 if(i===0){reference=side;await runFFmpeg(job,['-i',s.path,'-map','0:a:0','-vn','-ac','1','-ar','8000','-f','f32le','mono.raw']);rms=audioFeatures(floats(await readFile(join(job.dir,'mono.raw'))));await discard(job,'mono.raw')}
 else{const match=alignIntro(reference.subarray(0,160000),side.subarray(0,160000));s.confidence=match.confidence;s.offset=match.confidence>=.3?match.offset:0;if(match.confidence<.3)job.warnings.push('warnAlignment');const st=Math.floor(Math.min(reference.length,side.length)*.7),en=Math.min(reference.length,side.length,st+160000);const late=alignIntro(reference.subarray(st,en),side.subarray(st,en));if(late.confidence>.45&&Math.abs(late.offset-s.offset)>.12)job.warnings.push('warnDrift')}
 if(!cues.length){try{if(s.file.subtitles?.url){const r=await remote(s.file.subtitles.url,{signal:job.controller.signal,validate:allowedMediaUrl});cues=parseVTT(await boundedText(r,2e6));cueOffset=s.offset}}catch(e){if(job.controller.signal.aborted)throw e}
 if(!cues.length){const rc=await runFFmpeg(job,['-i',s.path,'-map','0:s:0','-f','webvtt','timing.vtt'],{optional:true});if(rc===0){cues=parseVTT(await readFile(join(job.dir,'timing.vtt'),'utf8'));cueOffset=s.offset}await discard(job,'timing.vtt')}}
 }
 job.stage='planning';job.progress=95;job.plan=makePlan(sources,cues,cueOffset,rms);
 if(!cues.length)job.warnings.push('warnCaptions');if(job.plan.cuts.some(c=>c.kind==='acoustic'))job.warnings.push('warnAcoustic');job.warnings=[...new Set(job.warnings)];job.state='ready';job.stage='ready';job.progress=100;
}
async function fontPath(){
 const paths=[process.env.FONT_PATH,'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/dejavu/DejaVuSans.ttf','/System/Library/Fonts/Supplemental/Arial.ttf','C:/Windows/Fonts/arial.ttf'].filter(Boolean);
 for(const p of paths){try{await access(p);return p.replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"\\'")}catch{}}return null;
}
export async function renderNative(job,catalog){
 const p=job.plan,times=validatePlan(p),h=job.options.quality,w=Math.round(h*16/9/2)*2,font=await fontPath(),banner=validateBanner(job.banner),d=banner.design,scale=h/720;
 await writeFile(join(job.dir,'credit.txt'),CREDIT);
 for(let i=0;i<p.sources.length;i++){
 const s=p.sources[i],start=times[i]+s.offset,duration=times[i+1]-times[i];job.stage='rendering';job.progress=3+i/p.sources.length*80;
 let filter=`[0:v:0]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=24,setsar=1,setpts=PTS-STARTPTS[v]`;
 const fontArg=font?":fontfile='"+font+"'":'';
 if(job.showLabel){
 const label=(job.options.locale==='de'?LABELS[s.code]:null)||catalog.find(l=>l.langcode===s.code)?.name||s.code;await writeFile(join(job.dir,'label.txt'),label.replace(/[\r\n]/g,' '));
 const bw=Math.round(d.width*scale),bh=Math.round(d.height*scale);
 filter+=`;color=c=${d.background}@${d.opacity}:s=${bw}x${bh}:r=24,format=rgba,drawtext=textfile=label.txt:expansion=none${fontArg}:fontsize=${Math.round(d.fontSize*scale)}:fontcolor=${d.color}:x=${Math.round(d.padding*scale)}:y=(h-text_h)/2,crop=${Math.max(1,bw-Math.round(d.padding*scale))}:${bh}:0:0,pad=${bw}:${bh}:0:0:color=${d.background}@${d.opacity}[badge];[v][badge]overlay=${Math.round(banner.x*scale)}:${Math.round(banner.y*scale)}:format=auto${banner.duration===null?'':":enable='lt(t,"+banner.duration+")'"}[labeled]`;
 }else filter+=';[v]null[labeled]';
 filter+=`;[labeled]drawtext=textfile=credit.txt:expansion=none${fontArg}:fontsize=${Math.max(9,Math.round(18*scale))}:fontcolor=0xd1d1d1:x=(w-text_w)/2:y=h-text_h-${Math.round(18*scale)}:box=1:boxcolor=black@0.72:boxborderw=${Math.round(6*scale)}:enable='gte(t,${creditStart(p.duration,times[i]).toFixed(6)})'[out]`;

 await runFFmpeg(job,['-ss',start.toFixed(6),'-i',s.path,'-filter_complex',filter,'-map','[out]','-an','-sn','-frames:v',String(Math.round(duration*24)),'-c:v','libx264','-profile:v','main','-level:v','4.1','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-threads','2','-progress','pipe:1',`v${i}.mp4`],{onTime:t=>{job.progress=Math.min(83,3+(i+Math.min(1,t/duration))/p.sources.length*80)}});
 const a=start-(i?.02:0),b=times[i+1]+s.offset+(i<p.sources.length-1?.02:0);
 await runFFmpeg(job,['-i',s.path,'-map','0:a:0','-af',`atrim=start=${Math.max(0,a).toFixed(6)}:end=${b.toFixed(6)},asetpts=PTS-STARTPTS,aresample=48000`,'-ac','2','-c:a','pcm_s16le',`a${i}.wav`]);
 }
 job.stage='joining';job.progress=85;const inputs=[],filters=[];let last='0:a:0';
 for(let i=0;i<p.sources.length;i++)inputs.push('-i',`a${i}.wav`);for(let i=1;i<p.sources.length;i++){filters.push(`[${last}][${i}:a:0]acrossfade=d=0.04:c1=tri:c2=tri[m${i}]`);last=`m${i}`}
 await runFFmpeg(job,[...inputs,'-filter_complex',filters.join(';'),'-map',`[${last}]`,'-c:a','aac','-b:a','192k','audio.m4a']);
 await writeFile(join(job.dir,'concat.txt'),p.sources.map((_,i)=>`file 'v${i}.mp4'`).join('\n'));
 job.stage='finishing';job.progress=95;await runFFmpeg(job,['-f','concat','-safe','0','-i','concat.txt','-i','audio.m4a','-map','0:v:0','-map','1:a:0','-c','copy','-t',p.duration.toFixed(6),'-movflags','+faststart','mix.mp4']);
 job.resultSize=(await stat(join(job.dir,'mix.mp4'))).size;job.state='done';job.stage='done';job.progress=100;
 await discard(job,'credit.txt','label.txt','concat.txt','audio.m4a',...p.sources.flatMap((s,i)=>[s.path,`v${i}.mp4`,`a${i}.wav`]));
}
