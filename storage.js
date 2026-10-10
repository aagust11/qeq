const PREFIX = 'qeq-v2-';
export function read(name, fallback = null) { try { return JSON.parse(localStorage.getItem(PREFIX + name)) ?? fallback; } catch { return fallback; } }
export function write(name, value) { localStorage.setItem(PREFIX + name, JSON.stringify(value)); }
export function saveAttempt(attempt) {
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
