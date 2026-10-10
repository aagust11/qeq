"""Servidor de festa en xarxa local. Python 3.10+, sense dependències."""
import argparse, hashlib, hmac, json, mimetypes, os, secrets, socket, sqlite3, threading, time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from scripts.build import build, ROOT

class Store:
    def __init__(self, path, catalog):
        self.path = str(path)
        self.lock = threading.RLock()
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, secret TEXT NOT NULL, data TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS catalogs (version TEXT PRIMARY KEY, data TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, data TEXT NOT NULL)')
            db.execute('INSERT OR IGNORE INTO settings VALUES (1, ?)', (json.dumps({'hideNames':False,'revealAnswers':False}),))
            db.execute('INSERT OR REPLACE INTO catalogs VALUES (?, ?)',(catalog['version'],json.dumps(catalog)))
    def connect(self):
        return sqlite3.connect(self.path, timeout=15)
    def settings(self):
        with self.connect() as db: return json.loads(db.execute('SELECT data FROM settings WHERE id=1').fetchone()[0])
    def all(self):
        with self.connect() as db: return [json.loads(r[0]) for r in db.execute('SELECT data FROM attempts')]
    def accept(self, ident, secret, data):
        if not isinstance(data,dict) or data.get('schema')!=2 or ident!=data.get('id') or len(ident)!=36 or not isinstance(secret,str) or len(secret)!=36:
            raise ValueError('Partida no vàlida.')
        for field,limit in [('firstName',80),('lastName',120)]:
            if not isinstance(data.get(field),str) or not data[field].strip() or len(data[field])>limit: raise ValueError('Nom o cognoms no vàlids.')
        with self.lock, self.connect() as db:
            cat=db.execute('SELECT data FROM catalogs WHERE version=?',(data.get('catalogVersion',''),)).fetchone()
            if not cat: raise ValueError('Aquest catàleg no és al servidor. Conserva la partida i avisa l’organització.')
            lookup={c['id']:c for c in json.loads(cat[0])['cards']}
            cards=data.get('cards'); answers=data.get('answers')
            if not isinstance(cards,list) or not cards or len(cards)!=len(lookup) or not isinstance(answers,list) or len(answers)>len(cards): raise ValueError('Nombre de fotos no vàlid.')
            ids=[c.get('id') for c in cards if isinstance(c,dict)]
            if len(ids)!=len(cards) or len(set(ids))!=len(ids) or set(ids)!=set(lookup): raise ValueError('Fotos no vàlides.')
            if any(not isinstance(a,dict) or a.get('id')!=ids[i] or a.get('choice') not in (('Èric i Aleix','Aleix i Èric') if lookup[ids[i]].get('kind')=='pair' else ('Èric','Aleix')) for i,a in enumerate(answers)): raise ValueError('Decisions no vàlides.')
            old=db.execute('SELECT secret,data FROM attempts WHERE id=?',(ident,)).fetchone()
            digest=hashlib.sha256(secret.encode()).hexdigest()
            if old:
                if not hmac.compare_digest(old[0],digest): raise PermissionError('No autoritzat.')
                previous=json.loads(old[1]); prev=previous['answers']
                if previous['catalogVersion']!=data['catalogVersion'] or [c['id'] for c in previous['cards']]!=ids or previous['firstName']!=data['firstName'].strip() or previous['lastName']!=data['lastName'].strip(): raise ValueError('La partida original no es pot modificar.')
                if len(answers)<len(prev): return
                if any(a['id']!=b['id'] or a['choice']!=b['choice'] for a,b in zip(prev,answers)): raise ValueError('Les decisions desades no es poden canviar.')
            # Les identitats i els punts provenen del catàleg, mai del client.
            clean={'schema':2,'id':ident,'firstName':data['firstName'].strip(),'lastName':data['lastName'].strip(),'catalogVersion':data['catalogVersion'],'cards':[lookup[i] for i in ids],'answers':[{'id':a['id'],'choice':a['choice']} for a in answers], 'startedAt':json.loads(old[1])['startedAt'] if old else time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'updatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'receivedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
            db.execute('INSERT OR REPLACE INTO attempts VALUES (?,?,?)',(ident,digest,json.dumps(clean)))

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # No escriure noms, contrasenyes ni fitxes de sessió al registre.
    def send_json(self, status, data):
        raw=json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    def body(self):
        size=int(self.headers.get('Content-Length','0'))
        if size<1 or size>2000000: raise ValueError('Mida de petició no vàlida.')
        return json.loads(self.rfile.read(size))
    def authorized(self):
        token=self.headers.get('Authorization','').removeprefix('Bearer ')
        return self.server.sessions.get(token,0)>time.time()
    def do_GET(self):
        path=urlparse(self.path).path
        if path=='/api/info':
            settings=self.server.store.settings();self.send_json(200,{'service':'qeq-local-v2','settings':{'revealAnswers':settings['revealAnswers']}})
        elif path=='/api/admin/state':
            if not self.authorized(): return self.send_json(401,{'error':'La sessió ha caducat. Torna a entrar.'})
            self.send_json(200,{'settings':self.server.store.settings(),'attempts':self.server.store.all()})
        elif path.startswith('/api/'):
            self.send_json(404,{'error':'Ruta no disponible.'})
        else: super().do_GET()
    def do_POST(self): self.mutate()
    def do_PUT(self): self.mutate()
    def mutate(self):
        origin=self.headers.get('Origin')
        if origin and urlparse(origin).netloc!=self.headers.get('Host'): return self.send_json(403,{'error':'Origen no autoritzat.'})
        path=urlparse(self.path).path
        try:
            if path=='/api/admin/login' and self.command=='POST':
                ip=self.client_address[0]; attempts=self.server.failures.get(ip,[]);attempts=[t for t in attempts if time.time()-t<60]
                if len(attempts)>=10:return self.send_json(429,{'error':'Massa intents. Espera un minut.'})
                data=self.body();provided=data.get('password','')
                if not isinstance(provided,str) or not hmac.compare_digest(provided.encode(),self.server.password.encode()):
                    self.server.failures[ip]=attempts+[time.time()];return self.send_json(401,{'error':'Contrasenya incorrecta.'})
                token=secrets.token_urlsafe(32);self.server.sessions[token]=time.time()+12*3600;return self.send_json(200,{'token':token})
            if path=='/api/admin/logout' and self.command=='POST':
                self.server.sessions.pop(self.headers.get('Authorization','').removeprefix('Bearer '),None);return self.send_json(200,{'ok':True})
            if path=='/api/admin/settings' and self.command=='PUT':
                if not self.authorized():return self.send_json(401,{'error':'La sessió ha caducat. Torna a entrar.'})
                d=self.body()
                if not isinstance(d.get('hideNames'),bool) or not isinstance(d.get('revealAnswers'),bool):raise ValueError('Configuració no vàlida.')
                with self.server.store.connect() as db:db.execute('UPDATE settings SET data=? WHERE id=1',(json.dumps({'hideNames':d['hideNames'],'revealAnswers':d['revealAnswers']}),))
                return self.send_json(200,{'ok':True})
            if path.startswith('/api/attempts/') and self.command=='PUT':
                self.server.store.accept(path.rsplit('/',1)[-1],self.headers.get('X-Attempt-Secret',''),self.body());return self.send_json(200,{'ok':True})
            self.send_json(404,{'error':'Ruta no disponible.'})
        except PermissionError as e:self.send_json(403,{'error':str(e)})
        except (ValueError,TypeError,KeyError) as e:self.send_json(400,{'error':str(e) if isinstance(e,ValueError) else 'Dades no vàlides.'})

def create_server(port, db_path, password, catalog):
    server=ThreadingHTTPServer(('0.0.0.0',port),partial(Handler,directory=str(ROOT/'dist')))
    server.store=Store(db_path,catalog);server.password=password;server.sessions={};server.failures={};return server

def main():
    parser=argparse.ArgumentParser(description='Servidor local de Qui és qui?');parser.add_argument('--port',type=int,default=8080);args=parser.parse_args()
    catalog=build();state=ROOT/'.local';state.mkdir(exist_ok=True);password=os.environ.get('QEQ_ADMIN_PASSWORD') or secrets.token_urlsafe(12)
    server=create_server(args.port,state/'partides.sqlite3',password,catalog)
    try:
        with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as s:s.connect(('192.0.2.1',80));ip=s.getsockname()[0]
    except OSError:ip=socket.gethostbyname(socket.gethostname())
    print(f'\nJoc per als mòbils: http://{ip}:{args.port}/\nAdministració: http://localhost:{args.port}/admin/\nContrasenya: {password}\n\nTots els dispositius han de compartir wifi. No cal Internet.\nMantén aquesta finestra oberta i l’ordinador encès. Ctrl+C per aturar.\n')
    try:server.serve_forever()
    except KeyboardInterrupt:server.server_close()
if __name__=='__main__':main()
