// Italian copy of the two solution pages. Source: copy-en.ts.
// Rules for translators: scripts/seo/solution-landings/TRANSLATING.md.
import type { LangCopy } from './types'

export const copy: LangCopy = {
  ui: {
    home: 'IFC Viewer Online',
    sources: 'Fonti',
    readOn: 'consultato il',
    preview: 'Anteprima',
    faqLabel: 'FAQ',
    faqTitle: 'Le domande di chi acquista',
    related: 'Da leggere',
    pricing: 'Piani e prezzi',
    postReception: 'Controllare i modelli IFC dei subappaltatori',
    postClash: 'Clash detection nel browser',
    postBatch: 'Validare molti file IFC in una volta',
  },
  pages: {
    contractors: {
      title: 'Ricezione modelli IFC per imprese e promotori',
      desc: 'I subappaltatori verificano gratis il loro IFC sui tuoi requisiti prima dell’invio; tu rivedi solo ciò che passa. Piano Reception in anteprima.',
      nav: 'Per le imprese',
      kicker: 'Per imprese di costruzione e promotori · Piano Reception · Anteprima',
      h1: ['Ricevi solo modelli IFC già conformi', 'per imprese di costruzione e promotori che ricevono modelli dai subappaltatori'],
      lead: 'Pubblica i tuoi requisiti come un unico link. Ogni subappaltatore ci verifica il proprio modello gratis, nel browser, e lo corregge prima dell’invio. Vedi chi ha consegnato, cosa passa e perché il resto torna indietro, con un report pronto per il committente.',
      cta: 'Parla con noi',
      cta2: 'Come funziona la revisione',
      note: 'Anteprima: il piano Reception è progettato e mostrato qui con dati di esempio. Non è ancora in vendita e nulla viene salvato. Verificare un modello è gratuito e funziona già oggi.',
      hero: {
        alt: 'Panoramica Reception di un progetto residenziale con dati di esempio: azioni di oggi, ore ed euro risparmiati stimati e fornitori per milestone',
        cap: 'Il cantiere a colpo d’occhio, con dati di esempio: cosa rivedere oggi, risparmi stimati con le relative ipotesi e ogni fornitore per milestone. Interfaccia in spagnolo.',
      },
      sections: [
        {
          kind: 'text', label: 'Il problema', h2: 'I modelli sbagliati li scopre chi li riceve',
          ps: [
            'Secondo la ISO 19650-2, la revisione e l’accettazione del modello informativo spettano alla parte incaricante: l’impresa o il promotore che lo riceve. La guida dello UK BIM Framework descrive questa verifica come parte del flusso di lavoro dell’ambiente di condivisione dati.',
            'Skanska UK afferma che i suoi obiettivi dipendono "critically" (in modo critico) dal ricevere informazioni di qualità dalla propria filiera. I BIM manager delle imprese descrivono notevoli difficoltà a far scendere e risalire le informazioni lungo la filiera via e-mail e FTP.',
            'In pratica un coordinatore apre ogni consegna, trova le stesse proprietà mancanti e gli stessi nomi errati, scrive le motivazioni a mano e aspetta la versione successiva. Il subappaltatore scopre le regole solo dopo essere stato respinto.',
          ],
          sources: ['ukbimPartC', 'skanska', 'cmTier2'],
        },
        {
          kind: 'flow', label: 'Come funziona', h2: 'Dai tuoi requisiti al report per il committente',
          sub: 'Tutte le schermate qui sotto mostrano il design di Reception con dati di esempio (progetto "Mirador del Turia", dieci fornitori). L’interfaccia è in spagnolo.',
          steps: [
            { h: 'Pubblica i requisiti come link', p: 'Regole, IDS e punteggio minimo per stato ISO 19650. I subappaltatori ricevono la versione approvata; un link precedente continua a funzionare.', alt: 'Libreria di regole con un cambio di versione, il suo effetto sullo stesso modello e un pulsante per creare il link per i subappaltatori', cap: 'Cosa cambia tra versioni delle regole e il link che va ai subappaltatori.' },
            { h: 'I subappaltatori verificano gratis prima dell’invio', p: 'Senza account. Vedono il punteggio, cosa non passa, gli elementi coinvolti e la [guida di correzione](fix) di ogni regola, così la maggior parte degli errori è corretta prima di arrivare a te.', alt: 'Pagina fornitore senza account con un punteggio di 84, un nome file errato e un elenco di cosa correggere', cap: 'La pagina che vede un subappaltatore: cosa passa, cosa non passa e come rinominare il file.' },
            { h: 'Rivedi una coda, non una casella di posta', p: 'Le consegne arrivano già verificate, con il nome del file letto secondo la ISO 19650 e un confronto prima-dopo con la versione precedente. Le scorciatoie da tastiera ti guidano lungo la coda.', alt: 'Finestra di revisione con quattro versioni di una consegna, il nome file ISO 19650 diviso in campi e il punteggio dei requisiti', cap: 'Una consegna: le sue versioni, il nome file campo per campo e i suoi requisiti.' },
            { h: 'Restituiscila con motivazioni utili al fornitore', p: 'Ogni motivazione rimanda agli elementi in 3D e a come correggerli. Tutto viene registrato con hash concatenato ed esportato in CSV.', alt: 'Decisione di restituire una consegna con le motivazioni non superate spuntate e gli elementi elencati', cap: 'Restituire un modello: le motivazioni, gli elementi e una nota per il fornitore.' },
            { h: 'Segui le interferenze tra discipline nel tempo', p: 'Clash detection nel browser, ordinata per costo stimato, con l’andamento tra un’analisi e l’altra.', alt: 'Pannello delle interferenze con l’andamento tra analisi e le interferenze ordinate per costo stimato', cap: 'Interferenze con andamento e costo stimato (hotel di esempio federato).' },
            { h: 'Tieni informato il committente senza scrivere nulla', p: 'Una pagina di progetto con l’ultimo punteggio, le consegne accettate, le interferenze risolte e la prossima milestone. L’invio è simulato nell’anteprima.', alt: 'Pagina di progetto per il committente con l’Health Score del modello, le interferenze risolte e la cronologia', cap: 'Cosa vede il committente aprendo il link di aggiornamento.' },
            { h: 'Invia il report settimanale alla direzione di cantiere', p: 'Ricevuto, superato, mancante e il tempo risparmiato stimato, già scritto da copiare o scaricare.', alt: 'Report settimanale delle consegne per la direzione di cantiere con un riepilogo per fornitore', cap: 'Il report settimanale, generato dalle consegne.' },
          ],
        },
        {
          kind: 'table', label: 'Risparmio stimato', h2: 'Circa 22 ore al mese di un coordinatore, secondo le nostre ipotesi',
          sub: 'Una stima, non una misura. Sostituisci i numeri con i tuoi: la panoramica di Reception permette di modificare ogni ipotesi.',
          head: ['Attività', 'Ipotesi', 'Quota risparmiata (ipotizzata)', 'Minuti al mese'],
          rows: [
            ['Rivedere le consegne a mano', '40 consegne × 25 min', '80 %', '800'],
            ['Preparare la riunione di coordinamento', '4 riunioni × 90 min', '70 %', '252'],
            ['Scrivere il report per il committente', '8 report × 45 min', '80 %', '288'],
            ['Totale', '', '', '1.340 min ≈ 22 h'],
          ],
          after: [
            'A 45 € l’ora sono circa 1.000 € al mese. Il piano Reception è previsto da 290 € per progetto al mese, quindi secondo queste ipotesi si ripaga circa tre volte. Rilavorazioni e penali evitate non sono conteggiate.',
          ],
        },
        {
          kind: 'table', label: 'Confronto', h2: 'Accanto a un ambiente di condivisione dati',
          sub: 'Ogni colonna di un fornitore riporta solo ciò che diceva la sua pagina il giorno in cui l’abbiamo letta. Dove una pagina non dice nulla, la cella lo indica.',
          head: ['', 'Catenda Hub', 'Dalux Box', 'Autodesk Construction Cloud', 'IFC Viewer Online Reception (anteprima)'],
          rows: [
            ['Prezzo pubblicato', 'Per progetto, in base al valore dell’opera: circa 400 € al mese per un progetto da 10 M€, circa 1.100 € per 50 M€; preventivo su richiesta', 'Nessuno nella pagina del prodotto; modulo di contatto', 'Nessuno; preventivo per bundle, con prezzi per utente, progetto e account', 'Previsto: da 290 € per progetto al mese con 15 fornitori, o 790 € illimitato. Non ancora in vendita'],
            ['Licenza necessaria per i fornitori', 'No: "Your subs don\'t need a licence to log a defect" (i tuoi subappaltatori non hanno bisogno di licenza per segnalare un difetto)', 'Non indicato nella pagina', 'Non indicato nella pagina', 'Senza account: verificano gratis nel browser'],
            ['Verifica dei modelli rispetto ai requisiti', 'Non indicato nella pagina dei prezzi', 'Sì: validare dati e geometria del modello rispetto ai requisiti di progetto', 'Il bundle Model Management elenca preparazione dei modelli, coordinamento e clash detection', 'Regole e IDS 1.0 con un punteggio per consegna. La verifica è gratuita oggi; la casella di ricezione è in anteprima'],
            ['Approvazione dei modelli ricevuti', 'Non indicato nella pagina dei prezzi', 'Flussi di approvazione e una convenzione di denominazione dei file vincolante', 'Non indicato nella pagina dei prezzi', 'Accettare o restituire con motivazioni ed elementi 3D (anteprima)'],
          ],
          after: [
            'Non sostituisce il tuo CDE. Si colloca prima: qualunque CDE usi, il modello arriva già verificato sui tuoi requisiti, e il fornitore li conosceva prima dell’invio.',
          ],
          sources: ['catenda', 'dalux', 'acc'],
        },
        {
          kind: 'cols', label: 'Gratis e anteprima', h2: 'Cosa funziona oggi e cosa è in anteprima',
          cols: [
            { h: 'Gratis, disponibile oggi', items: ['Aprire e verificare qualsiasi IFC nel browser, senza caricare nulla', 'I tuoi file IDS 1.0 e 44 regole con Health Score', 'Importazione ed esportazione BCF, confronto tra versioni', 'Le [guide di correzione](fix) di ogni regola'] },
            { h: 'Piano Reception, in anteprima', items: ['Link dei requisiti con versioni per stato ISO 19650', 'Coda delle consegne con accettazione o restituzione motivata', 'Scheda fornitore e registro con hash concatenato', 'Pagina per il committente e report settimanale'] },
          ],
        },
      ],
      faq: [
        ['Posso usare Reception oggi?', 'Non ancora. È progettato e mostrato con dati di esempio. Se ricevi modelli dai subappaltatori, [parla con noi](pricing): cerchiamo alcuni progetti pilota. Verificare un modello sui tuoi requisiti è gratuito e funziona oggi nel [visualizzatore](viewer).'],
        ['I subappaltatori pagano o hanno bisogno di un account?', 'No. Aprono il tuo link e verificano il loro modello gratis nel browser. Paga chi riceve e gestisce le consegne.'],
        ['Sostituisce Catenda, Dalux o Autodesk Construction Cloud?', 'No. Verifica il modello prima che arrivi al tuo CDE e funziona con qualunque CDE usi. Ogni CDE ha il proprio flusso; vedi il confronto qui sopra con la data in cui abbiamo letto le loro pagine.'],
        ['Il modello viene caricato per verificarlo?', 'Per la verifica gratuita no: avviene nel browser del subappaltatore. In Reception, la consegna che accetti viene archiviata per te nell’UE.'],
        ['Quanto costerà?', 'È previsto da 290 € per progetto al mese con 15 fornitori, o 790 € per progetti illimitati. I prezzi possono cambiare prima del lancio; vedi i [piani](pricing).'],
        ['Da dove viene la cifra del risparmio?', 'Dalle ipotesi nella tabella qui sopra: numero di consegne, minuti per attività e quota risparmiata per ciascuna. Sono ipotesi, non misure, e puoi modificarle nella panoramica.'],
      ],
      faqSources: ['catenda', 'dalux', 'acc'],
      bottom: ['Ricevi modelli dai subappaltatori?', 'Dicci quanti progetti e fornitori hai. Stiamo scegliendo alcuni progetti pilota per Reception.'],
    },
    engineering: {
      title: 'Coordinamento BIM per studi di ingegneria — piano Team',
      desc: 'Modelli accettati al primo invio: regole condivise, clash detection, segnalazioni con correzione e blocco di pubblicazione. Piano Team in anteprima.',
      nav: 'Per gli studi di ingegneria',
      kicker: 'Per studi di ingegneria e studi di progettazione · Piano Team · Anteprima',
      h1: ['Consegna modelli che il committente accetta al primo invio', 'per studi di ingegneria e di progettazione che coordinano più discipline'],
      lead: 'Un unico insieme di regole aziendali, clash detection nel browser, segnalazioni con vista della camera e correzione suggerita, e un blocco che impedisce di pubblicare un modello sotto il tuo punteggio minimo. Il committente vede l’avanzamento senza che tu debba scriverlo.',
      cta: 'Iscriviti alla lista d’attesa Team',
      cta2: 'La clash detection nel browser',
      note: 'Anteprima: il piano Team è progettato e mostrato qui con dati di esempio. Non è ancora in vendita e nulla viene salvato. Verificare un modello con il tuo IDS è gratuito e funziona già oggi.',
      hero: {
        alt: 'Dashboard Team con dati di esempio: Health Score per progetto e relativo andamento, segnalazioni aperte per persona e scadenze a rischio',
        cap: 'La dashboard del team, con dati di esempio: salute di ogni progetto, carico per persona e scadenze a rischio. Interfaccia in spagnolo.',
      },
      sections: [
        {
          kind: 'text', label: 'Il problema', h2: 'I rifiuti nascono da dettagli che nessuno ha controllato',
          ps: [
            'Oggi i committenti inviano i propri requisiti informativi, spesso come IDS. Una consegna a cui manca un nome di proprietà o una classificazione torna indietro, e la correzione costa più di quanto sarebbe costata la verifica.',
            'Un consulente BIM descrive un problema di validazione dei dati IFC costato settimane, dovuto a nomi di proprietà che non corrispondevano a quanto richiesto. La ISO 19650-2 fa della verifica prima della condivisione un passaggio del gruppo di consegna, non del committente.',
            'In uno studio le regole vivono nella testa o nel foglio di calcolo di una persona, le interferenze si esaminano in riunione e le segnalazioni finiscono in catene di e-mail senza la vista che le spiega.',
          ],
          sources: ['bimCorner', 'ukbimPartC'],
        },
        {
          kind: 'flow', label: 'Come funziona', h2: 'Dalle regole aziendali al modello pubblicato',
          sub: 'Tutte le schermate qui sotto mostrano il design di Team con dati di esempio. L’interfaccia è in spagnolo.',
          steps: [
            { h: 'Scrivi le regole una volta, come frasi', p: 'Classe, condizione, requisito e gravità, compresa la geometria (spazio libero davanti alle porte, altezza netta) e le relazioni (porta in un muro). Ogni regola è IDS 1.0.', alt: 'Editor di regole con regole geometriche e di relazione, risultati sul modello di esempio e una segnalazione creata con la sua correzione', cap: 'Regole geometriche e di relazione verificate su un modello di esempio.' },
            { h: 'Gestiscile come studio', p: 'Una libreria condivisa con versioni, autore, revisione e approvazione (l’autore non approva la propria regola), commenti ed esportazione in IDS.', alt: 'Libreria di regole aziendale con una versione in revisione, le modifiche da v2 a v3 e commenti', cap: 'Un insieme di regole in revisione: cosa è cambiato, chi lo approva e la cronologia.' },
            { h: 'Esegui la clash detection nel browser', p: 'Interferenze fisiche e di tolleranza tra discipline, raggruppate, con regole per ignorare ciò che è accettato e un costo stimato per ciascuna.', alt: 'Pannello delle interferenze su un modello di torre con regole di esclusione che nascondono le interferenze accettate', cap: 'Regole di esclusione su un modello di torre: 1.569 risultati su 4.827 nascosti.' },
            { h: 'Trasforma ogni errore in una segnalazione con correzione', p: 'Assegnata, con scadenza, la camera salvata e una correzione suggerita per software di authoring, dalle nostre guide di correzione. Gli ospiti commentano gratis; BCF in entrata e in uscita.', alt: 'Segnalazione con una correzione suggerita per diversi software di authoring, responsabile, scadenza e commenti', cap: 'Una segnalazione con correzione suggerita, responsabile e scadenza.' },
            { h: 'Ferma un modello debole prima della pubblicazione', p: 'Nulla arriva allo stato Pubblicato sotto il tuo punteggio minimo, con un revisore facoltativo e una cronologia di cosa è passato e perché.', alt: 'Blocco di pubblicazione con un punteggio minimo di 80 e la cronologia dei modelli pubblicati e trattenuti', cap: 'Il blocco di pubblicazione e la sua cronologia.' },
            { h: 'Tieni informato il committente', p: 'Aggiornamenti per fase costruiti dai dati in tempo reale: punteggio, consegne, segnalazioni e milestone. L’invio è simulato nell’anteprima.', alt: 'Schermata di aggiornamento per il committente con la scelta di fase, modello e destinatari', cap: 'Un aggiornamento per il committente per fase di progetto.' },
          ],
        },
        {
          kind: 'table', label: 'Risparmio stimato', h2: 'Circa 17 ore al mese, secondo le nostre ipotesi',
          sub: 'Una stima per un team di tre persone, non una misura. Sostituisci i numeri con i tuoi.',
          head: ['Attività', 'Ipotesi', 'Quota risparmiata (ipotizzata)', 'Minuti al mese'],
          rows: [
            ['Verificare le consegne prima dell’invio', '12 consegne × 60 min', '60 %', '432'],
            ['Preparare la riunione di coordinamento', '4 riunioni × 90 min', '70 %', '252'],
            ['Rilavorare le consegne restituite', '3 restituzioni × 120 min', '50 %', '180'],
            ['Scrivere gli aggiornamenti per il committente', '8 aggiornamenti × 30 min', '70 %', '168'],
            ['Totale', '', '', '1.032 min ≈ 17 h'],
          ],
          after: [
            'A 45 € l’ora sono circa 775 € al mese. Team è previsto a 59 € per editor al mese con fatturazione annuale, minimo tre editor (177 € al mese), quindi secondo queste ipotesi si ripaga circa quattro volte.',
          ],
        },
        {
          kind: 'table', label: 'Confronto', h2: 'Accanto ai consueti strumenti di coordinamento',
          sub: 'Ogni colonna di un fornitore riporta solo ciò che diceva la sua pagina il giorno in cui l’abbiamo letta.',
          head: ['', 'BIMcollab', 'Solibri', 'IFC Viewer Online Team (anteprima)'],
          rows: [
            ['Prezzo pubblicato', 'Basic 12,50 €, Advanced 18,75 €, Enterprise 25 € per utente al mese con fatturazione annuale', 'Per licenza all’anno: Essential 1.428 €, Advanced 2.109 €, Premium 2.772 €', 'Previsto: 59 € per editor al mese con fatturazione annuale, minimo tre editor. Non ancora in vendita'],
            ['Segnalazioni', 'Gestione delle segnalazioni basata su BCF con plug-in per gli strumenti BIM', 'Gestione delle segnalazioni BCF da Essential', 'Segnalazioni con camera, scadenza e correzione suggerita; BCF in entrata e in uscita (anteprima)'],
            ['Regole', 'Regole di clash e smart view condivise per l’uso in BIMcollab Zoom', 'Regole predefinite da Essential; regole personalizzate da Advanced; governance delle regole in Premium', 'Regole come frasi, IDS 1.0, libreria condivisa con approvazione (anteprima)'],
            ['Ospiti', 'Uno o due account ospite per utente pagante, a seconda del piano', 'Non indicato nella pagina dei prezzi', 'Gli ospiti commentano gratis'],
          ],
          after: [
            'Solibri è la scelta più forte per una verifica approfondita basata su regole sul desktop, BIMcollab per un ampio flusso di segnalazioni tra strumenti. Team è per gli studi che vogliono regole, interferenze, segnalazioni e aggiornamento al committente in un unico posto, nel browser.',
          ],
          sources: ['bimcollab', 'solibri'],
        },
        {
          kind: 'cols', label: 'Gratis e anteprima', h2: 'Cosa funziona oggi e cosa è in anteprima',
          cols: [
            { h: 'Gratis, disponibile oggi', items: ['Aprire e federare più file IFC nel browser', 'Verificare ogni modello con il tuo IDS 1.0 e 44 regole', 'Importazione ed esportazione BCF, confronto tra versioni', 'Le [guide di correzione](fix) di ogni regola'] },
            { h: 'Piano Team, in anteprima', items: ['Libreria di regole aziendale con approvazione', 'Clash detection tra discipline', 'Segnalazioni condivise con correzione suggerita, blocco di pubblicazione', 'Aggiornamenti per il committente per fase'] },
          ],
        },
      ],
      faq: [
        ['Posso usare Team oggi?', 'Non ancora. È progettato e mostrato con dati di esempio. [Iscriviti alla lista d’attesa](pricing) per sapere quando apre. Verificare un modello con il tuo IDS è gratuito e funziona oggi nel [visualizzatore](viewer).'],
        ['La clash detection è gratuita?', 'No. La clash detection tra discipline è un nuovo strumento e sarà a pagamento. Aprire, federare e verificare ogni modello resta gratuito. Di più nell’articolo sulla [clash detection nel browser](postClash).'],
        ['Possiamo usare l’IDS del nostro committente?', 'Sì, e questa parte è gratuita già oggi. In Team puoi anche importare un IDS nella libreria aziendale e conservarne le versioni.'],
        ['Sostituisce BIMcollab o Solibri?', 'Non per tutti i team. Vedi il confronto qui sopra, con i prezzi delle loro pagine e la data in cui le abbiamo lette.'],
        ['Quanto costerà?', 'È previsto a 59 € per editor al mese con fatturazione annuale, minimo tre editor; gli ospiti sono gratuiti. I prezzi possono cambiare prima del lancio; vedi i [piani](pricing).'],
        ['Possiamo verificare un’intera cartella di modelli?', 'Anche questo fa parte dell’anteprima a pagamento: leggi come funziona la [validazione in blocco](postBatch).'],
      ],
      faqSources: ['bimcollab', 'solibri'],
      bottom: ['Coordini più discipline?', 'Iscriviti alla lista d’attesa Team e dicci quanti editor hai. Ti scriveremo quando apre.'],
    },
  },
}
