// Catalog data uses only the publisher's name and langcode fields.
export const COMMON = ['X','E','S','F','T','U','CHS','I','J','KO','A','HI','IN','TK','P','O','M','K','TG','SW'];
export const LABELS = {X:'Deutsch',E:'Englisch',S:'Spanisch',F:'Französisch',T:'Portugiesisch',U:'Russisch',CHS:'Chinesisch (Mandarin)',I:'Italienisch',J:'Japanisch',KO:'Koreanisch',A:'Arabisch',HI:'Hindi',IN:'Indonesisch',TK:'Türkisch',P:'Polnisch',O:'Niederländisch',M:'Rumänisch',K:'Ukrainisch',TG:'Tagalog',SW:'Suaheli'};
// Explicit ISO → JW mapping. Never interpret a JW code as an ISO code.
const ISO = {de:'X',en:'E',es:'S',fr:'F',pt:'T',ru:'U',zh:'CHS',it:'I',ja:'J',ko:'KO',ar:'A',hi:'HI',id:'IN',tr:'TK',pl:'P',nl:'O',ro:'M',uk:'K',tl:'TG',fil:'TG',sw:'SW',el:'G',sv:'Z',da:'D',fi:'FI',no:'N',nb:'N',cs:'B',hu:'H',th:'SI',vi:'VT'};
export const preferredCodes = (locales=[]) => [...new Set(locales.map(l => /^pt-PT/i.test(l)?'TPO':/^zh-(TW|HK|Hant)/i.test(l)?'CH':ISO[l.toLowerCase().split('-')[0]]).filter(Boolean))];
export const labelFor = (code,catalog=[]) => LABELS[code] || catalog.find(l=>l.langcode===code)?.name || code;
export const seconds = s => {const p=s.replace(',','.').split(':').map(Number);return p.reduce((a,b)=>a*60+b,0)};
export const clock = s => `${Math.floor(Math.max(0,s)/60)}:${String(Math.floor(Math.max(0,s)%60)).padStart(2,'0')}`;
export function parseSource(value, sourceHostname) {
 let u;try{u=new URL(value.trim())}catch{throw Error('invalidURL');}
 if(u.protocol!=='https:' || !(u.hostname===sourceHostname||u.hostname.endsWith('.'+sourceHostname)) || u.username || u.password || u.port)throw Error('invalidSource');
 const key=u.searchParams.get('lank') || u.hash.match(/(?:^#|\/)(pub-[A-Za-z0-9_-]+_(?:VIDEO|AUDIO))(?:$|[/?&])/i)?.[1] || u.pathname.match(/(pub-[A-Za-z0-9_-]+_(?:VIDEO|AUDIO))/i)?.[1];
 const locale=u.searchParams.get('wtlocale') || 'X';
 const videoKey=key?.replace(/_AUDIO$/i,'_VIDEO');
 const corrected=!!key&&videoKey!==key;
 if(corrected){if(u.searchParams.has('lank'))u.searchParams.set('lank',videoKey);else if(u.hash.includes(key))u.hash=u.hash.replace(key,videoKey);else u.pathname=u.pathname.replace(key,videoKey)}
 return {key:videoKey||null,corrected,locale:/^[A-Z0-9-]{1,12}$/i.test(locale)?locale.toUpperCase():'X',url:u.href};
}
export function chooseFile(files,quality=720){
 const list=files.filter(f=>f.mimetype==='video/mp4'&&f.progressiveDownloadURL).map(f=>({...f,q:parseInt(f.label)||f.frameHeight||0})).sort((a,b)=>a.q-b.q);
 if(!list.length)throw Error('noVideo');
 return list.filter(f=>f.q<=quality).at(-1)||list[0];
}
export function parseVTT(text){
 const result=[];for(const block of text.replace(/\r/g,'').split(/\n\s*\n/)){
 const m=block.match(/((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})/);
 if(m){let start=seconds(m[1]),end=seconds(m[2]);if(end>start)result.push({start,end});}
 }return result.sort((a,b)=>a.start-b.start);
}
export function randomCodes(pool,count,random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296){
 const a=[...new Set(pool)];if(count<2||count>10||count>a.length)throw Error('languageCount');
 for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a.slice(0,count);
}
function fft(re,im,inverse=false){
 const n=re.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]]}}
 for(let len=2;len<=n;len<<=1){const ang=2*Math.PI/len*(inverse?1:-1),wr0=Math.cos(ang),wi0=Math.sin(ang);for(let i=0;i<n;i+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){const a=i+j,b=a+len/2,vr=re[b]*wr-im[b]*wi,vi=re[b]*wi+im[b]*wr;re[b]=re[a]-vr;im[b]=im[a]-vi;re[a]+=vr;im[a]+=vi;const w=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=w;}}}
 if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n}
}
// FFT cross-correlation of the instrumental intro. Offset is source minus reference.
export function alignIntro(reference,source,sampleRate=8000,maxShift=2){
 const start=Math.min(sampleRate*2,Math.floor(reference.length*.1)),length=Math.min(sampleRate*11,reference.length-start,source.length-start);
 if(length<sampleRate)return {offset:0,confidence:0};
 const yStart=Math.max(0,start-Math.floor(maxShift*sampleRate)),yEnd=Math.min(source.length,start+length+Math.floor(maxShift*sampleRate));
 const x=reference.subarray(start,start+length),y=source.subarray(yStart,yEnd);let n=1;while(n<x.length+y.length)n<<=1;
 const ar=new Float64Array(n),ai=new Float64Array(n),br=new Float64Array(n),bi=new Float64Array(n);ar.set(y);for(let i=0;i<x.length;i++)br[i]=x[x.length-1-i];fft(ar,ai);fft(br,bi);
 for(let i=0;i<n;i++){const r=ar[i]*br[i]-ai[i]*bi[i];ai[i]=ar[i]*bi[i]+ai[i]*br[i];ar[i]=r}fft(ar,ai,true);
 let ex=0,ey=0;for(let i=0;i<x.length;i++){ex+=x[i]*x[i];ey+=y[i]*y[i]}
 let best=-Infinity,lag=0;for(let i=0;i<=y.length-x.length;i++){const score=ar[i+x.length-1]/Math.sqrt(Math.max(1e-20,ex*ey));if(score>best){best=score;lag=i}if(i+x.length<y.length)ey+=y[i+x.length]**2-y[i]**2;}
 return {offset:(yStart+lag-start)/sampleRate,confidence:Math.min(1,Math.max(0,best))};
}
export function audioFeatures(samples,rate=8000){
 const hop=Math.round(rate*.02),rms=[];for(let i=0;i<samples.length;i+=hop){let sum=0;for(let j=i;j<Math.min(samples.length,i+hop);j++)sum+=samples[j]**2;rms.push(Math.sqrt(sum/hop))}return rms;
}
export function boundaryCandidates(cues,duration,rms){
 const candidates=[];const merged=[];
 for(const cue of cues){const prior=merged.at(-1);if(prior&&cue.start<prior.end-.05)prior.end=Math.max(prior.end,cue.end);else merged.push({...cue});}
 for(let i=0;i<merged.length-1;i++){
 const end=merged[i].end,next=merged[i+1].start,gap=Math.max(0,next-end);
 if(end>8&&next<duration-8)candidates.push({time:end+gap*(gap>=1.5?2/3:.5),kind:gap>=1.5?'pause':'phrase',gap,score:gap>=1.5?0:0.2});
 }
 // Acoustic fallback: local energy valleys, never advertised as vocal separation.
 if(rms?.length){
 for(let t=12;t<duration-12;t+=.5){let index=Math.floor(t/.02),low=Infinity,p=index;for(let i=Math.max(0,index-10);i<Math.min(rms.length,index+11);i++){if(rms[i]<low){low=rms[i];p=i}}
 let avg=0,n=0;for(let i=Math.max(0,index-50);i<Math.min(rms.length,index+51);i++){avg+=rms[i];n++}const ratio=low/(avg/n+1e-8);
 if(ratio<.72&&!candidates.some(c=>Math.abs(c.time-p*.02)<.4))candidates.push({time:p*.02,kind:'acoustic',gap:0,score:1+ratio});
 }}return candidates.sort((a,b)=>a.time-b.time);
}
export function planBoundaries(cues,duration,count,rms=[]){
 if(count<2||count>10)throw Error('languageCount');
 const candidates=boundaryCandidates(cues,duration,rms),step=duration/count;
 // Dynamic programming chooses ordered musical candidates with meaningful segment lengths.
 const minGap=Math.max(2,Math.min(8,step*.35));let previous=candidates.map(c=>({cost:Infinity,path:[]}));
 for(let k=1;k<count;k++){
 const current=candidates.map(()=>({cost:Infinity,path:[]}));
 for(let j=0;j<candidates.length;j++){
 const c=candidates[j];if(c.time<minGap*k||duration-c.time<minGap*(count-k))continue;
 const target=((c.time-step*k)/step)**2*3+c.score*.3;
 if(k===1)current[j]={cost:target,path:[c]};else for(let p=0;p<j;p++)if(c.time-candidates[p].time>=minGap&&previous[p].cost+target<current[j].cost)current[j]={cost:previous[p].cost+target,path:[...previous[p].path,c]};
 }previous=current;}
 const best=previous.reduce((a,b)=>a.cost<b.cost?a:b,{cost:Infinity,path:[]});
 if(!Number.isFinite(best.cost))throw Error('noBoundaries');
 return best.path.map(c=>({...c,time:Math.round(c.time*24)/24}));
}
export function validateTimeline(boundaries,duration,count){
 if(boundaries.length!==count-1)throw Error('invalidCuts');
 let prior=0;for(const b of [...boundaries,duration]){if(!Number.isFinite(b)||b-prior<1)throw Error('invalidCuts');prior=b}
}

export function randomWithPreferred(pool,count,preferred,random){
 if(!preferred)return randomCodes(pool,count,random);
 const rest=pool.filter(c=>c!==preferred);
 if(count<2||count>10||rest.length<count-1)throw Error('notEnoughLanguages');
 if(count===2){const choices=randomCodes([...rest,preferred],2,random);return [preferred,choices.find(c=>c!==preferred)];}
 return [preferred,...randomCodes(rest,count-1,random)];
}
export function isIOS(userAgent,platform,touches){return /iPhone|iPad|iPod/i.test(userAgent)||(platform==='MacIntel'&&touches>1);}
export function makePlan(sources,cues,offset,rms){
 const last=sources.at(-1),duration=Math.floor(Math.min(sources[0].duration,last.duration-last.offset)*24)/24;
 const cuts=planBoundaries(cues.map(c=>({start:c.start-offset,end:c.end-offset})).filter(c=>c.end>0&&c.start<duration),duration,sources.length,rms);
 const plan={duration,cuts,sources};validatePlan(plan);return plan;
}
export function validatePlan(p){
 validateTimeline(p.cuts.map(c=>c.time),p.duration,p.sources.length);
 const times=[0,...p.cuts.map(c=>c.time),p.duration];
 p.sources.forEach((s,i)=>{if(!Number.isFinite(s.offset)||Math.abs(s.offset)>10||times[i]+s.offset<-.001||times[i+1]+s.offset>s.duration+.05)throw Error('invalidOffset')});
 return times;
}
