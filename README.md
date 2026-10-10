# Èric o Aleix · Qui és qui?

Interfície en català, nom i cognoms, botons i lliscament (Èric: esquerra/groc; Aleix: dreta/blau), animació amb segell, blocs de set fotos i revisió final. No es revela cap resposta individual fins que l’administració ho activa. El recompte inclou l’últim bloc encara que tingui menys de set fotos. Les decisions són definitives.

## Afegir les fotos

Puja les fotos a **`fotos/Èric/`** i **`fotos/Aleix/`** a `main`. JPG, JPEG, PNG o WEBP. Cada foto és una pregunta; hi ha d’aparèixer només el germà corresponent. Per a una foto de tots dos, puja dos retalls independents. GitHub Actions genera automàticament el catàleg i publica el joc. Les sis fotos originals es fan servir només per a la portada: no tenen identitats suposades. Fins que pugis fotos a les carpetes, no es pot començar el repte.

Els fitxers publicats tenen noms neutres. Això amaga la resposta en el nom de la foto, però **aquest joc de festa no és un examen antitrampes**: el catàleg del navegador conté les identitats per poder calcular els resultats sense connexió. Un usuari tècnic que inspeccioni el codi o el repositori públic pot descobrir-les. La interfície les oculta fins a l’ordre de l’administració.

## Opció A: festa en una mateixa wifi (recomanada per funcionar sense Internet)

1. Descarrega el repositori des de GitHub (Code → Download ZIP), descomprimeix-lo i instal·la Python 3.10 o superior si no el tens.
2. A Windows fes doble clic a **`Iniciar-festa.bat`**. En altres sistemes: `python3 serve.py`.
3. La consola mostra l’adreça local per als mòbils, la URL `/admin/` i una contrasenya aleatòria d’administració. Pots fixar-la amb la variable d’entorn `QEQ_ADMIN_PASSWORD`.
4. Tots els mòbils han d’obrir **l’adreça local de la consola**, no GitHub Pages, i estar a la mateixa wifi. El tallafoc ha de permetre Python en aquesta xarxa de confiança. Una wifi de convidats que aïlli els dispositius no servirà.
5. Obre `/admin/`, inicia sessió i deixa el servidor encès. Pots ocultar noms per projectar i activar les respostes per a tots els participants. S’actualitza cada 5 segons; els mòbils comproven els canvis cada 10 segons.

**No cal Internet**, però sí la wifi local i l’ordinador servidor encès. No cal Supabase. No exposis aquest servidor HTTP a Internet; està pensat per a una xarxa local de confiança. La contrasenya canvia quan reinicies, llevat que la fixis. La base de dades es manté.

Les puntuacions es recalculen al servidor a partir del catàleg, no es confia en els punts enviats pel client. Cada partida té un identificador i un secret aleatoris. El servidor bloqueja canvis en decisions ja rebudes. L’administració exigeix autenticació; no hi ha cap enllaç des de la portada. Amagar l’enllaç no és la protecció.

## Si es perd la connexió

Cada resposta es desa primer al navegador. Es reintenta l’enviament cada 10 segons, en recuperar la xarxa i en tornar a la pestanya. Repetir un enviament no duplica la partida. La base de dades `.local/partides.sqlite3` conserva totes les partides rebudes després de reiniciar el servidor. Conserva la carpeta `.local` com a còpia de seguretat i no la pugis a GitHub.

A GitHub Pages (HTTPS), el servei de memòria cau permet reobrir el joc sense connexió després de la primera càrrega i prepara les fotos abans de començar, si hi ha espai. A la wifi local (HTTP), mantén **la pàgina oberta**: sense connexió no es pot garantir reobrir-la, perquè els navegadors no permeten service workers en HTTP de xarxa local. Les respostes desades es recuperen en tornar a connectar-se. Si el navegador denega l’emmagatzematge, el joc ho avisa i no accepta noves decisions sense desar-les.

## Opció B: GitHub Pages, sense servidor

https://aagust11.github.io/qeq/

Permet jugar i desar el progrés al dispositiu. **No centralitza dades entre dispositius.** `/admin/` només mostra partides d’aquest mateix navegador i permet importar JSON descarregats pels jugadors. El control de revelar respostes en aquest mode només afecta el mateix navegador. No hi ha una contrasenya falsa en JavaScript: no existeixen dades remotes compartides en aquest mode.

Per fer servir l’enllaç públic amb marcador compartit real cal desplegar un backend HTTPS o integrar Supabase. No s’ha creat cap compte, servei de pagament ni base de dades externa. No canviïs d’origen o d’adreça a mitja festa: l’emmagatzematge del navegador està associat a l’adreça que ha obert cada jugador.

## Administració i privadesa

La revisió final mostra la decisió i, després d’activar les solucions, la identitat i els punts (+1 o 0). L’administració veu progrés, encerts, errors, última recepció i detall. Ocultar els noms només canvia la pantalla: no anonimitza l’exportació ni la base de dades. Els fitxers exportats contenen dades personals i s’han de conservar de manera privada.

Les partides en curs mantenen el seu catàleg i ordre de fotos quan s’actualitza el catàleg. El servidor conserva les versions de catàlegs que ha carregat. No eliminis `dist/photos` durant una festa: pot contenir fotos de partides iniciades abans d’una actualització.

## Desenvolupament

`python3 scripts/build.py` genera `dist/`. `python3 serve.py` genera el lloc i inicia el servidor. Proves: `node --test tests/core.test.mjs` i `python3 -m unittest discover -s tests -p 'test_*.py'`.
