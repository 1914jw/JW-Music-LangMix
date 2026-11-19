import {validateBanner,validateDesign,DEFAULT_DESIGN,drawBadge} from './banner.mjs';
import {locale} from './i18n.mjs';
const de=locale==='de';
export function setupBanner(onChange,labelFor){
 const host=document.createElement('fieldset');host.className='banner-controls';
 host.innerHTML=`<legend>${de?'Sprachbanner gestalten':'Language banner design'}</legend>
 <label for="bannerDuration">${de?'Anzeigedauer nach jedem Wechsel':'Visibility after each language starts'}</label><select id="bannerDuration"><option value="always">${de?'Immer':'Always'}</option><option value="timed">${de?'Eigene Dauer':'Custom duration'}</option></select>
 <label for="bannerSeconds">${de?'Dauer in Sekunden':'Duration in seconds'}</label><input id="bannerSeconds" type="number" min="0.1" max="900" step="0.1" value="5" disabled>
 <label for="bannerPosition">${de?'Position':'Position'}</label><select id="bannerPosition"><option value="top-left">${de?'Oben links':'Top left'}</option><option value="top-right">${de?'Oben rechts':'Top right'}</option><option value="bottom-left">${de?'Unten links':'Bottom left'}</option><option value="bottom-right">${de?'Unten rechts':'Bottom right'}</option><option value="custom">${de?'Eigene X/Y-Position':'Custom X/Y position'}</option></select>
 <div class="banner-grid">${[['bannerX','X',24,0,1280],['bannerY','Y',24,0,720],['bannerWidth',de?'Breite':'Width',320,100,1280],['bannerHeight',de?'Höhe':'Height',64,40,720]].map(([id,title,value,min,max])=>`<label for="${id}">${title}<input id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="1"></label>`).join('')}</div>
 <p>${de?'Position und Größe: Pixel bei 1280 × 720. Automatische Skalierung beim Export.':'Position and size: pixels at 1280 × 720. Automatically scaled for export.'}</p>
 <label for="bannerUpload">${de?'Eigenes JSON-Design hochladen':'Upload custom JSON design'}</label><input id="bannerUpload" type="file" accept=".json,application/json"><a class="text-button" href="/banner-example.json" download>${de?'JSON-Vorlage herunterladen':'Download JSON template'}</a><button type="button" class="secondary" id="bannerReset">${de?'Standarddesign wiederherstellen':'Reset banner design'}</button>
 <p id="bannerError" role="alert" hidden></p><canvas id="bannerPreview" width="1280" height="720" role="img" aria-label="${de?'Sprachbanner-Vorschau im Videoformat 16 zu 9':'Language banner position preview in a 16 by 9 video'}"></canvas>
 <p>${de?'Vorschau zeigt Position. Lange Namen werden am Bannerrand abgeschnitten.':'Preview shows placement. Long names are clipped at the banner edge.'}</p><p>${de?'Letzte drei Sekunden: englischer Herkunftshinweis, immer eingebrannt.':'Final three seconds: English attribution, always embedded.'}</p>`;
 document.querySelector('.settings-card .smart-note').before(host);
 const $=id=>document.getElementById(id);let design={...DEFAULT_DESIGN},uploadSerial=0;
 function read(){return validateBanner({duration:$('bannerDuration').value==='always'?null:Number($('bannerSeconds').value),position:$('bannerPosition').value,x:Number($('bannerX').value),y:Number($('bannerY').value),design:{...design,width:Number($('bannerWidth').value),height:Number($('bannerHeight').value)}})}
 function refresh(){
 $('bannerSeconds').disabled=$('bannerDuration').disabled||$('bannerDuration').value==='always';
 for(const id of ['bannerX','bannerY'])$(id).disabled=$('bannerPosition').disabled||$('bannerPosition').value!=='custom';
 try{const b=read();$('bannerError').hidden=true;const ctx=$('bannerPreview').getContext('2d');ctx.fillStyle='#252733';ctx.fillRect(0,0,1280,720);ctx.strokeStyle='#555968';ctx.strokeRect(1,1,1278,718);if(document.getElementById('showLabel').checked){ctx.save();ctx.translate(b.x,b.y);drawBadge(ctx,labelFor(),b.design);ctx.restore()}}
 catch{$('bannerError').textContent=de?'Ungültiges Design oder Position außerhalb des Bildes.':'Invalid design or position outside the frame.';$('bannerError').hidden=false}
 }
 for(const el of host.querySelectorAll('select,input[type=number]'))el.addEventListener('input',()=>{onChange();refresh()});
 $('bannerUpload').onchange=async()=>{const serial=++uploadSerial,file=$('bannerUpload').files[0];if(!file)return;try{if(file.size>8192)throw Error();const candidate=validateDesign(JSON.parse(await file.text()));if(serial!==uploadSerial)return;design=candidate;$('bannerWidth').value=design.width;$('bannerHeight').value=design.height;onChange();refresh()}catch{if(serial!==uploadSerial)return;$('bannerError').textContent=de?'Ungültige JSON-Datei. Bitte Vorlage verwenden (max. 8 KB).':'Invalid JSON file. Use the template (max. 8 KB).';$('bannerError').hidden=false}finally{if(serial===uploadSerial)$('bannerUpload').value=''}};
 $('bannerReset').onclick=()=>{++uploadSerial;design={...DEFAULT_DESIGN};$('bannerWidth').value=320;$('bannerHeight').value=64;$('bannerX').value=24;$('bannerY').value=24;$('bannerPosition').value='top-left';onChange();refresh()};refresh();return {read,refresh};
}
