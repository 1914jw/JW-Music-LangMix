// Coordinates and dimensions use a 1280 × 720 reference frame.
export const CREDIT = 'Created with 1914jw/JW-Music-LangMix · Self-hosted';
export const DEFAULT_DESIGN = Object.freeze({width:320,height:64,fontSize:28,padding:16,background:'#141418',color:'#ffffff',opacity:0.8});
const positions=['top-left','top-right','bottom-left','bottom-right','custom'];
function number(value,min,max){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error('invalidBanner');return value}
export function validateDesign(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!Object.hasOwn(DEFAULT_DESIGN,k)))throw Error('invalidBanner');
 const d={...DEFAULT_DESIGN,...input};
 number(d.width,100,1280);number(d.height,40,720);if(!Number.isInteger(d.width)||!Number.isInteger(d.height))throw Error('invalidBanner');number(d.fontSize,12,96);number(d.padding,0,64);number(d.opacity,0,1);
 if(d.padding*2+d.fontSize>d.height||d.padding*2>=d.width)throw Error('invalidBanner');
 for(const k of ['background','color'])if(typeof d[k]!=='string'||!/^#[0-9a-f]{6}$/i.test(d[k]))throw Error('invalidBanner');
 return d;
}
export function validateBanner(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('invalidBanner');
 const design=validateDesign(input.design),duration=input.duration??null,position=input.position??'top-left';
 if(duration!==null)number(duration,0.1,900);
 if(!positions.includes(position))throw Error('invalidBanner');
 let x=input.x??24,y=input.y??24;
 if(position==='custom'){number(x,0,1280-design.width);number(y,0,720-design.height)}
 else{x=position.endsWith('right')?1280-design.width-24:24;y=position.startsWith('bottom')?720-design.height-24:24;x=Math.max(0,Math.min(x,1280-design.width));y=Math.max(0,Math.min(y,720-design.height))}
 return {design,duration,position,x,y};
}
// The end credit uses the output timeline, including when it spans a cut.
export function creditStart(duration,segmentStart){return Math.max(0,duration-3-segmentStart)}
export function drawBadge(ctx,text,design){
 const d=validateDesign(design);ctx.save();ctx.globalAlpha=d.opacity;ctx.fillStyle=d.background;ctx.fillRect(0,0,d.width,d.height);ctx.globalAlpha=1;ctx.fillStyle=d.color;ctx.font=`${d.fontSize}px Arial, sans-serif`;ctx.textBaseline='middle';ctx.beginPath();ctx.rect(d.padding,0,d.width-d.padding*2,d.height);ctx.clip();ctx.fillText(text,d.padding,d.height/2);ctx.restore();
}
export async function badgePNG(text,design){const d=validateDesign(design),canvas=document.createElement('canvas');canvas.width=d.width;canvas.height=d.height;drawBadge(canvas.getContext('2d'),text,d);return new Uint8Array(await(await new Promise(r=>canvas.toBlob(r,'image/png'))).arrayBuffer())}
export async function creditPNG(){const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=42;const ctx=canvas.getContext('2d');ctx.font='18px Arial, sans-serif';const width=ctx.measureText(CREDIT).width+24;ctx.fillStyle='rgba(0,0,0,0.72)';ctx.fillRect((1280-width)/2,0,width,42);ctx.fillStyle='#d1d1d1';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(CREDIT,640,21);return new Uint8Array(await(await new Promise(r=>canvas.toBlob(r,'image/png'))).arrayBuffer())}
