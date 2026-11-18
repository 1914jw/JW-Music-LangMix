import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';import {renderNative} from '../server/render.mjs';
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
