import type { HelpCopy } from './types'

export const ca: HelpCopy = {
  ui: {
    hub: 'Ajuda: recepció de lliuraments IFC',
    hubIntro: 'Guies breus de l’espai de treball de pagament: configurar un projecte, preparar els proveïdors, llegir un veredicte, connectar les vostres eines i com es guarden les vostres dades.',
    preview: 'Vista prèvia: aquestes funcions encara no estan obertes al registre. Les guies descriuen com funcionen avui.',
    all: 'Totes les guies',
    home: 'IFC Viewer Online',
    pricing: 'Plans',
  },
  topics: {
    setup: {
      title: 'Configurar un projecte',
      desc: 'D’un espai de treball buit al primer lliurament comprovat, en cinc passos.',
      sections: [
        ['1. Crear el projecte', 'Un projecte és una obra o un contracte. Doneu-li un nom, un codi curt (de 2 a 6 lletres majúscules, usat a l’inici de cada nom de fitxer) i la puntuació mínima que necessita un lliurament. Ho podeu canviar tot més endavant.'],
        ['2. Definir els requisits', 'Trieu una plantilla (un perfil EIR) o pugeu el vostre propi IDS. Els proveïdors es comproven amb ell abans d’enviar, i de nou al servidor quan arriba el fitxer.'],
        ['3. Convidar els proveïdors', 'Cada proveïdor rep el seu propi enllaç de pujada; no cal compte. L’enllaç es mostra una sola vegada: copieu el missatge preparat i envieu-lo des del vostre correu.'],
        ['4. Connectar una carpeta o un webhook', 'Els lliuraments també poden arribar des d’una carpeta vigilada de SharePoint o Drive, i cada veredicte es pot enviar a les vostres eines per webhook. Totes dues opcions són opcionals.'],
        ['5. Enviar un lliurament de prova', 'La llista de primers passos envia un IFC públic petit per les mateixes comprovacions que el fitxer d’un proveïdor, de manera que veieu un veredicte a la safata abans que ningú lliuri.'],
      ],
    },
    suppliers: {
      title: 'Preparar els vostres proveïdors',
      desc: 'Què veu un proveïdor, què ha de fer bé i què significa cada error.',
      sections: [
        ['El seu enllaç', 'L’enllaç obre una pàgina amb els requisits del projecte, la regla de noms de fitxer i la propera data de lliurament. Qualsevol persona amb l’enllaç pot lliurar en nom d’aquest proveïdor, així que no s’ha de compartir. Si es filtra, creeu-ne un de nou des de la fitxa del proveïdor: l’anterior deixa de funcionar a l’instant.'],
        ['La comprovació gratuïta', 'Quan un proveïdor tria un fitxer, es comprova al seu propi navegador: si és un IFC complet, la regla de noms i la puntuació. Veu què ha de corregir, amb una guia gratuïta per a cada regla, abans d’enviar res.'],
        ['El nom del fitxer', 'Els noms segueixen ISO 19650: codi de projecte, codi propi del proveïdor, volum, nivell, tipus, funció, número, estat (S0 a S4) i revisió, per exemple `TNO-ESTRUC-ZZ-02-M3-S-0001-S2-P01.ifc`. Un nom que incompleix la regla també el rebutja el servidor.'],
        ['Quan alguna cosa falla', 'Massa gran: exporteu sense elements no usats o dividiu el model. No és un IFC: exporteu de nou com a IFC, ja que un fitxer natiu reanomenat no serveix. Malmès: el fitxer es va tallar durant l’exportació o la baixada, així que exporteu-lo de nou. Massa intents: espereu un minut; no es perd res.'],
      ],
    },
    verdict: {
      title: 'Llegir un veredicte',
      desc: 'L’estat del fitxer, el veredicte automàtic i la vostra revisió són tres coses diferents.',
      sections: [
        ['El fitxer', 'Cada lliurament rep primer un estat de fitxer: correcte, malmès (tallat o sense tancar, mai no es puntua), no és un IFC, o no és el fitxer declarat (el seu SHA-256 no coincideix).'],
        ['El veredicte automàtic', 'Un fitxer que s’obre es puntua de 0 a 100 respecte als vostres requisits. Si arriba o supera el mínim del projecte s’accepta automàticament; per sota, es rebutja amb el motiu. Aquest veredicte és del servidor i es conserva.'],
        ['La vostra revisió', 'Una persona pot acceptar o retornar qualsevol lliurament amb un motiu, i aquesta decisió queda segellada al registre amb l’empremta del fitxer. Un lliurament no es pot acceptar abans de validar-se; retornar-lo abans continua sent possible.'],
        ['El registre', 'Cada recepció i decisió es guarda en ordre, amb qui la va fer i quan. Exporteu-lo en qualsevol moment des de la pestanya del projecte, com a ZIP (JSON i CSV) o JSON.'],
      ],
    },
    api: {
      title: 'API i webhooks',
      desc: 'Lliuraments, veredictes i esdeveniments per a les vostres pròpies eines.',
      sections: [
        ['Lliuraments', 'La llista de lliuraments retorna, per a cadascun, l’estat del fitxer, el veredicte automàtic (`auto`) i la revisió d’una persona (`review`) com a camps separats. `verdict` continua sent el valor efectiu per a integracions anteriors. El contracte complet es descriu en OpenAPI.'],
        ['Webhooks', 'Trieu els esdeveniments (rebut, validat, acceptat, retornat) i una adreça https. Cada crida se signa amb HMAC-SHA256 sobre la marca de temps i el cos; el secret es mostra una sola vegada. Les adreces de xarxes privades es rebutgen.'],
        ['Carpetes vigilades', 'Una carpeta de SharePoint o Drive pot lliurar en nom d’un proveïdor. Es processen diversos fitxers alhora, i l’informe s’escriu al costat de cada model. Un fitxer que va fallar per la xarxa es reintenta a la comprovació següent.'],
        ['Límits', 'Les pàgines públiques permeten 60 peticions per minut per adreça, i l’API amb sessió iniciada en permet 600 per minut per usuari. Per sobre, la resposta és un 429 amb `Retry-After: 60`.'],
      ],
    },
    security: {
      title: 'Seguretat i les vostres dades',
      desc: 'Com es mantenen separades les dades de cada empresa i com treure-les totes.',
      sections: [
        ['Cada empresa per separat', 'Cada consulta es filtra per empresa, i la mateixa base de dades també ho imposa (seguretat a nivell de fila): una empresa mai no llegeix ni canvia les dades d’una altra, ni tan sols demanant un id conegut.'],
        ['Rols', 'Propietaris i administradors gestionen persones, enllaços de proveïdors, webhooks i l’esborrat de projectes. Els editors revisen lliuraments, els revisors comenten i els lectors consulten. Un proveïdor només veu els seus propis lliuraments.'],
        ['Registre d’auditoria', 'Convidar o revocar un proveïdor, decisions, enllaços de client, webhooks, automatitzacions, rols, el logotip, exportacions i esborrats deixen cadascun una línia amb qui ho va fer i quan.'],
        ['Treure les dades', 'Des de la pestanya del projecte, exporteu-ho tot (lliuraments amb tots dos veredictes, el registre i les incidències) o esborreu el projecte. Esborrar exigeix escriure el nom del projecte, elimina també els fitxers i deixa només una línia al registre d’auditoria.'],
      ],
    },
  },
}
