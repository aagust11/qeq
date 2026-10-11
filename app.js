import {BLOCK_SIZE, shuffled, tally, completedCount, blocks, validAttempt, optionsFor, isPair, truthLabel} from './core.js';
import {read, write, saveAttempt, download,deviceIdentity,savedSession,exclusive} from './storage.js';
import {syncAll,receiptKey,usingCloud,recoverSession} from './sync.js';
import {photoPreloader} from './preload.js';
const $=id=>document.getElementById(id);
const gameClosed=()=>read('settings',{}).gameClosed===true;
const gamePaused=()=>read('settings',{}).gamePaused===true;
const stopped=()=>gameClosed()||gamePaused();
let previousControl='';
let catalog={cards:[]}, attempt=null, busy=false, photoReady=false, view='cover';
const photoMemory=new Map();
const preloader=photoPreloader({
 async fetchPhoto(card){
  let cache=null;try{if('caches'in window)cache=await caches.open('qeq-photos-v2');}catch{}
  const url=new URL(card.src,location.href);let response=cache?await cache.match(url):null;
  if(!response){response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Foto no disponible');if(cache)try{await cache.put(url,response.clone());}catch{}}
  return URL.createObjectURL(await response.blob());
 },remember(card,url){photoMemory.set(card.id,url);},
 onProgress(ready,total){$('photoPreparation').textContent=total?ready>=total?'Fotos preparades per jugar sense connexió.':`Preparant fotos en segon pla… ${Math.min(ready,total)} de ${total}`:'';if(ready>=total&&$('notice').textContent.startsWith('Les altres fotos'))notice('Fotos preparades. Ja pots continuar encara que es talli la connexió.');}
});
let clockAt=performance.now(),clockEnabled=false;
function tickClock(){
 const now=performance.now(),delta=Math.max(0,now-clockAt);clockAt=now;
 if(!stopped()&&clockEnabled&&attempt?.timerVersion===1&&attempt.answers.length<attempt.cards.length){
  const latest=savedSession();
  if(latest?.id===attempt.id&&latest.answers.length===attempt.answers.length){
   attempt.activeMs=Math.max(attempt.activeMs||0,latest.activeMs||0)+Math.round(delta);
   try{saveAttempt(attempt);}catch{}
  }
 }
 clockEnabled=!!(!stopped()&&attempt?.timerVersion===1&&view==='game'&&!document.hidden&&attempt.answers.length<attempt.cards.length&&(photoReady||!$('checkpoint').hidden));
}
setInterval(tickClock,1000);
document.addEventListener('visibilitychange',tickClock);
window.addEventListener('pagehide',()=>{tickClock();clockEnabled=false;});
window.addEventListener('pageshow',()=>{clockAt=performance.now();tickClock();});
let paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
const original=[['image(6).png',260,-47,-48],['image(7).png',330,-76,-8],['image(7).png',330,-151,-25],['image(8).png',270,-58,-15],['image(8).png',270,-126,-33],['image(9).png',270,-135,-63],['image(10).png',240,-47,-28],['image(20261010-070401).png',235,-53,-10]];
function uuid(){return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(+c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>+c/4).toString(16));}
function notice(text){$('notice').textContent=text;$('notice').hidden=!text;}
function persist(){try{saveAttempt(attempt);return true;}catch{notice('No hi ha espai per desar la partida. Descarrega-la abans de tancar aquesta pàgina.');return false;}}
function show(next){tickClock();view=next;clockEnabled=false;['cover','game','results'].forEach(id=>$(id).hidden=id!==next);window.scrollTo(0,0);}
function cover(){show('cover');refreshResume();}
function refreshResume(){const saved=savedSession();$('play').hidden=validAttempt(saved);$('resume').hidden=!validAttempt(saved);$('resume').textContent=saved?.answers?.length===saved?.cards?.length?'Veure la meva partida':'Reprendre la partida';}
function buttons(disabled){disabled=disabled||stopped();$('chooseEric').disabled=disabled;$('chooseAleix').disabled=disabled;}
function syncLabel(){if(!attempt)return;const sent=read(receiptKey(attempt.id),-1);const issue=read('sync-error-'+attempt.id);$('syncStatus').textContent=issue?`Desat al dispositiu. Enviament pendent: ${issue}`:(usingCloud||read('server-known'))?(sent===attempt.answers.length?'Desat al dispositiu i enviat a l’organització.':'Desat al dispositiu · pendent d’enviar. Es reintentarà automàticament.'):'Desat en aquest dispositiu. La versió web independent no envia puntuacions a altres dispositius.';}
function setupCover(){original.forEach(([file,w,x,y])=>{const tile=document.createElement('div');tile.className='tile';const inner=document.createElement('div');inner.className='tile-inner';const portrait=document.createElement('div');portrait.className='portrait';portrait.style=`--w:${w}%;--x:${x}%;--y:${y}%`;const img=document.createElement('img');img.src='assets/'+file;img.alt='Un dels bessons de petit';portrait.append(img);const label=document.createElement('span');label.className='tile-label';label.textContent='Èric o Aleix?';inner.append(portrait,label);tile.append(inner);$('coverBoard').append(tile);});}
setupCover();setInterval(()=>{if(view!=='cover'||paused||document.hidden)return;const tiles=$('coverBoard').children;tiles[Math.floor(Math.random()*tiles.length)]?.classList.toggle('down');},850);
function pauseLabel(){$('pause').textContent=paused?'▶ Reprendre l’animació':'Ⅱ Pausar l’animació';}pauseLabel();$('pause').onclick=()=>{paused=!paused;pauseLabel();};
$('home').onclick=e=>{e.preventDefault();if(!busy)cover();};$('exit').onclick=()=>{if(!busy){persist();cover();}};$('resultHome').onclick=cover;
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{notice('Fes servir l’opció de pantalla completa del navegador.');}};
async function loadCatalog(){try{const r=await fetch('catalog.json',{cache:'no-cache'});if(!r.ok)throw Error();const data=await r.json();if(!Array.isArray(data.cards))throw Error();catalog=data;try{write('catalog',catalog);}catch{}}catch{catalog=read('catalog',{cards:[]});}$('catalogStatus').textContent=catalog.cards.length?`${catalog.cards.length} fotos · resultats cada 7 respostes`:'Estem preparant les fotos del repte. Torna aviat!';$('play').disabled=stopped()||!catalog.cards.length;preloader.warm(catalog.cards);}
$('play').onclick=async()=>{if(stopped()){notice(gameClosed()?'El joc ja està tancat.':'El joc està pausat per l’organització.');return;}const saved=await recoverSession();if(validAttempt(saved)){attempt=saved;renderGame();return;}$('joinError').textContent='';$('join').showModal();};$('closeJoin').onclick=()=>$('join').close();
$('joinForm').onsubmit=async e=>{e.preventDefault();if(stopped()){notice(gameClosed()?'El joc ja està tancat.':'El joc està pausat per l’organització.');$('join').close();return;}return exclusive(async()=>{const saved=await recoverSession();if(validAttempt(saved)){attempt=saved;$('join').close();renderGame();return;}if(busy)return;const firstName=$('firstName').value.trim(),lastName=$('lastName').value.trim();if(!firstName||!lastName){$('joinError').textContent='Escriu el nom i els cognoms.';return;}busy=true;$('start').disabled=true;
try{const cards=shuffled(catalog.cards);$('joinError').textContent='Preparant la primera foto…';
try{await preloader.ensure(cards[0]);}catch{$('joinError').textContent='No es pot carregar la primera foto. Comprova la connexió i torna-ho a provar.';return;}
if(stopped()){$('joinError').textContent='El joc està aturat per l’organització.';return;}
preloader.warm(cards);
const device=deviceIdentity();attempt={schema:2,gameGeneration:read('settings',{}).gameGeneration||1,id:device.attemptId,deviceId:device.id,secret:device.secret,firstName,lastName,catalogVersion:catalog.version,cards,answers:[],acknowledged:0,timerVersion:1,activeMs:0,startedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};if(!persist()){$('joinError').textContent='No es pot desar la partida. Allibera espai o prova un altre navegador.';return;}$('join').close();notice(preloader.ready.size<cards.length?'Les altres fotos es preparen en segon pla. Mantén la connexió fins que estiguin descarregades.':'');renderGame();syncAll();}finally{busy=false;$('start').disabled=false;}});};
$('resume').onclick=()=>{const saved=savedSession();if(!validAttempt(saved)){notice('No s’ha pogut recuperar la partida.');return;}attempt=saved;renderGame();syncAll();};
function renderGame(){if(!validAttempt(attempt)){cover();return;}if(gameClosed()){renderResults();return;}show('game');$('playerLabel').textContent=`${attempt.firstName} ${attempt.lastName}`;const n=attempt.answers.length,total=attempt.cards.length,settled=completedCount(attempt);const score=tally(attempt,0,settled);$('totals').textContent=`Total: ${score.correct} encerts · ${score.wrong} errors${settled<n?' · bloc en curs':''}`;$('progressFill').style.width=`${n/total*100}%`;$('round').textContent=`Foto ${Math.min(n+1,total)} de ${total} · bloc ${Math.floor(n/BLOCK_SIZE)+1}`;syncLabel();
if(n>0&&(n%BLOCK_SIZE===0||n===total)&&attempt.acknowledged<n){showCheckpoint();return;}if(n===total){renderResults();return;}$('checkpoint').hidden=true;$('question').hidden=false;const current=attempt.cards[n],pair=isPair(current);const options=optionsFor(current);$('questionTitle').textContent=pair?'En quin ordre estan?':'Èric o Aleix?';$('questionHint').textContent=pair?'Mira la foto d’esquerra a dreta. Tria l’ordre amb els botons o llisca cap a l’opció corresponent.':'Llisca a l’esquerra per a l’Èric, a la dreta per a l’Aleix, o toca un botó.';$('chooseEric').textContent='← '+options[0];$('chooseAleix').textContent=options[1]+' →';$('chooseEric').setAttribute('aria-label',pair?'D’esquerra a dreta: Èric i Aleix':'Èric');$('chooseAleix').setAttribute('aria-label',pair?'D’esquerra a dreta: Aleix i Èric':'Aleix');$('question').classList.toggle('pair-question',pair);$('photoCard').className='photo-card';$('photoCard').style.transform='';$('stamp').textContent='';$('stamp').className='stamp';photoReady=false;buttons(true);$('imageError').hidden=true;$('retryImage').hidden=true;loadPhoto(attempt.cards[n]);}
async function loadPhoto(card){
 const img=$('questionImage');img.onload=()=>{photoReady=true;buttons(false);tickClock();};img.onerror=()=>{photoReady=false;buttons(true);$('imageError').hidden=false;$('retryImage').hidden=false;};img.alt=`Foto ${attempt.answers.length+1} del repte`;
 try{const url=await preloader.ensure(card);if(attempt?.cards[attempt.answers.length]?.id===card.id)img.src=url;}catch{if(attempt?.cards[attempt.answers.length]?.id===card.id)img.onerror();}
}
$('retryImage').onclick=()=>{$('imageError').hidden=true;$('retryImage').hidden=true;loadPhoto(attempt.cards[attempt.answers.length]);};
async function choose(choice){
 if(stopped()||busy||!photoReady||view!=='game'||!$('checkpoint').hidden)return;
 tickClock();busy=true;buttons(true);const expected=attempt.answers.length,left=choice==='Èric';
 let accepted=false;
 try{await exclusive(async()=>{
  const latest=savedSession();
  if(latest?.id!==attempt.id||latest.answers.length!==expected){attempt=latest;return;}
  choice=optionsFor(attempt.cards[expected])[left?0:1];
  attempt.answers.push({id:attempt.cards[expected].id,choice,at:new Date().toISOString(),...(attempt.timerVersion===1?{elapsedMs:Math.round(attempt.activeMs||0)}:{})});attempt.updatedAt=new Date().toISOString();
  if(!persist()){attempt.answers.pop();return;}accepted=true;
 });
 if(!accepted){busy=false;renderGame();return;}
 $('stamp').textContent=choice;$('stamp').className='stamp visible '+(left?'eric':'aleix');$('choiceStatus').textContent=`Has triat ${choice}.`;$('photoCard').style.transform='';$('photoCard').classList.add(left?'chosen-eric':'chosen-aleix');syncAll();
 await new Promise(r=>setTimeout(r,paused?120:750));
 }finally{busy=false;const latest=savedSession();if(latest)attempt=latest;renderGame();}
}
$('chooseEric').onclick=()=>choose('Èric');$('chooseAleix').onclick=()=>choose('Aleix');
let pointer=null;$('photoCard').onpointerdown=e=>{if(busy||!photoReady||e.button!==0)return;pointer={x:e.clientX,y:e.clientY,id:e.pointerId};$('photoCard').setPointerCapture(e.pointerId);};$('photoCard').onpointermove=e=>{if(!pointer||busy)return;const x=e.clientX-pointer.x;if(Math.abs(x)>12)$('photoCard').style.transform=`translateX(${Math.max(-100,Math.min(100,x))}px) rotate(${x/22}deg)`;};$('photoCard').onpointerup=e=>{if(!pointer)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;pointer=null;$('photoCard').style.transform='';if(Math.abs(dx)>75&&Math.abs(dx)>Math.abs(dy)*1.3)choose(dx<0?'Èric':'Aleix');};$('photoCard').onpointercancel=()=>{pointer=null;$('photoCard').style.transform='';};
document.addEventListener('keydown',e=>{if(view==='game'&&!busy&&$('checkpoint').hidden&&!['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)){if(e.key==='ArrowLeft')choose('Èric');if(e.key==='ArrowRight')choose('Aleix');}});
function showCheckpoint(){$('question').hidden=true;$('checkpoint').hidden=false;tickClock();const n=attempt.answers.length,start=Math.floor((n-1)/BLOCK_SIZE)*BLOCK_SIZE;const result=tally(attempt,start,n),total=tally(attempt);$('blockLabel').textContent=`BLOC ${Math.floor(start/BLOCK_SIZE)+1} · ${result.count} FOTOS`;$('blockCorrect').textContent=result.correct;$('blockWrong').textContent=result.wrong;$('blockTotal').textContent=`Acumulat: ${total.correct} encerts i ${total.wrong} errors en ${total.count} fotos.`;$('continue').textContent=n===attempt.cards.length?'Veure les meves decisions →':'Següent bloc →';}
$('continue').onclick=async()=>exclusive(()=>{if(stopped())return;attempt=savedSession();attempt.acknowledged=attempt.answers.length;persist();renderGame();syncAll();});
function renderResults(){if(gameClosed()){const final=read('final-'+attempt.id);if(final)attempt=final;notice(read('closed-sync-'+attempt.id,false)?'El joc ha acabat. Aquests són els resultats rebuts per l’organització; les fotos no contestades no sumen punts.':'El joc ha acabat. Pendent de confirmar els resultats oficials amb el servidor.');}if(view!=='results')show('results');const scores=tally(attempt);$('resultTitle').textContent=`${attempt.firstName}, ja has fet les teves apostes!`;$('finalTotals').textContent=`${scores.correct} encerts · ${scores.wrong} errors`;$('blockHistory').replaceChildren(...blocks(attempt).map(b=>{const p=document.createElement('p');p.textContent=`Bloc ${b.number}: ${b.correct} encerts · ${b.wrong} errors`;return p;}));const reveal=read('settings',{}).revealAnswers===true;$('revealMessage').textContent=reveal?'L’organització ha revelat les respostes. Ja pots comprovar cada decisió.':'Pots revisar què has triat. Les respostes correctes es mostraran quan l’organització les activi.';$('review').replaceChildren(...attempt.answers.map((answer,i)=>{const card=attempt.cards[i],box=document.createElement('article');box.className='review-card';const img=document.createElement('img');img.src=photoMemory.get(card.id)||card.src;img.alt=`Foto ${i+1}`;img.loading='lazy';const p=document.createElement('p');p.className=answer.choice===optionsFor(card)[0]?'tag eric':'tag aleix';p.textContent=`${isPair(card)?'D’esquerra a dreta':'Has triat'}: ${answer.choice}`;box.append(img,p);if(reveal){const truth=document.createElement('p');truth.className='review-truth';truth.textContent=`${truthLabel(card)}. ${card.person===answer.choice?'✓ Encert · +1 punt':'✕ Error · 0 punts'}`;box.append(truth);}return box;}));}
$('exportAttempt').onclick=()=>download('la-meva-partida.json',attempt);
document.addEventListener('qeq-reset',()=>{attempt=null;photoReady=false;clockEnabled=false;$('join').close();cover();$('play').disabled=stopped()||!catalog.cards.length;notice('L’organització ha reiniciat la partida o ha començat un joc nou. Pots tornar a començar quan el joc estigui actiu.');});
document.addEventListener('qeq-sync',()=>{
 const control=gameClosed()?'closed':gamePaused()?'paused':'active',changed=previousControl!==control;previousControl=control;
 $('play').disabled=stopped()||!catalog.cards.length;$('continue').disabled=stopped();
 if(stopped()&&$('join').open)$('join').close();
 if(gameClosed()){if(attempt){renderResults();return;}notice('El joc ja està tancat.');}
 else if(gamePaused()){buttons(true);notice('Joc pausat per l’organització. La partida es conserva.');}
 else if(changed){notice('');const saved=savedSession();if(validAttempt(saved)){attempt=saved;if(view!=='cover')renderGame();}}
 if(!stopped())buttons(!photoReady||busy);
 syncLabel();if(view==='results'&&attempt)renderResults();
});
window.addEventListener('storage',e=>{if(e.key==='qeq-v2-device'){attempt=savedSession();if(validAttempt(attempt))renderGame();else{clockEnabled=false;cover();}}});
window.addEventListener('online',()=>syncAll());window.addEventListener('storage',e=>{if(e.key==='qeq-v2-settings'&&view==='results')renderResults();if(e.key?.startsWith('qeq-v2-attempt-')&&!busy){const saved=savedSession();if(validAttempt(saved)){attempt=saved;if(view!=='cover')renderGame();else refreshResume();}}});document.addEventListener('qeq-recovered',()=>{if(!busy){attempt=savedSession();renderGame();}});document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncAll();});setInterval(syncAll,10000);
if('serviceWorker'in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{});}
refreshResume();loadCatalog();recoverSession().then(saved=>{if(validAttempt(saved)){attempt=saved;renderGame();}syncAll();}).catch(()=>notice('No es pot desar al navegador. Activa l’emmagatzematge per jugar.'));
