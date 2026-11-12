// Catalan copy of the two solution pages. Source: copy-en.ts.
// Rules for translators: scripts/seo/solution-landings/TRANSLATING.md.
import type { LangCopy } from './types'

export const copy: LangCopy = {
  ui: {
    home: 'IFC Viewer Online',
    sources: 'Fonts',
    readOn: 'llegit el',
    preview: 'Vista prèvia',
    faqLabel: 'Preguntes freqüents',
    faqTitle: 'El que pregunten els compradors',
    related: 'Relacionat',
    pricing: 'Plans i preus',
    postReception: 'Revisar els models IFC dels subcontractistes',
    postClash: 'Detecció de col·lisions al navegador',
    postBatch: 'Validar molts fitxers IFC alhora',
  },
  pages: {
    contractors: {
      title: 'Recepció de models IFC per a constructores i promotores',
      desc: 'Els subcontractistes comproven el seu IFC amb els teus requisits de franc abans d\'enviar-lo; tu només revises el que passa. Pla Reception en vista prèvia.',
      nav: 'Per a constructores',
      kicker: 'Per a constructores i promotores · Pla Reception · Vista prèvia',
      h1: ['Rep només models IFC que ja compleixen', 'per a constructores i promotores que reben models dels seus subcontractistes'],
      lead: 'Publica els teus requisits en un sol enllaç. Cada subcontractista hi comprova el seu model de franc, al navegador, i el corregeix abans d\'enviar-lo. Tu veus qui ha lliurat, què compleix i per què es retorna la resta, amb un informe a punt per al client.',
      cta: 'Parla amb nosaltres',
      cta2: 'Com funciona la revisió',
      note: 'Vista prèvia: el pla Reception està dissenyat i es mostra aquí amb dades d\'exemple. Encara no està a la venda i no es desa res. Comprovar un model és gratuït i funciona avui.',
      hero: {
        alt: 'Resum de Reception d\'un projecte residencial amb dades d\'exemple: accions d\'avui, hores i euros estalviats estimats i proveïdors per fita',
        cap: 'L\'obra d\'un cop d\'ull, amb dades d\'exemple: què revisar avui, l\'estalvi estimat amb els seus supòsits i cada proveïdor per fita. Interfície en castellà.',
      },
      sections: [
        {
          kind: 'text', label: 'El problema', h2: 'Els models dolents els descobreix qui els rep',
          ps: [
            'Segons la ISO 19650-2, revisar i acceptar el model d\'informació és tasca de la part que designa: la constructora o promotora que el rep. La guia del UK BIM Framework descriu aquesta comprovació com a part del flux de l\'entorn comú de dades.',
            'Skanska UK afirma que els seus objectius depenen "critically" (de manera crítica) de rebre informació de qualitat de la seva cadena de subministrament. Els BIM managers de constructores descriuen dificultats considerables per moure la informació per la cadena amb correu i FTP.',
            'A la pràctica, un coordinador obre cada lliurament, troba les mateixes propietats que falten i els mateixos noms mal posats, redacta els motius a mà i espera la versió següent. El subcontractista només coneix les regles quan ja l\'han rebutjat.',
          ],
          sources: ['ukbimPartC', 'skanska', 'cmTier2'],
        },
        {
          kind: 'flow', label: 'Com funciona', h2: 'Dels teus requisits a l\'informe per al client',
          sub: 'Totes les captures són el disseny de Reception amb dades d\'exemple (projecte «Mirador del Turia», deu proveïdors). La interfície és en castellà.',
          steps: [
            { h: 'Publica els teus requisits com a enllaç', p: 'Regles, IDS i puntuació mínima per estat ISO 19650. Els subcontractistes reben la versió aprovada; un enllaç antic continua funcionant.', alt: 'Biblioteca de regles amb un canvi de versió, el seu efecte sobre el mateix model i un botó per crear l\'enllaç per als subcontractistes', cap: 'Què canvia entre versions de regles i l\'enllaç que va als subcontractistes.' },
            { h: 'Els subcontractistes comproven de franc abans d\'enviar', p: 'Sense compte. Veuen la puntuació, què falla, els elements afectats i la [guia de correcció](fix) de cada regla, de manera que la majoria d\'errors es corregeixen abans d\'arribar-te.', alt: 'Pàgina de proveïdor sense compte amb una puntuació de 84, un nom de fitxer incorrecte i la llista del que cal corregir', cap: 'La pàgina que veu un subcontractista: què compleix, què falla i com canviar el nom del fitxer.' },
            { h: 'Revisa una cua, no una safata d\'entrada', p: 'Els lliuraments arriben ja comprovats, amb el nom de fitxer llegit segons ISO 19650 i un abans i després respecte a la versió anterior. Les dreceres de teclat et porten per la cua.', alt: 'Diàleg de revisió amb quatre versions d\'un lliurament, el nom de fitxer ISO 19650 separat en camps i la puntuació de requisits', cap: 'Un lliurament: les seves versions, el nom de fitxer camp per camp i els requisits.' },
            { h: 'Retorna\'l amb motius amb què el proveïdor pugui actuar', p: 'Cada motiu apunta als elements en 3D i a com corregir-los. Tot queda registrat amb un hash encadenat i s\'exporta a CSV.', alt: 'Decisió de retornar un lliurament amb els motius fallits marcats i els elements llistats', cap: 'Retornar un model: els motius, els elements i una nota per al proveïdor.' },
            { h: 'Veu les col·lisions entre disciplines en el temps', p: 'Les col·lisions es calculen al navegador, ordenades per cost estimat, amb la tendència entre execucions.', alt: 'Panell de col·lisions amb la tendència entre execucions i les col·lisions ordenades per cost estimat', cap: 'Col·lisions amb la seva tendència i cost estimat (hotel federat d\'exemple).' },
            { h: 'Mantén informat el client sense redactar-ho', p: 'Una pàgina de projecte amb l\'última puntuació, els lliuraments acceptats, les col·lisions resoltes i la propera fita. A la vista prèvia l\'enviament és simulat.', alt: 'Pàgina de projecte per al client amb el Health Score del model, les col·lisions resoltes i la cronologia', cap: 'El que veu el client en obrir l\'enllaç d\'actualització.' },
            { h: 'Envia l\'informe setmanal a la direcció d\'obra', p: 'Rebut, aprovat, pendent i el temps estalviat estimat, redactat perquè el copiïs o el descarreguis.', alt: 'Informe setmanal de lliuraments per a la direcció d\'obra amb un resum per proveïdor', cap: 'L\'informe setmanal, generat a partir dels lliuraments.' },
          ],
        },
        {
          kind: 'table', label: 'Estalvi estimat', h2: 'Unes 22 hores al mes d\'un coordinador, segons els nostres supòsits',
          sub: 'Una estimació, no una mesura. Canvia les xifres per les teves: el resum de Reception et deixa editar cada supòsit.',
          head: ['Tasca', 'Supòsit', 'Part estalviada (suposada)', 'Minuts al mes'],
          rows: [
            ['Revisar lliuraments a mà', '40 lliuraments × 25 min', '80 %', '800'],
            ['Preparar la reunió de col·lisions', '4 reunions × 90 min', '70 %', '252'],
            ['Redactar l\'informe per al client', '8 informes × 45 min', '80 %', '288'],
            ['Total', '', '', '1.340 min ≈ 22 h'],
          ],
          after: [
            'A 45 € l\'hora són uns 1.000 € al mes. El pla Reception està previst des de 290 € per projecte al mes, així que amb aquests supòsits recupera unes tres vegades el seu cost. No es compten la feina refeta ni les penalitzacions evitades.',
          ],
        },
        {
          kind: 'table', label: 'Comparativa', h2: 'Al costat d\'un entorn comú de dades',
          sub: 'Cada columna d\'un fabricant diu només el que deia la seva pròpia pàgina el dia que la vam llegir. Si la pàgina no diu res, la cel·la ho indica.',
          head: ['', 'Catenda Hub', 'Dalux Box', 'Autodesk Construction Cloud', 'IFC Viewer Online Reception (vista prèvia)'],
          rows: [
            ['Preu publicat', 'Per projecte, segons el pressupost d\'obra: uns 400 € al mes per a un projecte de 10 M€, uns 1.100 € per a 50 M€; pressupost a petició', 'Cap a la pàgina del producte; formulari de contacte', 'Cap; pressupost per paquet, amb preus per usuari, projecte i compte', 'Previst: des de 290 € per projecte al mes amb 15 proveïdors, o 790 € il·limitat. Encara no està a la venda'],
            ['Els proveïdors necessiten llicència', 'No: "Your subs don\'t need a licence to log a defect" (els teus subcontractistes no necessiten llicència per registrar un defecte)', 'No consta a la pàgina', 'No consta a la pàgina', 'Sense compte: comproven de franc al navegador'],
            ['Comprovar models amb requisits', 'No consta a la pàgina de preus', 'Sí: validar dades i geometria del model amb els requisits del projecte', 'El paquet Model Management inclou condicionament de models, coordinació i detecció de col·lisions', 'Regles i IDS 1.0 amb una puntuació per lliurament. Comprovar és gratuït avui; la safata d\'entrada és en vista prèvia'],
            ['Aprovació dels models rebuts', 'No consta a la pàgina de preus', 'Fluxos d\'aprovació i una convenció de noms de fitxer obligatòria', 'No consta a la pàgina de preus', 'Acceptar o retornar amb motius i elements en 3D (vista prèvia)'],
          ],
          after: [
            'No substitueix el teu CDE. Va abans: facis servir el CDE que facis servir, el model arriba ja comprovat amb els teus requisits, i el proveïdor els coneixia abans d\'enviar-lo.',
          ],
          sources: ['catenda', 'dalux', 'acc'],
        },
        {
          kind: 'cols', label: 'Gratuït i vista prèvia', h2: 'Què funciona avui i què és vista prèvia',
          cols: [
            { h: 'Gratuït, disponible avui', items: ['Obrir i comprovar qualsevol IFC al navegador, sense pujar res', 'Els teus fitxers IDS 1.0 i 44 regles amb Health Score', 'Importar i exportar BCF, comparar versions', 'Les [guies de correcció](fix) de cada regla'] },
            { h: 'Pla Reception, en vista prèvia', items: ['Enllaç de requisits amb versions per estat ISO 19650', 'Cua de lliuraments amb acceptar o retornar i motius', 'Fitxa de proveïdor i registre amb hash encadenat', 'Pàgina per al client i informe setmanal'] },
          ],
        },
      ],
      faq: [
        ['Puc fer servir Reception avui?', 'Encara no. Està dissenyat i es mostra amb dades d\'exemple. Si reps models de subcontractistes, [parla amb nosaltres](pricing): busquem uns quants projectes pilot. Comprovar un model amb els teus requisits és gratuït i funciona avui al [visor](viewer).'],
        ['Els subcontractistes paguen o necessiten compte?', 'No. Obren el teu enllaç i comproven el seu model de franc al navegador. Paga qui rep i gestiona els lliuraments.'],
        ['Substitueix Catenda, Dalux o Autodesk Construction Cloud?', 'No. Comprova el model abans que arribi al teu CDE i funciona amb qualsevol CDE. Cada CDE té el seu propi flux; mira la comparativa de dalt amb la data en què vam llegir les seves pàgines.'],
        ['Es puja el model per comprovar-lo?', 'En la comprovació gratuïta, no: s\'executa al navegador del subcontractista. A Reception, el lliurament que acceptes es desa per a tu a la UE.'],
        ['Quant costarà?', 'Està previst des de 290 € per projecte al mes amb 15 proveïdors, o 790 € per a projectes il·limitats. Els preus poden canviar abans del llançament; consulta els [plans](pricing).'],
        ['D\'on surt la xifra d\'estalvi?', 'Dels supòsits de la taula de dalt: nombre de lliuraments, minuts per tasca i la part que estalvia cada tasca. Són supòsits, no mesures, i els pots canviar al resum.'],
      ],
      faqSources: ['catenda', 'dalux', 'acc'],
      bottom: ['Reps models de subcontractistes?', 'Explica\'ns quants projectes i proveïdors tens. Estem triant uns quants projectes pilot per a Reception.'],
    },
    engineering: {
      title: 'Coordinació BIM per a enginyeries i estudis — pla Team',
      desc: 'Lliura models que el client accepta a la primera: regles compartides, col·lisions, incidències amb correcció i control de publicació. Team en vista prèvia.',
      nav: 'Per a enginyeries',
      kicker: 'Per a enginyeries i estudis · Pla Team · Vista prèvia',
      h1: ['Lliura models que el client accepta a la primera', 'per a enginyeries i estudis que coordinen diverses disciplines'],
      lead: 'Un únic conjunt de regles d\'empresa, col·lisions al navegador, incidències amb la càmera i una correcció suggerida, i un control que impedeix publicar un model per sota de la teva puntuació mínima. El client veu l\'avenç sense que l\'hagis de redactar.',
      cta: 'Apunta\'m a la llista de Team',
      cta2: 'Detecció de col·lisions al navegador',
      note: 'Vista prèvia: el pla Team està dissenyat i es mostra aquí amb dades d\'exemple. Encara no està a la venda i no es desa res. Comprovar un model amb el teu IDS és gratuït i funciona avui.',
      hero: {
        alt: 'Panell de Team amb dades d\'exemple: Health Score per projecte i la seva tendència, incidències obertes per persona i terminis en risc',
        cap: 'El panell de l\'equip, amb dades d\'exemple: salut de cada projecte, càrrega per persona i terminis en risc. Interfície en castellà.',
      },
      sections: [
        {
          kind: 'text', label: 'El problema', h2: 'Els rebuigs venen de detalls que ningú no va comprovar',
          ps: [
            'Els clients ja envien els seus propis requisits d\'informació, sovint com a IDS. Un lliurament al qual li falta un nom de propietat o una classificació torna enrere, i corregir-lo costa més del que hauria costat comprovar-lo.',
            'Un consultor BIM descriu un problema de validació de dades IFC que va costar setmanes, causat per noms de propietat que no coincidien amb el que s\'exigia. La ISO 19650-2 fa de la comprovació abans de compartir un pas de l\'equip de lliurament, no del client.',
            'En un estudi les regles viuen al cap o al full de càlcul d\'una persona, les col·lisions es revisen en una reunió i les incidències acaben en fils de correu sense la vista que les explica.',
          ],
          sources: ['bimCorner', 'ukbimPartC'],
        },
        {
          kind: 'flow', label: 'Com funciona', h2: 'De les regles d\'empresa a un model publicat',
          sub: 'Totes les captures són el disseny de Team amb dades d\'exemple. La interfície és en castellà.',
          steps: [
            { h: 'Escriu les regles una vegada, com a frases', p: 'Classe, condició, requisit i gravetat, inclosa la geometria (espai lliure davant de portes, alçada lliure) i les relacions (porta en un mur). Cada regla és IDS 1.0.', alt: 'Editor de regles amb regles de geometria i de relació, resultats sobre el model d\'exemple i una incidència creada amb la seva correcció', cap: 'Regles de geometria i de relació comprovades en un model d\'exemple.' },
            { h: 'Gestiona-les com a empresa', p: 'Una biblioteca compartida amb versions, autor, revisió i aprovació (l\'autor no aprova la seva pròpia regla), comentaris i exportació a IDS.', alt: 'Biblioteca de regles d\'empresa amb una versió en revisió, els canvis de v2 a v3 i comentaris', cap: 'Un conjunt de regles en revisió: què ha canviat, qui l\'aprova i l\'historial.' },
            { h: 'Calcula col·lisions al navegador', p: 'Col·lisions dures i de folgança entre disciplines, agrupades, amb regles per ignorar el que s\'ha acceptat i un cost estimat per a cadascuna.', alt: 'Panell de col·lisions sobre el model d\'una torre amb regles d\'ignorar que amaguen col·lisions acceptades', cap: 'Regles d\'ignorar al model d\'una torre: 1.569 de 4.827 resultats amagats.' },
            { h: 'Converteix cada error en una incidència amb correcció', p: 'Assignada, amb termini, la càmera desada i una correcció suggerida per eina d\'autoria a partir de les nostres guies de correcció. Els convidats comenten de franc; BCF d\'entrada i sortida.', alt: 'Incidència amb una correcció suggerida per a diverses eines d\'autoria, responsable, termini i comentaris', cap: 'Una incidència amb la seva correcció suggerida, responsable i termini.' },
            { h: 'Atura un model fluix abans de publicar-lo', p: 'Res no arriba a Publicat per sota de la teva puntuació mínima, amb un revisor opcional i un historial del que ha passat i per què.', alt: 'Control de publicació amb una puntuació mínima de 80 i l\'historial de models publicats i retinguts', cap: 'El control de publicació i el seu historial.' },
            { h: 'Mantén informat el client', p: 'Actualitzacions per fase construïdes amb dades en directe: puntuació, lliuraments, incidències i fites. A la vista prèvia l\'enviament és simulat.', alt: 'Pantalla d\'actualització al client triant una fase, una plantilla i els destinataris', cap: 'Una actualització al client per fase del projecte.' },
          ],
        },
        {
          kind: 'table', label: 'Estalvi estimat', h2: 'Unes 17 hores al mes, segons els nostres supòsits',
          sub: 'Una estimació per a un equip de tres, no una mesura. Canvia les xifres per les teves.',
          head: ['Tasca', 'Supòsit', 'Part estalviada (suposada)', 'Minuts al mes'],
          rows: [
            ['Comprovar lliuraments abans d\'enviar-los', '12 lliuraments × 60 min', '60 %', '432'],
            ['Preparar la reunió de col·lisions', '4 reunions × 90 min', '70 %', '252'],
            ['Refer lliuraments retornats', '3 devolucions × 120 min', '50 %', '180'],
            ['Redactar actualitzacions al client', '8 actualitzacions × 30 min', '70 %', '168'],
            ['Total', '', '', '1.032 min ≈ 17 h'],
          ],
          after: [
            'A 45 € l\'hora són uns 775 € al mes. Team està previst a 59 € per editor al mes amb facturació anual, amb un mínim de tres editors (177 € al mes), així que amb aquests supòsits recupera unes quatre vegades el seu cost.',
          ],
        },
        {
          kind: 'table', label: 'Comparativa', h2: 'Al costat de les eines de coordinació habituals',
          sub: 'Cada columna d\'un fabricant diu només el que deia la seva pròpia pàgina el dia que la vam llegir.',
          head: ['', 'BIMcollab', 'Solibri', 'IFC Viewer Online Team (vista prèvia)'],
          rows: [
            ['Preu publicat', 'Basic 12,50 €, Advanced 18,75 €, Enterprise 25 € per usuari al mes amb facturació anual', 'Per llicència l\'any: Essential 1.428 €, Advanced 2.109 €, Premium 2.772 €', 'Previst: 59 € per editor al mes amb facturació anual, mínim tres editors. Encara no està a la venda'],
            ['Incidències', 'Gestió d\'incidències basada en BCF amb plug-ins per a eines BIM', 'Gestió d\'incidències BCF des d\'Essential', 'Incidències amb càmera, termini i correcció suggerida; BCF d\'entrada i sortida (vista prèvia)'],
            ['Regles', 'Regles de col·lisió i smart views compartides per fer servir a BIMcollab Zoom', 'Regles predefinides des d\'Essential; regles pròpies des d\'Advanced; govern de regles a Premium', 'Regles com a frases, IDS 1.0, biblioteca compartida amb aprovació (vista prèvia)'],
            ['Convidats', 'Un o dos comptes de convidat per usuari de pagament, segons el pla', 'No consta a la pàgina de preus', 'Els convidats comenten de franc'],
          ],
          after: [
            'Solibri és la millor opció per a una comprovació profunda per regles a l\'escriptori i BIMcollab per a un flux d\'incidències ampli entre eines. Team és per a estudis que volen regles, col·lisions, incidències i l\'actualització al client en un sol lloc, al navegador.',
          ],
          sources: ['bimcollab', 'solibri'],
        },
        {
          kind: 'cols', label: 'Gratuït i vista prèvia', h2: 'Què funciona avui i què és vista prèvia',
          cols: [
            { h: 'Gratuït, disponible avui', items: ['Obrir i federar diversos fitxers IFC al navegador', 'Comprovar cada model amb el teu IDS 1.0 i 44 regles', 'Importar i exportar BCF, comparar versions', 'Les [guies de correcció](fix) de cada regla'] },
            { h: 'Pla Team, en vista prèvia', items: ['Biblioteca de regles d\'empresa amb aprovació', 'Detecció de col·lisions entre disciplines', 'Incidències compartides amb correcció suggerida, control de publicació', 'Actualitzacions al client per fase'] },
          ],
        },
      ],
      faq: [
        ['Puc fer servir Team avui?', 'Encara no. Està dissenyat i es mostra amb dades d\'exemple. [Apunta\'t a la llista d\'espera](pricing) per saber quan obre. Comprovar un model amb el teu IDS és gratuït i funciona avui al [visor](viewer).'],
        ['La detecció de col·lisions és gratuïta?', 'No. La detecció de col·lisions entre disciplines és una eina nova i serà de pagament. Obrir, federar i comprovar cada model continua sent gratuït. Més a l\'article sobre [detecció de col·lisions al navegador](postClash).'],
        ['Podem fer servir l\'IDS del nostre client?', 'Sí, i aquesta part és gratuïta avui. A Team també pots importar un IDS a la biblioteca de l\'empresa i conservar-ne les versions.'],
        ['Substitueix BIMcollab o Solibri?', 'No per a tots els equips. Mira la comparativa de dalt, amb els preus de les seves pàgines i la data en què les vam llegir.'],
        ['Quant costarà?', 'Està previst a 59 € per editor al mes amb facturació anual, mínim tres editors; els convidats són gratuïts. Els preus poden canviar abans del llançament; consulta els [plans](pricing).'],
        ['Podem comprovar una carpeta sencera de models?', 'Això també forma part de la vista prèvia de pagament: llegeix com funciona la [validació per lots](postBatch).'],
      ],
      faqSources: ['bimcollab', 'solibri'],
      bottom: ['Coordines diverses disciplines?', 'Apunta\'t a la llista d\'espera de Team i explica\'ns quants editors teniu. T\'escriurem quan obri.'],
    },
  },
}
