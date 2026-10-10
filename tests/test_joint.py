import contextlib, io, json, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import scripts.build as builder
from serve import Store

class JointTest(unittest.TestCase):
    def test_catalog_prefixes_case_and_ignored_names(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            for name in ('index.html','style.css','app.js','core.js','storage.js','sync.js','sw.js','admin.js','cloud-config.js','analytics.js'):(root/name).touch()
            for name in ('admin','assets','fotos/Conjuntes'):(root/name).mkdir(parents=True,exist_ok=True)
            for name in ('ea_1.jpg','AE_2.PNG','vacances.jpg'):(root/'fotos/Conjuntes'/name).write_bytes(b'test-fixture')
            output=io.StringIO()
            with patch.object(builder,'ROOT',root),contextlib.redirect_stdout(output):catalog=builder.build()
            self.assertEqual(len(catalog['cards']),2)
            self.assertEqual({c['person'] for c in catalog['cards']},{'Èric i Aleix','Aleix i Èric'})
            self.assertTrue(all(c['kind']=='pair' for c in catalog['cards']))
            self.assertIn('vacances.jpg',output.getvalue())
            self.assertTrue(all('ea_' not in c['src'] and 'AE_' not in c['src'] for c in catalog['cards']))
    def test_server_accepts_order_but_not_single_name(self):
        with tempfile.TemporaryDirectory() as folder:
            catalog={'version':'joint','cards':[{'id':'pair','src':'photos/'+('a'*24)+'.jpg','person':'Aleix i Èric','kind':'pair'}]}
            store=Store(Path(folder)/'db',catalog)
            ident='1'*36;secret='2'*36
            a={'schema':2,'id':ident,'firstName':'Prova','lastName':'Conjunta','catalogVersion':'joint','cards':catalog['cards'],'answers':[{'id':'pair','choice':'Èric'}]}
            with self.assertRaises(ValueError):store.accept(ident,secret,a)
            a['answers'][0]['choice']='Aleix i Èric';store.accept(ident,secret,a)
            self.assertEqual(store.all()[0]['answers'][0]['choice'],'Aleix i Èric')
