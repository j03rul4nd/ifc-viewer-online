import type { LangCopy } from './types'

// Catalan copy for the six landing families. Translated from copy-en.ts; see
// TRANSLATING.md. Vendor quotes stay in English inside «…».

export const copy: LangCopy = {
  ui: {
    home: 'IFC Viewer Online',
    sources: 'Fonts',
    readOn: 'consultat el',
    faqLabel: 'Preguntes freqüents',
    faqTitle: 'Preguntes',
    related: 'Pàgines relacionades',
    fix: 'Corregir errors d’IFC',
    blogSolibri: 'Solibri o un validador al navegador: la comparació llarga',
    pricing: 'Preus',
    embedCta: 'Executa la validació en un IFC d’exemple',
    embedSub: 'Carrega el validador en aquesta pàgina. No es puja res.',
  },
  pages: {
    // ─────────────────────────────────────────────────────────────────────────
    validator: {
      title: 'Validació IFC en Línia — Validador IFC Gratuït, 44 Regles',
      desc: 'Comprova un fitxer IFC al navegador: 44 regles, IDS 1.0 i un Health Score de 0 a 100. El fitxer no es puja. Gratis, sense compte. IFC2x3, IFC4, IFC4x3.',
      nav: 'Validador IFC',
      kicker: '44 regles · IDS 1.0 · El fitxer es queda al teu navegador · Gratis',
      h1: ['Validació IFC en línia', 'Què falla al fitxer, i on'],
      lead: 'Deixa anar un fitxer IFC i obtens un Health Score de 0 a 100, la llista de problemes agrupats per regla i els elements que fallen ressaltats al model 3D. El fitxer es llegeix a la pestanya del teu navegador i no es puja.',
      cta: 'Valida un fitxer IFC',
      cta2: 'o obre el model d’exemple',
      note: 'Sense compte. IFC2x3, IFC4, IFC4x1 i IFC4x3, fins a 2 GB per fitxer.',
      shots: [
        { alt: 'Validació IFC d’una casa de dues plantes al navegador: Health Score 77, un error i 161 avisos, les tres correccions que recuperen més punts, i la vista 3D recorrent els 119 elements sense tipus', cap: 'El model públic d’exemple Duplex (2,3 MB, 7.181 entitats) treu un 77. «Show in 3D» a la primera correcció enquadra els 119 elements sense tipus, amb un comptador per recórrer-los d’un en un.' },
        { alt: 'Llista d’incidències de la validació IFC agrupades per regla, amb el nombre d’elements que incompleixen cada regla i l’explicació de com corregir-la', cap: 'Cada regla es desplega amb els seus elements i amb els passos per corregir-la a Revit, Archicad o Tekla.' },
      ],
      sections: [
        {
          kind: 'cols', label: 'Abast', h2: 'Què cobreix la comprovació, i què no',
          sub: 'Hi ha 44 regles en vuit grups. 25 s’executen per defecte; les altres 19 s’activen des d’un perfil perquè demanen una decisió teva (un nivell LOD, un patró de nomenclatura, un sistema de classificació).',
          cols: [
            { h: 'Comprova', items: [
              'Identificadors: GlobalId duplicats i GlobalId que no són GUID IFC vàlids de 22 caràcters.',
              'Estructura: un sol IfcProject, la cadena Projecte → Emplaçament → Edifici → Planta, elements sense planta, agregacions trencades o circulars, obertures sense element amfitrió.',
              'Plantes: cotes d’elevació que falten, duplicades o desordenades.',
              'Dades: noms buits, noms duplicats, valors de propietat buits, elements sense tipus o sense material, espais sense superfície.',
              'Qualitat de l’exportació: més d’un 5 % d’elements com a IfcBuildingElementProxy, un model a més de 10 km de l’origen, més de 500 KB per element, unitats de longitud imperials.',
              'Si ho demanes: conjunts de propietats obligatoris per classe, patrons de nomenclatura, classificació, propietats i quantitats de LOD 100–400, camps de projecte i d’autor d’ISO 19650, sistemes MEP.',
              'Els teus propis requisits: un fitxer IDS 1.0, un dels cinc perfils integrats (lliurament bàsic, revisió de qualitat, coordinació BIM, ISO 19650, LOD 300) o un perfil que defineixis tu.',
            ] },
            { h: 'No comprova', items: [
              'Col·lisions entre dos models. Les regles de col·lisió comparen caixes contenidores dins d’un sol model, amb un solapament de 5 cm, fins a 800 elements i 100 resultats. Són un primer filtre, no coordinació.',
              'Normativa d’edificació: accessibilitat, seguretat en cas d’incendi, recorreguts d’evacuació o alçades lliures. Aquí cap regla llegeix una normativa.',
              'Tot l’esquema IFC. No és una prova de conformitat EXPRESS: executa aquestes 44 regles i el teu IDS.',
              'Codis d’ISO 19650. La regla del nom de fitxer llegeix el nom escrit a la capçalera de l’IFC i en compta els camps; no verifica cada codi.',
              'Fitxers natius. Llegeix IFC, no fitxers de Revit ni d’Archicad.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Límits', h2: 'Límits, amb xifres',
          head: ['', 'Límit'],
          rows: [
            ['Mida del fitxer', 'Un fitxer de 2 GB es rebutja. Apareix un avís a partir de 200 MB i una advertència de memòria a partir d’1 GB. En mòbils, tauletes i ordinadors amb 4 GB de memòria o menys, l’advertència comença als 80 MB.'],
            ['Formats', 'IFC2x3, IFC4, IFC4x1 i IFC4x3, com a .ifc o dins d’un .ifczip o un .zip.'],
            ['Regles', '44 en total, 25 activades per defecte. La severitat i els llindars es poden canviar regla per regla.'],
            ['IDS', 'IDS 1.0 amb les seves sis facetes. Les restriccions totalDigits, fractionDigits i whiteSpace no es llegeixen. Es llisten fins a 200 elements que fallen per especificació.'],
            ['Correccions automàtiques', 'GlobalId no vàlids i duplicats, i noms buits o duplicats. La resta l’edites a mà o la corregeixes al programa de modelatge.'],
            ['Velocitat', 'El model d’exemple de la imatge (2,3 MB, 7.181 entitats) es va validar en uns 20 segons a l’ordinador amb què es van fer aquestes captures. El temps creix amb el nombre d’entitats.'],
            ['Connexió', 'La pàgina s’ha de carregar des d’internet. No funciona sense connexió.'],
          ],
        },
        {
          kind: 'text', label: 'El teu fitxer', h2: 'Què passa amb el fitxer',
          ps: [
            'L’IFC l’obre codi que s’executa a la pestanya del teu navegador. No s’envia ni a nosaltres ni a ningú més, de manera que no cal esperar cap pujada ni hi ha res a esborrar després.',
            'Per reobrir un model més de pressa, el navegador desa una còpia convertida de la geometria al seu emmagatzematge privat, al teu ordinador (fins a 4 GB; el més antic és el primer que s’elimina). Si esborres les dades del lloc al navegador, desapareix.',
            'Hi ha dues coses que sí que surten del navegador, i totes dues les controles tu. Les estadístiques d’ús sense galetes registren que s’ha obert un fitxer, la mida i el nombre d’elements, mai el contingut; es poden desactivar i respecten Do Not Track. I si prems Comparteix, l’enllaç mateix porta la puntuació, el nom del fitxer i les 50 primeres incidències amb els noms dels seus elements, de manera que qualsevol que tingui l’enllaç les pot llegir.',
          ],
        },
        { kind: 'shot', label: 'El resultat', h2: 'De la puntuació a l’element', sub: 'Prova-ho aquí amb el model d’exemple i després obre el teu fitxer.' },
        {
          kind: 'steps', label: 'Com va', h2: 'Del fitxer a un IFC corregit',
          steps: [
            ['Obre el fitxer', 'Arrossega el .ifc a la pàgina. Es poden tenir diversos fitxers oberts alhora; cadascun es valida per separat.'],
            ['Llegeix el veredicte', 'La puntuació, els errors i els avisos, i les tres correccions que recuperen més punts. Amb un clic es ressalten els elements que fallen.'],
            ['Corregeix el que es pot corregir aquí', 'Regenera els GlobalId no vàlids, canvia noms en bloc, edita noms i valors de propietat. Cada edició es pot desfer.'],
            ['Exporta', 'L’IFC corregit, que l’analitzador torna a escriure, i els resultats com a BCF 2.1, CSV, JSON, un informe de lliurament en HTML o un full de càlcul COBie.'],
          ],
        },
        {
          kind: 'text', label: 'Preu', h2: 'Què costa',
          ps: [
            'Res. El visor, les 44 regles, l’IDS, les correccions i totes les exportacions d’aquesta pàgina són gratuïts, sense compte, també per a feina comercial. El codi font és públic sota llicència MIT a [GitHub](github).',
            'Els plans de pagament (Pro a 19 € al mes, Team a 35 € per editor al mes) són per a coses que necessiten un servidor, com ara emmagatzemar models i desar conjunts de regles. Encara no estan a la venda; la [pàgina de preus](pricing) diu què inclourà cadascun.',
          ],
        },
      ],
      faq: [
        ['El fitxer IFC es puja a un servidor?', 'No. El fitxer el llegeix codi que s’executa a la pestanya del teu navegador. Del navegador només en surten estadístiques d’ús anònimes (mida del fitxer i nombre d’elements, mai el contingut) i els enllaços per compartir que creïs tu.'],
        ['Quines versions d’IFC llegeix?', 'IFC2x3, IFC4, IFC4x1 i IFC4x3, com a fitxers .ifc o dins d’arxius .ifczip i .zip. Els fitxers de 2 GB o més es rebutgen.'],
        ['Substitueix una eina de detecció de col·lisions?', 'No. Les regles de col·lisió comparen caixes contenidores dins d’un sol model i estan desactivades per defecte. Troben solapaments evidents abans que enviïs un model; la coordinació entre disciplines necessita una eina de col·lisions.'],
        ['Puc comprovar un model contra els meus propis requisits?', 'Sí. Carrega un fitxer IDS 1.0, o parteix d’un dels set conjunts de requisits ja preparats (lliurament ISO 19650, LOD 200 i LOD 400, traspàs COBie i d’altres). També pots muntar un perfil de validació amb els teus patrons de nomenclatura i els teus conjunts de propietats obligatoris.'],
        ['Puc corregir els errors i tornar a exportar l’IFC?', 'Els GlobalId i els noms es poden corregir automàticament; els noms, les descripcions i els valors de propietat es poden editar a mà, amb l’opció de desfer. L’exportació torna a escriure l’IFC amb aquests canvis. La geometria i les relacions no es poden editar.'],
        ['Funciona sense connexió a internet?', 'No. La pàgina s’ha de carregar des d’internet. Per a xarxes sense accés a internet hi ha una [instal·lació on-premise](onprem).'],
      ],
      bottom: ['Comprova un fitxer ara', 'Gratis, sense compte, i el fitxer es queda al teu navegador.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    cloud: {
      title: 'Validador IFC al Núvol — Valida en línia sense pujar res',
      desc: 'Comprovació d’IFC des d’una pàgina web sense pujar el model: 44 regles, IDS 1.0 i un Health Score calculat al navegador. Gratis, sense compte, fins a 2 GB.',
      nav: 'Validador IFC al núvol',
      kicker: 'En línia · Sense pujada · 44 regles · IDS 1.0 · Gratis',
      h1: ['Validador IFC al núvol', 'sense la pujada'],
      lead: 'Una eina de comprovació d’IFC al núvol normalment vol dir enviar el model al servidor d’algú altre. Aquesta és una pàgina web que fa la feina al teu propi navegador: la mateixa comoditat, i el fitxer no surt mai del teu ordinador.',
      cta: 'Valida un fitxer IFC',
      cta2: 'o obre el model d’exemple',
      note: 'Sense compte. Funciona a Chrome, Edge, Firefox i Safari. Fins a 2 GB per fitxer.',
      shots: [
        { alt: 'Comprovació IDS d’un model IFC al navegador: l’especificació «Walls declare a FireRating in Pset_WallCommon» falla per als 57 murs d’una casa de dues plantes mostrada en 3D', cap: 'Un IDS 1.0 d’exemple comprovat contra el model: cap dels 57 murs declara una resistència al foc. Tant el model com l’IDS es llegeixen a la pestanya del navegador.' },
        { alt: 'Diàleg d’exportació d’una validació IFC amb els formats JSON, CSV, certificat, BCF, informe de lliurament i COBie', cap: 'Els resultats surten com a fitxers que et descarregues: BCF 2.1, CSV, JSON, un informe de lliurament en HTML o un full de càlcul COBie.' },
      ],
      sections: [
        {
          kind: 'table', label: 'Pujada o navegador', h2: 'Un servei de comprovació que puja el model, i una pàgina que no',
          sub: 'Solibri WebChecker és l’exemple publicat més clar d’un servei de comprovació al núvol, i per això és la comparació que fem aquí. La seva columna cita la pàgina de Solibri mateix.',
          head: ['', 'Solibri WebChecker (Beta)', 'IFC Viewer Online'],
          rows: [
            ['On va el model', 'Es puja al servei. Les dades es desen a la UE o als EUA, cosa que es tria quan es configura el projecte', 'Enlloc. Es llegeix a la pestanya del teu navegador'],
            ['Quant de temps es conserven els resultats', '30 dies, i després s’eliminen', 'Fins que tanques la pestanya. Et quedes el que exportes'],
            ['Mida del fitxer', 'Fins a 5 GB per fitxer IFC', 'Menys de 2 GB per fitxer, i menys en un ordinador amb poca memòria'],
            ['Compte', 'Un Solibri ID i un pla Solibri Advanced o Premium', 'Cap'],
            ['Cost d’una comprovació', '50 tokens. Advanced inclou 1.750 tokens l’any, Premium 17.500; un paquet de 5.000 tokens costa 250 €', 'Gratis'],
            ['Comprovacions', 'La comprovació Model Health de Solibri, o un conjunt de regles propi (.cset) preparat a l’aplicació d’escriptori de Solibri', '44 regles fixes i els teus fitxers IDS 1.0'],
            ['Resultats', 'PDF i BCF; fitxers SMC amb Premium', 'BCF 2.1, CSV, JSON, informe HTML, full de càlcul COBie. Sense fitxer PDF: l’informe HTML s’imprimeix des del navegador'],
          ],
          after: [
            'Un servidor es guanya el lloc quan els fitxers són més grans del que un navegador pot aguantar, quan els resultats han d’estar disponibles per a tot l’equip d’un projecte, o quan les comprovacions s’han d’executar sense ningú al davant. Aquí no passa res d’això: aquesta pàgina comprova el fitxer d’una persona a l’ordinador d’aquesta persona.',
            'El navegador guanya quan el model no pot sortir de l’edifici, quan ningú aprovarà un proveïdor nou aquesta setmana, o quan només necessites una resposta sobre un fitxer.',
          ],
          sources: ['solibriWebchecker', 'solibriPricing'],
        },
        {
          kind: 'cols', label: 'Abast', h2: 'Què comprova, i què no',
          cols: [
            { h: 'Comprova', items: [
              '44 regles en vuit grups: identificadors, estructura espacial, plantes, noms, valors de propietat, tipus, materials, qualitat de l’exportació. 25 s’executen per defecte.',
              'Fitxers IDS 1.0, amb les sis facetes: entitat, atribut, propietat, classificació, material i part-de.',
              'Cinc perfils de validació integrats (lliurament bàsic, revisió de qualitat, coordinació BIM, ISO 19650, LOD 300), o el teu.',
            ] },
            { h: 'No comprova', items: [
              'Col·lisions entre models. Només caixes contenidores dins d’un sol model, desactivat per defecte.',
              'Normativa d’edificació ni regles de disseny escrites per al teu projecte. No hi ha editor de regles; els requisits entren com a IDS.',
              'Lots. Cada fitxer l’obre una persona; res s’executa de manera programada.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Límits', h2: 'Límits, amb xifres',
          head: ['', 'Límit'],
          rows: [
            ['Mida del fitxer', 'Un fitxer de 2 GB es rebutja. Apareix un avís a partir de 200 MB i una advertència de memòria a partir d’1 GB; en mòbils, tauletes i ordinadors amb 4 GB de memòria o menys comença als 80 MB.'],
            ['Formats', 'IFC2x3, IFC4, IFC4x1 i IFC4x3, com a .ifc o dins d’un .ifczip o un .zip.'],
            ['IDS', 'IDS 1.0. Les restriccions totalDigits, fractionDigits i whiteSpace no es llegeixen. Es llisten fins a 200 elements que fallen per especificació.'],
            ['Compartir', 'Un enllaç per compartir porta la puntuació i les 50 primeres incidències dins de l’URL, fins a 8.000 caràcters. El model no hi és.'],
            ['Connexió', 'La pàgina s’ha de carregar des d’internet. No funciona sense connexió.'],
          ],
        },
        {
          kind: 'text', label: 'El teu fitxer', h2: 'Què passa amb el fitxer',
          ps: [
            'L’IFC l’obre codi que s’executa a la pestanya del teu navegador i no s’envia enlloc. Ho pots comprovar tu mateix: obre les eines per a desenvolupadors del navegador, mira la pestanya Xarxa i deixa-hi anar un fitxer.',
            'El navegador desa una còpia convertida de la geometria al seu emmagatzematge privat, al teu ordinador (fins a 4 GB), per reobrir el model més de pressa. Si esborres les dades del lloc, desapareix.',
            'Les estadístiques d’ús sense galetes registren la mida del fitxer i el nombre d’elements, mai el contingut, i es poden desactivar. Un enllaç per compartir, si en crees un, conté la puntuació, el nom del fitxer i fins a 50 incidències amb noms d’elements.',
          ],
        },
        { kind: 'shot', label: 'El resultat', h2: 'Prova-ho amb un model d’exemple', sub: 'La demo de sota s’executa en aquesta pàgina. Després obre el teu fitxer.' },
        {
          kind: 'text', label: 'Preu', h2: 'Què costa',
          ps: [
            'Res: el visor, les regles, l’IDS i les exportacions són gratuïts i no demanen compte. El codi és públic sota llicència MIT a [GitHub](github).',
            'Els plans de pagament que hi afegeixen un servidor (models emmagatzemats, conjunts de regles desats, treball en equip) es descriuen a la [pàgina de preus](pricing) i encara no estan a la venda.',
          ],
        },
      ],
      faq: [
        ['Això és un servei al núvol?', 'Arriba des del web com si ho fos, però la comprovació la fa el teu navegador. No hi ha pujada, ni cua, ni cap còpia del model desada per part nostra.'],
        ['Com puc verificar que no es puja res?', 'Obre les eines per a desenvolupadors del navegador, ves a la pestanya Xarxa i deixa-hi anar un fitxer IFC. Veuràs com es carreguen els fitxers de la pàgina mateixa i cap petició que porti el model.'],
        ['Fins a quina mida de fitxer admet?', 'Els fitxers de 2 GB o més es rebutgen, i el límit pràctic depèn de la memòria de l’ordinador: apareix una advertència a partir d’1 GB, o a partir de 80 MB en mòbils i màquines amb 4 GB de memòria o menys. Solibri WebChecker accepta fins a 5 GB per fitxer (solibri.com/solutions/webchecker, consultat el 2026-11-10).'],
        ['Ho puc automatitzar?', 'Des d’aquesta pàgina, no: cada fitxer l’obre una persona. Hi ha un servidor MCP (ifc-viewer-mcp) que executa la mateixa validació a la teva màquina des d’un assistent o un script; mira el [codi font a GitHub](github).'],
        ['Es pot fer servir amb models confidencials?', 'El model es queda al teu ordinador, que és el que acostuma a demanar un NDA. Comprova dues coses amb la teva pròpia política: les estadístiques d’ús anònimes (es poden desactivar) i els enllaços per compartir (contenen noms de fitxer i d’elements).'],
      ],
      faqSources: ['solibriWebchecker'],
      bottom: ['Comprova un fitxer sense pujar-lo', 'Gratis, sense compte. El model es queda al teu ordinador.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    onprem: {
      title: 'Validador IFC On-Premise — Validació BIM sense Internet',
      desc: 'El visor IFC, el validador de 44 regles i les comprovacions IDS servits a la teva xarxa, sense internet. Imatge de contenidor, instal·lació, formació i suport.',
      nav: 'Validació IFC on-premise',
      kicker: 'On-premise · Sense connexió a internet · El teu servidor',
      h1: ['Validador IFC on-premise', 'per a xarxes que es mantenen tancades'],
      lead: 'L’aplicació pública ja llegeix els fitxers IFC dins del navegador, però la pàgina mateixa es carrega des d’internet. On això no es permet, el mateix visor, el mateix validador i les mateixes comprovacions IDS se serveixen des d’un contenidor al teu propi servidor.',
      cta: 'Demana un pilot',
      cta2: '',
      note: 'Una seu, abast tancat: instal·lació, configuració amb els teus requisits, una sessió de formació i un període de suport.',
      shots: [
        { alt: 'Validador IFC amb la llista de perfils de validació integrats oberta: lliurament bàsic, revisió de qualitat, coordinació BIM, compliment d’ISO 19650 i disseny LOD 300', cap: 'Els perfils integrats. Durant el pilot, els teus perfils i fitxers IDS es carreguen i es proven amb els teus models.' },
        { alt: 'Resultat d’una comprovació IDS al validador IFC: una especificació fallada, 0 de 57 murs amb la propietat FireRating, amb botons per ressaltar, aïllar i exportar', cap: 'Un model comprovat contra un fitxer IDS: els 57 murs incompleixen el requisit de resistència al foc. En on-premise, el model i els requisits es queden a la teva xarxa.' },
      ],
      sections: [
        {
          kind: 'cols', label: 'Per a qui és', h2: 'Quan «no es puja res» no és suficient',
          cols: [
            { h: 'Encaixa quan', items: [
              'Les estacions de treball no tenen accés a internet, o no en poden carregar programari.',
              'Necessites una única versió auditada que no canviï fins que tu ho decideixis.',
              'Els models dels contractistes s’han de comprovar contra el teu IDS o el teu EIR sense passar per un tercer.',
              'Vols tenir algú a qui trucar quan no funciona.',
            ] },
            { h: 'No et cal quan', items: [
              'La teva política només prohibeix pujar models. El [validador públic](validator) no els puja.',
              'Tens personal per allotjar-lo vosaltres mateixos. El codi té llicència MIT i inclou un Dockerfile: construïu la imatge i serviu-la. El pilot hi afegeix configuració, formació i suport, no un producte diferent.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Què reps', h2: 'Què s’instal·la, i què no',
          head: ['', 'Detall'],
          rows: [
            ['Programari', 'El visor, les 44 regles amb el Health Score, IDS 1.0, BCF 2.1 i 3.0, diversos models alhora, mesures i seccions. Una aplicació web estàtica servida per nginx des d’un contenidor; la comprovació s’executa al navegador de cada usuari.'],
            ['Servidor', 'Qualsevol màquina que executi un contenidor. Només serveix fitxers, de manera que necessita poc: la feina la fan les estacions de treball.'],
            ['Connexions', 'Cap connexió sortint i cap estadística d’ús en aquesta compilació.'],
            ['No disponible sense connexió', 'El context de mapa 3D (terreny, edificis d’OpenStreetMap) i els models d’exemple en línia, perquè es descarreguen d’internet.'],
            ['Els teus requisits', 'Els teus fitxers IDS, perfils de validació i patrons de nomenclatura, carregats i provats amb els teus models.'],
            ['Actualitzacions', 'Un fitxer d’imatge nou, lliurat pel canal que triïs. Res s’actualitza sol.'],
            ['Maquinari', 'El teu servidor o la teva màquina virtual. Si ho demanes, es pot subministrar una passarel·la preconfigurada.'],
          ],
        },
        {
          kind: 'table', label: 'Alternatives', h2: 'L’altra opció per a xarxes aïllades que coneixem',
          sub: 'Si estàs comparant, això és el que Solibri publica sobre el seu pla sense connexió.',
          head: ['', 'Solibri Security+', 'IFC Viewer Online on-premise'],
          rows: [
            ['Es descriu com a', '«Fully offline operation (no telemetry)», «Air-gapped by design», «Controlled update cycles»', 'Un contenidor al teu servidor; cap connexió sortint'],
            ['Preu', 'No es publica; «Talk with an expert»', 'Pressupost per pilot després d’una trucada per definir l’abast'],
            ['Comprovacions', 'La validació basada en regles de Solibri', '44 regles fixes i IDS 1.0; col·lisions només per caixa contenidora'],
          ],
          after: [
            'Solibri és l’opció més sòlida quan necessites detecció de col·lisions entre disciplines o regles escrites per a la teva organització. Aquesta instal·lació és la cosa més petita: obrir un lliurament, comprovar-lo contra els teus requisits i retornar els resultats.',
          ],
          sources: ['solibriPricing'],
        },
        {
          kind: 'steps', label: 'Pilot', h2: 'Com funciona un pilot',
          steps: [
            ['Trucada per definir l’abast', 'Les normes de la teva xarxa, la mida dels teus models, els teus requisits i qui el farà servir.'],
            ['Instal·lació', 'Al teu servidor, amb els teus fitxers IDS i perfils carregats.'],
            ['Formació', 'Una sessió amb els teus coordinadors BIM, amb els teus models.'],
            ['Decisió', 'Després del període de suport decideixes si l’estens a altres seus.'],
          ],
        },
        {
          kind: 'form', label: 'Demana un pilot', h2: 'Explica’ns el teu entorn',
          sub: 'El formulari obre un missatge al teu programa de correu. No s’envia res als nostres servidors.',
          org: 'Organització', sector: 'Sector',
          sectors: ['Defensa / seguretat', 'Energia / subministraments', 'Transport / infraestructures', 'Administració pública', 'Indústria / fabricació', 'Empresa AEC', 'Altres'],
          deploy: 'Xarxa', deploys: ['Sense cap accés a internet', 'Xarxa privada, internet restringit', 'Núvol privat a la nostra regió', 'Encara no ho sabem'],
          hw: 'Maquinari', hws: ['El nostre servidor o màquina virtual', 'Una passarel·la preconfigurada', 'Encara no ho sabem'],
          need: 'Què necessites comprovar, i quina mida tenen aproximadament els models?',
          submit: 'Obre el correu', direct: 'O escriu a', subject: 'Pilot de validació IFC on-premise',
        },
      ],
      faq: [
        ['Surt res de la nostra xarxa?', 'No. El contenidor serveix l’aplicació als vostres navegadors i no fa cap connexió sortint; aquesta compilació no porta estadístiques d’ús. Els models es llegeixen al navegador de cada usuari i no es desen al servidor.'],
        ['En què es diferencia de l’aplicació pública?', 'El programa és el mateix. El que canvia és des d’on se serveix, que és una versió fixa, i que les funcions que necessiten internet (el context de mapa i els models d’exemple en línia) no estan disponibles.'],
        ['El podem allotjar nosaltres sense vosaltres?', 'Sí. El codi font és públic sota llicència MIT i inclou un Dockerfile i una configuració d’nginx. El pilot és per a equips que el volen configurat, explicat i amb suport.'],
        ['Quina mida poden tenir els models?', 'La mateixa que a l’aplicació pública: menys de 2 GB per fitxer, amb el límit pràctic de la memòria de cada estació de treball, perquè la comprovació s’executa al navegador.'],
        ['Què costa?', 'Un pilot es pressuposta després de la trucada per definir l’abast, perquè depèn del nombre de seus i del suport que necessitis. Encara no hi ha cap llista de preus pública.'],
      ],
      bottom: ['La teva xarxa té connexió? Aleshores ja és gratis', 'El validador públic llegeix el fitxer al teu navegador i no puja res.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    solibri: {
      title: 'Alternativa a Solibri Gratuïta — Validar IFC al Navegador',
      desc: 'Quan n’hi ha prou amb un validador gratuït al navegador i quan cal Solibri: preus, col·lisions, regles i IDS segons el web de Solibri, consultat el 2026-11-10.',
      nav: 'Alternativa a Solibri',
      kicker: 'Gratis · Al navegador · Comparat amb els plans que publica Solibri',
      h1: ['Alternativa a Solibri gratuïta', 'per comprovar un IFC abans de lliurar-lo'],
      lead: 'Solibri és una plataforma de comprovació basada en regles que es ven en plans de 99 € a 2.772 € per llicència i any. IFC Viewer Online és una pàgina web gratuïta que obre un IFC, executa 44 regles fixes i el teu IDS, i mostra què falla. Substitueix Solibri en algunes feines i en d’altres no; aquesta pàgina diu en quines.',
      cta: 'Valida un fitxer IFC',
      cta2: 'o obre el model d’exemple',
      note: 'Sense compte, sense instal·lar res, i el fitxer no es puja.',
      heroSources: ['solibriPricing'],
      shots: [
        { alt: 'Model IFC comprovat al navegador amb la regla de col·lisions activada: Health Score 70, 36 col·lisions entre elements al capdamunt de la llista de correccions, i els elements implicats ressaltats a la vista 3D', cap: 'El model d’exemple amb la regla de col·lisions activada: 36 solapaments entre caixes contenidores, i la puntuació baixa de 77 a 70. És un primer filtre dins d’un sol model, no la detecció de col·lisions que ven Solibri.' },
        { alt: 'Comprovació IDS al navegador: una especificació IDS que exigeix una resistència al foc als murs, incomplerta pels 57 murs del model IFC mostrat en 3D', cap: 'Un fitxer IDS 1.0 comprovat contra el model, gratis i sense compte: a 57 murs els falta la resistència al foc que demana l’especificació.' },
      ],
      sections: [
        {
          kind: 'table', label: 'Comparació', h2: 'Solibri i IFC Viewer Online, de costat',
          sub: 'La columna de Solibri només diu el que Solibri publica. On les seves pàgines no diuen res (sistemes operatius, límits de mida de fitxer), no hi ha fila.',
          head: ['', 'Solibri', 'IFC Viewer Online'],
          rows: [
            ['Preu', 'Starter 99 €, Essential 1.428 €, Advanced 2.109 €, Premium 2.772 €: preus de partida per llicència i any. Security+ sota petició', 'Gratis. Els plans de pagament per a funcions de servidor encara no estan a la venda'],
            ['Comprovació de models', 'A partir d’Essential. Starter és per veure models i revisar resultats: «Model checking is performed in Solibri Essential, Advanced, or Premium»', 'Inclosa: 44 regles fixes, 25 activades per defecte'],
            ['Detecció de col·lisions', 'Essential: comprovació de col·lisions basada en regles, col·lisions dures i toves. Advanced: una matriu de col·lisions entre disciplines amb toleràncies', 'Només caixes contenidores, dins d’un sol model, solapament de 5 cm, fins a 800 elements i 100 resultats. Desactivada per defecte'],
            ['Regles pròpies', 'Advanced i Premium: «Custom rule creation and modification»', 'Sense editor de regles. Pots activar i desactivar regles, canviar-ne la severitat i definir patrons de nomenclatura i conjunts de propietats obligatoris; la resta entra com a IDS'],
            ['IDS', 'Essential comprova les propietats obligatòries contra definicions IDS. Advanced hi afegeix fluxos de treball IDS, un editor d’IDS i un validador d’IDS', 'IDS 1.0 amb les seves sis facetes. Tres restriccions (totalDigits, fractionDigits, whiteSpace) no es llegeixen'],
            ['BCF', 'A partir d’Essential: «BCF issue management and CDE integrations»', 'Llegeix i escriu fitxers BCF 2.1 i 3.0. Sense connexió a un servidor BCF ni a un CDE'],
            ['Models natius de Revit', 'A partir d’Essential: «IFC and native Revit model federation»', 'Només IFC'],
            ['Amidaments', 'Advanced: «Quantity / Information Takeoff (QTO / ITO)»', 'Suma les quantitats que ja hi ha escrites a l’IFC. Sense regles d’amidament'],
            ['Sense internet', 'Security+: «Fully offline operation (no telemetry)»', 'La pàgina es carrega des d’internet; el fitxer no es puja. Hi ha una [instal·lació on-premise](onprem)'],
          ],
          after: [
            'Tria Solibri quan coordines diverses disciplines i necessites detecció de col·lisions de debò, quan la teva organització escriu les seves pròpies regles, o quan la comprovació s’ha de governar en molts projectes. Res d’aquesta pàgina ho fa.',
            'Tria IFC Viewer Online quan vols saber avui si un IFC està en condicions de ser enviat: identificadors, estructura, noms, propietats, el teu IDS. També és l’eina per a la gent que envolta un equip amb Solibri i no té llicència: l’arquitecte que exporta el model, el client que el rep.',
            'Molts equips faran servir totes dues: una comprovació ràpida al navegador abans d’exportar, i Solibri per a la coordinació.',
          ],
          sources: ['solibriPricing', 'solibriStarter', 'solibriEssential', 'solibriAdvanced'],
        },
        {
          kind: 'text', label: 'Solibri avui', h2: 'Si busques Solibri Office o Solibri Anywhere',
          ps: [
            'El web de Solibri llista Solibri Office, CheckPoint, Anywhere i Site com a productes antics que «no longer available for new customers». Els plans actuals són Starter, Essential, Advanced, Premium i Security+.',
            'La versió gratuïta de Solibri Anywhere continua funcionant per a qui ja la té, en versions anteriors a la 26.4.0; Solibri diu que el dret d’ús gratuït no està disponible en versions més noves. Si feies servir Anywhere per obrir i mirar fitxers IFC, el [visor](viewer) ho fa gratis, al navegador, en qualsevol sistema operatiu.',
          ],
          sources: ['solibriLegacy', 'solibriPricing'],
        },
        {
          kind: 'cols', label: 'Abast', h2: 'Què hi trobes aquí, i què no',
          cols: [
            { h: 'Hi trobes', items: [
              'Un Health Score de 0 a 100 i les correccions que recuperen més punts.',
              'Els elements que fallen ressaltats al model 3D, i llistats per regla, planta o classe.',
              'Comprovacions IDS 1.0 i cinc perfils de validació integrats, del lliurament bàsic a ISO 19650 i LOD 300.',
              'Correccions automàtiques de GlobalId i noms, edició manual de noms i valors de propietat, i l’IFC corregit.',
              'Resultats com a BCF 2.1, CSV, JSON, un informe HTML o un full de càlcul COBie.',
            ] },
            { h: 'No hi trobes', items: [
              'Detecció de col·lisions entre models, ni al nivell de la geometria real.',
              'Un editor de regles, comprovació de normativa (accessibilitat, incendis, recorreguts d’evacuació) ni anàlisi d’espais.',
              'Seguiment d’incidències amb assignacions en un servidor. Els fitxers BCF s’intercanvien a mà.',
              'Fitxers de 2 GB o més. El límit depèn de la memòria del teu ordinador.',
            ] },
          ],
        },
        { kind: 'shot', label: 'Prova-ho', h2: 'Executa-ho amb un model d’exemple', sub: 'La demo de sota carrega el validador en aquesta pàgina.' },
        {
          kind: 'text', label: 'Preu', h2: 'Què costa',
          ps: [
            'El visor, les regles, l’IDS, les correccions i les exportacions són gratuïts, sense compte, també per a projectes comercials. El codi font és públic sota llicència MIT a [GitHub](github).',
            'Els plans de pagament (Pro a 19 € al mes, Team a 35 € per editor al mes) hi afegiran coses que necessiten un servidor; encara no estan a la venda. Mira la [pàgina de preus](pricing).',
          ],
        },
      ],
      faq: [
        ['IFC Viewer Online substitueix Solibri?', 'Per comprovar un IFC abans del lliurament (identificadors, estructura espacial, noms, propietats, IDS), sí. Per a la detecció de col·lisions entre disciplines, les regles pròpies i la governança entre projectes, no: per a això hi ha Solibri Essential i Advanced.'],
        ['Quant costa Solibri?', 'Solibri publica preus de partida per llicència i any: Starter 99 €, Essential 1.428 €, Advanced 2.109 € i Premium 2.772 €. El preu de Security+ es dona sota petició (solibri.com/pricing, consultat el 2026-11-10).'],
        ['Hi ha una versió gratuïta de Solibri?', 'Solibri Anywhere, que tenia una versió gratuïta, ara és un producte antic i no està disponible per a clients nous; els usuaris gratuïts que ja ho eren poden conservar les versions anteriors a la 26.4.0 (solibri.com/products/legacy-products, consultat el 2026-11-10). El pla actual més barat és Starter, a 99 € l’any.'],
        ['El pla Starter de 99 € comprova models?', 'Segons Solibri, Starter és per a la inspecció visual i per revisar resultats fets per altres: «Model checking is performed in Solibri Essential, Advanced, or Premium» (solibri.com/products/starter, consultat el 2026-11-10).'],
        ['Què fa Solibri que això no pot fer?', 'Detecció de col·lisions sobre la geometria real i entre models, regles escrites per a la teva organització, regles d’amidament, models natius de Revit, servidors BCF i connexions amb CDE, i un pla totalment sense connexió. Mira la taula de més amunt.'],
        ['Puc fer servir totes dues?', 'Sí, i és un repartiment habitual: els autors i els clients comproven un fitxer al navegador abans d’enviar-lo, i l’equip de coordinació passa Solibri sobre el model federat.'],
      ],
      faqSources: ['solibriPricing', 'solibriLegacy', 'solibriStarter'],
      bottom: ['Comprova un fitxer abans de decidir', 'És un minut, no costa res i el model es queda al teu ordinador.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    webchecker: {
      title: 'Alternativa a Solibri WebChecker — Comprovador IFC Gratis',
      desc: 'Solibri WebChecker demana un pla Advanced o Premium i puja l’IFC. Aquesta alternativa gratuïta comprova el fitxer al navegador. Què fa cadascun, amb fonts.',
      nav: 'Alternativa a Solibri WebChecker',
      kicker: 'Gratis · Sense pla de Solibri · El fitxer no es puja',
      h1: ['Alternativa a Solibri WebChecker', 'que comprova l’IFC al teu propi navegador'],
      lead: 'Solibri WebChecker (Beta) executa en línia el motor de comprovació de Solibri: puges un IFC, es comprova al servei de Solibri i et descarregues un PDF o un BCF. Ve amb els plans Advanced i Premium. Si necessites una comprovació web sense pla, o sense pujar el model, aquesta pàgina la fa al teu navegador, amb menys comprovacions.',
      cta: 'Valida un fitxer IFC',
      cta2: 'o obre el model d’exemple',
      note: 'Sense compte i sense tokens. Fins a 2 GB per fitxer.',
      heroSources: ['solibriWebchecker'],
      shots: [
        { alt: 'Comprovació d’IFC al web: la llista d’incidències agrupades per regla amb el nombre d’elements que fallen, al tauler de validació del visor al navegador', cap: 'Els resultats d’una comprovació, agrupats per regla. No s’ha pujat res per obtenir-los.' },
        { alt: 'Exportació d’una comprovació d’IFC des del navegador amb els formats BCF, CSV, JSON, informe de lliurament i COBie', cap: 'Els resultats surten com a BCF 2.1, CSV, JSON, un informe HTML o un full de càlcul COBie. No hi ha fitxer PDF; l’informe HTML s’imprimeix des del navegador.' },
      ],
      sections: [
        {
          kind: 'table', label: 'Comparació', h2: 'Solibri WebChecker i IFC Viewer Online',
          sub: 'La columna de WebChecker està treta de la pàgina de Solibri mateix.',
          head: ['', 'Solibri WebChecker (Beta)', 'IFC Viewer Online'],
          rows: [
            ['Accés', 'Inclòs a Solibri Advanced (des de 2.109 € l’any) i Premium (des de 2.772 €). No a Starter, Essential ni Security+, i «not a standalone product». Cal un Solibri ID', 'Obre la pàgina. Sense compte'],
            ['Cost per comprovació', '50 tokens. Advanced inclou 1.750 tokens l’any (unes 35 comprovacions), Premium 17.500 (unes 350). Tokens addicionals: 5.000 per 250 €, 10.000 per 450 €, 25.000 per 750 €', 'Gratis, tantes comprovacions com vulguis'],
            ['On va el model', 'Es puja. Residència de les dades a la UE o als EUA, que es tria en configurar el projecte', 'Es queda a la pestanya del teu navegador'],
            ['Conservació dels resultats', '30 dies', 'Fins que tanques la pestanya; exporta el que necessitis'],
            ['Mida del fitxer', 'Fins a 5 GB per fitxer IFC', 'Menys de 2 GB, i menys en un ordinador amb poca memòria'],
            ['Comprovacions', 'Comprovació Model Health (estructura i classificació, nomenclatura i identificadors, propietats clau mitjançant comprovacions basades en IDS, col·lisions geomètriques dures entre disciplines), o un conjunt de regles propi .cset fet a l’aplicació d’escriptori', '44 regles fixes i fitxers IDS 1.0. Col·lisions només per caixa contenidora dins d’un sol model'],
            ['Resultats', 'PDF i BCF (1.0, 2.0, 2.1 o 3.0); fitxers SMC per als usuaris de Premium', 'BCF 2.1, CSV, JSON, informe HTML, full de càlcul COBie'],
          ],
          after: [
            'WebChecker és la millor eina quan el teu equip BIM ja manté conjunts de regles de Solibri i vol que els participants del projecte executin exactament aquells, quan els fitxers passen de 2 GB, o quan necessites col·lisions dures entre disciplines a l’informe.',
            'Aquesta pàgina és la millor eina quan no tens un pla Advanced o Premium, quan el model no es pot pujar, o quan comproves sovint i no vols comptar tokens.',
          ],
          sources: ['solibriWebchecker', 'solibriPricing'],
        },
        {
          kind: 'cols', label: 'Abast', h2: 'Què cobreix aquesta comprovació, i què no',
          cols: [
            { h: 'Comprova', items: [
              'Identificadors, estructura espacial, plantes, noms, valors de propietat, tipus i materials: 44 regles, 25 activades per defecte.',
              'Fitxers IDS 1.0 amb les seves sis facetes.',
              'Cinc perfils de validació integrats, o els teus patrons de nomenclatura i conjunts de propietats obligatoris.',
            ] },
            { h: 'No comprova', items: [
              'Conjunts de regles de Solibri. Aquí no es pot carregar un fitxer .cset.',
              'Col·lisions dures entre disciplines, regles d’accessibilitat ni anàlisi d’espais.',
              'Fitxers de 2 GB o més.',
            ] },
          ],
          sources: ['solibriWebchecker'],
        },
        {
          kind: 'text', label: 'El teu fitxer', h2: 'Què passa amb el fitxer',
          ps: [
            'L’IFC el llegeix codi que s’executa a la pestanya del teu navegador i no es puja. El navegador desa una còpia convertida de la geometria al seu emmagatzematge privat, al teu ordinador (fins a 4 GB), per reobrir-lo més de pressa; si esborres les dades del lloc, desapareix.',
            'Les estadístiques d’ús sense galetes registren la mida del fitxer i el nombre d’elements, mai el contingut, i es poden desactivar. Un enllaç per compartir, si en crees un, porta la puntuació, el nom del fitxer i fins a 50 incidències dins de l’URL.',
          ],
        },
        { kind: 'shot', label: 'Prova-ho', h2: 'Fes una comprovació amb un model d’exemple', sub: 'La demo de sota carrega el validador en aquesta pàgina.' },
        {
          kind: 'text', label: 'Preu', h2: 'Què costa',
          ps: [
            'Res, i no hi ha tokens. El visor, les regles, l’IDS i les exportacions són gratuïts i sense compte. El codi és públic sota llicència MIT a [GitHub](github).',
            'Els plans de pagament que hi afegeixen un servidor es descriuen a la [pàgina de preus](pricing) i encara no estan a la venda. Els altres plans i preus es comparen en [una pàgina a part](solibri).',
          ],
        },
      ],
      faq: [
        ['Què és Solibri WebChecker?', 'En paraules de Solibri, «a browser-based model validation service that runs Solibri’s rules-based checking engine online». Els usuaris pugen models IFC, executen la comprovació Model Health o un conjunt de regles propi, i exporten PDF o BCF (solibri.com/solutions/webchecker, consultat el 2026-11-10).'],
        ['Solibri WebChecker és gratuït?', 'No. Està inclòs a Solibri Advanced i Premium i no es ven per separat. Cada comprovació gasta 50 tokens de l’assignació anual del pla o de paquets de tokens que comencen a 250 € per 5.000 tokens (solibri.com/solutions/webchecker, consultat el 2026-11-10).'],
        ['WebChecker puja el meu model?', 'Sí: Solibri el descriu com un servei on els usuaris pugen models IFC, amb les dades desades a la UE o als EUA i els resultats conservats durant 30 dies (solibri.com/solutions/webchecker, consultat el 2026-11-10). IFC Viewer Online, en canvi, llegeix el fitxer al teu navegador.'],
        ['Puc executar aquí els meus conjunts de regles de Solibri?', 'No. Els conjunts de regles de Solibri (.cset) només s’executen a Solibri. Els requisits que es poden escriure com a IDS 1.0 sí que es poden comprovar aquí.'],
        ['Quin dels dos troba més problemes?', 'Busquen coses diferents. La comprovació Model Health de WebChecker inclou col·lisions dures entre disciplines, cosa que aquesta pàgina no fa. Aquesta pàgina dona una puntuació i correccions automàtiques d’identificadors i noms. Per a la coordinació, fes servir Solibri.'],
      ],
      faqSources: ['solibriWebchecker'],
      bottom: ['Fes una comprovació web ara', 'Sense pla, sense tokens, sense pujada.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    mac: {
      title: 'Visor IFC per a Mac — Gratis, sense instal·lar, a Safari',
      desc: 'Obre fitxers IFC en un Mac amb Safari, Chrome o Firefox: vista 3D, propietats, seccions, mesures i validació. Sense instal·lar res, sense compte, gratis.',
      nav: 'Visor IFC per a Mac',
      kicker: 'macOS · Safari, Chrome, Firefox, Edge · Sense instal·lar res · Gratis',
      h1: ['Visor IFC per a Mac', 'que funciona al navegador que ja tens'],
      lead: 'No hi ha cap aplicació per descarregar: el visor és una pàgina web. Obre-la amb Safari o Chrome a macOS, deixa-hi anar un fitxer IFC i tens el model 3D, l’arbre espacial, les propietats de cada element, seccions, mesures i un informe de validació. El fitxer no es puja.',
      cta: 'Obre el visor',
      cta2: 'o obre el model d’exemple',
      note: 'Sense compte. IFC2x3, IFC4, IFC4x1 i IFC4x3, fins a 2 GB per fitxer.',
      shots: [
        { alt: 'Visor IFC en una finestra de navegador de 1440 per 900, la mida de la pantalla d’un MacBook: una casa de dues plantes en 3D, l’arbre espacial a l’esquerra i, a la dreta, els atributs IFC i els conjunts de propietats d’un mur seleccionat', cap: 'El visor en una finestra de 1440 × 900, la mida per defecte de la pantalla d’un MacBook Air (capturat a Chrome). A la dreta, els atributs i els conjunts de propietats del mur seleccionat.' },
        { alt: 'Pla de secció que talla un model IFC d’una casa al visor del navegador, amb el mobiliari interior visible, en una finestra de 1440 per 900', cap: 'Un pla de secció a través del mateix model, que es mou amb el control lliscant o arrossegant-lo a la vista. No hi intervé cap connector.' },
      ],
      sections: [
        {
          kind: 'cols', label: 'En un Mac', h2: 'Què funciona a macOS, i què pots esperar',
          cols: [
            { h: 'Funciona', items: [
              'A Safari, Chrome, Firefox i Edge a macOS. La pàgina necessita WebGL i WebAssembly, que aquests navegadors ja inclouen.',
              'Obrir fitxers .ifc, i arxius .ifczip o .zip, arrossegant-los a la finestra o amb el botó Open.',
              'Diversos models alhora, cadascun amb el seu arbre i les seves propietats.',
              'També en un iPad o un iPhone, amb fitxers més petits.',
            ] },
            { h: 'Tingues en compte', items: [
              'No és una aplicació de macOS: no hi ha icona al Dock ni previsualització amb Quick Look, i els fitxers .ifc no s’obren amb doble clic.',
              'La pàgina s’ha de carregar des d’internet. No funciona sense connexió.',
              'El límit de mida de fitxer és de 2 GB, i a la pràctica és la memòria del Mac: apareix una advertència a partir d’1 GB, o a partir de 80 MB en màquines amb 4 GB de memòria o menys i en iPad i iPhone.',
              'Les captures d’aquesta pàgina es van fer a Chrome. Si alguna cosa es veu malament a Safari, prova amb Chrome.',
            ] },
          ],
        },
        {
          kind: 'cols', label: 'Eines', h2: 'Què pots fer amb un model',
          cols: [
            { h: 'Mirar', items: [
              'Orbitar, desplaçar i fer zoom; amagar i aïllar elements; navegar per l’arbre espacial.',
              'Plans de secció i plantes 2D tallades del model, exportades com a DXF, SVG o PDF.',
              'Mesurar distàncies, àrees, angles i distàncies lliures.',
              'Llegir tots els conjunts de propietats i les quantitats escrites al fitxer.',
            ] },
            { h: 'Comprovar i corregir', items: [
              'Una validació amb 44 regles i un Health Score de 0 a 100; mira el [validador IFC](validator).',
              'Comprovacions IDS 1.0 contra els teus propis requisits.',
              'Editar noms i valors de propietat, corregir GlobalId, i exportar l’IFC corregit o un GLB.',
              'Obrir i escriure fitxers BCF 2.1 i 3.0.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Comparació', h2: 'Altres maneres d’obrir un IFC en un Mac',
          sub: 'Flinker és l’altre visor gratuït al navegador pel qual ens pregunten. La seva columna diu el que Flinker publica.',
          head: ['', 'Flinker', 'IFC Viewer Online'],
          rows: [
            ['Què és', '«The IFC viewer for Microsoft»: SharePoint, Teams, Excel, Power BI, Windows i el navegador', 'Un visor, validador i editor en una pàgina web'],
            ['En un Mac', 'El visor al navegador. L’aplicació d’escriptori és per a Windows; el web no esmenta macOS', 'Qualsevol navegador actual a macOS'],
            ['Per començar', '«Open a model without creating an account»', 'Sense compte'],
            ['Formats', 'IFC 2x3, 4 i 4x3; BCF 2.1 i 3.0; IDS 1.0; DXF; superposició de PDF', 'IFC2x3, IFC4, IFC4x1 i IFC4x3; BCF 2.1 i 3.0; IDS 1.0'],
            ['El fitxer', 'S’analitza al navegador; es queda al dispositiu o a l’emmagatzematge de Microsoft que triïs', 'Es llegeix al navegador; no es puja'],
            ['Comprovació', 'Comprovacions de requisits IDS amb ressaltat del que compleix i del que falla', '44 regles amb un Health Score, més IDS'],
            ['Preu', 'Community: gratis. Enterprise: preu per desplegament', 'Gratis'],
          ],
          after: [
            'Tria Flinker quan els teus projectes ja viuen a SharePoint i Teams: obrir el model al costat dels documents és per al que està fet, i aquest visor no es connecta a Microsoft 365.',
            'Tria IFC Viewer Online quan també vols saber si el model és bo: la validació, la puntuació i les correccions són la diferència.',
            'Sobre Solibri: les pàgines de producte que vam llegir el mateix dia no diuen en quins sistemes operatius funcionen els seus plans, i per això no ho diem. Comprova els requisits de sistema de Solibri abans de comprar-lo per a un Mac.',
          ],
          sources: ['flinkerViewer', 'solibriPricing'],
        },
        { kind: 'shot', label: 'Prova-ho', h2: 'Obre el model d’exemple', sub: 'La demo de sota s’executa en aquesta pàgina, al navegador que fas servir ara.' },
        {
          kind: 'text', label: 'Preu', h2: 'Què costa',
          ps: [
            'Res. No hi ha llicència, ni període de prova, ni compte. El codi és públic sota llicència MIT a [GitHub](github). Els plans de pagament que hi afegeixen un servidor són a la [pàgina de preus](pricing) i encara no estan a la venda.',
          ],
        },
      ],
      faq: [
        ['Hi ha algun visor IFC per a Mac que no calgui instal·lar?', 'Sí: aquest és una pàgina web. Obre-la amb Safari, Chrome, Firefox o Edge a macOS i deixa-hi anar el fitxer. No hi ha res a descarregar ni a instal·lar.'],
        ['Funciona a Safari?', 'Sí. Necessita WebGL i WebAssembly, que les versions actuals de Safari inclouen. Les captures d’aquesta pàgina es van fer a Chrome, així que prova amb Chrome si un model no es veu bé.'],
        ['L’IFC es puja quan l’obro?', 'No. El fitxer el llegeix codi que s’executa a la pestanya del navegador. Del navegador només en surten estadístiques d’ús anònimes (mida del fitxer i nombre d’elements), i es poden desactivar.'],
        ['Puc obrir fitxers de Revit o d’Archicad?', 'No, només IFC. Primer exporta un IFC des del programa de modelatge.'],
        ['Funciona sense connexió en un Mac?', 'No. La pàgina s’ha de carregar des d’internet cada vegada, tot i que el model mateix no s’envia mai.'],
        ['Flinker està disponible per a Mac?', 'El visor de Flinker funciona al navegador, de manera que es pot fer servir així en un Mac; la seva aplicació d’escriptori es publica per a Windows i el seu web no esmenta macOS (flinker.app/products/ifc-viewer, consultat el 2026-11-10).'],
      ],
      faqSources: ['flinkerViewer'],
      bottom: ['Obre un IFC al teu Mac', 'Al navegador, gratis, sense instal·lar res.'],
    },
  },
}
