"""Genera el catàleg i un lloc estàtic sense dependències."""
from pathlib import Path
import hashlib, json, shutil
ROOT = Path(__file__).resolve().parents[1]
def build():
    out = ROOT / 'dist'
    out.mkdir(exist_ok=True)
    photos = out / 'photos'
    photos.mkdir(exist_ok=True)
    cards = []
    for folder in ('Èric', 'Aleix', 'Conjuntes'):
        for source in sorted((ROOT / 'fotos' / folder).rglob('*')):
            if not source.is_file() or source.suffix.lower() not in ('.jpg','.jpeg','.png','.webp'): continue
            person = folder
            if folder == 'Conjuntes':
                prefix = source.name.casefold()[:2]
                if prefix not in ('ea', 'ae'):
                    print(f'AVÍS: foto conjunta ignorada (cal prefix ea o ae): {source.name}')
                    continue
                person = 'Èric i Aleix' if prefix == 'ea' else 'Aleix i Èric'
            raw = source.read_bytes()
            key = hashlib.sha256(person.encode()+b'\0'+str(source.relative_to(ROOT)).encode()+raw).hexdigest()[:24]
            target = key + source.suffix.lower()
            shutil.copyfile(source, photos / target)
            card = {'id':key,'src':'photos/'+target,'person':person}
            if folder == 'Conjuntes': card['kind'] = 'pair'
            cards.append(card)
    revision = hashlib.sha256(json.dumps(cards,sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:16]
    manifest = {'version':revision,'cards':cards}
    (out/'catalog.json').write_text(json.dumps(manifest,ensure_ascii=False),encoding='utf-8')
    for name in ('index.html','style.css','app.js','core.js','storage.js','sync.js','sw.js','admin.js','cloud-config.js','analytics.js','presentation.js','presentation.css','preload.js','photo-manager.js','photo-manager.css','photo-filters.js'):
        shutil.copyfile(ROOT/name,out/name)
    shutil.copytree(ROOT/'admin',out/'admin',dirs_exist_ok=True)
    shutil.copytree(ROOT/'assets',out/'assets',dirs_exist_ok=True)
    (out/'.nojekyll').touch()
    print(f'Catàleg preparat: {len(cards)} fotos. Versió {revision}.')
    return manifest
if __name__ == '__main__': build()
