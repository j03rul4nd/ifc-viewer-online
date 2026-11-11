import type { LangCopy } from './types'

// Italian copy for the six landing families. Translated from copy-en.ts; see
// TRANSLATING.md. Vendor quotes stay in English inside “…”.

export const copy: LangCopy = {
  ui: {
    home: 'IFC Viewer Online',
    sources: 'Fonti',
    readOn: 'letto il',
    faqLabel: 'FAQ',
    faqTitle: 'Domande',
    related: 'Pagine correlate',
    fix: 'Correggere gli errori IFC',
    blogSolibri: 'Solibri o un validatore nel browser: il confronto esteso',
    pricing: 'Prezzi',
    embedCta: 'Esegui la validazione su un IFC di esempio',
    embedSub: 'Carica il validatore in questa pagina. Nessun file viene inviato.',
  },
  pages: {
    // ─────────────────────────────────────────────────────────────────────────
    validator: {
      title: 'Validazione IFC Online — Validatore IFC Gratis, 44 Regole',
      desc: 'Controlla un file IFC nel browser: 44 regole, IDS 1.0 e Health Score da 0 a 100. Il file non viene caricato. Gratis, senza account. IFC2x3, IFC4, IFC4x3.',
      nav: 'Validatore IFC',
      kicker: '44 regole · IDS 1.0 · Il file resta nel tuo browser · Gratis',
      h1: ['Validazione IFC online', 'Che cosa non va nel file, e dove'],
      lead: 'Trascina un file IFC e ottieni un Health Score da 0 a 100, l’elenco dei problemi raggruppati per regola e gli elementi non conformi evidenziati nel modello 3D. Il file viene letto nella scheda del tuo browser e non viene caricato.',
      cta: 'Valida un file IFC',
      cta2: 'oppure apri il modello di esempio',
      note: 'Senza account. IFC2x3, IFC4, IFC4x1 e IFC4x3, fino a 2 GB per file.',
      shots: [
        { alt: 'Validazione IFC di una casa a due piani nel browser: Health Score 77, un errore e 161 avvisi, le tre correzioni che recuperano più punti e la vista 3D che scorre i 119 elementi senza tipo', cap: 'Il modello di esempio pubblico Duplex (2,3 MB, 7.181 entità) ottiene 77. “Show in 3D” sulla prima correzione inquadra i 119 elementi senza tipo, con un contatore per scorrerli uno a uno.' },
        { alt: 'Elenco dei problemi di validazione IFC raggruppati per regola, con il numero di elementi che non rispettano ciascuna regola e la spiegazione di come correggerla', cap: 'Ogni regola si apre sui suoi elementi e sui passaggi per correggerla in Revit, Archicad o Tekla.' },
      ],
      sections: [
        {
          kind: 'cols', label: 'Ambito', h2: 'Che cosa copre il controllo, e che cosa no',
          sub: 'Le regole sono 44, in otto gruppi. 25 vengono eseguite per impostazione predefinita; le altre 19 si attivano da un profilo perché richiedono una tua decisione (un livello LOD, uno schema di denominazione, un sistema di classificazione).',
          cols: [
            { h: 'Controlla', items: [
              'Identificatori: GlobalId duplicati e GlobalId che non sono GUID IFC validi di 22 caratteri.',
              'Struttura: un solo IfcProject, la catena Project → Site → Building → Storey, elementi senza piano, aggregazioni interrotte o circolari, aperture senza elemento ospite.',
              'Piani: quote mancanti, duplicate o non ordinate.',
              'Dati: nomi vuoti, nomi duplicati, valori di proprietà vuoti, elementi senza tipo o senza materiale, spazi senza superficie.',
              'Qualità dell’esportazione: più del 5% degli elementi come IfcBuildingElementProxy, un modello a più di 10 km dall’origine, più di 500 KB per elemento, unità di lunghezza imperiali.',
              'Su richiesta: property set obbligatori per classe, schemi di denominazione, classificazione, proprietà e quantità LOD 100–400, campi ISO 19650 di progetto e autore, sistemi MEP.',
              'I tuoi requisiti: un file IDS 1.0, uno dei cinque profili integrati (consegna di base, revisione di qualità, coordinamento BIM, ISO 19650, LOD 300) o un profilo definito da te.',
            ] },
            { h: 'Non controlla', items: [
              'Le interferenze tra due modelli. Le regole di clash confrontano i bounding box all’interno di un solo modello, con una sovrapposizione di 5 cm, fino a 800 elementi e 100 risultati. Sono un primo filtro, non coordinamento.',
              'Le normative edilizie: accessibilità, sicurezza antincendio, vie di esodo o altezze libere. Qui nessuna regola legge una norma.',
              'L’intero schema IFC. Non è un test di conformità EXPRESS: esegue queste 44 regole e i tuoi IDS.',
              'I codici ISO 19650. La regola sul nome del file legge il nome scritto nell’header dell’IFC e ne conta i campi; non verifica ogni codice.',
              'I file nativi. Legge IFC, non file di Revit o Archicad.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Limiti', h2: 'I limiti, con i numeri',
          head: ['', 'Limite'],
          rows: [
            ['Dimensione del file', 'Un file da 2 GB viene rifiutato. Compare un avviso da 200 MB e un avviso di memoria da 1 GB. Su telefoni, tablet e computer con 4 GB di memoria o meno, l’avviso parte da 80 MB.'],
            ['Formati', 'IFC2x3, IFC4, IFC4x1 e IFC4x3, come .ifc o dentro .ifczip e .zip.'],
            ['Regole', '44 in totale, 25 attive per impostazione predefinita. Gravità e soglie si possono cambiare regola per regola.'],
            ['IDS', 'IDS 1.0 con i suoi sei facet. Le restrizioni totalDigits, fractionDigits e whiteSpace non vengono lette. Per ogni specifica vengono elencati fino a 200 elementi non conformi.'],
            ['Correzioni automatiche', 'GlobalId non validi e duplicati, nomi vuoti o duplicati. Tutto il resto lo modifichi a mano o lo correggi nel software di authoring.'],
            ['Velocità', 'Il modello di esempio nell’immagine (2,3 MB, 7.181 entità) è stato validato in circa 20 secondi sul computer usato per queste catture. Il tempo cresce con il numero di entità.'],
            ['Connessione', 'La pagina deve essere caricata da internet. Non funziona offline.'],
          ],
        },
        {
          kind: 'text', label: 'Il tuo file', h2: 'Che cosa succede al file',
          ps: [
            'L’IFC viene aperto da codice che gira nella scheda del tuo browser. Non viene inviato né a noi né a nessun altro, quindi non c’è un caricamento da attendere e non c’è nulla da cancellare dopo.',
            'Per riaprire un modello più in fretta, il browser conserva una copia convertita della sua geometria nel proprio spazio di archiviazione privato sul tuo computer (fino a 4 GB; le copie più vecchie vengono eliminate per prime). Cancellando i dati del sito nel browser la rimuovi.',
            'Due cose invece escono dal browser, ed entrambe le controlli tu. Le statistiche d’uso senza cookie registrano che è stato aperto un file, la sua dimensione e il suo numero di elementi, mai il contenuto; si possono disattivare e rispettano Do Not Track. E se premi Condividi, il link stesso contiene il punteggio, il nome del file e i primi 50 problemi con i nomi dei relativi elementi, quindi chiunque abbia il link può leggerli.',
          ],
        },
        { kind: 'shot', label: 'Il risultato', h2: 'Dal punteggio all’elemento', sub: 'Provalo qui sul modello di esempio, poi apri il tuo file.' },
        {
          kind: 'steps', label: 'Come funziona', h2: 'Dal file a un IFC corretto',
          steps: [
            ['Apri il file', 'Trascina il file .ifc nella pagina. Si possono tenere aperti più file insieme; ciascuno viene validato per conto suo.'],
            ['Leggi l’esito', 'Il punteggio, gli errori e gli avvisi, e le tre correzioni che recuperano più punti. Un clic evidenzia gli elementi non conformi.'],
            ['Correggi ciò che si può correggere qui', 'Rigenera i GlobalId non validi, rinomina in blocco, modifica nomi e valori di proprietà. Ogni modifica si può annullare.'],
            ['Esporta', 'L’IFC corretto, riscritto dal parser, e i risultati come BCF 2.1, CSV, JSON, un report di consegna HTML o un foglio di calcolo COBie.'],
          ],
        },
        {
          kind: 'text', label: 'Prezzo', h2: 'Quanto costa',
          ps: [
            'Niente. Il visualizzatore, le 44 regole, l’IDS, le correzioni e tutte le esportazioni di questa pagina sono gratuiti, senza account, anche per lavori commerciali. Il codice sorgente è pubblico con licenza MIT su [GitHub](github).',
            'I piani a pagamento (Pro a 19 € al mese, Team a 35 € per editor al mese) riguardano ciò che richiede un server, come l’archiviazione dei modelli e i set di regole salvati. Non sono ancora in vendita; la [pagina dei prezzi](pricing) dice che cosa includerà ciascuno.',
          ],
        },
      ],
      faq: [
        ['Il file IFC viene caricato su un server?', 'No. Il file viene letto da codice che gira nella scheda del tuo browser. Dal browser escono solo le statistiche d’uso anonime (dimensione del file e numero di elementi, mai il contenuto) e i link di condivisione che crei tu.'],
        ['Quali versioni IFC legge?', 'IFC2x3, IFC4, IFC4x1 e IFC4x3, come file .ifc o dentro archivi .ifczip e .zip. I file da 2 GB in su vengono rifiutati.'],
        ['Sostituisce uno strumento di clash detection?', 'No. Le regole di clash confrontano i bounding box all’interno di un singolo modello e sono disattivate per impostazione predefinita. Trovano le sovrapposizioni evidenti prima di inoltrare un modello; il coordinamento tra discipline richiede uno strumento di clash detection.'],
        ['Posso verificare un modello rispetto ai miei requisiti?', 'Sì. Carica un file IDS 1.0, oppure parti da uno dei sette set di requisiti già pronti (consegna ISO 19650, LOD 200 e LOD 400, consegna COBie e altri). Puoi anche costruire un profilo di validazione con i tuoi schemi di denominazione e i property set obbligatori.'],
        ['Posso correggere gli errori ed esportare di nuovo l’IFC?', 'GlobalId e nomi si possono correggere automaticamente; nomi, descrizioni e valori di proprietà si possono modificare a mano, con annullamento. L’esportazione riscrive l’IFC con queste modifiche. Geometria e relazioni non si possono modificare.'],
        ['Funziona senza connessione a internet?', 'No. La pagina deve essere caricata da internet. Per le reti senza accesso a internet esiste un’[installazione on-premise](onprem).'],
      ],
      bottom: ['Controlla un file adesso', 'Gratis, senza account, e il file resta nel tuo browser.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    cloud: {
      title: 'Validatore IFC Cloud — Valida IFC online senza caricare',
      desc: 'Verifica IFC da una pagina web senza caricare il modello: 44 regole, IDS 1.0 e Health Score calcolato nel browser. Gratis, senza account, file fino a 2 GB.',
      nav: 'Validatore IFC cloud',
      kicker: 'Online · Senza caricamento · 44 regole · IDS 1.0 · Gratis',
      h1: ['Validatore IFC cloud', 'senza il caricamento'],
      lead: 'Uno strumento cloud per la verifica IFC di solito comporta l’invio del modello al server di qualcun altro. Questo è una pagina web che fa il lavoro nel tuo browser: stessa comodità, e il file non lascia mai il tuo computer.',
      cta: 'Valida un file IFC',
      cta2: 'oppure apri il modello di esempio',
      note: 'Senza account. Funziona in Chrome, Edge, Firefox e Safari. Fino a 2 GB per file.',
      shots: [
        { alt: 'Verifica IDS di un modello IFC nel browser: la specifica “Walls declare a FireRating in Pset_WallCommon” non è rispettata dai 57 muri di una casa a due piani mostrata in 3D', cap: 'Un IDS 1.0 di esempio verificato sul modello: nessuno dei 57 muri dichiara una resistenza al fuoco. Il modello e l’IDS vengono letti entrambi nella scheda del browser.' },
        { alt: 'Finestra di esportazione di una validazione IFC con i formati JSON, CSV, certificato, BCF, report di consegna e COBie', cap: 'I risultati escono come file che scarichi: BCF 2.1, CSV, JSON, un report di consegna HTML o un foglio di calcolo COBie.' },
      ],
      sections: [
        {
          kind: 'table', label: 'Caricamento o browser', h2: 'Un servizio di verifica che carica il modello, e una pagina che non lo fa',
          sub: 'Solibri WebChecker è l’esempio pubblicato più chiaro di servizio di verifica cloud, quindi qui il confronto è con lui. La sua colonna riporta ciò che dice la pagina di Solibri.',
          head: ['', 'Solibri WebChecker (Beta)', 'IFC Viewer Online'],
          rows: [
            ['Dove va il modello', 'Caricato sul servizio. I dati sono conservati nell’UE o negli Stati Uniti, a scelta al momento della configurazione del progetto', 'Da nessuna parte. Viene letto nella scheda del tuo browser'],
            ['Per quanto tempo restano i risultati', '30 giorni, poi vengono rimossi', 'Finché non chiudi la scheda. Ti resta ciò che esporti'],
            ['Dimensione del file', 'Fino a 5 GB per file IFC', 'Meno di 2 GB per file, e meno ancora su un computer con poca memoria'],
            ['Account', 'Un Solibri ID e un piano Solibri Advanced o Premium', 'Nessuno'],
            ['Costo di una verifica', '50 token. Advanced include 1.750 token all’anno, Premium 17.500; un pacchetto da 5.000 token costa 250 €', 'Gratis'],
            ['Controlli', 'Il controllo Model Health di Solibri, oppure un set di regole personalizzato (.cset) preparato nell’applicazione desktop di Solibri', '44 regole fisse e i tuoi file IDS 1.0'],
            ['Risultati', 'PDF e BCF; file SMC con Premium', 'BCF 2.1, CSV, JSON, report HTML, foglio di calcolo COBie. Nessun file PDF: il report HTML si stampa dal browser'],
          ],
          after: [
            'Un server ha senso quando i file sono più grandi di quanto un browser possa gestire, quando i risultati devono restare a disposizione di tutto il team di progetto, o quando le verifiche devono girare senza nessuno davanti. Qui non succede niente di tutto questo: questa pagina verifica il file di una persona sul computer di quella persona.',
            'Il browser è la scelta giusta quando il modello non può uscire dall’edificio, quando nessuno approverà un nuovo fornitore questa settimana, o quando ti serve soltanto una risposta su un file.',
          ],
          sources: ['solibriWebchecker', 'solibriPricing'],
        },
        {
          kind: 'cols', label: 'Ambito', h2: 'Che cosa controlla, e che cosa no',
          cols: [
            { h: 'Controlla', items: [
              '44 regole in otto gruppi: identificatori, struttura spaziale, piani, nomi, valori di proprietà, tipi, materiali, qualità dell’esportazione. 25 vengono eseguite per impostazione predefinita.',
              'File IDS 1.0, con i sei facet: entità, attributo, proprietà, classificazione, materiale e part-of.',
              'Cinque profili di validazione integrati (consegna di base, revisione di qualità, coordinamento BIM, ISO 19650, LOD 300), oppure i tuoi.',
            ] },
            { h: 'Non controlla', items: [
              'Le interferenze tra modelli. Solo i bounding box all’interno di un modello, e la regola è disattivata per impostazione predefinita.',
              'Normative edilizie o regole di progettazione scritte per il tuo progetto. Non c’è un editor di regole; i requisiti entrano come IDS.',
              'Lotti di file. Ogni file viene aperto da una persona; niente gira a orari programmati.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Limiti', h2: 'I limiti, con i numeri',
          head: ['', 'Limite'],
          rows: [
            ['Dimensione del file', 'Un file da 2 GB viene rifiutato. Compare un avviso da 200 MB e un avviso di memoria da 1 GB; su telefoni, tablet e computer con 4 GB di memoria o meno parte da 80 MB.'],
            ['Formati', 'IFC2x3, IFC4, IFC4x1 e IFC4x3, come .ifc o dentro .ifczip e .zip.'],
            ['IDS', 'IDS 1.0. Le restrizioni totalDigits, fractionDigits e whiteSpace non vengono lette. Per ogni specifica vengono elencati fino a 200 elementi non conformi.'],
            ['Condivisione', 'Un link di condivisione contiene il punteggio e i primi 50 problemi dentro l’URL, fino a 8.000 caratteri. Il modello non c’è.'],
            ['Connessione', 'La pagina deve essere caricata da internet. Non funziona offline.'],
          ],
        },
        {
          kind: 'text', label: 'Il tuo file', h2: 'Che cosa succede al file',
          ps: [
            'L’IFC viene aperto da codice che gira nella scheda del tuo browser e non viene inviato da nessuna parte. Puoi verificarlo da te: apri gli strumenti per sviluppatori del browser, osserva la scheda Rete (Network) e trascina un file.',
            'Il browser conserva una copia convertita della geometria nel suo spazio di archiviazione privato sul tuo computer (fino a 4 GB) per riaprire il modello più in fretta. Cancellando i dati del sito la rimuovi.',
            'Le statistiche d’uso senza cookie registrano la dimensione del file e il numero di elementi, mai il contenuto, e si possono disattivare. Un link di condivisione, se ne crei uno, contiene il punteggio, il nome del file e fino a 50 problemi con i nomi degli elementi.',
          ],
        },
        { kind: 'shot', label: 'Il risultato', h2: 'Provalo su un modello di esempio', sub: 'La demo qui sotto gira in questa pagina. Poi apri il tuo file.' },
        {
          kind: 'text', label: 'Prezzo', h2: 'Quanto costa',
          ps: [
            'Niente: il visualizzatore, le regole, l’IDS e le esportazioni sono gratuiti e non richiedono un account. Il codice è pubblico con licenza MIT su [GitHub](github).',
            'I piani a pagamento che aggiungono un server (modelli archiviati, set di regole salvati, lavoro in team) sono descritti nella [pagina dei prezzi](pricing) e non sono ancora in vendita.',
          ],
        },
      ],
      faq: [
        ['È un servizio cloud?', 'Viene distribuito dal web come un servizio cloud, ma la verifica la fa il tuo browser. Non c’è caricamento, non c’è coda e da parte nostra non resta nessuna copia del modello.'],
        ['Come posso verificare che non venga caricato nulla?', 'Apri gli strumenti per sviluppatori del browser, vai alla scheda Rete (Network) e trascina un file IFC. Vedrai caricarsi i file della pagina e nessuna richiesta che trasporta il modello.'],
        ['Quanto può essere grande un file?', 'I file da 2 GB in su vengono rifiutati, e il limite pratico dipende dalla memoria del computer: compare un avviso da 1 GB, oppure da 80 MB su telefoni e macchine con 4 GB di memoria o meno. Solibri WebChecker accetta fino a 5 GB per file (solibri.com/solutions/webchecker, letto il 2026-11-10).'],
        ['Posso automatizzarlo?', 'Non da questa pagina: ogni file viene aperto da una persona. Esiste un server MCP (ifc-viewer-mcp) che esegue la stessa validazione sulla tua macchina da un assistente o da uno script; vedi il [codice sorgente su GitHub](github).'],
        ['Si può usare con modelli riservati?', 'Il modello resta sul tuo computer, che di solito è ciò che chiede un NDA. Controlla due cose rispetto alla tua policy: le statistiche d’uso anonime (si possono disattivare) e i link di condivisione (contengono nomi di file e di elementi).'],
      ],
      faqSources: ['solibriWebchecker'],
      bottom: ['Controlla un file senza caricarlo', 'Gratis, senza account. Il modello resta sul tuo computer.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    onprem: {
      title: 'Validatore IFC on-premise — Validazione BIM in rete isolata',
      desc: 'Visualizzatore IFC, validatore a 44 regole e verifiche IDS serviti dalla tua rete, senza connessione internet. Immagine container, setup, formazione, supporto.',
      nav: 'Validazione IFC on-premise',
      kicker: 'On-premise · Senza connessione a internet · Il tuo server',
      h1: ['Validatore IFC on-premise', 'per le reti che restano chiuse'],
      lead: 'L’app pubblica legge già i file IFC dentro il browser, ma la pagina stessa viene caricata da internet. Dove questo non è consentito, lo stesso visualizzatore, lo stesso validatore e le stesse verifiche IDS vengono serviti da un container sul tuo server.',
      cta: 'Richiedi un pilota',
      cta2: '',
      note: 'Una sede, perimetro fisso: installazione, configurazione con i tuoi requisiti, una sessione di formazione e un periodo di supporto.',
      shots: [
        { alt: 'Validatore IFC con l’elenco dei profili di validazione integrati aperto: consegna di base, revisione di qualità, coordinamento BIM, conformità ISO 19650 e progettazione LOD 300', cap: 'I profili integrati. Durante il pilota, i tuoi profili e i tuoi file IDS vengono caricati e provati sui tuoi modelli.' },
        { alt: 'Risultato di una verifica IDS nel validatore IFC: una specifica non superata, 0 muri su 57 con una proprietà FireRating, con i pulsanti per evidenziare, isolare ed esportare', cap: 'Un modello verificato rispetto a un file IDS: i 57 muri non rispettano il requisito di resistenza al fuoco. On-premise, il modello e i requisiti restano nella tua rete.' },
      ],
      sections: [
        {
          kind: 'cols', label: 'Per chi è', h2: 'Quando «non viene caricato nulla» non basta',
          cols: [
            { h: 'Fa al caso tuo quando', items: [
              'Le postazioni di lavoro non hanno accesso a internet, o non possono caricare software da lì.',
              'Ti serve una sola versione verificata che non cambia finché non lo decidi tu.',
              'I modelli degli appaltatori vanno verificati rispetto ai tuoi IDS o al tuo EIR senza passare da terzi.',
              'Vuoi qualcuno da chiamare quando non funziona.',
            ] },
            { h: 'Non ti serve quando', items: [
              'La tua policy vieta soltanto di caricare i modelli. Il [validatore pubblico](validator) non li carica.',
              'Hai il personale per ospitarlo in proprio. Il codice ha licenza MIT e include un Dockerfile: costruisci l’immagine e servila. Il pilota aggiunge configurazione, formazione e supporto, non un prodotto diverso.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Che cosa ricevi', h2: 'Che cosa viene installato, e che cosa no',
          head: ['', 'Dettaglio'],
          rows: [
            ['Software', 'Il visualizzatore, le 44 regole con l’Health Score, IDS 1.0, BCF 2.1 e 3.0, più modelli insieme, misure e sezioni. Un’applicazione web statica servita da nginx da un container; la verifica gira nel browser di ciascun utente.'],
            ['Server', 'Qualsiasi macchina che esegua un container. Serve soltanto dei file, quindi le basta poco: il lavoro lo fanno le postazioni.'],
            ['Connessioni', 'Nessuna connessione in uscita e nessuna statistica d’uso in questa build.'],
            ['Non disponibile offline', 'Il contesto di mappa 3D (terreno, edifici di OpenStreetMap) e i modelli di esempio online, perché vengono scaricati da internet.'],
            ['I tuoi requisiti', 'I tuoi file IDS, i profili di validazione e gli schemi di denominazione caricati e provati sui tuoi modelli.'],
            ['Aggiornamenti', 'Un nuovo file immagine, consegnato attraverso il canale che scegli tu. Niente si aggiorna da solo.'],
            ['Hardware', 'Un tuo server o una tua macchina virtuale. Su richiesta si può fornire un gateway preconfigurato.'],
          ],
        },
        {
          kind: 'table', label: 'Alternative', h2: 'L’altra opzione air-gapped che conosciamo',
          sub: 'Se stai confrontando, questo è ciò che Solibri pubblica sul suo piano offline.',
          head: ['', 'Solibri Security+', 'IFC Viewer Online on-premise'],
          rows: [
            ['Descritto come', '“Fully offline operation (no telemetry)”, “Air-gapped by design”, “Controlled update cycles”', 'Un container sul tuo server; nessuna connessione in uscita'],
            ['Prezzo', 'Non pubblicato; “Talk with an expert”', 'Preventivo per ogni pilota dopo una chiamata di definizione del perimetro'],
            ['Controlli', 'La validazione basata su regole di Solibri', '44 regole fisse e IDS 1.0; clash solo per bounding box'],
          ],
          after: [
            'Solibri è la scelta più solida quando ti servono la clash detection tra discipline o regole scritte per la tua organizzazione. Questa installazione è la cosa più piccola: aprire una consegna, verificarla rispetto ai tuoi requisiti e restituire i risultati.',
          ],
          sources: ['solibriPricing'],
        },
        {
          kind: 'steps', label: 'Pilota', h2: 'Come funziona un pilota',
          steps: [
            ['Chiamata di definizione del perimetro', 'Le regole della tua rete, la dimensione dei tuoi modelli, i tuoi requisiti e chi lo userà.'],
            ['Installazione', 'Sul tuo server, con i tuoi file IDS e i tuoi profili caricati.'],
            ['Formazione', 'Una sessione con i tuoi BIM coordinator, sui tuoi modelli.'],
            ['Decisione', 'Dopo il periodo di supporto decidi se estenderlo ad altre sedi.'],
          ],
        },
        {
          kind: 'form', label: 'Richiedi un pilota', h2: 'Parlaci del tuo ambiente',
          sub: 'Il modulo apre un messaggio nel tuo programma di posta. Nulla viene inviato ai nostri server.',
          org: 'Organizzazione', sector: 'Settore',
          sectors: ['Difesa / sicurezza', 'Energia / servizi di pubblica utilità', 'Trasporti / infrastrutture', 'Pubblica amministrazione', 'Industria / manifattura', 'Studio o impresa AEC', 'Altro'],
          deploy: 'Rete', deploys: ['Nessun accesso a internet', 'Rete privata, internet limitato', 'Cloud privato nella nostra regione', 'Non lo so ancora'],
          hw: 'Hardware', hws: ['Un nostro server o una nostra macchina virtuale', 'Un gateway preconfigurato', 'Non lo so ancora'],
          need: 'Che cosa devi verificare, e quanto sono grandi all’incirca i modelli?',
          submit: 'Apri l’e-mail', direct: 'Oppure scrivi a', subject: 'Pilota di validazione IFC on-premise',
        },
      ],
      faq: [
        ['Qualcosa esce dalla nostra rete?', 'No. Il container serve l’applicazione ai vostri browser e non apre nessuna connessione in uscita; questa build non contiene statistiche d’uso. I modelli vengono letti nel browser di ciascun utente e non vengono salvati sul server.'],
        ['Che cosa cambia rispetto all’app pubblica?', 'Il programma è lo stesso. Cambia da dove viene servito, il fatto che è una versione fissa, e che le funzioni che richiedono internet (il contesto di mappa e i modelli di esempio online) non sono disponibili.'],
        ['Possiamo ospitarlo in proprio senza di voi?', 'Sì. Il codice sorgente è pubblico con licenza MIT e include un Dockerfile e una configurazione nginx. Il pilota è per i team che lo vogliono configurato, spiegato e supportato.'],
        ['Quanto possono essere grandi i modelli?', 'Come nell’app pubblica: meno di 2 GB per file, con il limite pratico dato dalla memoria di ciascuna postazione, perché la verifica gira nel browser.'],
        ['Quanto costa?', 'Il preventivo di un pilota arriva dopo la chiamata di definizione del perimetro, perché dipende dal numero di sedi e dal supporto che ti serve. Non c’è ancora un listino pubblico.'],
      ],
      bottom: ['La tua rete è connessa? Allora è già gratis', 'Il validatore pubblico legge il file nel tuo browser e non carica nulla.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    solibri: {
      title: 'Alternativa a Solibri Gratis — Validare l’IFC nel Browser',
      desc: 'Quando basta un validatore gratuito nel browser e quando serve Solibri: prezzi, clash detection, regole e IDS a confronto dalle pagine di Solibri (2026-11-10).',
      nav: 'Alternativa a Solibri',
      kicker: 'Gratis · Nel browser · A confronto con i piani pubblicati da Solibri',
      h1: ['Alternativa a Solibri gratuita', 'per verificare un IFC prima della consegna'],
      lead: 'Solibri è una piattaforma di verifica basata su regole venduta in piani da 99 € a 2.772 € per licenza all’anno. IFC Viewer Online è una pagina web gratuita che apre un IFC, esegue 44 regole fisse e i tuoi IDS, e mostra che cosa non è conforme. Sostituisce Solibri per alcuni lavori e non per altri; questa pagina dice quali.',
      cta: 'Valida un file IFC',
      cta2: 'oppure apri il modello di esempio',
      note: 'Senza account, niente da installare, e il file non viene caricato.',
      heroSources: ['solibriPricing'],
      shots: [
        { alt: 'Modello IFC verificato nel browser con la regola di clash attivata: Health Score 70, 36 interferenze tra elementi in cima all’elenco delle correzioni, e gli elementi coinvolti evidenziati nella vista 3D', cap: 'Il modello di esempio con la regola di clash attivata: 36 sovrapposizioni tra bounding box, e il punteggio scende da 77 a 70. È un primo filtro all’interno di un modello, non la clash detection che vende Solibri.' },
        { alt: 'Verifica IDS nel browser: una specifica IDS che richiede una resistenza al fuoco sui muri, non rispettata dai 57 muri del modello IFC mostrato in 3D', cap: 'Un file IDS 1.0 verificato sul modello, gratis e senza account: a 57 muri manca la resistenza al fuoco richiesta dalla specifica.' },
      ],
      sections: [
        {
          kind: 'table', label: 'Confronto', h2: 'Solibri e IFC Viewer Online, fianco a fianco',
          sub: 'La colonna di Solibri dice soltanto ciò che Solibri pubblica. Dove le sue pagine non dichiarano qualcosa (sistemi operativi, limiti di dimensione dei file), la riga non c’è.',
          head: ['', 'Solibri', 'IFC Viewer Online'],
          rows: [
            ['Prezzo', 'Starter 99 €, Essential 1.428 €, Advanced 2.109 €, Premium 2.772 €: prezzi di partenza per licenza all’anno. Security+ su richiesta', 'Gratis. I piani a pagamento per le funzioni su server non sono ancora in vendita'],
            ['Verifica del modello', 'Da Essential. Starter serve a visualizzare i modelli e a rivedere i risultati: “Model checking is performed in Solibri Essential, Advanced, or Premium”', 'Inclusa: 44 regole fisse, 25 attive per impostazione predefinita'],
            ['Clash detection', 'Essential: verifica delle interferenze basata su regole, hard clash e soft clash. Advanced: una matrice di clash tra discipline con tolleranze', 'Solo bounding box, all’interno di un modello, sovrapposizione di 5 cm, fino a 800 elementi e 100 risultati. Disattivata per impostazione predefinita'],
            ['Le tue regole', 'Advanced e Premium: “Custom rule creation and modification”', 'Nessun editor di regole. Puoi attivare e disattivare le regole, cambiarne la gravità e impostare schemi di denominazione e property set obbligatori; tutto il resto entra come IDS'],
            ['IDS', 'Essential verifica le proprietà richieste rispetto a definizioni IDS. Advanced aggiunge flussi di lavoro IDS, un editor IDS e un validatore IDS', 'IDS 1.0 con i suoi sei facet. Tre restrizioni (totalDigits, fractionDigits, whiteSpace) non vengono lette'],
            ['BCF', 'Da Essential: “BCF issue management and CDE integrations”', 'Legge e scrive file BCF 2.1 e 3.0. Nessuna connessione a un server BCF o a un CDE'],
            ['Modelli Revit nativi', 'Da Essential: “IFC and native Revit model federation”', 'Solo IFC'],
            ['Computo delle quantità', 'Advanced: “Quantity / Information Takeoff (QTO / ITO)”', 'Somma le quantità già scritte nell’IFC. Nessuna regola di takeoff'],
            ['Senza internet', 'Security+: “Fully offline operation (no telemetry)”', 'La pagina viene caricata da internet; il file non viene caricato. Esiste un’[installazione on-premise](onprem)'],
          ],
          after: [
            'Scegli Solibri quando coordini più discipline e ti serve una vera clash detection, quando la tua organizzazione scrive le proprie regole, o quando la verifica va governata su molti progetti. Niente in questa pagina fa queste cose.',
            'Scegli IFC Viewer Online quando vuoi sapere oggi se un IFC è pronto per essere inviato: identificatori, struttura, nomi, proprietà, i tuoi IDS. È anche lo strumento per le persone che ruotano attorno a un team Solibri e non hanno una licenza: l’architetto che esporta il modello, il committente che lo riceve.',
            'Molti team li useranno entrambi: un controllo rapido nel browser prima dell’esportazione, e Solibri per il coordinamento.',
          ],
          sources: ['solibriPricing', 'solibriStarter', 'solibriEssential', 'solibriAdvanced'],
        },
        {
          kind: 'text', label: 'Solibri oggi', h2: 'Se stai cercando Solibri Office o Solibri Anywhere',
          ps: [
            'Il sito di Solibri elenca Solibri Office, CheckPoint, Anywhere e Site come prodotti legacy che sono “no longer available for new customers”. I piani attuali sono Starter, Essential, Advanced, Premium e Security+.',
            'La versione gratuita di Solibri Anywhere funziona ancora per chi ce l’ha già, sulle versioni precedenti alla 26.4.0; Solibri dice che il diritto d’uso gratuito non è disponibile nelle release più recenti. Se usavi Anywhere per aprire e guardare file IFC, il [visualizzatore](viewer) lo fa gratis, nel browser, su qualsiasi sistema operativo.',
          ],
          sources: ['solibriLegacy', 'solibriPricing'],
        },
        {
          kind: 'cols', label: 'Ambito', h2: 'Che cosa ottieni qui, e che cosa no',
          cols: [
            { h: 'Ottieni', items: [
              'Un Health Score da 0 a 100 e le correzioni che recuperano più punti.',
              'Gli elementi non conformi evidenziati nel modello 3D, ed elencati per regola, piano o classe.',
              'Verifiche IDS 1.0 e cinque profili di validazione integrati, dalla consegna di base a ISO 19650 e LOD 300.',
              'Correzioni automatiche per GlobalId e nomi, modifiche manuali di nomi e valori di proprietà, e l’IFC corretto.',
              'I risultati come BCF 2.1, CSV, JSON, un report HTML o un foglio di calcolo COBie.',
            ] },
            { h: 'Non ottieni', items: [
              'Clash detection tra modelli, né al livello della geometria reale.',
              'Un editor di regole, il code checking (accessibilità, antincendio, vie di esodo) o l’analisi degli spazi.',
              'Gestione delle issue con assegnazioni su un server. I file BCF si scambiano a mano.',
              'File da 2 GB in su. Il limite dipende dalla memoria del tuo computer.',
            ] },
          ],
        },
        { kind: 'shot', label: 'Provalo', h2: 'Eseguilo su un modello di esempio', sub: 'La demo qui sotto carica il validatore in questa pagina.' },
        {
          kind: 'text', label: 'Prezzo', h2: 'Quanto costa',
          ps: [
            'Il visualizzatore, le regole, l’IDS, le correzioni e le esportazioni sono gratuiti, senza account, anche per progetti commerciali. Il codice sorgente è pubblico con licenza MIT su [GitHub](github).',
            'I piani a pagamento (Pro a 19 € al mese, Team a 35 € per editor al mese) aggiungeranno ciò che richiede un server; non sono ancora in vendita. Vedi la [pagina dei prezzi](pricing).',
          ],
        },
      ],
      faq: [
        ['IFC Viewer Online sostituisce Solibri?', 'Per verificare un IFC prima della consegna (identificatori, struttura spaziale, nomi, proprietà, IDS), sì. Per la clash detection tra discipline, le regole personalizzate e la governance su più progetti, no: per questo ci sono Solibri Essential e Advanced.'],
        ['Quanto costa Solibri?', 'Solibri pubblica prezzi di partenza per licenza all’anno: Starter 99 €, Essential 1.428 €, Advanced 2.109 € e Premium 2.772 €. Il prezzo di Security+ è su richiesta (solibri.com/pricing, letto il 2026-11-10).'],
        ['Esiste una versione gratuita di Solibri?', 'Solibri Anywhere, che aveva una versione gratuita, oggi è un prodotto legacy e non è disponibile per i nuovi clienti; chi lo usa già gratis può tenere le versioni precedenti alla 26.4.0 (solibri.com/products/legacy-products, letto il 2026-11-10). Il piano attuale più economico è Starter a 99 € all’anno.'],
        ['Il piano Starter da 99 € verifica i modelli?', 'Secondo Solibri, Starter serve all’ispezione visiva e a rivedere i risultati prodotti da altri: “Model checking is performed in Solibri Essential, Advanced, or Premium” (solibri.com/products/starter, letto il 2026-11-10).'],
        ['Che cosa fa Solibri che questo strumento non può fare?', 'Clash detection sulla geometria reale e tra modelli, regole scritte per la tua organizzazione, regole di quantity takeoff, modelli Revit nativi, server BCF e connessioni ai CDE, e un piano completamente offline. Vedi la tabella sopra.'],
        ['Posso usarli entrambi?', 'Sì, ed è una divisione frequente: autori e committenti controllano un file nel browser prima di inviarlo, e il team di coordinamento usa Solibri sul modello federato.'],
      ],
      faqSources: ['solibriPricing', 'solibriLegacy', 'solibriStarter'],
      bottom: ['Controlla un file prima di decidere', 'Richiede un minuto, non costa nulla e il modello resta sul tuo computer.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    webchecker: {
      title: 'Alternativa a Solibri WebChecker — Checker IFC Web Gratis',
      desc: 'Solibri WebChecker richiede un piano Advanced o Premium e carica l’IFC. Questa alternativa gratuita verifica il file nel browser. Cosa fa ciascuno, con fonti.',
      nav: 'Alternativa a Solibri WebChecker',
      kicker: 'Gratis · Senza piano Solibri · Il file non viene caricato',
      h1: ['Alternativa a Solibri WebChecker', 'che verifica l’IFC nel tuo browser'],
      lead: 'Solibri WebChecker (Beta) esegue online il motore di verifica di Solibri: carichi un IFC, viene verificato sul servizio di Solibri, e scarichi un PDF o un BCF. È incluso nei piani Advanced e Premium. Se ti serve una verifica via web senza un piano, o senza caricare il modello, questa pagina la fa nel tuo browser, con meno controlli.',
      cta: 'Valida un file IFC',
      cta2: 'oppure apri il modello di esempio',
      note: 'Senza account e senza token. Fino a 2 GB per file.',
      heroSources: ['solibriWebchecker'],
      shots: [
        { alt: 'Verifica IFC via web: l’elenco dei problemi raggruppati per regola con il numero di elementi non conformi, nel pannello di validazione del visualizzatore nel browser', cap: 'I risultati di una verifica, raggruppati per regola. Per produrli non è stato caricato nulla.' },
        { alt: 'Esportazione di una verifica IFC dal browser con i formati BCF, CSV, JSON, report di consegna e COBie', cap: 'I risultati escono come BCF 2.1, CSV, JSON, un report HTML o un foglio di calcolo COBie. Non c’è un file PDF; il report HTML si stampa dal browser.' },
      ],
      sections: [
        {
          kind: 'table', label: 'Confronto', h2: 'Solibri WebChecker e IFC Viewer Online',
          sub: 'La colonna di WebChecker è presa dalla pagina di Solibri.',
          head: ['', 'Solibri WebChecker (Beta)', 'IFC Viewer Online'],
          rows: [
            ['Accesso', 'Incluso in Solibri Advanced (da 2.109 € all’anno) e Premium (da 2.772 €). Non in Starter, Essential o Security+, e “not a standalone product”. Richiede un Solibri ID', 'Apri la pagina. Senza account'],
            ['Costo per verifica', '50 token. Advanced include 1.750 token all’anno (circa 35 verifiche), Premium 17.500 (circa 350). Token aggiuntivi: 5.000 per 250 €, 10.000 per 450 €, 25.000 per 750 €', 'Gratis, per qualsiasi numero di verifiche'],
            ['Dove va il modello', 'Caricato. Residenza dei dati nell’UE o negli Stati Uniti, scelta alla configurazione del progetto', 'Resta nella scheda del tuo browser'],
            ['Conservazione dei risultati', '30 giorni', 'Finché non chiudi la scheda; esporta ciò che ti serve'],
            ['Dimensione del file', 'Fino a 5 GB per file IFC', 'Meno di 2 GB, e meno ancora su un computer con poca memoria'],
            ['Controlli', 'Controllo Model Health (struttura e classificazione, denominazione e identificatori, proprietà chiave tramite controlli basati su IDS, hard clash geometrici tra discipline), oppure un set di regole .cset personalizzato creato nell’applicazione desktop', '44 regole fisse e file IDS 1.0. Clash solo per bounding box all’interno di un modello'],
            ['Risultati', 'PDF e BCF (1.0, 2.0, 2.1 o 3.0); file SMC per gli utenti Premium', 'BCF 2.1, CSV, JSON, report HTML, foglio di calcolo COBie'],
          ],
          after: [
            'WebChecker è lo strumento migliore quando il tuo team BIM mantiene già set di regole Solibri e vuole che i partecipanti al progetto eseguano esattamente quelli, quando i file superano i 2 GB, o quando nel report ti servono gli hard clash tra discipline.',
            'Questa pagina è lo strumento migliore quando non hai un piano Advanced o Premium, quando il modello non può essere caricato, o quando verifichi spesso e non vuoi contare i token.',
          ],
          sources: ['solibriWebchecker', 'solibriPricing'],
        },
        {
          kind: 'cols', label: 'Ambito', h2: 'Che cosa copre questa verifica, e che cosa no',
          cols: [
            { h: 'Controlla', items: [
              'Identificatori, struttura spaziale, piani, nomi, valori di proprietà, tipi e materiali: 44 regole, 25 attive per impostazione predefinita.',
              'File IDS 1.0 con i loro sei facet.',
              'Cinque profili di validazione integrati, oppure i tuoi schemi di denominazione e property set obbligatori.',
            ] },
            { h: 'Non controlla', items: [
              'I set di regole di Solibri. Un file .cset qui non si può caricare.',
              'Hard clash tra discipline, regole di accessibilità o analisi degli spazi.',
              'File da 2 GB in su.',
            ] },
          ],
          sources: ['solibriWebchecker'],
        },
        {
          kind: 'text', label: 'Il tuo file', h2: 'Che cosa succede al file',
          ps: [
            'L’IFC viene letto da codice che gira nella scheda del tuo browser e non viene caricato. Il browser conserva una copia convertita della geometria nel suo spazio di archiviazione privato sul tuo computer (fino a 4 GB) per riaprirlo più in fretta; cancellando i dati del sito la rimuovi.',
            'Le statistiche d’uso senza cookie registrano la dimensione del file e il numero di elementi, mai il contenuto, e si possono disattivare. Un link di condivisione, se ne crei uno, contiene il punteggio, il nome del file e fino a 50 problemi dentro l’URL.',
          ],
        },
        { kind: 'shot', label: 'Provalo', h2: 'Esegui una verifica su un modello di esempio', sub: 'La demo qui sotto carica il validatore in questa pagina.' },
        {
          kind: 'text', label: 'Prezzo', h2: 'Quanto costa',
          ps: [
            'Niente, e non ci sono token. Il visualizzatore, le regole, l’IDS e le esportazioni sono gratuiti e senza account. Il codice è pubblico con licenza MIT su [GitHub](github).',
            'I piani a pagamento che aggiungono un server sono descritti nella [pagina dei prezzi](pricing) e non sono ancora in vendita. Gli altri piani e prezzi sono messi a confronto in [una pagina a parte](solibri).',
          ],
        },
      ],
      faq: [
        ['Che cos’è Solibri WebChecker?', 'Con le parole di Solibri, “a browser-based model validation service that runs Solibri\'s rules-based checking engine online”. Gli utenti caricano modelli IFC, eseguono il controllo Model Health o un set di regole personalizzato, ed esportano PDF o BCF (solibri.com/solutions/webchecker, letto il 2026-11-10).'],
        ['Solibri WebChecker è gratuito?', 'No. È incluso in Solibri Advanced e Premium e non viene venduto separatamente. Ogni verifica consuma 50 token dalla dotazione annuale del piano o da pacchetti di token che partono da 250 € per 5.000 token (solibri.com/solutions/webchecker, letto il 2026-11-10).'],
        ['WebChecker carica il mio modello?', 'Sì: Solibri lo descrive come un servizio in cui gli utenti caricano modelli IFC, con i dati conservati nell’UE o negli Stati Uniti e i risultati tenuti per 30 giorni (solibri.com/solutions/webchecker, letto il 2026-11-10). IFC Viewer Online invece legge il file nel tuo browser.'],
        ['Posso eseguire qui i miei set di regole Solibri?', 'No. I set di regole Solibri (.cset) girano soltanto in Solibri. I requisiti che si possono scrivere come IDS 1.0 si possono verificare qui.'],
        ['Quale dei due trova più problemi?', 'Cercano cose diverse. Il controllo Model Health di WebChecker include gli hard clash tra discipline, che questa pagina non fa. Questa pagina dà un punteggio e correzioni automatiche per identificatori e nomi. Per il coordinamento, usa Solibri.'],
      ],
      faqSources: ['solibriWebchecker'],
      bottom: ['Esegui una verifica via web adesso', 'Senza piano, senza token, senza caricamento.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    mac: {
      title: 'Visualizzatore IFC per Mac — Gratis, funziona in Safari',
      desc: 'Apri file IFC su Mac in Safari, Chrome o Firefox: vista 3D, proprietà, sezioni, misure e validazione. Niente da installare, senza account, gratis.',
      nav: 'Visualizzatore IFC per Mac',
      kicker: 'macOS · Safari, Chrome, Firefox, Edge · Niente da installare · Gratis',
      h1: ['Visualizzatore IFC per Mac', 'che gira nel browser che hai già'],
      lead: 'Non c’è un’app da scaricare: il visualizzatore è una pagina web. Aprila in Safari o Chrome su macOS, trascina un file IFC e ottieni il modello 3D, l’albero spaziale, le proprietà di ogni elemento, sezioni, misure e un report di validazione. Il file non viene caricato.',
      cta: 'Apri il visualizzatore',
      cta2: 'oppure apri il modello di esempio',
      note: 'Senza account. IFC2x3, IFC4, IFC4x1 e IFC4x3, fino a 2 GB per file.',
      shots: [
        { alt: 'Visualizzatore IFC in una finestra del browser da 1440 per 900, la dimensione dello schermo di un MacBook: una casa a due piani in 3D, l’albero spaziale a sinistra e gli attributi IFC e i property set di un muro selezionato a destra', cap: 'Il visualizzatore in una finestra da 1440 × 900, la dimensione predefinita dello schermo di un MacBook Air (cattura fatta in Chrome). A destra, gli attributi e i property set del muro selezionato.' },
        { alt: 'Piano di sezione che taglia un modello IFC di una casa nel visualizzatore nel browser, con gli arredi interni visibili, in una finestra da 1440 per 900', cap: 'Un piano di sezione attraverso lo stesso modello, spostato con il cursore o trascinandolo nella vista. Non serve nessun plug-in.' },
      ],
      sections: [
        {
          kind: 'cols', label: 'Su Mac', h2: 'Che cosa funziona su macOS, e che cosa aspettarsi',
          cols: [
            { h: 'Funziona', items: [
              'In Safari, Chrome, Firefox ed Edge su macOS. La pagina richiede WebGL e WebAssembly, che questi browser includono.',
              'L’apertura di file .ifc e di archivi .ifczip o .zip, trascinandoli nella finestra o con il pulsante Apri.',
              'Più modelli insieme, ciascuno con il suo albero e le sue proprietà.',
              'Anche su iPad o iPhone, con file più piccoli.',
            ] },
            { h: 'Tieni presente', items: [
              'Non è un’applicazione macOS: niente icona nel Dock, niente anteprima Quick Look, e i file .ifc non si aprono con un doppio clic.',
              'La pagina deve essere caricata da internet. Non funziona offline.',
              'Il limite di dimensione del file è 2 GB, e in pratica la memoria del Mac: compare un avviso da 1 GB, oppure da 80 MB sulle macchine con 4 GB di memoria o meno e su iPad e iPhone.',
              'Le catture di questa pagina sono state fatte in Chrome. Se in Safari qualcosa non si vede bene, prova Chrome.',
            ] },
          ],
        },
        {
          kind: 'cols', label: 'Strumenti', h2: 'Che cosa puoi fare con un modello',
          cols: [
            { h: 'Guardare', items: [
              'Orbita, panoramica e zoom; nascondi e isola elementi; esplora l’albero spaziale.',
              'Piani di sezione e piante 2D tagliate dal modello, esportate in DXF, SVG o PDF.',
              'Misura distanze, aree, angoli e luci libere.',
              'Leggi tutti i property set e le quantità scritte nel file.',
            ] },
            { h: 'Verificare e correggere', items: [
              'Una validazione con 44 regole e un Health Score da 0 a 100; vedi il [validatore IFC](validator).',
              'Verifiche IDS 1.0 rispetto ai tuoi requisiti.',
              'Modifica nomi e valori di proprietà, correggi i GlobalId ed esporta l’IFC corretto o un GLB.',
              'Apri e scrivi file BCF 2.1 e 3.0.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Confronto', h2: 'Altri modi per aprire un IFC su Mac',
          sub: 'Flinker è l’altro visualizzatore gratuito nel browser di cui ci chiedono. La sua colonna dice ciò che Flinker pubblica.',
          head: ['', 'Flinker', 'IFC Viewer Online'],
          rows: [
            ['Che cos’è', '“The IFC viewer for Microsoft”: SharePoint, Teams, Excel, Power BI, Windows e il browser', 'Un visualizzatore, validatore ed editor in una pagina web'],
            ['Su Mac', 'Il visualizzatore nel browser. L’app desktop è per Windows; il sito non menziona macOS', 'Qualsiasi browser aggiornato su macOS'],
            ['Per iniziare', '“Open a model without creating an account”', 'Senza account'],
            ['Formati', 'IFC 2x3, 4 e 4x3; BCF 2.1 e 3.0; IDS 1.0; DXF; sovrapposizione di PDF', 'IFC2x3, IFC4, IFC4x1 e IFC4x3; BCF 2.1 e 3.0; IDS 1.0'],
            ['Il file', 'Analizzato nel browser; resta sul dispositivo o nello spazio di archiviazione Microsoft che scegli', 'Letto nel browser; non viene caricato'],
            ['Verifica', 'Verifiche dei requisiti IDS con evidenziazione di superato e non superato', '44 regole con un Health Score, più IDS'],
            ['Prezzo', 'Community: gratis. Enterprise: prezzo per installazione', 'Gratis'],
          ],
          after: [
            'Scegli Flinker quando i tuoi progetti vivono già in SharePoint e Teams: aprire il modello accanto ai documenti è ciò per cui è fatto, e questo visualizzatore non si collega a Microsoft 365.',
            'Scegli IFC Viewer Online quando vuoi anche sapere se il modello è fatto bene: la validazione, il punteggio e le correzioni sono la differenza.',
            'Su Solibri: le pagine di prodotto che abbiamo letto lo stesso giorno non dichiarano su quali sistemi operativi girano i suoi piani, quindi non lo diciamo. Controlla i requisiti di sistema di Solibri prima di acquistarlo per un Mac.',
          ],
          sources: ['flinkerViewer', 'solibriPricing'],
        },
        { kind: 'shot', label: 'Provalo', h2: 'Apri il modello di esempio', sub: 'La demo qui sotto gira in questa pagina, nel browser che stai usando adesso.' },
        {
          kind: 'text', label: 'Prezzo', h2: 'Quanto costa',
          ps: [
            'Niente. Non c’è una licenza, non c’è un periodo di prova e non c’è un account. Il codice è pubblico con licenza MIT su [GitHub](github). I piani a pagamento che aggiungono un server sono nella [pagina dei prezzi](pricing) e non sono ancora in vendita.',
          ],
        },
      ],
      faq: [
        ['Esiste un visualizzatore IFC per Mac che non richiede installazione?', 'Sì: questo è una pagina web. Aprila in Safari, Chrome, Firefox o Edge su macOS e trascina il file. Non c’è nulla da scaricare o installare.'],
        ['Funziona in Safari?', 'Sì. Richiede WebGL e WebAssembly, che le versioni attuali di Safari includono. Le catture di questa pagina sono state fatte in Chrome, quindi prova Chrome se un modello non si visualizza bene.'],
        ['L’IFC viene caricato quando lo apro?', 'No. Il file viene letto da codice che gira nella scheda del browser. Dal browser escono solo le statistiche d’uso anonime (dimensione del file e numero di elementi), e si possono disattivare.'],
        ['Posso aprire file di Revit o Archicad?', 'No, solo IFC. Esporta prima un IFC dal software di authoring.'],
        ['Funziona offline su Mac?', 'No. La pagina deve essere caricata da internet ogni volta, anche se il modello in sé non viene mai inviato.'],
        ['Flinker è disponibile per Mac?', 'Il visualizzatore di Flinker gira nel browser, quindi su Mac si può usare così; la sua app desktop è pubblicata per Windows e il suo sito non menziona macOS (flinker.app/products/ifc-viewer, letto il 2026-11-10).'],
      ],
      faqSources: ['flinkerViewer'],
      bottom: ['Apri un IFC sul tuo Mac', 'Nel browser, gratis, senza nulla da installare.'],
    },
  },
}
