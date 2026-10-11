import {read, write, savedSession,deviceIdentity,saveAttempt,resetSession} from './storage.js';
import {CLOUD_API} from './cloud-config.js';
export const usingCloud = location.protocol === 'https:';
export const receiptKey = id => (usingCloud?'cloud-sent-':'sent-')+id;
let running=false;
function root(){return new URL('./',new URL(document.querySelector('meta[name="app-root"]')?.content||'./',location.href));}
function endpoint(path){return usingCloud?new URL(path,CLOUD_API):new URL('api/'+path,root());}
export async function getServer() {
  try {
    const r=await fetch(endpoint('info'),{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!r.ok)return null;const data=await r.json();
    if(!['qeq-cloud-v1','qeq-local-v2'].includes(data.service))return null;
    write('server-known',true);return data;
  }catch{return null;}
}
export async function api(path,options={}) {
 const headers={'Content-Type':'application/json',...(options.headers||{})};
 if(usingCloud&&headers.Authorization){headers['X-Admin-Token']=headers.Authorization.replace(/^Bearer /,'');delete headers.Authorization;}
 const r=await fetch(endpoint(path),{...options,cache:'no-store',headers,signal:AbortSignal.timeout(15000)});
 const data=await r.json().catch(()=>({error:'Resposta del servidor no vàlida.'}));
 if(!r.ok){const e=new Error(data.error||'No s’ha pogut connectar.');e.status=r.status;e.needsSnapshot=data.needsSnapshot;e.reset=data.reset;throw e;}return data;
}
export async function syncAll() {
 if(running)return;running=true;
 try{
  const info=await getServer();
  if(!info){document.dispatchEvent(new CustomEvent('qeq-sync',{detail:{online:false,known:usingCloud||read('server-known',false)}}));return;}
  const previousSettings=read('settings',{});write('settings',info.settings);
  if(usingCloud&&info.settings.controlRevision!==read('control-checked')){
   await recoverSession();
  }
  if(info.settings.gamePaused&&!info.settings.gameClosed){document.dispatchEvent(new CustomEvent('qeq-sync',{detail:{online:true,settings:info.settings,previousSettings}}));return;}

  if(info.settings.gameClosed){
   const a=savedSession();
   if(a&&read('closed-sync-'+a.id)!==info.settings.closedAt){
    try{const device=deviceIdentity();const result=await api('device/recover',{method:'POST',headers:{'X-Attempt-Secret':device.secret},body:JSON.stringify({deviceId:device.id,attemptId:device.attemptId,...(savedSession()?{gameGeneration:savedSession().gameGeneration||1}:{})})});
     write('final-'+a.id,result.attempt?{...result.attempt,secret:a.secret}:{...a,answers:[]});write('closed-sync-'+a.id,info.settings.closedAt);
    }catch{}
   }
   document.dispatchEvent(new CustomEvent('qeq-sync',{detail:{online:true,settings:info.settings}}));return;
  }
  for(const a of [savedSession()]){
   if(!a||a.schema!==2||!a.secret)continue;
   const device=deviceIdentity();a.deviceId=device.id;
   const sent=read(receiptKey(a.id),-1);const ackKey=receiptKey(a.id)+'-ack';
   if(sent===a.answers.length&&read(ackKey,0)===(a.acknowledged||0))continue;
   const payload=usingCloud&&sent>=0?{id:a.id,deviceId:device.id,from:sent,answers:a.answers.slice(sent),acknowledged:a.acknowledged||0}:a;
   try{const result=await api('attempts/'+a.id,{method:'PUT',headers:{'X-Attempt-Secret':a.secret},body:JSON.stringify(payload)});
    if(result.recovered&&result.attempt){adoptRecovered(result.attempt,device);}
    else{write(receiptKey(a.id),result.accepted??a.answers.length);write(ackKey,a.acknowledged||0);}
    write('sync-error-'+a.id,null);
   }catch(e){if(e.reset){resetSession(a.id);continue;}if(e.needsSnapshot)write(receiptKey(a.id),-1);write('sync-error-'+a.id,e.message);}
  }
  document.dispatchEvent(new CustomEvent('qeq-sync',{detail:{online:true,settings:info.settings}}));
 }finally{running=false;}
}

function adoptRecovered(remote,device){
 const local=savedSession();
 if(local?.id===remote.id&&local.answers.length>=remote.answers.length)return local;
 const recovered={...remote,secret:device.secret,acknowledged:remote.acknowledged||0};
 saveAttempt(recovered);write('device',{...device,attemptId:recovered.id});
 document.dispatchEvent(new CustomEvent('qeq-recovered'));return recovered;
}
export async function recoverSession(){
 const device=deviceIdentity();
 if(!usingCloud)return savedSession();
 try{const r=await api('device/recover',{method:'POST',headers:{'X-Attempt-Secret':device.secret},body:JSON.stringify({deviceId:device.id,attemptId:device.attemptId,...(savedSession()?{gameGeneration:savedSession().gameGeneration||1}:{})})});write('control-checked',read('settings',{}).controlRevision);if(r.reset){resetSession(device.attemptId);return null;}if(r.attempt)return adoptRecovered(r.attempt,device);}
 catch{}return savedSession();
}
