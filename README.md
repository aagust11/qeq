# Èric o Aleix · Qui és qui?

Joc públic: https://aagust11.github.io/qeq/
Administració privada: https://aagust11.github.io/qeq/admin/

## Dades compartides a Supabase

L’aplicació HTTPS es connecta al projecte **Bessons** mitjançant l’Edge Function `qeq-api`. Les partides, decisions, puntuacions, estadístiques i configuració es desen a Postgres. Ja no cal tenir un ordinador servidor encès ni compartir wifi: cada mòbil fa servir la seva connexió a Internet.

L’administració requereix contrasenya. Es desa amb PBKDF2-SHA256, salt aleatòria i 600.000 iteracions; no es publica a GitHub. Les sessions caduquen al cap de 12 hores. Hi ha limitació d’intents d’entrada. La contrasenya es pot canviar dins d’administració; això revoca les altres sessions. Les taules i funcions de dades només són accessibles per l’Edge Function, amb RLS habilitada i permisos públics revocats. L’absència de polítiques RLS per a anon/authenticated és deliberada: aquests rols no han d’accedir directament a cap fila. La clau service_role només existeix al servidor.

## Una partida per dispositiu i recuperació

El navegador crea identificadors aleatoris ocults per al dispositiu i la partida, amb un secret. La base de dades imposa una única partida per identificador de dispositiu. La portada reprèn aquesta partida o mostra el resultat si ja s’ha acabat; no ofereix tornar a jugar. Les pestanyes comparteixen estat i, quan el navegador ho permet, s’utilitza Web Locks per evitar decisions simultànies.

Cada resposta es desa localment abans d’avançar. En recuperar la connexió s’envien només les respostes pendents; els reenviaments són idempotents i el servidor no permet canviar decisions rebudes. Si el mòbil es tanca, es reprèn des del punt desat. També es pot recuperar la còpia del servidor amb les credencials ocultes del dispositiu. Les fotos es preparen en memòria cau abans de començar; el mode sense connexió exigeix haver descarregat les fotos i la pàgina. Si el navegador denega o elimina l’emmagatzematge, aquesta garantia queda limitada.

**Límit real:** és una restricció per perfil de navegador, no una identificació física infal·lible. Es pot eludir esborrant les dades, amb mode privat o amb un altre navegador/dispositiu. No s’utilitza fingerprinting, IP com a identitat ni cap dada oculta del maquinari. Per impedir també aquests casos caldrien invitacions individuals o comptes.

La còpia local continua funcionant durant un tall; l’administració només pot veure el progrés que ja ha arribat al servidor. El joc torna a comprovar la connexió periòdicament i en recuperar la xarxa. No cal reenviar fotos, el catàleg ni tota la partida a cada resposta. L’administració comprova revisions i no torna a descarregar les dades si no han canviat.

## Administració

- Configuració compartida: ocultar noms i revelar solucions.
- Rànquing de partides acabades per encerts, amb menor temps actiu com a desempat. Els empats exactes comparteixen posició. Noms ocults per defecte; clic per descobrir-los individualment.
- Progrés de totes les partides i detall de decisions.
- Fotos amb més encerts i més errors, inclosos tots els empats. És una comparació per quantitat; el percentatge permet comparar exposicions diferents.
- Resum per foto: respostes, encerts, errors i percentatge. Sense respostes, el percentatge és «—».
- Les fotos conjuntes compten com una pregunta i un punt.
- Exportació privada en JSON. Ocultar noms a la pantalla no anonimitza el fitxer exportat.

## Incorporar fotos

Puja a `main` JPG, JPEG, PNG o WEBP a:

- `fotos/Èric/`: Èric sol.
- `fotos/Aleix/`: Aleix sol.
- `fotos/Conjuntes/`: noms que comencin per `ea` (Èric i Aleix) o `ae` (Aleix i Èric), sempre **d’esquerra a dreta**. Majúscules i minúscules acceptades.

GitHub Actions genera el catàleg i publica el joc. Una foto conjunta sense prefix vàlid s’ignora amb un avís. La base de dades registra els catàlegs nous des de la publicació oficial, mai des de les identitats enviades pel jugador. Es conserven els catàlegs anteriors ja registrats per puntuar les partides en curs. Si elimines una foto del repositori, els resultats històrics es conserven, però la seva miniatura pot deixar d’estar disponible a GitHub Pages.

No és un examen antitrampes: per puntuar sense connexió, el catàleg del navegador conté la solució, i les carpetes del repositori són públiques. La interfície només revela cada solució quan l’administració ho activa. El servidor recalcula els punts a partir del seu catàleg i ignora puntuacions o identitats manipulades pel client.

## Desenvolupament i servidor local opcional

`python3 scripts/build.py` genera `dist/`.
`node --test tests/*.mjs` i `python3 -m unittest discover -s tests -p 'test_*.py'` executen les proves.

`supabase/schema.sql` és la còpia reproduïble de l’esquema inicial complet; no s’ha d’executar de nou sobre una base ja inicialitzada. Les migracions aplicades consten a Supabase. `supabase/functions/qeq-api/index.ts` conté el servidor i `cloud-config.js` només l’adreça pública. Cap clau privilegiada ni contrasenya es desa al repositori.

El servidor Python anterior continua disponible amb `Iniciar-festa.bat` o `python3 serve.py`. En HTTP local fa servir SQLite, no Supabase. És un mode separat: els jugadors de GitHub Pages utilitzen Supabase. No canviïs d’adreça a mitja partida. Per a la festa amb dades compartides, fes servir l’enllaç HTTPS de GitHub Pages.

## Presentació dels resultats

A administració, «Presentar els resultats» obre una pestanya privada amb l’estil de la caràtula, guanyadors i fotos amb més encerts/errors (tots els empats). S’actualitza cada 5 segons, té pantalla completa i permet mostrar/ocultar els noms sense modificar la configuració general. No porta cap credencial a la URL. Requereix una sessió d’administració vàlida.

Guanya qui té més encerts entre les partides acabades. En cas d’empat, guanya qui té menys mil·lisegons de temps actiu; si també empaten, comparteixen victòria. El temps compta amb el joc visible (incloses les pauses de resultats de bloc), s’atura en sortir a la portada, ocultar/tancar la pestanya o acabar, i exclou la preparació inicial de fotos. Es desa localment cada segon i amb cada resposta; un tancament brusc pot perdre fins a aproximadament un segon de temps, però no les decisions desades. Es recupera amb la partida i s’envia amb les respostes, sense trànsit addicional per segon. El servidor conserva el primer temps rebut de cada resposta i comprova que sigui creixent. No és un cronòmetre antitrampes: depèn del navegador del jugador.

Les partides anteriors no tenen temps registrat. Si una afecta un empat al primer lloc, la presentació mostra l’empat pendent de desempat, sense atribuir-li un temps inventat. `supabase/results-timing.sql` recull el canvi d’esquema ja aplicat (no executar-lo dues vegades).
