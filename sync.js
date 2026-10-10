import {read, write, attempts} from './storage.js';
let running=false;
export async function getServer() {
  try {
    const r=await fetch(new URL('api/info',root()),{cache:'no-store',signal:AbortSignal.timeout(4000)});
    if(!r.ok) return null;
    const data=await r.json();
    if(data.service!=='qeq-local-v2')return null;
    write('server-known',true);return data;
  } catch {return null;}
}
function root(){return new URL('./',new URL(document.querySelector('meta[name="app-root"]')?.content||'./',location.href));}
export async function api(path, options={}) {
  const r=await fetch(new URL('api/'+path,root()),{...options,cache:'no-store',headers:{'Content-Type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(8000)});
  const data=await r.json().catch(()=>({error:'Resposta del servidor no vàlida.'}));
  if(!r.ok)throw new Error(data.error||'No s’ha pogut connectar.');
  return data;
}
export async function syncAll() {
  if(running)return;running=true;
  try {
    const info=await getServer();
    if(!info) {document.dispatchEvent(new CustomEvent('qeq-sync',{detail:{online:false,known:read('server-known',false)}}));return;}
    write('settings',info.settings);
    for(const a of attempts()) {
      if(!a || a.schema!==2)continue;
      const sent=read('sent-'+a.id, -1);
      if(sent===a.answers.length)continue;
      try {
        await api('attempts/'+a.id,{method:'PUT',headers:{'X-Attempt-Secret':a.secret},body:JSON.stringify(a)});
        write('sent-'+a.id,a.answers.length);
        write('sync-error-'+a.id,null);
      } catch(e){write('sync-error-'+a.id,e.message);}
    }
    document.dispatchEvent(new CustomEvent('qeq-sync',{detail:{online:true,settings:info.settings}}));
  } finally {running=false;}
}
