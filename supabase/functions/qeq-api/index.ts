// Custom authentication: admin password + hashed expiring session;
// player writes require a per-attempt secret. No privileged key reaches browsers.
const ORIGIN = 'https://aagust11.github.io';
const CATALOG_URL = ORIGIN + '/qeq/catalog.json';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const dbUrl = Deno.env.get('SUPABASE_URL')! + '/rest/v1/';
const enc = new TextEncoder();
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
const sha = async (value:string) => hex(await crypto.subtle.digest('SHA-256',enc.encode(value)));
async function db(path:string, method='GET', body?:unknown, preference='return=representation') {
 const r=await fetch(dbUrl+path,{method,headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json',Prefer:preference},body:body===undefined?undefined:JSON.stringify(body)});
 const text=await r.text();const data=text?JSON.parse(text):null;
 if(!r.ok)throw new Error(data?.message||'Error de base de dades');return data;
}
function fail(message:string,status=400){return Object.assign(new Error(message),{status});}
async function json(req:Request){if(Number(req.headers.get('content-length'))>2_000_000)throw fail('Petició massa gran.',413);const text=await req.text();if(text.length>2_000_000)throw fail('Petició massa gran.',413);try{const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw fail('Dades no vàlides.');}}
async function requireAdmin(req:Request){const token=req.headers.get('X-Admin-Token')||'';if(!/^[a-f0-9]{64}$/.test(token))throw fail('Cal iniciar sessió.',401);const hashed=await sha(token);const sessions=await db('qeq_admin_sessions?token_hash=eq.'+hashed+'&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&select=token_hash');if(!sessions.length)throw fail('La sessió ha caducat. Torna a entrar.',401);return hashed;}
async function passwordHash(password:string,salt:string,iterations:number){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:Uint8Array.from(salt.match(/../g)!.map(x=>parseInt(x,16))),iterations},key,256));}
function equal(a:string,b:string){if(a.length!==b.length)return false;let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);return mismatch===0;}
async function allRows(path:string){const result=[];for(let offset=0;;offset+=500){const page=await db(path+'&limit=500&offset='+offset);result.push(...page);if(page.length<500)return result;}}
async function ensureCatalog(version:string){if(!/^[a-f0-9]{16}$/.test(version))throw fail('Versió de fotos no vàlida.');const known=await db('qeq_catalogs?version=eq.'+version+'&select=version');if(known.length)return;
 // Only a fixed trusted publication can register a catalog; never client-provided identities.
 const r=await fetch(CATALOG_URL,{cache:'no-store'});if(!r.ok)throw fail('No es pot comprovar el catàleg. Ho tornarem a intentar.',503);const cat=await r.json();if(cat.version!==version||!Array.isArray(cat.cards)||!cat.cards.length)throw fail('Aquest catàleg encara no està disponible al servidor. Reintenta-ho després.',409);
 if(cat.cards.length>2000||cat.cards.some((c:any)=>!/^photos\/[a-f0-9]{24}\.(jpg|jpeg|png|webp)$/.test(c.src)||!['Èric','Aleix','Èric i Aleix','Aleix i Èric'].includes(c.person)))throw fail('Catàleg no vàlid.');
 await db('qeq_photos?on_conflict=id','POST',cat.cards.map((c:any)=>({id:c.id,src:c.src,person:c.person,kind:c.kind||'single'})),'resolution=ignore-duplicates,return=minimal');
 await db('qeq_catalogs?on_conflict=version','POST',{version:cat.version,data:cat},'resolution=ignore-duplicates,return=minimal');
}
Deno.serve(async req=>{
 const origin=req.headers.get('Origin');const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'content-type, x-admin-token, x-attempt-secret','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS','Vary':'Origin'};
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(origin&&origin!==ORIGIN)return reply({error:'Origen no autoritzat.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 const path=new URL(req.url).pathname.split('/qeq-api/')[1]||'';
 try{
 if(path==='info'&&req.method==='GET'){const [settings]=await db('qeq_settings?select=reveal_answers,closed_at,paused,game_generation,updated_at');return reply({service:'qeq-cloud-v1',settings:{revealAnswers:settings.reveal_answers,gameClosed:!!settings.closed_at,closedAt:settings.closed_at,gamePaused:settings.paused,controlRevision:settings.updated_at,gameGeneration:settings.game_generation}});}
 if(path==='admin/login'&&req.method==='POST'){
  const minute=Math.floor(Date.now()/60000);const ip=req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
  const allowed=await db('rpc/qeq_take_login_slot','POST',{p_bucket:minute+':'+await sha(ip),p_limit:10});
  const globalAllowed=await db('rpc/qeq_take_login_slot','POST',{p_bucket:minute+':global',p_limit:120});
  if(!allowed||!globalAllowed)throw fail('Massa intents. Espera un minut.',429);
  const body=await json(req);if(typeof body.password!=='string'||body.password.length>256)throw fail('Contrasenya incorrecta.',401);
  const [credential]=await db('qeq_admin_credentials?select=salt,password_hash,iterations');
  if(!credential||!equal(await passwordHash(body.password,credential.salt,credential.iterations),credential.password_hash))throw fail('Contrasenya incorrecta.',401);
  const token=hex(crypto.getRandomValues(new Uint8Array(32)).buffer);await db('qeq_admin_sessions','POST',{token_hash:await sha(token),expires_at:new Date(Date.now()+12*3600000).toISOString()});
  await db('qeq_admin_sessions?expires_at=lt.'+encodeURIComponent(new Date().toISOString()),'DELETE');return reply({token});
 }
 if(path.startsWith('admin/')){
  const tokenHash=await requireAdmin(req);
  if(path==='admin/logout'&&req.method==='POST'){await db('qeq_admin_sessions?token_hash=eq.'+tokenHash,'DELETE');return reply({ok:true});}
  if(path==='admin/state'&&req.method==='GET'){
   const [[settings],latest]=await Promise.all([db('qeq_settings?select=hide_names,reveal_answers,closed_at,paused,game_generation,updated_at'),db('qeq_attempts?select=updated_at&order=updated_at.desc&limit=1')]);
   const revision=settings.updated_at+'|'+(latest[0]?.updated_at||'empty');
   if(new URL(req.url).searchParams.get('since')===revision)return reply({unchanged:true,revision});
   const [attempts,photos]=await Promise.all([allRows('qeq_attempts?select=data,eligible&order=started_at,id'),allRows('qeq_photo_summary?select=*&order=id')]);
   return reply({revision,settings:{hideNames:settings.hide_names,revealAnswers:settings.reveal_answers,gameClosed:!!settings.closed_at,closedAt:settings.closed_at,gamePaused:settings.paused,controlRevision:settings.updated_at,gameGeneration:settings.game_generation},attempts:attempts.map((a:any)=>({...a.data,eligible:a.eligible})),photos});
  }
  if(path==='admin/new-game'&&req.method==='POST'){const body=await json(req);if(!Number.isInteger(body.gameGeneration)||body.gameGeneration<1)throw fail('Joc no vàlid.');return reply(await db('rpc/qeq_new_game','POST',{p_expected_generation:body.gameGeneration}));}
  if(path==='admin/playing'&&req.method==='POST'){const body=await json(req);if(typeof body.active!=='boolean')throw fail('Estat no vàlid.');return reply(await db('rpc/qeq_set_playing','POST',{p_active:body.active}));}
  if(path==='admin/attempt'&&req.method==='POST'){const body=await json(req);if(!/^[a-f0-9-]{36}$/.test(body.id)||!['delete','exclude','include'].includes(body.action))throw fail('Acció no vàlida.');return reply(await db('rpc/qeq_manage_attempt','POST',{p_id:body.id,p_action:body.action}));}
  if(path==='admin/finish'&&req.method==='POST'){return reply(await db('rpc/qeq_finish_game','POST',{}));}
  if(path==='admin/settings'&&req.method==='PUT'){const body=await json(req);if(typeof body.hideNames!=='boolean'||typeof body.revealAnswers!=='boolean')throw fail('Configuració no vàlida.');await db('qeq_settings?id=eq.true','PATCH',{hide_names:body.hideNames,reveal_answers:body.revealAnswers,updated_at:new Date().toISOString()});return reply({ok:true});}
  if(path==='admin/password'&&req.method==='PUT'){const body=await json(req);if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)throw fail('La contrasenya ha de tenir entre 12 i 128 caràcters.');const salt=hex(crypto.getRandomValues(new Uint8Array(24)).buffer);await db('qeq_admin_credentials?id=eq.true','PATCH',{salt,password_hash:await passwordHash(body.password,salt,600000),iterations:600000,updated_at:new Date().toISOString()});await db('qeq_admin_sessions?token_hash=neq.'+tokenHash,'DELETE');return reply({ok:true});}
  throw fail('Ruta no disponible.',404);
 }
 if(path==='device/recover'&&req.method==='POST'){
  const body=await json(req);const secret=req.headers.get('X-Attempt-Secret')||'';
  if(!/^[a-f0-9-]{36}$/.test(body.deviceId)||!/^[a-f0-9-]{36}$/.test(secret))throw fail('Dispositiu no vàlid.');
  if(Number.isInteger(body.gameGeneration)){const [state]=await db('qeq_settings?select=game_generation');if(body.gameGeneration<state.game_generation)return reply({reset:true});}
  if(/^[a-f0-9-]{36}$/.test(body.attemptId||'')){
   const revoked=await db('qeq_revoked_attempts?id=eq.'+body.attemptId+'&select=device_id,secret_hash');
   if(revoked.length){if(revoked[0].device_id!==body.deviceId||!equal(revoked[0].secret_hash,await sha(secret)))throw fail('No autoritzat.',403);return reply({reset:true});}
  }
  const found=await db('qeq_attempts?device_id=eq.'+body.deviceId+'&select=data,secret_hash');
  if(!found.length)return reply({attempt:null});
  if(!equal(found[0].secret_hash,await sha(secret)))throw fail('No autoritzat.',403);
  return reply({attempt:found[0].data});
 }
 if(path.startsWith('attempts/')&&req.method==='PUT'){
  let body=await json(req);const id=path.slice('attempts/'.length),secret=req.headers.get('X-Attempt-Secret')||'';
  if(!/^[a-f0-9-]{36}$/.test(id)||id!==body.id||!/^[a-f0-9-]{36}$/.test(secret))throw fail('Partida no vàlida.');
  if(Number.isInteger(body.from)){
   const stored=await db('qeq_attempts?id=eq.'+id+'&select=data,secret_hash');
   if(!stored.length)return reply({error:'Cal reenviar la còpia completa.',needsSnapshot:true},409);
   if(!equal(stored[0].secret_hash,await sha(secret)))throw fail('No autoritzat.',403);
   const prev=stored[0].data;
   if(body.deviceId!==prev.deviceId||body.from<0||body.from>prev.answers.length||!Array.isArray(body.answers))throw fail('Actualització no vàlida.',409);
   for(let i=0;i<body.answers.length&&body.from+i<prev.answers.length;i++)if(body.answers[i].id!==prev.answers[body.from+i].id||body.answers[i].choice!==prev.answers[body.from+i].choice)throw fail('No es pot canviar una decisió desada.',409);
   const merged=prev.answers.slice();body.answers.forEach((a:any,i:number)=>merged[body.from+i]=a);
   body={...prev,answers:merged,acknowledged:body.acknowledged};
  }
  await ensureCatalog(body.catalogVersion);
  const result=await db('rpc/qeq_save_attempt','POST',{p_data:body,p_secret_hash:await sha(secret)});return reply(result);
 }
 throw fail('Ruta no disponible.',404);
 }catch(e){const message=e instanceof Error?e.message:'Error inesperat.';const status=(e as any).status||(message.includes('No autoritzat')?403:400);return reply({error:message,reset:['Partida eliminada per l’organització.','Partida d’un joc anterior.'].includes(message)},status);}
});
