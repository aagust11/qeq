import {api,usingCloud} from './sync.js';
import {filterPhotos,photoFolder,photoOrder} from './photo-filters.js';
const $=id=>document.getElementById(id),key=usingCloud?'qeq-cloud-admin-session':'qeq-admin-session';
let token=sessionStorage.getItem(key)||'',photos=[],loading=false;const saving=new Set();
const auth=()=>({Authorization:'Bearer '+token});
function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function lock(){token='';sessionStorage.removeItem(key);photos=[];$('photoGrid').replaceChildren();$('photoManager').hidden=true;$('refreshPhotos').hidden=true;$('photoLocked').hidden=false;$('photoStatus').textContent='Cal iniciar sessió a administració.';}
function labelFor(p){const folder=photoFolder(p),order=photoOrder(p);return order?`${folder} · ${order} · ${p.person}`:folder;}
function render(){
 const folder=$('folderFilter').value;$('orderControl').hidden=folder!=='Conjuntes';
 const visible=filterPhotos(photos,{folder,order:$('orderFilter').value,state:$('stateFilter').value});
 const active=photos.filter(p=>p.enabled!==false).length;
 $('photoCount').textContent=`${visible.length} fotos visibles · ${active} activades de ${photos.length} en total`;$('noActive').hidden=active>0;$('noMatches').hidden=visible.length>0;
 $('photoGrid').replaceChildren(...visible.map(p=>{
  const card=node('article',undefined,'manager-card'+(p.enabled===false?' inactive':''));
  const preview=node('button',undefined,'manager-preview');preview.setAttribute('aria-label','Ampliar foto · '+labelFor(p));const img=document.createElement('img');img.src='../'+p.src;img.alt=labelFor(p);img.loading='lazy';preview.append(img);preview.onclick=()=>{$('previewImage').src=img.src;$('previewCaption').textContent=labelFor(p);$('photoPreview').showModal();};
  const caption=node('p',labelFor(p),'manager-caption');const label=node('label',undefined,'manager-toggle');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=p.enabled!==false;checkbox.disabled=saving.has(p.id);checkbox.setAttribute('aria-label','Activar foto · '+labelFor(p));const status=node('span',saving.has(p.id)?'Desant…':checkbox.checked?'Activada':'Desactivada');
  checkbox.onchange=()=>setEnabled(p,checkbox.checked);label.append(checkbox,status);card.append(preview,caption,label);return card;
 }));
}
async function setEnabled(p,enabled){saving.add(p.id);render();try{await api('admin/photos',{method:'PUT',headers:auth(),body:JSON.stringify({id:p.id,enabled})});p.enabled=enabled;$('photoError').textContent='';$('photoStatus').textContent='Canvi desat. S’aplicarà a les partides noves.';}catch(e){$('photoError').textContent=e.message;if(e.status===401)lock();}finally{saving.delete(p.id);if(token)render();}}
async function refresh(){if(loading||saving.size||!token)return;loading=true;try{const result=await api('admin/photos',{headers:auth()});photos=result.photos;$('photoManager').hidden=false;$('photoLocked').hidden=true;$('refreshPhotos').hidden=false;$('photoStatus').textContent='Fotos actualitzades a les '+new Date().toLocaleTimeString('ca-ES');$('photoError').textContent='';render();}catch(e){$('photoError').textContent=e.message;if(e.status===401)lock();}finally{loading=false;}}
for(const id of ['folderFilter','orderFilter','stateFilter'])$(id).onchange=render;
$('refreshPhotos').onclick=refresh;window.addEventListener('online',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
if(token&&usingCloud)refresh();else lock();
