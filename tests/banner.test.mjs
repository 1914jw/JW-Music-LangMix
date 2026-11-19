import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBanner,validateDesign,creditStart,CREDIT} from '../public/banner.mjs';
test('banner duration and placement stay inside output at all corners',()=>{
 for(const position of ['top-left','top-right','bottom-left','bottom-right']){const b=validateBanner({position,duration:5});assert(b.x>=0&&b.y>=0);assert(b.x+b.design.width<=1280);assert(b.y+b.design.height<=720)}
 assert.equal(validateBanner().duration,null);
 assert.equal(validateBanner({duration:.1}).duration,.1);
 assert.deepEqual([validateBanner({position:'bottom-right'}).x,validateBanner({position:'bottom-right'}).y],[936,632]);
});
test('untrusted designs cannot inject filters, scripts, paths or out-of-frame geometry',()=>{
 for(const design of [{background:'red;movie=/etc/passwd'},{color:'#ffffff:enable=0'},{fontSize:Infinity},{width:1},{height:20},{width:100.5},{padding:60},{font:'/etc/passwd'},{script:'alert(1)'},null,[]])assert.throws(()=>validateDesign(design),/invalidBanner/);
 for(const input of [{duration:-1},{duration:0},{duration:'5'},{duration:NaN},{position:'evil'},{position:'custom',x:1000},{position:'custom',y:700}])assert.throws(()=>validateBanner(input),/invalidBanner/);
 const b=validateBanner({position:'custom',x:800,y:500,design:{width:360,height:72}});assert.equal(b.x,800);assert.equal(b.design.width,360);
});
test('mandatory English credit starts on global timeline even across cuts',()=>{
 assert.match(CREDIT,/Self-hosted/);
 // Six-second video cut at four seconds: credit starts at t=3 in first
 // segment and t=0 in second, spanning the cut without a gap.
 assert.equal(creditStart(6,0),3);assert.equal(creditStart(6,4),0);
 assert.equal(creditStart(2,0),0);
});
