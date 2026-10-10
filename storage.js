const PREFIX = 'qeq-v2-';
export function read(name, fallback = null) { try { return JSON.parse(localStorage.getItem(PREFIX + name)) ?? fallback; } catch { return fallback; } }
export function write(name, value) { localStorage.setItem(PREFIX + name, JSON.stringify(value)); }
export function saveAttempt(attempt) {
  if(read('revoked-'+attempt.id,false))throw new Error('Partida eliminada per l’organització.');
  const previous=read('attempt-'+attempt.id);
  if(previous){
    if(previous.answers.length>attempt.answers.length)throw new Error('La partida té respostes més recents en una altra pestanya.');
    if(previous.answers.some((a,i)=>a.id!==attempt.answers[i]?.id||a.choice!==attempt.answers[i]?.choice))throw new Error('No es pot canviar una resposta ja desada.');
  }
  write('attempt-' + attempt.id, attempt);
  write('active', attempt.id);
}
export function attempts() {
  const result = [];
  for (let i=0;i<localStorage.length;i++) {
    const key=localStorage.key(i);
    if(key.startsWith(PREFIX+'attempt-')) {try {result.push(JSON.parse(localStorage.getItem(key)));}catch{}}
  }
  return result;
}
export function download(name, data) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function uuid(){return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(+c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>+c/4).toString(16));}
export function deviceIdentity(){
 let device=read('device');if(device)return device;
 const old=read('attempt-'+read('active'));
 device={id:uuid(),secret:old?.secret||uuid(),attemptId:old?.id||uuid()};write('device',device);return device;
}
export async function exclusive(action){return navigator.locks?navigator.locks.request('qeq-one-device-session',action):action();}
export function savedSession(){const id=read('device')?.attemptId||read('active');return id?read('attempt-'+id):null;}

export function resetSession(expectedId){
 const device=deviceIdentity();if(device.attemptId!==expectedId)return;
 write('revoked-'+expectedId,true);
 for(const name of ['attempt-','final-','closed-sync-','cloud-sent-','sync-error-'])localStorage.removeItem(PREFIX+name+expectedId);
 write('device',{...device,attemptId:uuid()});write('active',null);
 document.dispatchEvent(new CustomEvent('qeq-reset'));
}
