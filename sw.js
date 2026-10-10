const SHELL='qeq-shell-v3';
const FILES=['./','index.html','style.css','app.js','core.js','storage.js','sync.js','catalog.json','admin/','admin.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(SHELL).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('qeq-shell-')&&key!==SHELL)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==location.origin||url.pathname.includes('/api/'))return;
 if(url.pathname.includes('/photos/')||url.pathname.includes('/assets/')){
 event.respondWith((async()=>{const cache=await caches.open('qeq-photos-v2');const old=await cache.match(event.request);if(old)return old;const r=await fetch(event.request);if(r.ok)await cache.put(event.request,r.clone());return r;})());return;
 }
 event.respondWith((async()=>{try{const r=await fetch(event.request);if(r.ok){const cache=await caches.open(SHELL);await cache.put(event.request,r.clone());}return r;}catch{const old=await caches.match(event.request);return old||new Response('Sense connexió. Torna a obrir el joc quan tinguis xarxa.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}})());
});
