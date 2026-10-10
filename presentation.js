import {api,usingCloud} from './sync.js';
import {winners,photoExtremes,localPhotoStats,durationMs,formatTime} from './analytics.js';
const $=id=>document.getElementById(id),key=usingCloud?'qeq-cloud-admin-session':'qeq-admin-session';
let token=sessionStorage.getItem(key)||'',revision='',data=null,busy=false;
function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function lock(){data=null;token='';sessionStorage.removeItem(key);$('presentation').hidden=true;$('locked').hidden=false;$('status').textContent='Pantalla privada de l’organització';for(const id of ['winners','correctPhotos','wrongPhotos'])$(id).replaceChildren();}
function render(){
 const attempts=[...data.attempts].sort((a,b)=>a.startedAt.localeCompare(b.startedAt)||a.id.localeCompare(b.id));
 const result=winners(attempts,data.settings.gameClosed),finished=data.settings.gameClosed?attempts.length:attempts.filter(a=>a.cards.length&&a.answers.length===a.cards.length).length;
 $('winnerTitle').textContent=!result.players.length?'Qui s’endurà la victòria?':result.missingTime?'Empat en encerts':result.players.length===1?'Ja tenim guanyador/a!':'Una victòria compartida!';
 $('winners').replaceChildren(...result.players.map((a,i)=>{const card=node('article',undefined,'winner-card');card.style.setProperty('--delay',`${i*90}ms`);card.append(node('span','★','winner-star'),node('p',`${a.firstName} ${a.lastName}`,'winner-name'),node('strong',`${a.score.correct}`,'winner-score'),node('span',`encerts de ${a.cards.length}`,'winner-label'),node('p',formatTime(durationMs(a)),'winner-time'));return card;}));
 if(!result.players.length)$('winners').append(node('p','El podi s’omplirà quan arribin les primeres partides acabades.','empty-podium'));
 $('winnerNote').textContent=result.missingTime?'Hi ha partides anteriors sense temps registrat. No es pot resoldre aquest empat per temps.':`${finished} ${finished===1?'partida acabada':'partides acabades'} · ${attempts.length-finished} en curs`;
 const extremes=photoExtremes(data.photos||localPhotoStats(attempts));
 for(const [prefix,photos,count,label] of [['correct',extremes.mostCorrect,extremes.maxCorrect,'encerts'],['wrong',extremes.mostWrong,extremes.maxWrong,'errors']]){
  $(prefix+'Caption').textContent=photos.length?`${count} ${label} per foto${photos.length>1?` · ${photos.length} fotos empatades`:''}`:`Encara no hi ha ${label}.`;
  $(prefix+'Photos').replaceChildren(...photos.map((p,i)=>{const tile=node('article',undefined,'award-tile');tile.style.setProperty('--delay',`${i*70}ms`);const img=document.createElement('img');img.src='../'+p.src;img.alt='Foto del repte';img.loading='lazy';const labelEl=node('div',undefined,'award-tile-label');labelEl.append(node('strong',`${count} ${label}`),node('span',`${p.responses} respostes · ${Number(p.accuracy).toFixed(1)}% d’encert`));tile.append(img,labelEl);return tile;}));
 }
}
async function refresh(){if(busy||!token)return;try{if(window.opener&&!window.opener.closed&&!window.opener.sessionStorage.getItem(key)){lock();return;}}catch{}busy=true;
 try{const r=await api('admin/state'+(usingCloud&&revision?'?since='+encodeURIComponent(revision):''),{headers:{Authorization:'Bearer '+token}});if(!r.unchanged){data=r;revision=r.revision||'';render();}$('presentation').hidden=false;$('locked').hidden=true;$('status').textContent=(data.settings.gameClosed?'Joc tancat · resultats finals · ':'En directe · actualitzat a les ')+new Date().toLocaleTimeString('ca-ES');}
 catch(e){if(e.status===401)lock();else $('status').textContent=data?'Sense connexió · es mostren els últims resultats rebuts':'No s’han pogut carregar els resultats. Es tornarà a intentar.';}
 finally{busy=false;}
}
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{$('status').textContent='Fes servir la pantalla completa del navegador.';}};
if(token)refresh();else lock();setInterval(()=>{if(!document.hidden)refresh();},5000);window.addEventListener('online',refresh);
