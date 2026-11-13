import type { HelpCopy } from './types'

export const it: HelpCopy = {
  ui: {
    hub: 'Aiuto: ricevere consegne IFC',
    hubIntro: 'Guide brevi per l’area di lavoro a pagamento: configurare un progetto, preparare i fornitori, leggere un verdetto, collegare i vostri strumenti e come vengono conservati i vostri dati.',
    preview: 'Anteprima: queste funzioni non sono ancora aperte all’iscrizione. Le guide descrivono come funzionano oggi.',
    all: 'Tutte le guide',
    home: 'IFC Viewer Online',
    pricing: 'Piani',
  },
  topics: {
    setup: {
      title: 'Configurare un progetto',
      desc: 'Da un’area di lavoro vuota alla prima consegna verificata, in cinque passaggi.',
      sections: [
        ['1. Creare il progetto', 'Un progetto è un cantiere o un contratto. Assegnategli un nome, un codice breve (da 2 a 6 lettere maiuscole, usato all’inizio di ogni nome file) e il punteggio minimo che una consegna deve raggiungere. Potete modificare tutto in seguito.'],
        ['2. Definire i requisiti', 'Scegliete un modello (un profilo EIR) o caricate il vostro IDS. I fornitori vengono verificati rispetto a esso prima dell’invio, e di nuovo sul server quando il file arriva.'],
        ['3. Invitare i fornitori', 'Ogni fornitore riceve un proprio link di caricamento; non serve un account. Il link viene mostrato una sola volta: copiate il messaggio pronto e inviatelo dalla vostra e-mail.'],
        ['4. Collegare una cartella o un webhook', 'Le consegne possono arrivare anche da una cartella SharePoint o Drive monitorata, e ogni verdetto può essere inviato ai vostri strumenti tramite webhook. Entrambi sono facoltativi.'],
        ['5. Inviare una consegna di prova', 'L’elenco iniziale fa passare un piccolo IFC pubblico attraverso gli stessi controlli del file di un fornitore, così vedete un verdetto nella posta in arrivo prima che qualcuno consegni.'],
      ],
    },
    suppliers: {
      title: 'Preparare i fornitori',
      desc: 'Cosa vede un fornitore, cosa deve rispettare e cosa significa ogni errore.',
      sections: [
        ['Il loro link', 'Il link apre una pagina con i requisiti del progetto, la regola per i nomi dei file e la prossima scadenza. Chiunque abbia il link può consegnare a nome di quel fornitore, quindi non va condiviso. Se viene divulgato, createne uno nuovo dalla scheda del fornitore: quello vecchio smette subito di funzionare.'],
        ['Il controllo gratuito', 'Quando un fornitore sceglie un file, questo viene verificato nel suo browser: se è un IFC completo, la regola del nome e il punteggio. Vede cosa correggere, con una guida gratuita per ogni regola, prima che venga inviato qualcosa.'],
        ['Il nome del file', 'I nomi seguono la ISO 19650: codice del progetto, codice proprio del fornitore, volume, livello, tipo, ruolo, numero, stato (da S0 a S4) e revisione, per esempio `TNO-ESTRUC-ZZ-02-M3-S-0001-S2-P01.ifc`. Un nome che viola la regola viene rifiutato anche dal server.'],
        ['Quando qualcosa non va', 'Troppo grande: esportate senza elementi inutilizzati o dividete il modello. Non è un IFC: esportate di nuovo in IFC, un file nativo rinominato non funziona. Danneggiato: il file è stato troncato durante l’esportazione o il download, quindi esportatelo di nuovo. Troppi tentativi: attendete un minuto; non si perde nulla.'],
      ],
    },
    verdict: {
      title: 'Leggere un verdetto',
      desc: 'Lo stato del file, il verdetto automatico e la vostra revisione sono tre cose diverse.',
      sections: [
        ['Il file', 'Ogni consegna riceve prima uno stato del file: ok, danneggiato (troncato o non chiuso, mai valutato), non è un IFC, oppure non è il file dichiarato (il suo SHA-256 è diverso).'],
        ['Il verdetto automatico', 'Un file che si apre riceve un punteggio da 0 a 100 rispetto ai vostri requisiti. Pari o superiore al minimo del progetto viene accettato automaticamente; al di sotto, viene respinto con la motivazione. Questo verdetto è del server e viene conservato.'],
        ['La vostra revisione', 'Una persona può accettare o restituire qualsiasi consegna con una motivazione, e la decisione viene sigillata nel registro con l’impronta del file. Una consegna non può essere accettata prima di essere stata validata; restituirla prima resta possibile.'],
        ['Il registro', 'Ogni ricezione e decisione viene conservata in ordine, con chi l’ha fatta e quando. Esportatelo in qualsiasi momento dalla scheda del progetto, come ZIP (JSON e CSV) o JSON.'],
      ],
    },
    api: {
      title: 'API e webhook',
      desc: 'Consegne, verdetti ed eventi per i vostri strumenti.',
      sections: [
        ['Consegne', 'L’elenco delle consegne restituisce, per ciascuna, lo stato del file, il verdetto automatico (`auto`) e la revisione di una persona (`review`) in campi separati. `verdict` resta il valore effettivo per le integrazioni precedenti. Il contratto completo è descritto in OpenAPI.'],
        ['Webhook', 'Scegliete gli eventi (ricevuta, validata, accettata, restituita) e un indirizzo https. Ogni chiamata è firmata con HMAC-SHA256 su timestamp e corpo; il segreto viene mostrato una sola volta. Gli indirizzi su reti private vengono rifiutati.'],
        ['Cartelle monitorate', 'Una cartella SharePoint o Drive può consegnare per conto di un fornitore. Più file vengono gestiti contemporaneamente e il rapporto viene scritto accanto a ogni modello. Un file non riuscito per problemi di rete viene ritentato al controllo successivo.'],
        ['Limiti', 'Le pagine pubbliche consentono 60 richieste al minuto per indirizzo e l’API autenticata 600 al minuto per utente. Oltre, la risposta è un 429 con `Retry-After: 60`.'],
      ],
    },
    security: {
      title: 'Sicurezza e i vostri dati',
      desc: 'Come i dati di ogni azienda restano separati e come esportarli tutti.',
      sections: [
        ['Ogni azienda separata', 'Ogni query è filtrata per azienda, e anche il database stesso lo impone (sicurezza a livello di riga): un’azienda non legge né modifica mai i dati di un’altra, nemmeno chiedendo un id noto.'],
        ['Ruoli', 'Proprietari e amministratori gestiscono persone, link dei fornitori, webhook ed eliminazione dei progetti. Gli editor esaminano le consegne, i revisori commentano e i lettori consultano. Un fornitore vede sempre e solo le proprie consegne.'],
        ['Registro di audit', 'Invitare o revocare un fornitore, decisioni, link per i clienti, webhook, automazioni, ruoli, il logo, esportazioni ed eliminazioni lasciano ciascuno una riga con chi e quando.'],
        ['Portare via i dati', 'Dalla scheda del progetto, esportate tutto (consegne con entrambi i verdetti, il registro e le segnalazioni) oppure eliminate il progetto. L’eliminazione richiede di digitare il nome del progetto, rimuove anche i file e lascia solo una riga nel registro di audit.'],
      ],
    },
  },
}
