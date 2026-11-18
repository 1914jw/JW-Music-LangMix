import {COMMON,LABELS,preferredCodes,randomWithPreferred,randomCodes,isIOS,clock,validatePlan} from './core.mjs';
import {locale,t,translatedName} from './i18n.mjs';
import {renderShell} from './view.mjs';
renderShell();
const $=id=>document.getElementById(id),colors=['#9583c8','#7e9fbd','#b8aa7a','#83a593','#bd8994','#8c94bd','#c49d79','#839da6','#a9a47d','#a387a5'];
const mobile=isIOS(navigator.userAgent,navigator.platform,navigator.maxTouchPoints);
const state={catalog:[],preferred:preferredCodes(navigator.languages||[navigator.language]),selected:[],song:null,checked:'',busy:false,plan:null,result:null,engine:null,job:null,controller:null,config:{nativeAvailable:false},serial:0,validation:0};
let checkTimer,checkController,toastTimer;
const name=c=>translatedName(c,state.catalog,LABELS);
function mode(){return $('engine').value==='auto'?(mobile?'server':'browser'):$('engine').value}
function toast(k){$('toast').textContent=t(k);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500)}
function error(e,target='globalError'){$(target).textContent=e?t(e.message||e):'';$(target).hidden=!e}
async function api(path,options={}){const r=await fetch(path,{cache:'no-store',...options});let x;try{x=await r.json()}catch{throw Error(r.status===401?'auth':'network')}if(!r.ok)throw Error(x.error||'network');return x}
const post=(path,data,signal)=>api(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data),signal});
function rememberJob(id){try{if(id)sessionStorage.setItem('music-langmix-job',id);else sessionStorage.removeItem('music-langmix-job')}catch{}}
function clearOutput(){if(state.result?.url.startsWith('blob:'))URL.revokeObjectURL(state.result.url);state.result=null;const v=$('resultVideo');v.pause();v.removeAttribute('src');v.load();v.hidden=true;$('downloadButton').hidden=true;$('newMix').hidden=true;$('emptyVisual').hidden=false;$('stageBottom').hidden=false;$('exportNote').textContent=t('initialNote')}
function forget(){if(state.busy)return;clearOutput();state.plan=null;state.engine?.close();state.engine=null;if(state.job){const id=state.job;state.job=null;void api('/api/jobs/'+id,{method:'DELETE'}).catch(()=>{});rememberJob(null)}$('timelineEditor').hidden=true;$('analysisWarnings').hidden=true;updateActions();renderTimeline()}
function updateActions(){
 $('analyzeButton').hidden=state.busy||!!state.plan||!!state.result;$('renderButton').hidden=state.busy||!state.plan||!!state.result;$('newMix').hidden=state.busy||!state.result;
 $('previewLanguage').hidden=state.busy||!!state.result||!$('showLabel').checked;
 $('previewStatus').textContent=t(state.result?'done':state.plan?'ready':'idle');
 const native=mode()==='server';$('processingMode').textContent=t(native?'native':'local');$('privacyCaption').textContent=t(native?'privacyServer':'privacyBrowser');$('serverNotice').hidden=!native;
}
function busy(v){state.busy=v;for(const el of document.querySelectorAll('.editor button,.editor input,.editor select,#consent,#analyzeButton,#renderButton,#timelineEditor input,#resetCuts'))el.disabled=v||el.dataset.reference==='true'||(!!state.result&&!!el.closest('#timelineEditor'));$('progressArea').hidden=!v;updateActions()}
function progress(p){$('progressArea').hidden=false;$('progressTitle').textContent=t(p.stage);$('previewStatus').textContent=t(p.stage);$('progressBar').value=Math.min(99,Math.max(0,p.progress||0));let detail=`${t('estimated')} ${Math.round(p.progress||0)} %`;if(p.stage==='downloading')detail=`${((p.bytes||0)/1048576).toFixed(1)}${p.totalBytes?' / '+(p.totalBytes/1048576).toFixed(1):''} MB`;if(p.stage==='loading')detail=t('moduleHint');$('progressText').textContent=detail+' · '+t(mode()==='server'?'workingServer':'working');$('previewLanguage').hidden=true}
function renderSelected(){
 $('selectedLanguages').replaceChildren();state.selected.forEach((code,i)=>{const chip=document.createElement('div');chip.className='language-chip';const rank=document.createElement('span');rank.textContent=i+1;const text=document.createElement('span');text.textContent=name(code);chip.append(rank,text);
 if(i){const move=document.createElement('button');move.className='move';move.textContent='‹';move.title=t('move')+': '+name(code);move.setAttribute('aria-label',move.title);move.onclick=()=>{forget();[state.selected[i-1],state.selected[i]]=[code,state.selected[i-1]];renderAll()};chip.append(move)}
 const remove=document.createElement('button');remove.textContent='×';remove.title=t('remove')+': '+name(code);remove.setAttribute('aria-label',remove.title);remove.onclick=()=>{forget();state.selected=state.selected.filter(c=>c!==code);renderAll()};chip.append(remove);$('selectedLanguages').append(chip)});$('selectionCount').textContent=`${state.selected.length} / 10`;$('previewLanguage').textContent=state.selected.length?name(state.selected[0]):'';
}
const normalized=s=>s.toLocaleLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
function renderLanguages(){
 const q=normalized($('languageSearch').value.trim()),priority=[...state.preferred,...COMMON],score=c=>{const i=priority.indexOf(c);return i<0?999:i};
 let list=state.catalog.filter(l=>!q||normalized(l.name+' '+l.langcode+' '+name(l.langcode)).includes(q)).sort((a,b)=>score(a.langcode)-score(b.langcode)||name(a.langcode).localeCompare(name(b.langcode),locale));
 $('listHeading').textContent=t(q?'searchResults':'preferred');$('catalogCount').textContent=`${list.length} ${t('languages')}`;$('languageList').replaceChildren();
 for(const l of list.slice(0,q?150:80)){const chosen=state.selected.includes(l.langcode),b=document.createElement('button');b.className='language-option'+(chosen?' chosen':'');b.setAttribute('aria-pressed',chosen);b.disabled=state.busy;const mono=document.createElement('span');mono.className='lang-monogram';mono.textContent=l.langcode;const copy=document.createElement('span');copy.className='lang-copy';const title=document.createElement('strong');title.textContent=name(l.langcode);const sub=document.createElement('small');sub.textContent=state.preferred.includes(l.langcode)?'☆ '+t('browserLanguage'):l.name;copy.append(title,sub);const check=document.createElement('span');check.className='checkmark';check.textContent='✓';b.append(mono,copy,check);b.onclick=()=>{if(!chosen&&state.selected.length>=10)return toast('maxLanguages');forget();state.selected=chosen?state.selected.filter(c=>c!==l.langcode):[...state.selected,l.langcode];renderAll()};$('languageList').append(b)}
 if(!list.length){const p=document.createElement('p');p.className='field-hint';p.textContent=t('noLanguage');$('languageList').append(p)}
}
function renderTimeline(){const p=state.plan,b=p?[0,...p.cuts.map(c=>c.time),p.duration]:state.selected.map((_,i)=>i).concat(state.selected.length);$('timeline').replaceChildren();$('timelineLegend').replaceChildren();state.selected.forEach((c,i)=>{const div=document.createElement('div');div.style.background=colors[i];div.style.flex=Math.max(.01,b[i+1]-b[i]);div.textContent=c;div.title=name(c);$('timeline').append(div);const legend=document.createElement('span'),dot=document.createElement('i');dot.style.background=colors[i];legend.append(dot,document.createTextNode(name(c)));$('timelineLegend').append(legend)});$('mixCount').textContent=state.selected.length+' '+t('languages');$('durationLabel').textContent=p?clock(p.duration):state.song?clock(state.song.duration):'—:—';$('qualityLabel').textContent=$('quality').value+'p'}
function renderAll(){renderSelected();renderLanguages();renderTimeline();updateActions()}
function showSong(){const m=state.song;$('songInfo').hidden=!m;if(m){$('songTitle').textContent=m.title;$('songDetails').textContent=clock(m.duration)+(m.files?' · '+[...new Set(m.files.map(f=>f.label))].join(' / '):'')}renderTimeline()}
async function checkURL(){
 const raw=$('songUrl').value.trim();if(state.song&&state.checked===raw)return state.song;clearTimeout(checkTimer);const version=++state.validation;checkController?.abort();checkController=new AbortController();
 if(!raw){$('sourceStatus').textContent='';return null}
 error('','sourceError');$('sourceStatus').textContent=t('checking');
 try{const song=await api('/api/resolve?url='+encodeURIComponent(raw),{signal:checkController.signal});if(version!==state.validation)throw new DOMException('Aborted','AbortError');state.song=song;state.checked=song.url||raw;$('songUrl').value=state.checked;$('sourceStatus').textContent=t(song.corrected?'corrected':'sourceReady');showSong();return song}
 catch(e){if(version===state.validation&&e.name!=='AbortError'){state.song=null;state.checked='';showSong();$('sourceStatus').textContent='';error(e,'sourceError')}throw e}
}
$('songUrl').oninput=()=>{forget();state.song=null;state.checked='';++state.validation;checkController?.abort();clearTimeout(checkTimer);showSong();error('','sourceError');$('sourceStatus').textContent='';if($('songUrl').value.trim())checkTimer=setTimeout(()=>void checkURL().catch(()=>{}),1500)};
$('songUrl').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();void checkURL().catch(()=>{})}};
$('pasteButton').onclick=async()=>{try{const text=await navigator.clipboard.readText();$('songUrl').value=text.trim();$('songUrl').dispatchEvent(new Event('input',{bubbles:true}))}catch{toast('clipboard');$('songUrl').focus()}};
$('languageSearch').oninput=renderLanguages;
$('shuffleOrder').onclick=()=>{if(state.selected.length<2)return;forget();state.selected=randomCodes(state.selected,state.selected.length);renderAll()};
$('randomButton').onclick=async()=>{
 const count=Number($('randomCount').value),preferred=state.preferred.find(c=>state.catalog.some(l=>l.langcode===c))||'E';if(!state.preferred.length)toast('noBrowserLanguage');forget();error('');state.controller=new AbortController();const serial=++state.serial;busy(true);
 try{let pool=COMMON.filter(c=>state.catalog.some(l=>l.langcode===c));if($('songUrl').value.trim()){
 const song=await checkURL();const available=[];const check=[...new Set([preferred,...pool])],queue=[...check];let done=0;
 await Promise.all(Array.from({length:4},async()=>{while(queue.length){const code=queue.shift();try{await api(`/api/media?key=${encodeURIComponent(song.key)}&lang=${encodeURIComponent(code)}`,{signal:state.controller.signal});available.push(code)}catch(e){state.controller.signal.throwIfAborted();if(e.message!=='noVideo')throw e}progress({stage:'checkingStage',progress:++done/check.length*100})}}));if(!available.includes(preferred))throw Error('browserUnavailable');pool=pool.filter(c=>available.includes(c))}
 state.selected=randomWithPreferred(pool,count,preferred);renderAll();
 }catch(e){if(e.name!=='AbortError')error(e)}finally{if(serial===state.serial)busy(false)}
};
for(const id of ['quality','showLabel','engine'])$(id).onchange=()=>{forget();renderAll()};
function showPlan(p){state.plan=p;state.originalCuts=p.cuts.map(c=>({...c}));$('timelineEditor').hidden=false;renderCutInputs();const warnings=[...new Set(p.warnings||[])];$('analysisWarnings').replaceChildren();$('analysisWarnings').hidden=!warnings.length;for(const w of warnings){const el=document.createElement('p');el.textContent=t(w);$('analysisWarnings').append(el)}renderTimeline()}
function renderCutInputs(){const p=state.plan;$('cutInputs').replaceChildren();p.cuts.forEach((cut,i)=>{const row=document.createElement('div');row.className='cut-row';const label=document.createElement('label');label.htmlFor='cut'+i;label.textContent=name(p.sources[i].code)+' → '+name(p.sources[i+1].code);const small=document.createElement('small');small.textContent=t(cut.kind||'phrase');const input=document.createElement('input');Object.assign(input,{id:'cut'+i,type:'number',min:'1',max:String(p.duration-1),step:String(1/24),value:cut.time.toFixed(3)});input.onchange=()=>{cut.time=Math.round(Number(input.value)*24)/24;input.value=cut.time.toFixed(3);renderTimeline()};row.append(label,small,input);$('cutInputs').append(row)});
 $('offsetInputs').replaceChildren();p.sources.forEach((s,i)=>{const row=document.createElement('div');row.className='offset-row';const label=document.createElement('label');label.htmlFor='offset'+i;label.textContent=name(s.code);const small=document.createElement('small');small.textContent=i?t('confidence')+' '+Math.round(s.confidence*100)+' %':t('reference');const input=document.createElement('input');Object.assign(input,{id:'offset'+i,type:'number',min:'-10',max:'10',step:'.001',value:s.offset.toFixed(3)});input.disabled=!i;input.dataset.reference=i?'false':'true';input.onchange=()=>{s.offset=Number(input.value)};row.append(label,small,input);$('offsetInputs').append(row)})
}
$('resetCuts').onclick=()=>{state.plan.cuts=state.originalCuts.map(c=>({...c}));renderCutInputs();renderTimeline()};
async function pollJob(id,signal){let failures=0;for(;;){signal.throwIfAborted();let j;try{j=await api('/api/jobs/'+id,{signal});failures=0}catch(e){if(e.name==='AbortError'||e.message==='expired'||++failures>=4)throw e;await delay(1500,signal);continue}progress(j);if(['ready','done'].includes(j.state))return j;if(['failed','canceled'].includes(j.state))throw Error(j.error||'renderFailed');await delay(1200,signal)}}
function delay(ms,signal){return new Promise((resolve,reject)=>{if(signal.aborted)return reject(signal.reason);const abort=()=>{clearTimeout(timer);reject(signal.reason)};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},ms);signal.addEventListener('abort',abort,{once:true})})}
$('analyzeButton').onclick=async()=>{
 error('');if(!$('consent').checked)return error('consentError');if(state.selected.length<2||state.selected.length>10)return error('languageCount');if(mode()==='server'&&!state.config.nativeAvailable)return error('serverMissing');
 const serial=++state.serial;state.controller=new AbortController();busy(true);progress({stage:'checkingStage',progress:1});
 try{const song=await checkURL();if(!song)throw Error('invalidURL');
 if(mode()==='server'){
 const j=await post('/api/jobs',{key:song.key,sourceUrl:state.checked,languages:state.selected,quality:Number($('quality').value),locale,title:song.title},state.controller.signal);state.job=j.id;rememberJob(j.id);const ready=await pollJob(j.id,state.controller.signal);showPlan(ready);
 }else{const {BrowserEngine}=await import('./browser-engine.mjs');state.engine=new BrowserEngine(progress,state.controller.signal);showPlan(await state.engine.prepare(song.key,state.selected,Number($('quality').value)))}
 }catch(e){if(serial===state.serial&&e.name!=='AbortError'){error(e);state.engine?.close();state.engine=null}}finally{if(serial===state.serial)busy(false)}
};
function finish(result){state.result=result;const v=$('resultVideo');v.src=result.url;v.hidden=false;$('emptyVisual').hidden=true;$('stageBottom').hidden=true;$('previewLanguage').hidden=true;const link=$('downloadButton');link.href=result.download||result.url;link.download='Music-LangMix.mp4';link.hidden=false;$('exportNote').textContent=(result.size/1048576).toFixed(1)+' MB · '+clock(state.plan.duration)+' · '+t('reviewNote')+(state.job?' '+t('retention'):'');updateActions()}
$('renderButton').onclick=async()=>{
 error('');if(!$('consent').checked)return error('consentError');try{validatePlan(state.plan)}catch(e){return error(e)}
 const serial=++state.serial;busy(true);let wake;
 try{
 if(state.job){state.controller=new AbortController();await post('/api/jobs/'+state.job+'/render',{cuts:state.plan.cuts.map(c=>c.time),offsets:state.plan.sources.map(s=>s.offset),showLabel:$('showLabel').checked,locale},state.controller.signal);const done=await pollJob(state.job,state.controller.signal);finish({url:'/api/jobs/'+state.job+'/result',download:'/api/jobs/'+state.job+'/result?download=1',size:done.resultSize})}
 else{try{wake=await navigator.wakeLock?.request('screen')}catch{}const blob=await state.engine.render(state.plan,Number($('quality').value),$('showLabel').checked,name);finish({url:URL.createObjectURL(blob),size:blob.size})}
 }catch(e){if(serial===state.serial&&e.name!=='AbortError'){error(e);state.engine?.close();state.engine=null;state.plan=null;$('timelineEditor').hidden=true;if(state.job){const id=state.job;state.job=null;rememberJob(null);void api('/api/jobs/'+id,{method:'DELETE'}).catch(()=>{})}}}finally{try{await wake?.release()}catch{}if(serial===state.serial)busy(false)}
};
$('cancelButton').onclick=()=>{++state.serial;state.controller?.abort();++state.validation;checkController?.abort();state.engine?.close();state.engine=null;busy(false);forget();toast('canceled')};
$('newMix').onclick=()=>{forget();state.song=null;state.checked='';$('songUrl').value='';$('sourceStatus').textContent='';showSong();renderAll();$('songUrl').focus()};
function dialog(title,paragraphs){$('dialogTitle').textContent=t(title);$('dialogBody').replaceChildren();for(const item of paragraphs){const p=document.createElement('p');p.textContent=t(item);$('dialogBody').append(p)}$('infoDialog').showModal()}
$('helpButton').onclick=()=>dialog('helpTitle',['helpBody']);$('legalButton').onclick=()=>dialog('rightsTitle',['rightsBody','disclaimer','privacyBody']);
$('closeDialog').onclick=$('dialogDone').onclick=()=>$('infoDialog').close();$('infoDialog').onclick=e=>{if(e.target===$('infoDialog'))$('infoDialog').close()};
let dark=matchMedia('(prefers-color-scheme: dark)').matches;try{const saved=localStorage.getItem('music-langmix-theme');if(saved)dark=saved==='dark'}catch{}document.body.dataset.theme=dark?'dark':'light';$('themeToggle').onclick=()=>{dark=!dark;document.body.dataset.theme=dark?'dark':'light';try{localStorage.setItem('music-langmix-theme',dark?'dark':'light')}catch{}};
for(let i=0;i<49;i++){const bar=document.createElement('i');bar.style.height=(9+Math.abs(Math.sin(i*1.74)*Math.cos(i*.29))*48)*(1-Math.abs(i-24)/42)+'px';$('decorWave').append(bar)}
try{
 [state.catalog,state.config]=await Promise.all([api('/languages.json'),api('/api/config')]);state.selected=[...new Set([...state.preferred.filter(c=>state.catalog.some(l=>l.langcode===c)),...COMMON])].slice(0,7);renderAll();
 let id;try{id=sessionStorage.getItem('music-langmix-job')}catch{}
 if(/^[a-f0-9]{64}$/.test(id||'')){
 try{const j=await api('/api/jobs/'+id);state.job=id;state.selected=j.options.languages;$('quality').value=j.options.quality;$('engine').value='server';state.song={title:j.title,duration:j.duration||0};$('songUrl').value=j.options.sourceUrl||'';$('consent').checked=false;renderAll();showSong();if(['ready','done'].includes(j.state)){showPlan(j);if(j.state==='done')finish({url:'/api/jobs/'+id+'/result',download:'/api/jobs/'+id+'/result?download=1',size:j.resultSize});busy(false)}else if(['queued','preparing','rendering'].includes(j.state)){state.controller=new AbortController();busy(true);const ready=await pollJob(id,state.controller.signal);showPlan(ready);if(ready.state==='done')finish({url:'/api/jobs/'+id+'/result',download:'/api/jobs/'+id+'/result?download=1',size:ready.resultSize});busy(false)}else throw Error('expired');toast('resume')}
 catch(e){rememberJob(null);state.job=null;busy(false);error(e)}
 }
}catch(e){error(e)}
addEventListener('beforeunload',e=>{if(state.busy&&mode()==='browser'){e.preventDefault();e.returnValue=''}});
