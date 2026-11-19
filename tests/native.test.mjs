import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';import {renderNative} from '../server/render.mjs';
let available=true;try{execFileSync('ffmpeg',['-version'],{stdio:'ignore'})}catch{available=false}
test('native exporter renders real H264/AAC, labels and crossfades without a browser',{skip:!available},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'langmix-native-'));
 try{
 // Generated test tones only. No downloaded music or footage.
 for(let i=0;i<2;i++)execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i',`color=c=${i?'blue':'red'}:s=640x360:r=24:d=6`,'-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=6','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-ac','2','-shortest',join(dir,`source${i}.mp4`)]);
 const job={dir,controller:new AbortController(),options:{quality:360,locale:'en'},showLabel:true,plan:{duration:6,cuts:[{time:3}],sources:[{code:'E',path:'source0.mp4',offset:0,duration:6},{code:'X',path:'source1.mp4',offset:0,duration:6}]}};
 await renderNative(job,[{langcode:'E',name:'English'},{langcode:'X',name:'German'}]);assert.equal(job.state,'done');assert(job.resultSize>1000);
 const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',join(dir,'mix.mp4')]));const video=info.streams.find(s=>s.codec_type==='video'),audio=info.streams.find(s=>s.codec_type==='audio');assert.equal(video.codec_name,'h264');assert.equal(video.height,360);assert.equal(audio.codec_name,'aac');assert(Math.abs(Number(info.format.duration)-6)<.05);
 execFileSync('ffmpeg',['-v','error','-i',join(dir,'mix.mp4'),'-f','null','-']);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('timed custom banner hides and mandatory credit spans cuts with labels off too',{skip:!available},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'langmix-overlays-'));
 try{
 for(const showLabel of [true,false]){
 for(let i=0;i<2;i++)execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=blue:s=640x360:r=24:d=6','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=6','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-ac','2','-shortest',join(dir,`source${i}.mp4`)]);
 const job={dir,controller:new AbortController(),options:{quality:360,locale:'en'},showLabel,banner:{duration:1,position:'custom',x:800,y:400,design:{width:320,height:64,background:'#00ff00',opacity:1}},plan:{duration:6,cuts:[{time:4}],sources:[{code:'E',path:'source0.mp4',offset:0,duration:6},{code:'X',path:'source1.mp4',offset:0,duration:6}]}};
 await renderNative(job,[{langcode:'E',name:'English'},{langcode:'X',name:'German'}]);
 const frame=t=>execFileSync('ffmpeg',['-v','error','-ss',String(t),'-i',join(dir,'mix.mp4'),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:2e6});
 const early=frame(.5),hidden=frame(2),before=frame(2.9),end1=frame(3.5),end2=frame(4.5);
 const green=b=>b[(205*640+402)*3+1];if(showLabel){assert(green(early)>150);assert(green(hidden)<50);assert(green(end2)>150)}else assert(green(early)<50);
 // H.264 chroma subsampling blends blue into tiny gray glyphs.
 // Red and green luminance distinguishes the credit from the blue fixture.
 const creditPixels=b=>{let count=0;for(let y=330;y<355;y++)for(let x=50;x<590;x++){const i=(y*640+x)*3;if(b[i]>100&&b[i+1]>100)count++}return count};
 console.log({showLabel,creditPixels:[creditPixels(before),creditPixels(end1),creditPixels(end2)]});
 if(creditPixels(end1)<=50||creditPixels(end2)<=50){await mkdir('tests-output',{recursive:true});for(const t of [2.9,3.5,4.5])execFileSync('ffmpeg',['-v','error','-y','-ss',String(t),'-i',join(dir,'mix.mp4'),'-frames:v','1',`tests-output/native-${showLabel}-${t}.png`]);}
 assert(creditPixels(before)<10);assert(creditPixels(end1)>50);assert(creditPixels(end2)>50);
 }
 }finally{await rm(dir,{recursive:true,force:true})}
});
