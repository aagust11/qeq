import unittest, tempfile, threading, json
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from serve import Store, create_server

CAT={'version':'test','cards':[{'id':'x','src':'photos/'+('a'*24)+'.jpg','person':'Èric'},{'id':'y','src':'photos/'+('b'*24)+'.jpg','person':'Aleix'}]}
ID='11111111-1111-4111-8111-111111111111'
SECRET='22222222-2222-4222-8222-222222222222'
def attempt():
    return {'schema':2,'id':ID,'firstName':'Prova','lastName':'Local','catalogVersion':'test','cards':CAT['cards'],'answers':[]}
class ServerTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)/'scores.db';self.store=Store(self.path,CAT)
    def tearDown(self):self.temp.cleanup()
    def test_resume_deduplicate_and_persist(self):
        a=attempt();self.store.accept(ID,SECRET,a);a['answers']=[{'id':'x','choice':'Èric'}];self.store.accept(ID,SECRET,a);self.store.accept(ID,SECRET,a)
        restarted=Store(self.path,CAT);self.assertEqual(len(restarted.all()),1);self.assertEqual(len(restarted.all()[0]['answers']),1)
        self.store.accept(ID,SECRET,attempt());self.assertEqual(len(self.store.all()[0]['answers']),1)
    def test_identity_and_decisions_cannot_be_forged(self):
        a=attempt();a['cards']=[dict(c,person='Aleix') for c in CAT['cards']];a['answers']=[{'id':'x','choice':'Èric'}];self.store.accept(ID,SECRET,a)
        self.assertEqual(self.store.all()[0]['cards'][0]['person'],'Èric')
        with self.assertRaises(PermissionError):self.store.accept(ID,'x'*36,a)
        a['answers'][0]['choice']='Aleix'
        with self.assertRaises(ValueError):self.store.accept(ID,SECRET,a)
    def test_http_auth_reveal_and_private_names(self):
        server=create_server(0,self.path,'test-password',CAT);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();base='http://127.0.0.1:'+str(server.server_port)
        def request(path,data=None,method=None,headers=None):
            req=Request(base+path,data=None if data is None else json.dumps(data).encode(),method=method,headers={'Content-Type':'application/json',**(headers or {})})
            with urlopen(req) as r:return json.load(r)
        try:
            with self.assertRaises(HTTPError) as e:request('/api/admin/state')
            self.assertEqual(e.exception.code,401)
            request('/api/attempts/'+ID,attempt(),'PUT',{'X-Attempt-Secret':SECRET})
            info=request('/api/info');self.assertNotIn('attempts',info);self.assertFalse(info['settings']['revealAnswers'])
            token=request('/api/admin/login',{'password':'test-password'},'POST')['token'];auth={'Authorization':'Bearer '+token}
            state=request('/api/admin/state',headers=auth);self.assertEqual(state['attempts'][0]['firstName'],'Prova');self.assertNotIn('secret',state['attempts'][0])
            request('/api/admin/settings',{'hideNames':True,'revealAnswers':True},'PUT',auth);self.assertTrue(request('/api/info')['settings']['revealAnswers'])
            request('/api/admin/logout',{},'POST',auth)
            with self.assertRaises(HTTPError):request('/api/admin/state',headers=auth)
        finally:server.shutdown();server.server_close();thread.join()
if __name__=='__main__':unittest.main()
