// ─── Pricing page copy ×10 ────────────────────────────────────────────────────
// `{p}`, `{y}`, `{n}`, `{plan}` are filled by the generator with numbers and
// prices already formatted for the language. Plan names Pro, Team, Developer and
// Enterprise stay in English everywhere (they are product names); Free and
// Reception are translated because they describe what the plan is.

import type { PricingLang } from '../../../src/lib/pricing/pricing-paths'
import type { GroupId, Plan, Role, RowId } from './pricing-data'

export interface PricingCopy {
  htmlLang: string
  meta: { title: string; description: string }
  nav: { validator: string; sdk: string; blog: string; open: string; theme: string }
  h1: string
  lead: string
  status: string
  pick: {
    legend: string
    roles: Record<Role, string>
    /** One line saying why that plan fits; shown after a role is chosen. */
    why: Record<Plan, string>
    see: string
  }
  plans: {
    h2: string
    sub: string
    show: string
    recommended: string
  }
  names: Record<Plan, string>
  who: Record<'free' | 'pro' | 'team', string>
  price: {
    free: string
    month: string
    editorMonth: string
    yearly: string
    minEditors: string
    founder: string
  }
  groups: Record<GroupId, string>
  rows: Record<RowId, { label: string; note?: string; pro?: string; team?: string }>
  included: string
  notIncluded: string
  cta: { free: string; waitlist: string; talk: string }
  reception: {
    h2: string; sub: string; perProject: string; unlimited: string; body: string
    steps: { b: string; t: string }[]
  }
  more: { h2: string; dev: string; devPrice: string; ent: string; entPrice: string; onPrem: string }
  faq: { h2: string; items: { q: string; a: string }[] }
  dialog: {
    title: string; titleTalk: string; desc: string; email: string; emailPh: string
    role: string; roles: { deliver: string; receive: string; build: string; other: string }
    close: string; join: string; saving: string; ok: string; err: string
  }
  footer: { privacy: string; terms: string; onPrem: string }
}

const en: PricingCopy = {
  htmlLang: 'en',
  meta: {
    title: 'Pricing — IFC Viewer Online',
    description: 'Everything in your browser is free: IFC viewer, Health Score, IDS, BCF. Pro, Team and Reception add EU storage, client links, quality gates and delivery intake.',
  },
  nav: { validator: 'Validator', sdk: 'SDK', blog: 'Blog', open: 'Open the viewer', theme: 'Switch light or dark' },
  h1: 'Free in your browser. Paid when our servers work for you.',
  lead: 'Opening, measuring and checking IFC files stays free for good. Paid plans add EU storage, links for your client, team quality gates and a desk that receives deliveries from your supply chain.',
  status: 'Paid plans are not on sale yet. The waitlist gets them first, with the founding offer.',
  pick: {
    legend: 'What do you do with IFC files?',
    roles: {
      open: 'Open and check a model now and then',
      solo: 'Deliver models to clients, on my own',
      team: 'Deliver models as a studio or firm',
      receive: 'Receive models from suppliers',
      build: 'Build software on top',
    },
    why: {
      free: 'Free covers it: viewer, Health Score, IDS and BCF, with nothing uploaded.',
      pro: 'Pro: open files too large for a browser and send your client a link.',
      team: 'Team: one house standard, a quality gate on every upload, and a portal for your client.',
      reception: 'Reception: suppliers check against your requirements before they send.',
      developer: 'Developer: the hosted validation API. The client SDK stays free.',
      enterprise: 'Enterprise: Reception across a portfolio, with single sign-on.',
    },
    see: 'See the plan',
  },
  plans: {
    h2: 'For people who deliver models',
    sub: 'Architects, engineers and BIM coordinators who send IFC to a client.',
    show: 'Plan',
    recommended: 'Fits what you do',
  },
  names: { free: 'Free', pro: 'Pro', team: 'Team', reception: 'Reception', developer: 'Developer', enterprise: 'Enterprise' },
  who: { free: 'Anyone with an IFC', pro: 'One person', team: 'Studios and engineering firms' },
  price: {
    free: '{p}, forever',
    month: '{p} / month, billed yearly',
    editorMonth: '{p} per editor / month, billed yearly',
    yearly: '{y} a year · {m} / month if paid monthly',
    minEditors: '{n} editors minimum',
    founder: 'Founding offer for Team and Reception: {n}% off for {m} months for the first {t} customers, in exchange for a published case study.',
  },
  groups: { files: 'Files and storage', share: 'Sharing with your client', quality: 'Quality across the team', contract: 'Automation and contract' },
  rows: {
    browser: { label: 'Everything in your browser', note: 'Viewer, sections, measuring, Health Score with 44 rules, IDS 1.0, BCF, map, embed SDK. No account; files never leave your browser.' },
    storage: { label: 'Storage in the EU, with versions', pro: '20 GB', team: '100 GB per editor, shared' },
    large: { label: 'Files too large for a browser', pro: 'Up to 1 GB per file', team: 'Up to 3 GB per file' },
    link: { label: 'A link for your client', pro: 'Password and expiry', team: 'Client portal with your logo' },
    guests: { label: 'Reviewers and guests', team: 'Free, not counted as editors' },
    gate: { label: 'Quality gate on every upload' },
    standard: { label: 'House standard, roles, ISO 19650 states' },
    api: { label: 'Hosted validation API', pro: '500 checks / month', team: '2,000 checks / month per team' },
    dpa: { label: 'Data processing agreement' },
  },
  included: 'Included',
  notIncluded: 'Not included',
  cta: { free: 'Open the viewer', waitlist: 'Join the waitlist', talk: 'Talk to us' },
  reception: {
    h2: 'For people who receive models',
    sub: 'Contractors, developers, owners and facility managers who collect models from many suppliers.',
    perProject: 'From {p} / month per active project, up to {n} suppliers',
    unlimited: 'Portfolio: from {p} / month, unlimited projects and suppliers',
    body: 'Stop receiving models you have to send back. Your suppliers check their files free against your requirements before sending; you only receive what complies, and you see who delivers well.',
    steps: [
      { b: 'Publish your requirements', t: 'as a link or QR for tenders and contracts: IDS, rules, minimum score, naming.' },
      { b: 'Suppliers check for free', t: 'in their browser and fix before sending.' },
      { b: 'A delivery inbox', t: 'checks each file again, keeps the version and accepts or rejects it with BCF issues.' },
      { b: 'A record per supplier:', t: 'deliveries, accepted first time, score trend.' },
      { b: 'A close-out report', t: 'on the information received, ready for maintenance.' },
    ],
  },
  more: {
    h2: 'Building on top, or a whole portfolio',
    dev: 'The client-side SDK is free. Developer adds a hosted validation API for platforms, CDEs and automations.',
    devPrice: '{p} / month, billed yearly, + usage',
    ent: 'Reception across a portfolio, single sign-on, a data processing agreement and an on-premise option with no internet access.',
    entPrice: 'From {p} / year',
    onPrem: 'On-premise validator',
  },
  faq: {
    h2: 'Questions',
    items: [
      { q: 'Which plan is right for me?', a: 'If you open and check models, Free. If you send models to clients on your own, Pro. If several people in a firm deliver models, Team, from three editors. If you collect models from subcontractors, Reception.' },
      { q: 'Will the free viewer stay free?', a: 'Yes. Everything that runs in your browser stays free for good: viewer, measuring, sections, Health Score, 44 rules, IDS 1.0, BCF and the SDK. Paid plans only add what needs our servers, or new tools for teams.' },
      { q: 'Can I pay today?', a: 'Not yet. Paid plans open to the waitlist first. Leave your email and we write once, when your plan opens. Prices may still change before launch; the waitlist keeps the founding offer.' },
      { q: 'Where are files stored on paid plans?', a: 'On servers in the EU. On the free plan nothing is uploaded: your browser opens the file.' },
      { q: 'Do my suppliers pay for Reception?', a: 'No. Suppliers check their files against your requirements free, in their browser. Reception is paid by whoever receives the deliveries.' },
    ],
  },
  dialog: {
    title: 'Join the {plan} waitlist', titleTalk: 'Talk to us about {plan}', desc: 'We write once, when this plan opens. No newsletter.',
    email: 'Work email', emailPh: 'you@company.com', role: 'You mostly',
    roles: { deliver: 'Deliver models to clients', receive: 'Receive models from suppliers', build: 'Build software on top', other: 'Other' },
    close: 'Close', join: 'Join', saving: 'Saving…', ok: "You're on the list. We'll write once, when it opens.", err: 'Could not save it. Try again in a moment.',
  },
  footer: { privacy: 'Privacy', terms: 'Terms', onPrem: 'On-premise' },
}

const es: PricingCopy = {
  htmlLang: 'es',
  meta: {
    title: 'Precios — IFC Viewer Online',
    description: 'Gratis en tu navegador: visor IFC, Health Score, IDS y BCF. Pro, Team y Recepción añaden almacenamiento en la UE, enlaces al cliente y control de entregas.',
  },
  nav: { validator: 'Validador', sdk: 'SDK', blog: 'Blog', open: 'Abrir el visor', theme: 'Cambiar a claro u oscuro' },
  h1: 'Gratis en tu navegador. De pago cuando trabajan nuestros servidores.',
  lead: 'Abrir, medir y revisar IFC sigue siendo gratis para siempre. Los planes de pago añaden almacenamiento en la UE, enlaces para tu cliente, control de calidad del equipo y una bandeja que recibe las entregas de tus subcontratas.',
  status: 'Los planes de pago aún no están a la venta. La lista de espera los recibe primero, con la oferta de fundador.',
  pick: {
    legend: '¿Qué haces con los IFC?',
    roles: {
      open: 'Abro y reviso algún modelo de vez en cuando',
      solo: 'Entrego modelos a clientes, por mi cuenta',
      team: 'Entrego modelos como estudio o ingeniería',
      receive: 'Recibo modelos de subcontratas',
      build: 'Desarrollo software encima',
    },
    why: {
      free: 'Te basta el gratuito: visor, Health Score, IDS y BCF, sin subir nada.',
      pro: 'Pro: abre archivos demasiado grandes para el navegador y envía un enlace a tu cliente.',
      team: 'Team: un estándar de la casa, control de calidad en cada subida y un portal para tu cliente.',
      reception: 'Recepción: las subcontratas comprueban tus requisitos antes de enviar.',
      developer: 'Developer: la API de validación alojada. El SDK de cliente sigue siendo gratis.',
      enterprise: 'Enterprise: Recepción en toda la cartera de obras, con inicio de sesión único.',
    },
    see: 'Ver el plan',
  },
  plans: {
    h2: 'Para quien entrega modelos',
    sub: 'Arquitectos, ingenieros y coordinadores BIM que envían IFC a un cliente.',
    show: 'Plan',
    recommended: 'Encaja con lo que haces',
  },
  names: { free: 'Gratis', pro: 'Pro', team: 'Team', reception: 'Recepción', developer: 'Developer', enterprise: 'Enterprise' },
  who: { free: 'Cualquiera con un IFC', pro: 'Una persona', team: 'Estudios e ingenierías' },
  price: {
    free: '{p}, para siempre',
    month: '{p} / mes, pago anual',
    editorMonth: '{p} por editor / mes, pago anual',
    yearly: '{y} al año · {m} / mes si pagas mes a mes',
    minEditors: 'Mínimo {n} editores',
    founder: 'Oferta de fundador para Team y Recepción: {n} % de descuento durante {m} meses para los {t} primeros clientes, a cambio de un caso de éxito publicado.',
  },
  groups: { files: 'Archivos y almacenamiento', share: 'Compartir con tu cliente', quality: 'Calidad en todo el equipo', contract: 'Automatización y contrato' },
  rows: {
    browser: { label: 'Todo lo del navegador', note: 'Visor, secciones, medición, Health Score con 44 reglas, IDS 1.0, BCF, mapa y SDK para incrustar. Sin cuenta; los archivos no salen de tu navegador.' },
    storage: { label: 'Almacenamiento en la UE, con versiones', pro: '20 GB', team: '100 GB por editor, compartidos' },
    large: { label: 'Archivos demasiado grandes para el navegador', pro: 'Hasta 1 GB por archivo', team: 'Hasta 3 GB por archivo' },
    link: { label: 'Un enlace para tu cliente', pro: 'Con contraseña y caducidad', team: 'Portal del cliente con tu logo' },
    guests: { label: 'Revisores e invitados', team: 'Gratis, no cuentan como editores' },
    gate: { label: 'Control de calidad en cada subida' },
    standard: { label: 'Estándar de la casa, roles y estados ISO 19650' },
    api: { label: 'API de validación alojada', pro: '500 comprobaciones / mes', team: '2.000 comprobaciones / mes por equipo' },
    dpa: { label: 'Contrato de encargo de tratamiento' },
  },
  included: 'Incluido',
  notIncluded: 'No incluido',
  cta: { free: 'Abrir el visor', waitlist: 'Apuntarme a la lista', talk: 'Hablar con nosotros' },
  reception: {
    h2: 'Para quien recibe modelos',
    sub: 'Constructoras, promotoras, propiedades y gestores de activos que reciben modelos de muchas subcontratas.',
    perProject: 'Desde {p} / mes por obra activa, hasta {n} subcontratas',
    unlimited: 'Cartera: desde {p} / mes, obras y subcontratas ilimitadas',
    body: 'Deja de recibir modelos que tienes que devolver. Tus subcontratas comprueban sus archivos gratis contra tus requisitos antes de enviarlos; solo recibes lo que cumple y ves quién entrega bien.',
    steps: [
      { b: 'Publica tus requisitos', t: 'como enlace o QR para licitaciones y contratos: IDS, reglas, nota mínima y nomenclatura.' },
      { b: 'Las subcontratas comprueban gratis', t: 'en su navegador y corrigen antes de enviar.' },
      { b: 'Una bandeja de entregas', t: 'vuelve a comprobar cada archivo, guarda la versión y la acepta o rechaza con issues BCF.' },
      { b: 'Un historial por subcontrata:', t: 'entregas, aceptadas a la primera y evolución de la nota.' },
      { b: 'Un informe de cierre', t: 'de la información recibida, listo para mantenimiento.' },
    ],
  },
  more: {
    h2: 'Para integrar, o para toda una cartera',
    dev: 'El SDK de cliente es gratis. Developer añade una API de validación alojada para plataformas, CDE y automatizaciones.',
    devPrice: '{p} / mes, pago anual, + consumo',
    ent: 'Recepción en toda la cartera, inicio de sesión único, contrato de encargo de tratamiento y una opción en tus servidores sin acceso a internet.',
    entPrice: 'Desde {p} / año',
    onPrem: 'Validador en tus servidores',
  },
  faq: {
    h2: 'Preguntas',
    items: [
      { q: '¿Qué plan me conviene?', a: 'Si abres y revisas modelos, el gratuito. Si entregas modelos a clientes por tu cuenta, Pro. Si en tu empresa entregan varias personas, Team, desde tres editores. Si recibes modelos de subcontratas, Recepción.' },
      { q: '¿El visor gratuito seguirá siendo gratis?', a: 'Sí. Todo lo que funciona en el navegador sigue gratis para siempre: visor, medición, secciones, Health Score, 44 reglas, IDS 1.0, BCF y el SDK. Los planes de pago solo añaden lo que necesita nuestros servidores, o herramientas nuevas para equipos.' },
      { q: '¿Puedo pagar ya?', a: 'Todavía no. Los planes de pago se abren primero a la lista de espera. Deja tu correo y te escribimos una sola vez, cuando abra tu plan. Los precios pueden cambiar antes del lanzamiento; la lista conserva la oferta de fundador.' },
      { q: '¿Dónde se guardan los archivos en los planes de pago?', a: 'En servidores de la UE. En el plan gratuito no se sube nada: tu navegador abre el archivo.' },
      { q: '¿Mis subcontratas pagan por Recepción?', a: 'No. Comprueban sus archivos contra tus requisitos gratis, en su navegador. Recepción la paga quien recibe las entregas.' },
    ],
  },
  dialog: {
    title: 'Lista de espera de {plan}', titleTalk: 'Hablemos de {plan}', desc: 'Te escribimos una vez, cuando abra este plan. Sin boletines.',
    email: 'Correo de trabajo', emailPh: 'tu@empresa.com', role: 'Sobre todo',
    roles: { deliver: 'Entrego modelos a clientes', receive: 'Recibo modelos de subcontratas', build: 'Desarrollo software encima', other: 'Otro' },
    close: 'Cerrar', join: 'Apuntarme', saving: 'Guardando…', ok: 'Ya estás en la lista. Te escribiremos una vez, cuando abra.', err: 'No se ha podido guardar. Inténtalo de nuevo en un momento.',
  },
  footer: { privacy: 'Privacidad', terms: 'Condiciones', onPrem: 'En tus servidores' },
}

const de: PricingCopy = {
  htmlLang: 'de',
  meta: {
    title: 'Preise — IFC Viewer Online',
    description: 'Kostenlos im Browser: IFC-Viewer, Health Score, IDS, BCF. Pro, Team und Annahme ergänzen EU-Speicher, Links für Auftraggeber und die Prüfung von Lieferungen.',
  },
  nav: { validator: 'Validator', sdk: 'SDK', blog: 'Blog', open: 'Viewer öffnen', theme: 'Hell oder dunkel' },
  h1: 'Kostenlos im Browser. Kostenpflichtig, wenn unsere Server arbeiten.',
  lead: 'IFC-Dateien öffnen, messen und prüfen bleibt dauerhaft kostenlos. Die bezahlten Pläne ergänzen Speicher in der EU, Links für Ihren Auftraggeber, Qualitätsprüfung im Team und einen Eingang für Lieferungen Ihrer Nachunternehmer.',
  status: 'Die bezahlten Pläne sind noch nicht buchbar. Die Warteliste bekommt sie zuerst, mit dem Gründerangebot.',
  pick: {
    legend: 'Was machen Sie mit IFC-Dateien?',
    roles: {
      open: 'Ab und zu ein Modell öffnen und prüfen',
      solo: 'Modelle an Auftraggeber liefern, allein',
      team: 'Modelle als Büro oder Ingenieurbüro liefern',
      receive: 'Modelle von Nachunternehmern erhalten',
      build: 'Software darauf aufbauen',
    },
    why: {
      free: 'Kostenlos reicht: Viewer, Health Score, IDS und BCF, ohne Upload.',
      pro: 'Pro: Dateien öffnen, die für den Browser zu groß sind, und Ihrem Auftraggeber einen Link schicken.',
      team: 'Team: ein Bürostandard, Qualitätsprüfung bei jedem Upload und ein Portal für Ihren Auftraggeber.',
      reception: 'Annahme: Nachunternehmer prüfen gegen Ihre Anforderungen, bevor sie liefern.',
      developer: 'Developer: die gehostete Validierungs-API. Das Client-SDK bleibt kostenlos.',
      enterprise: 'Enterprise: Annahme über das ganze Portfolio, mit Single Sign-on.',
    },
    see: 'Zum Plan',
  },
  plans: {
    h2: 'Für alle, die Modelle liefern',
    sub: 'Architekten, Ingenieure und BIM-Koordinatoren, die IFC an einen Auftraggeber schicken.',
    show: 'Plan',
    recommended: 'Passt zu Ihrer Arbeit',
  },
  names: { free: 'Kostenlos', pro: 'Pro', team: 'Team', reception: 'Annahme', developer: 'Developer', enterprise: 'Enterprise' },
  who: { free: 'Alle mit einer IFC-Datei', pro: 'Eine Person', team: 'Architektur- und Ingenieurbüros' },
  price: {
    free: '{p}, dauerhaft',
    month: '{p} / Monat, jährlich abgerechnet',
    editorMonth: '{p} pro Bearbeiter / Monat, jährlich abgerechnet',
    yearly: '{y} pro Jahr · {m} / Monat bei monatlicher Zahlung',
    minEditors: 'Mindestens {n} Bearbeiter',
    founder: 'Gründerangebot für Team und Annahme: {n} % Rabatt für {m} Monate für die ersten {t} Kunden, im Austausch gegen eine veröffentlichte Fallstudie.',
  },
  groups: { files: 'Dateien und Speicher', share: 'Mit dem Auftraggeber teilen', quality: 'Qualität im ganzen Team', contract: 'Automatisierung und Vertrag' },
  rows: {
    browser: { label: 'Alles im Browser', note: 'Viewer, Schnitte, Messen, Health Score mit 44 Regeln, IDS 1.0, BCF, Karte, Einbettungs-SDK. Ohne Konto; Dateien verlassen Ihren Browser nicht.' },
    storage: { label: 'Speicher in der EU, mit Versionen', pro: '20 GB', team: '100 GB pro Bearbeiter, gemeinsam' },
    large: { label: 'Dateien, die für den Browser zu groß sind', pro: 'Bis 1 GB pro Datei', team: 'Bis 3 GB pro Datei' },
    link: { label: 'Ein Link für Ihren Auftraggeber', pro: 'Mit Passwort und Ablaufdatum', team: 'Kundenportal mit Ihrem Logo' },
    guests: { label: 'Prüfer und Gäste', team: 'Kostenlos, zählen nicht als Bearbeiter' },
    gate: { label: 'Qualitätsprüfung bei jedem Upload' },
    standard: { label: 'Bürostandard, Rollen, Status nach ISO 19650' },
    api: { label: 'Gehostete Validierungs-API', pro: '500 Prüfungen / Monat', team: '2.000 Prüfungen / Monat pro Team' },
    dpa: { label: 'Auftragsverarbeitungsvertrag (AVV)' },
  },
  included: 'Enthalten',
  notIncluded: 'Nicht enthalten',
  cta: { free: 'Viewer öffnen', waitlist: 'Auf die Warteliste', talk: 'Kontakt aufnehmen' },
  reception: {
    h2: 'Für alle, die Modelle erhalten',
    sub: 'Bauunternehmen, Projektentwickler, Bauherren und Facility Manager, die Modelle vieler Nachunternehmer sammeln.',
    perProject: 'Ab {p} / Monat pro aktivem Projekt, bis {n} Nachunternehmer',
    unlimited: 'Portfolio: ab {p} / Monat, unbegrenzt Projekte und Nachunternehmer',
    body: 'Keine Modelle mehr annehmen, die Sie zurückschicken müssen. Ihre Nachunternehmer prüfen ihre Dateien kostenlos gegen Ihre Anforderungen, bevor sie liefern; Sie erhalten nur, was passt, und sehen, wer gut liefert.',
    steps: [
      { b: 'Anforderungen veröffentlichen', t: 'als Link oder QR-Code für Ausschreibungen und Verträge: IDS, Regeln, Mindestnote, Benennung.' },
      { b: 'Nachunternehmer prüfen kostenlos', t: 'im Browser und korrigieren vor dem Versand.' },
      { b: 'Ein Liefereingang', t: 'prüft jede Datei erneut, speichert die Version und nimmt sie an oder lehnt sie mit BCF-Issues ab.' },
      { b: 'Ein Verlauf pro Nachunternehmer:', t: 'Lieferungen, beim ersten Mal angenommen, Entwicklung der Note.' },
      { b: 'Ein Abschlussbericht', t: 'über die erhaltenen Informationen, bereit für den Betrieb.' },
    ],
  },
  more: {
    h2: 'Darauf aufbauen oder ein ganzes Portfolio',
    dev: 'Das Client-SDK ist kostenlos. Developer ergänzt eine gehostete Validierungs-API für Plattformen, CDEs und Automatisierungen.',
    devPrice: '{p} / Monat, jährlich abgerechnet, + Nutzung',
    ent: 'Annahme über das ganze Portfolio, Single Sign-on, Auftragsverarbeitungsvertrag und eine On-Premise-Option ohne Internetzugang.',
    entPrice: 'Ab {p} / Jahr',
    onPrem: 'On-Premise-Validator',
  },
  faq: {
    h2: 'Fragen',
    items: [
      { q: 'Welcher Plan passt zu mir?', a: 'Wenn Sie Modelle öffnen und prüfen: Kostenlos. Wenn Sie allein Modelle an Auftraggeber liefern: Pro. Wenn mehrere Personen im Büro liefern: Team, ab drei Bearbeitern. Wenn Sie Modelle von Nachunternehmern erhalten: Annahme.' },
      { q: 'Bleibt der kostenlose Viewer kostenlos?', a: 'Ja. Alles, was im Browser läuft, bleibt dauerhaft kostenlos: Viewer, Messen, Schnitte, Health Score, 44 Regeln, IDS 1.0, BCF und das SDK. Bezahlte Pläne ergänzen nur, was unsere Server braucht, oder neue Werkzeuge für Teams.' },
      { q: 'Kann ich schon bezahlen?', a: 'Noch nicht. Die bezahlten Pläne öffnen zuerst für die Warteliste. Hinterlassen Sie Ihre E-Mail, wir schreiben einmal, wenn Ihr Plan startet. Die Preise können sich vor dem Start noch ändern; die Warteliste behält das Gründerangebot.' },
      { q: 'Wo liegen die Dateien in den bezahlten Plänen?', a: 'Auf Servern in der EU. Im kostenlosen Plan wird nichts hochgeladen: Ihr Browser öffnet die Datei.' },
      { q: 'Zahlen meine Nachunternehmer für die Annahme?', a: 'Nein. Sie prüfen ihre Dateien kostenlos im Browser gegen Ihre Anforderungen. Die Annahme bezahlt, wer die Lieferungen erhält.' },
    ],
  },
  dialog: {
    title: 'Warteliste für {plan}', titleTalk: 'Sprechen wir über {plan}', desc: 'Wir schreiben einmal, wenn dieser Plan startet. Kein Newsletter.',
    email: 'Geschäftliche E-Mail', emailPh: 'sie@firma.de', role: 'Sie vor allem',
    roles: { deliver: 'Liefern Modelle an Auftraggeber', receive: 'Erhalten Modelle von Nachunternehmern', build: 'Bauen Software darauf auf', other: 'Anderes' },
    close: 'Schließen', join: 'Eintragen', saving: 'Wird gespeichert…', ok: 'Sie stehen auf der Liste. Wir schreiben einmal, wenn es losgeht.', err: 'Speichern fehlgeschlagen. Bitte gleich noch einmal versuchen.',
  },
  footer: { privacy: 'Datenschutz', terms: 'AGB', onPrem: 'On-Premise' },
}

const fr: PricingCopy = {
  htmlLang: 'fr',
  meta: {
    title: 'Tarifs — IFC Viewer Online',
    description: 'Gratuit dans votre navigateur : visionneuse IFC, Health Score, IDS, BCF. Pro, Team et Réception ajoutent stockage UE, liens client et contrôle des livrables.',
  },
  nav: { validator: 'Validateur', sdk: 'SDK', blog: 'Blog', open: 'Ouvrir la visionneuse', theme: 'Mode clair ou sombre' },
  h1: 'Gratuit dans votre navigateur. Payant quand nos serveurs travaillent.',
  lead: 'Ouvrir, mesurer et vérifier des fichiers IFC reste gratuit pour toujours. Les offres payantes ajoutent le stockage dans l’UE, des liens pour votre client, un contrôle qualité d’équipe et une boîte qui reçoit les livrables de vos sous-traitants.',
  status: 'Les offres payantes ne sont pas encore en vente. La liste d’attente les reçoit en premier, avec l’offre fondateur.',
  pick: {
    legend: 'Que faites-vous avec des fichiers IFC ?',
    roles: {
      open: 'J’ouvre et vérifie un modèle de temps en temps',
      solo: 'Je livre des modèles à des clients, seul',
      team: 'Je livre des modèles en agence ou bureau d’études',
      receive: 'Je reçois des modèles de sous-traitants',
      build: 'Je développe un logiciel par-dessus',
    },
    why: {
      free: 'La version gratuite suffit : visionneuse, Health Score, IDS et BCF, sans rien envoyer.',
      pro: 'Pro : ouvrez des fichiers trop lourds pour le navigateur et envoyez un lien à votre client.',
      team: 'Team : une charte maison, un contrôle qualité à chaque envoi et un portail pour votre client.',
      reception: 'Réception : les sous-traitants vérifient vos exigences avant d’envoyer.',
      developer: 'Developer : l’API de validation hébergée. Le SDK client reste gratuit.',
      enterprise: 'Enterprise : la Réception sur tout un portefeuille, avec authentification unique.',
    },
    see: 'Voir l’offre',
  },
  plans: {
    h2: 'Pour ceux qui livrent des modèles',
    sub: 'Architectes, ingénieurs et coordinateurs BIM qui envoient des IFC à un client.',
    show: 'Offre',
    recommended: 'Correspond à votre activité',
  },
  names: { free: 'Gratuit', pro: 'Pro', team: 'Team', reception: 'Réception', developer: 'Developer', enterprise: 'Enterprise' },
  who: { free: 'Quiconque a un IFC', pro: 'Une personne', team: 'Agences et bureaux d’études' },
  price: {
    free: '{p}, pour toujours',
    month: '{p} / mois, facturé à l’année',
    editorMonth: '{p} par éditeur / mois, facturé à l’année',
    yearly: '{y} par an · {m} / mois en paiement mensuel',
    minEditors: '{n} éditeurs minimum',
    founder: 'Offre fondateur pour Team et Réception : {n} % de remise pendant {m} mois pour les {t} premiers clients, en échange d’une étude de cas publiée.',
  },
  groups: { files: 'Fichiers et stockage', share: 'Partager avec votre client', quality: 'Qualité dans toute l’équipe', contract: 'Automatisation et contrat' },
  rows: {
    browser: { label: 'Tout ce qui tourne dans le navigateur', note: 'Visionneuse, coupes, mesures, Health Score avec 44 règles, IDS 1.0, BCF, carte, SDK à intégrer. Sans compte ; les fichiers ne quittent pas votre navigateur.' },
    storage: { label: 'Stockage dans l’UE, avec versions', pro: '20 Go', team: '100 Go par éditeur, partagés' },
    large: { label: 'Fichiers trop lourds pour le navigateur', pro: 'Jusqu’à 1 Go par fichier', team: 'Jusqu’à 3 Go par fichier' },
    link: { label: 'Un lien pour votre client', pro: 'Mot de passe et expiration', team: 'Portail client à votre logo' },
    guests: { label: 'Relecteurs et invités', team: 'Gratuits, non comptés comme éditeurs' },
    gate: { label: 'Contrôle qualité à chaque envoi' },
    standard: { label: 'Charte maison, rôles, statuts ISO 19650' },
    api: { label: 'API de validation hébergée', pro: '500 contrôles / mois', team: '2 000 contrôles / mois par équipe' },
    dpa: { label: 'Accord de sous-traitance des données (DPA)' },
  },
  included: 'Inclus',
  notIncluded: 'Non inclus',
  cta: { free: 'Ouvrir la visionneuse', waitlist: 'Rejoindre la liste', talk: 'Nous contacter' },
  reception: {
    h2: 'Pour ceux qui reçoivent des modèles',
    sub: 'Entreprises générales, promoteurs, maîtres d’ouvrage et exploitants qui collectent les modèles de nombreux sous-traitants.',
    perProject: 'À partir de {p} / mois par chantier actif, jusqu’à {n} sous-traitants',
    unlimited: 'Portefeuille : à partir de {p} / mois, chantiers et sous-traitants illimités',
    body: 'Arrêtez de recevoir des modèles à renvoyer. Vos sous-traitants vérifient gratuitement leurs fichiers par rapport à vos exigences avant l’envoi ; vous ne recevez que ce qui est conforme et vous voyez qui livre bien.',
    steps: [
      { b: 'Publiez vos exigences', t: 'en lien ou QR code pour les appels d’offres et contrats : IDS, règles, note minimale, nommage.' },
      { b: 'Les sous-traitants vérifient gratuitement', t: 'dans leur navigateur et corrigent avant d’envoyer.' },
      { b: 'Une boîte de réception', t: 'revérifie chaque fichier, garde la version et l’accepte ou la refuse avec des issues BCF.' },
      { b: 'Un historique par sous-traitant :', t: 'livraisons, acceptées du premier coup, évolution de la note.' },
      { b: 'Un rapport de fin de chantier', t: 'sur les informations reçues, prêt pour l’exploitation.' },
    ],
  },
  more: {
    h2: 'Développer par-dessus, ou tout un portefeuille',
    dev: 'Le SDK client est gratuit. Developer ajoute une API de validation hébergée pour plateformes, CDE et automatisations.',
    devPrice: '{p} / mois, facturé à l’année, + usage',
    ent: 'Réception sur tout un portefeuille, authentification unique, accord de sous-traitance et une option sur site sans accès à internet.',
    entPrice: 'À partir de {p} / an',
    onPrem: 'Validateur sur site',
  },
  faq: {
    h2: 'Questions',
    items: [
      { q: 'Quelle offre me correspond ?', a: 'Si vous ouvrez et vérifiez des modèles : Gratuit. Si vous livrez seul des modèles à des clients : Pro. Si plusieurs personnes livrent dans votre structure : Team, dès trois éditeurs. Si vous recevez des modèles de sous-traitants : Réception.' },
      { q: 'La visionneuse gratuite restera-t-elle gratuite ?', a: 'Oui. Tout ce qui tourne dans le navigateur reste gratuit pour toujours : visionneuse, mesures, coupes, Health Score, 44 règles, IDS 1.0, BCF et le SDK. Les offres payantes n’ajoutent que ce qui a besoin de nos serveurs, ou de nouveaux outils d’équipe.' },
      { q: 'Puis-je payer dès aujourd’hui ?', a: 'Pas encore. Les offres payantes ouvrent d’abord à la liste d’attente. Laissez votre e-mail : nous écrivons une seule fois, à l’ouverture de votre offre. Les prix peuvent encore changer ; la liste garde l’offre fondateur.' },
      { q: 'Où sont stockés les fichiers dans les offres payantes ?', a: 'Sur des serveurs dans l’UE. Avec l’offre gratuite, rien n’est envoyé : votre navigateur ouvre le fichier.' },
      { q: 'Mes sous-traitants paient-ils la Réception ?', a: 'Non. Ils vérifient leurs fichiers gratuitement, dans leur navigateur. La Réception est payée par celui qui reçoit les livrables.' },
    ],
  },
  dialog: {
    title: 'Liste d’attente {plan}', titleTalk: 'Parlons de {plan}', desc: 'Nous écrivons une fois, à l’ouverture de cette offre. Pas de newsletter.',
    email: 'E-mail professionnel', emailPh: 'vous@entreprise.fr', role: 'Surtout, vous',
    roles: { deliver: 'Livrez des modèles à des clients', receive: 'Recevez des modèles de sous-traitants', build: 'Développez un logiciel par-dessus', other: 'Autre' },
    close: 'Fermer', join: 'M’inscrire', saving: 'Enregistrement…', ok: 'Vous êtes sur la liste. Nous écrirons une fois, à l’ouverture.', err: 'Enregistrement impossible. Réessayez dans un instant.',
  },
  footer: { privacy: 'Confidentialité', terms: 'Conditions', onPrem: 'Sur site' },
}

const pt: PricingCopy = {
  htmlLang: 'pt',
  meta: {
    title: 'Preços — IFC Viewer Online',
    description: 'Grátis no navegador: visualizador IFC, Health Score, IDS, BCF. Pro, Team e Receção acrescentam armazenamento na UE, links para o cliente e controlo de entregas.',
  },
  nav: { validator: 'Validador', sdk: 'SDK', blog: 'Blog', open: 'Abrir o visualizador', theme: 'Mudar para claro ou escuro' },
  h1: 'Gratuito no navegador. Pago quando os nossos servidores trabalham.',
  lead: 'Abrir, medir e verificar ficheiros IFC continua gratuito para sempre. Os planos pagos acrescentam armazenamento na UE, links para o seu cliente, controlo de qualidade da equipa e uma caixa que recebe as entregas dos seus subempreiteiros.',
  status: 'Os planos pagos ainda não estão à venda. A lista de espera recebe-os primeiro, com a oferta de fundador.',
  pick: {
    legend: 'O que faz com ficheiros IFC?',
    roles: {
      open: 'Abro e verifico um modelo de vez em quando',
      solo: 'Entrego modelos a clientes, por conta própria',
      team: 'Entrego modelos como gabinete ou empresa',
      receive: 'Recebo modelos de subempreiteiros',
      build: 'Desenvolvo software por cima',
    },
    why: {
      free: 'O gratuito chega: visualizador, Health Score, IDS e BCF, sem enviar nada.',
      pro: 'Pro: abra ficheiros grandes demais para o navegador e envie um link ao seu cliente.',
      team: 'Team: um padrão da casa, controlo de qualidade em cada envio e um portal para o seu cliente.',
      reception: 'Receção: os subempreiteiros verificam os seus requisitos antes de enviar.',
      developer: 'Developer: a API de validação alojada. O SDK de cliente continua gratuito.',
      enterprise: 'Enterprise: Receção em toda a carteira, com início de sessão único.',
    },
    see: 'Ver o plano',
  },
  plans: {
    h2: 'Para quem entrega modelos',
    sub: 'Arquitetos, engenheiros e coordenadores BIM que enviam IFC a um cliente.',
    show: 'Plano',
    recommended: 'Adequado ao que faz',
  },
  names: { free: 'Gratuito', pro: 'Pro', team: 'Team', reception: 'Receção', developer: 'Developer', enterprise: 'Enterprise' },
  who: { free: 'Qualquer pessoa com um IFC', pro: 'Uma pessoa', team: 'Gabinetes e empresas de engenharia' },
  price: {
    free: '{p}, para sempre',
    month: '{p} / mês, faturado anualmente',
    editorMonth: '{p} por editor / mês, faturado anualmente',
    yearly: '{y} por ano · {m} / mês com pagamento mensal',
    minEditors: 'Mínimo de {n} editores',
    founder: 'Oferta de fundador para Team e Receção: {n}% de desconto durante {m} meses para os {t} primeiros clientes, em troca de um caso de sucesso publicado.',
  },
  groups: { files: 'Ficheiros e armazenamento', share: 'Partilhar com o cliente', quality: 'Qualidade em toda a equipa', contract: 'Automação e contrato' },
  rows: {
    browser: { label: 'Tudo o que corre no navegador', note: 'Visualizador, cortes, medição, Health Score com 44 regras, IDS 1.0, BCF, mapa e SDK para incorporar. Sem conta; os ficheiros não saem do seu navegador.' },
    storage: { label: 'Armazenamento na UE, com versões', pro: '20 GB', team: '100 GB por editor, partilhados' },
    large: { label: 'Ficheiros grandes demais para o navegador', pro: 'Até 1 GB por ficheiro', team: 'Até 3 GB por ficheiro' },
    link: { label: 'Um link para o seu cliente', pro: 'Com palavra-passe e validade', team: 'Portal do cliente com o seu logótipo' },
    guests: { label: 'Revisores e convidados', team: 'Gratuitos, não contam como editores' },
    gate: { label: 'Controlo de qualidade em cada envio' },
    standard: { label: 'Padrão da casa, funções e estados ISO 19650' },
    api: { label: 'API de validação alojada', pro: '500 verificações / mês', team: '2000 verificações / mês por equipa' },
    dpa: { label: 'Acordo de tratamento de dados' },
  },
  included: 'Incluído',
  notIncluded: 'Não incluído',
  cta: { free: 'Abrir o visualizador', waitlist: 'Entrar na lista', talk: 'Falar connosco' },
  reception: {
    h2: 'Para quem recebe modelos',
    sub: 'Construtoras, promotores, donos de obra e gestores de ativos que recebem modelos de muitos subempreiteiros.',
    perProject: 'Desde {p} / mês por obra ativa, até {n} subempreiteiros',
    unlimited: 'Carteira: desde {p} / mês, obras e subempreiteiros ilimitados',
    body: 'Deixe de receber modelos que tem de devolver. Os seus subempreiteiros verificam os ficheiros gratuitamente contra os seus requisitos antes de enviar; só recebe o que cumpre e vê quem entrega bem.',
    steps: [
      { b: 'Publique os seus requisitos', t: 'como link ou QR para concursos e contratos: IDS, regras, nota mínima e nomenclatura.' },
      { b: 'Os subempreiteiros verificam grátis', t: 'no navegador e corrigem antes de enviar.' },
      { b: 'Uma caixa de entregas', t: 'volta a verificar cada ficheiro, guarda a versão e aceita-a ou rejeita-a com issues BCF.' },
      { b: 'Um histórico por subempreiteiro:', t: 'entregas, aceites à primeira e evolução da nota.' },
      { b: 'Um relatório de fecho', t: 'da informação recebida, pronto para a manutenção.' },
    ],
  },
  more: {
    h2: 'Para integrar, ou para toda uma carteira',
    dev: 'O SDK de cliente é gratuito. O Developer acrescenta uma API de validação alojada para plataformas, CDE e automações.',
    devPrice: '{p} / mês, faturado anualmente, + consumo',
    ent: 'Receção em toda a carteira, início de sessão único, acordo de tratamento de dados e uma opção nos seus servidores sem acesso à internet.',
    entPrice: 'Desde {p} / ano',
    onPrem: 'Validador nos seus servidores',
  },
  faq: {
    h2: 'Perguntas',
    items: [
      { q: 'Que plano me serve?', a: 'Se abre e verifica modelos, o Gratuito. Se entrega modelos a clientes por conta própria, o Pro. Se várias pessoas da empresa entregam, o Team, a partir de três editores. Se recebe modelos de subempreiteiros, a Receção.' },
      { q: 'O visualizador gratuito vai continuar gratuito?', a: 'Sim. Tudo o que corre no navegador continua gratuito para sempre: visualizador, medição, cortes, Health Score, 44 regras, IDS 1.0, BCF e o SDK. Os planos pagos só acrescentam o que precisa dos nossos servidores, ou ferramentas novas para equipas.' },
      { q: 'Posso pagar já?', a: 'Ainda não. Os planos pagos abrem primeiro à lista de espera. Deixe o seu e-mail e escrevemos uma só vez, quando o seu plano abrir. Os preços ainda podem mudar; a lista mantém a oferta de fundador.' },
      { q: 'Onde ficam os ficheiros nos planos pagos?', a: 'Em servidores na UE. No plano gratuito nada é enviado: é o seu navegador que abre o ficheiro.' },
      { q: 'Os meus subempreiteiros pagam a Receção?', a: 'Não. Verificam os ficheiros contra os seus requisitos gratuitamente, no navegador. A Receção é paga por quem recebe as entregas.' },
    ],
  },
  dialog: {
    title: 'Lista de espera do {plan}', titleTalk: 'Falemos do {plan}', desc: 'Escrevemos uma vez, quando este plano abrir. Sem newsletter.',
    email: 'E-mail profissional', emailPh: 'voce@empresa.pt', role: 'Sobretudo',
    roles: { deliver: 'Entrego modelos a clientes', receive: 'Recebo modelos de subempreiteiros', build: 'Desenvolvo software por cima', other: 'Outro' },
    close: 'Fechar', join: 'Entrar', saving: 'A guardar…', ok: 'Já está na lista. Escrevemos uma vez, quando abrir.', err: 'Não foi possível guardar. Tente de novo dentro de momentos.',
  },
  footer: { privacy: 'Privacidade', terms: 'Termos', onPrem: 'Nos seus servidores' },
}

const it: PricingCopy = {
  htmlLang: 'it',
  meta: {
    title: 'Prezzi — IFC Viewer Online',
    description: 'Gratis nel browser: visualizzatore IFC, Health Score, IDS, BCF. Pro, Team e Ricezione aggiungono archiviazione nell’UE, link al cliente e controllo consegne.',
  },
  nav: { validator: 'Validatore', sdk: 'SDK', blog: 'Blog', open: 'Apri il visualizzatore', theme: 'Tema chiaro o scuro' },
  h1: 'Gratis nel browser. A pagamento quando lavorano i nostri server.',
  lead: 'Aprire, misurare e verificare file IFC resta gratis per sempre. I piani a pagamento aggiungono archiviazione nell’UE, link per il tuo cliente, controllo qualità del team e una casella che riceve le consegne dei tuoi subappaltatori.',
  status: 'I piani a pagamento non sono ancora in vendita. La lista d’attesa li riceve per prima, con l’offerta fondatori.',
  pick: {
    legend: 'Cosa fai con i file IFC?',
    roles: {
      open: 'Apro e controllo un modello ogni tanto',
      solo: 'Consegno modelli ai clienti, da solo',
      team: 'Consegno modelli come studio o società di ingegneria',
      receive: 'Ricevo modelli dai subappaltatori',
      build: 'Sviluppo software sopra',
    },
    why: {
      free: 'Ti basta il gratuito: visualizzatore, Health Score, IDS e BCF, senza caricare nulla.',
      pro: 'Pro: apri file troppo grandi per il browser e invia un link al tuo cliente.',
      team: 'Team: uno standard dello studio, controllo qualità a ogni caricamento e un portale per il cliente.',
      reception: 'Ricezione: i subappaltatori verificano i tuoi requisiti prima di inviare.',
      developer: 'Developer: l’API di validazione ospitata. L’SDK client resta gratuito.',
      enterprise: 'Enterprise: Ricezione su tutto il portafoglio, con accesso unico.',
    },
    see: 'Vedi il piano',
  },
  plans: {
    h2: 'Per chi consegna modelli',
    sub: 'Architetti, ingegneri e coordinatori BIM che inviano IFC a un cliente.',
    show: 'Piano',
    recommended: 'Adatto a quello che fai',
  },
  names: { free: 'Gratis', pro: 'Pro', team: 'Team', reception: 'Ricezione', developer: 'Developer', enterprise: 'Enterprise' },
  who: { free: 'Chiunque abbia un IFC', pro: 'Una persona', team: 'Studi e società di ingegneria' },
  price: {
    free: '{p}, per sempre',
    month: '{p} / mese, fatturato annualmente',
    editorMonth: '{p} per editor / mese, fatturato annualmente',
    yearly: '{y} all’anno · {m} / mese con pagamento mensile',
    minEditors: 'Minimo {n} editor',
    founder: 'Offerta fondatori per Team e Ricezione: {n}% di sconto per {m} mesi ai primi {t} clienti, in cambio di un caso di studio pubblicato.',
  },
  groups: { files: 'File e archiviazione', share: 'Condividere con il cliente', quality: 'Qualità in tutto il team', contract: 'Automazione e contratto' },
  rows: {
    browser: { label: 'Tutto ciò che gira nel browser', note: 'Visualizzatore, sezioni, misure, Health Score con 44 regole, IDS 1.0, BCF, mappa, SDK da incorporare. Senza account; i file non lasciano il tuo browser.' },
    storage: { label: 'Archiviazione nell’UE, con versioni', pro: '20 GB', team: '100 GB per editor, condivisi' },
    large: { label: 'File troppo grandi per il browser', pro: 'Fino a 1 GB per file', team: 'Fino a 3 GB per file' },
    link: { label: 'Un link per il tuo cliente', pro: 'Con password e scadenza', team: 'Portale cliente con il tuo logo' },
    guests: { label: 'Revisori e ospiti', team: 'Gratis, non contano come editor' },
    gate: { label: 'Controllo qualità a ogni caricamento' },
    standard: { label: 'Standard dello studio, ruoli, stati ISO 19650' },
    api: { label: 'API di validazione ospitata', pro: '500 verifiche / mese', team: '2.000 verifiche / mese per team' },
    dpa: { label: 'Accordo sul trattamento dei dati (DPA)' },
  },
  included: 'Incluso',
  notIncluded: 'Non incluso',
  cta: { free: 'Apri il visualizzatore', waitlist: 'Iscriviti alla lista', talk: 'Contattaci' },
  reception: {
    h2: 'Per chi riceve modelli',
    sub: 'Imprese, sviluppatori immobiliari, committenti e facility manager che raccolgono modelli da molti subappaltatori.',
    perProject: 'Da {p} / mese per cantiere attivo, fino a {n} subappaltatori',
    unlimited: 'Portafoglio: da {p} / mese, cantieri e subappaltatori illimitati',
    body: 'Smetti di ricevere modelli da rimandare indietro. I tuoi subappaltatori verificano gratis i file rispetto ai tuoi requisiti prima di inviarli; ricevi solo ciò che è conforme e vedi chi consegna bene.',
    steps: [
      { b: 'Pubblica i tuoi requisiti', t: 'come link o QR per gare e contratti: IDS, regole, punteggio minimo, nomenclatura.' },
      { b: 'I subappaltatori verificano gratis', t: 'nel browser e correggono prima di inviare.' },
      { b: 'Una casella delle consegne', t: 'riverifica ogni file, conserva la versione e la accetta o la respinge con issue BCF.' },
      { b: 'Uno storico per subappaltatore:', t: 'consegne, accettate al primo invio, andamento del punteggio.' },
      { b: 'Un report di chiusura', t: 'sulle informazioni ricevute, pronto per la manutenzione.' },
    ],
  },
  more: {
    h2: 'Per sviluppare sopra, o per un intero portafoglio',
    dev: 'L’SDK client è gratuito. Developer aggiunge un’API di validazione ospitata per piattaforme, CDE e automazioni.',
    devPrice: '{p} / mese, fatturato annualmente, + consumo',
    ent: 'Ricezione su tutto il portafoglio, accesso unico, accordo sul trattamento dei dati e un’opzione on-premise senza accesso a internet.',
    entPrice: 'Da {p} / anno',
    onPrem: 'Validatore on-premise',
  },
  faq: {
    h2: 'Domande',
    items: [
      { q: 'Quale piano fa per me?', a: 'Se apri e controlli modelli, Gratis. Se consegni modelli ai clienti da solo, Pro. Se nel tuo studio consegnano più persone, Team, da tre editor. Se ricevi modelli dai subappaltatori, Ricezione.' },
      { q: 'Il visualizzatore gratuito resterà gratis?', a: 'Sì. Tutto ciò che gira nel browser resta gratis per sempre: visualizzatore, misure, sezioni, Health Score, 44 regole, IDS 1.0, BCF e l’SDK. I piani a pagamento aggiungono solo ciò che richiede i nostri server, o nuovi strumenti per i team.' },
      { q: 'Posso già pagare?', a: 'Non ancora. I piani a pagamento aprono prima alla lista d’attesa. Lascia la tua email e ti scriviamo una volta, quando apre il tuo piano. I prezzi possono ancora cambiare; la lista mantiene l’offerta fondatori.' },
      { q: 'Dove sono archiviati i file nei piani a pagamento?', a: 'Su server nell’UE. Nel piano gratuito non si carica nulla: è il tuo browser ad aprire il file.' },
      { q: 'I miei subappaltatori pagano la Ricezione?', a: 'No. Verificano i loro file rispetto ai tuoi requisiti gratis, nel browser. La Ricezione la paga chi riceve le consegne.' },
    ],
  },
  dialog: {
    title: 'Lista d’attesa di {plan}', titleTalk: 'Parliamo di {plan}', desc: 'Ti scriviamo una volta, quando apre questo piano. Niente newsletter.',
    email: 'Email di lavoro', emailPh: 'tu@azienda.it', role: 'Soprattutto',
    roles: { deliver: 'Consegno modelli ai clienti', receive: 'Ricevo modelli dai subappaltatori', build: 'Sviluppo software sopra', other: 'Altro' },
    close: 'Chiudi', join: 'Iscrivimi', saving: 'Salvataggio…', ok: 'Sei nella lista. Ti scriveremo una volta, all’apertura.', err: 'Impossibile salvare. Riprova tra un momento.',
  },
  footer: { privacy: 'Privacy', terms: 'Termini', onPrem: 'On-premise' },
}

const ca: PricingCopy = {
  htmlLang: 'ca',
  meta: {
    title: 'Preus — IFC Viewer Online',
    description: 'Gratuït al navegador: visor IFC, Health Score, IDS i BCF. Pro, Team i Recepció afegeixen emmagatzematge a la UE, enllaços al client i control de lliuraments.',
  },
  nav: { validator: 'Validador', sdk: 'SDK', blog: 'Blog', open: 'Obrir el visor', theme: 'Canviar a clar o fosc' },
  h1: 'Gratuït al navegador. De pagament quan treballen els nostres servidors.',
  lead: 'Obrir, mesurar i revisar IFC continua sent gratuït per sempre. Els plans de pagament afegeixen emmagatzematge a la UE, enllaços per al teu client, control de qualitat de l’equip i una safata que rep els lliuraments de les subcontractes.',
  status: 'Els plans de pagament encara no estan a la venda. La llista d’espera els rep primer, amb l’oferta de fundador.',
  pick: {
    legend: 'Què fas amb els IFC?',
    roles: {
      open: 'Obro i reviso algun model de tant en tant',
      solo: 'Lliuro models a clients, pel meu compte',
      team: 'Lliuro models com a estudi o enginyeria',
      receive: 'Rebo models de subcontractes',
      build: 'Desenvolupo programari a sobre',
    },
    why: {
      free: 'En tens prou amb el gratuït: visor, Health Score, IDS i BCF, sense pujar res.',
      pro: 'Pro: obre fitxers massa grans per al navegador i envia un enllaç al teu client.',
      team: 'Team: un estàndard de la casa, control de qualitat a cada pujada i un portal per al teu client.',
      reception: 'Recepció: les subcontractes comproven els teus requisits abans d’enviar.',
      developer: 'Developer: l’API de validació allotjada. L’SDK de client continua sent gratuït.',
      enterprise: 'Enterprise: Recepció a tota la cartera d’obres, amb inici de sessió únic.',
    },
    see: 'Veure el pla',
  },
  plans: {
    h2: 'Per a qui lliura models',
    sub: 'Arquitectes, enginyers i coordinadors BIM que envien IFC a un client.',
    show: 'Pla',
    recommended: 'Encaixa amb el que fas',
  },
  names: { free: 'Gratuït', pro: 'Pro', team: 'Team', reception: 'Recepció', developer: 'Developer', enterprise: 'Enterprise' },
  who: { free: 'Qualsevol amb un IFC', pro: 'Una persona', team: 'Estudis i enginyeries' },
  price: {
    free: '{p}, per sempre',
    month: '{p} / mes, pagament anual',
    editorMonth: '{p} per editor / mes, pagament anual',
    yearly: '{y} l’any · {m} / mes si pagues mes a mes',
    minEditors: 'Mínim {n} editors',
    founder: 'Oferta de fundador per a Team i Recepció: {n} % de descompte durant {m} mesos per als {t} primers clients, a canvi d’un cas d’èxit publicat.',
  },
  groups: { files: 'Fitxers i emmagatzematge', share: 'Compartir amb el client', quality: 'Qualitat a tot l’equip', contract: 'Automatització i contracte' },
  rows: {
    browser: { label: 'Tot el que funciona al navegador', note: 'Visor, seccions, mesura, Health Score amb 44 regles, IDS 1.0, BCF, mapa i SDK per incrustar. Sense compte; els fitxers no surten del teu navegador.' },
    storage: { label: 'Emmagatzematge a la UE, amb versions', pro: '20 GB', team: '100 GB per editor, compartits' },
    large: { label: 'Fitxers massa grans per al navegador', pro: 'Fins a 1 GB per fitxer', team: 'Fins a 3 GB per fitxer' },
    link: { label: 'Un enllaç per al teu client', pro: 'Amb contrasenya i caducitat', team: 'Portal del client amb el teu logotip' },
    guests: { label: 'Revisors i convidats', team: 'Gratuïts, no compten com a editors' },
    gate: { label: 'Control de qualitat a cada pujada' },
    standard: { label: 'Estàndard de la casa, rols i estats ISO 19650' },
    api: { label: 'API de validació allotjada', pro: '500 comprovacions / mes', team: '2.000 comprovacions / mes per equip' },
    dpa: { label: 'Contracte d’encarregat del tractament' },
  },
  included: 'Inclòs',
  notIncluded: 'No inclòs',
  cta: { free: 'Obrir el visor', waitlist: 'Apuntar-me a la llista', talk: 'Parlar amb nosaltres' },
  reception: {
    h2: 'Per a qui rep models',
    sub: 'Constructores, promotores, propietats i gestors d’actius que reben models de moltes subcontractes.',
    perProject: 'Des de {p} / mes per obra activa, fins a {n} subcontractes',
    unlimited: 'Cartera: des de {p} / mes, obres i subcontractes il·limitades',
    body: 'Deixa de rebre models que has de retornar. Les subcontractes comproven els seus fitxers gratis contra els teus requisits abans d’enviar-los; només reps el que compleix i veus qui lliura bé.',
    steps: [
      { b: 'Publica els teus requisits', t: 'com a enllaç o QR per a licitacions i contractes: IDS, regles, nota mínima i nomenclatura.' },
      { b: 'Les subcontractes comproven gratis', t: 'al seu navegador i corregeixen abans d’enviar.' },
      { b: 'Una safata de lliuraments', t: 'torna a comprovar cada fitxer, en desa la versió i l’accepta o la rebutja amb issues BCF.' },
      { b: 'Un historial per subcontracta:', t: 'lliuraments, acceptats a la primera i evolució de la nota.' },
      { b: 'Un informe de tancament', t: 'de la informació rebuda, a punt per al manteniment.' },
    ],
  },
  more: {
    h2: 'Per integrar, o per a tota una cartera',
    dev: 'L’SDK de client és gratuït. Developer afegeix una API de validació allotjada per a plataformes, CDE i automatitzacions.',
    devPrice: '{p} / mes, pagament anual, + consum',
    ent: 'Recepció a tota la cartera, inici de sessió únic, contracte d’encarregat del tractament i una opció als teus servidors sense accés a internet.',
    entPrice: 'Des de {p} / any',
    onPrem: 'Validador als teus servidors',
  },
  faq: {
    h2: 'Preguntes',
    items: [
      { q: 'Quin pla em convé?', a: 'Si obres i revises models, el gratuït. Si lliures models a clients pel teu compte, Pro. Si a la teva empresa lliuren diverses persones, Team, a partir de tres editors. Si reps models de subcontractes, Recepció.' },
      { q: 'El visor gratuït continuarà sent gratuït?', a: 'Sí. Tot el que funciona al navegador continua gratuït per sempre: visor, mesura, seccions, Health Score, 44 regles, IDS 1.0, BCF i l’SDK. Els plans de pagament només afegeixen el que necessita els nostres servidors, o eines noves per a equips.' },
      { q: 'Puc pagar ja?', a: 'Encara no. Els plans de pagament s’obren primer a la llista d’espera. Deixa el teu correu i t’escrivim una sola vegada, quan s’obri el teu pla. Els preus encara poden canviar; la llista conserva l’oferta de fundador.' },
      { q: 'On es desen els fitxers als plans de pagament?', a: 'En servidors de la UE. Al pla gratuït no es puja res: el teu navegador obre el fitxer.' },
      { q: 'Les meves subcontractes paguen per Recepció?', a: 'No. Comproven els seus fitxers contra els teus requisits gratis, al navegador. Recepció la paga qui rep els lliuraments.' },
    ],
  },
  dialog: {
    title: 'Llista d’espera de {plan}', titleTalk: 'Parlem de {plan}', desc: 'T’escrivim una vegada, quan s’obri aquest pla. Sense butlletins.',
    email: 'Correu de feina', emailPh: 'tu@empresa.cat', role: 'Sobretot',
    roles: { deliver: 'Lliuro models a clients', receive: 'Rebo models de subcontractes', build: 'Desenvolupo programari a sobre', other: 'Altres' },
    close: 'Tancar', join: 'Apuntar-me', saving: 'Desant…', ok: 'Ja ets a la llista. T’escriurem una vegada, quan s’obri.', err: 'No s’ha pogut desar. Torna-ho a provar d’aquí a un moment.',
  },
  footer: { privacy: 'Privadesa', terms: 'Condicions', onPrem: 'Als teus servidors' },
}

const zh: PricingCopy = {
  htmlLang: 'zh',
  meta: {
    title: '价格 — IFC Viewer Online',
    description: '在浏览器中运行的功能全部免费：IFC 查看器、Health Score、IDS、BCF。Pro、Team 和接收版增加欧盟存储、业主链接、质量门禁和交付接收。',
  },
  nav: { validator: '验证器', sdk: 'SDK', blog: '博客', open: '打开查看器', theme: '切换浅色或深色' },
  h1: '在浏览器中免费。用到我们的服务器时才付费。',
  lead: '打开、测量和检查 IFC 文件永久免费。付费方案增加欧盟存储、给业主的链接、团队质量门禁，以及接收分包商交付的收件箱。',
  status: '付费方案尚未开售。候补名单的用户最先开通，并享受首发优惠。',
  pick: {
    legend: '你用 IFC 文件做什么？',
    roles: {
      open: '偶尔打开并检查模型',
      solo: '独立向业主交付模型',
      team: '以设计院或工程公司身份交付模型',
      receive: '接收分包商的模型',
      build: '基于它开发自己的软件',
    },
    why: {
      free: '免费版就够了：查看器、Health Score、IDS 和 BCF，无需上传任何文件。',
      pro: 'Pro：打开浏览器装不下的大文件，并给业主发送链接。',
      team: 'Team：统一的公司标准，每次上传都有质量门禁，还有给业主的门户。',
      reception: '接收版：分包商在发送前按你的要求自查。',
      developer: 'Developer：托管的验证 API。客户端 SDK 仍然免费。',
      enterprise: 'Enterprise：在整个项目组合中使用接收版，支持单点登录。',
    },
    see: '查看方案',
  },
  plans: {
    h2: '面向交付模型的人',
    sub: '向业主发送 IFC 的建筑师、工程师和 BIM 协调员。',
    show: '方案',
    recommended: '适合你的工作',
  },
  names: { free: '免费版', pro: 'Pro', team: 'Team', reception: '接收版', developer: 'Developer', enterprise: 'Enterprise' },
  who: { free: '所有使用 IFC 的人', pro: '个人', team: '设计院和工程公司' },
  price: {
    free: '{p}，永久',
    month: '{p} / 月，按年付费',
    editorMonth: '每位编辑者 {p} / 月，按年付费',
    yearly: '每年 {y} · 按月付费为 {m} / 月',
    minEditors: '至少 {n} 位编辑者',
    founder: 'Team 和接收版首发优惠：前 {t} 位客户 {m} 个月享 {n}% 折扣，条件是发布一篇客户案例。',
  },
  groups: { files: '文件与存储', share: '与业主共享', quality: '全团队质量', contract: '自动化与合同' },
  rows: {
    browser: { label: '浏览器中的全部功能', note: '查看器、剖切、测量、含 44 条规则的 Health Score、IDS 1.0、BCF、地图、嵌入 SDK。无需账号；文件不会离开你的浏览器。' },
    storage: { label: '欧盟存储，含版本记录', pro: '20 GB', team: '每位编辑者 100 GB，共享' },
    large: { label: '浏览器装不下的大文件', pro: '单个文件最大 1 GB', team: '单个文件最大 3 GB' },
    link: { label: '给业主的链接', pro: '密码与有效期', team: '带贵司 Logo 的业主门户' },
    guests: { label: '审阅者和访客', team: '免费，不计入编辑者席位' },
    gate: { label: '每次上传的质量门禁' },
    standard: { label: '公司标准、角色、ISO 19650 状态' },
    api: { label: '托管验证 API', pro: '每月 500 次检查', team: '每个团队每月 2,000 次检查' },
    dpa: { label: '数据处理协议（DPA）' },
  },
  included: '包含',
  notIncluded: '不包含',
  cta: { free: '打开查看器', waitlist: '加入候补名单', talk: '联系我们' },
  reception: {
    h2: '面向接收模型的人',
    sub: '从众多分包商收集模型的总包、开发商、业主和设施管理者。',
    perProject: '每个在建项目 {p} / 月起，最多 {n} 家分包商',
    unlimited: '项目组合：{p} / 月起，项目和分包商不限',
    body: '不再收到需要退回的模型。分包商在发送前免费按你的要求检查文件；你只收到合格的模型，并能看出谁交付得好。',
    steps: [
      { b: '发布你的要求', t: '以链接或二维码用于招标和合同：IDS、规则、最低分数、命名。' },
      { b: '分包商免费自查', t: '在浏览器中修正后再发送。' },
      { b: '交付收件箱', t: '重新检查每个文件，保留版本，并附 BCF 问题清单予以接收或退回。' },
      { b: '每家分包商的记录：', t: '交付次数、一次通过率、分数走势。' },
      { b: '竣工交付报告', t: '汇总收到的信息，可直接用于运维。' },
    ],
  },
  more: {
    h2: '基于它开发，或覆盖整个项目组合',
    dev: '客户端 SDK 免费。Developer 为平台、CDE 和自动化增加托管验证 API。',
    devPrice: '{p} / 月，按年付费，+ 用量',
    ent: '在整个项目组合中使用接收版、单点登录、数据处理协议，以及无需联网的本地部署选项。',
    entPrice: '{p} / 年起',
    onPrem: '本地部署验证器',
  },
  faq: {
    h2: '常见问题',
    items: [
      { q: '哪个方案适合我？', a: '只是打开和检查模型，用免费版。独立向业主交付模型，用 Pro。公司里有多人交付，用 Team，三位编辑者起。接收分包商的模型，用接收版。' },
      { q: '免费查看器会一直免费吗？', a: '会。在浏览器中运行的功能永久免费：查看器、测量、剖切、Health Score、44 条规则、IDS 1.0、BCF 和 SDK。付费方案只增加需要我们服务器的功能，或面向团队的新工具。' },
      { q: '现在可以付费吗？', a: '还不行。付费方案先向候补名单开放。留下邮箱，你的方案开放时我们只发一封邮件。上线前价格可能调整；候补名单保留首发优惠。' },
      { q: '付费方案的文件存在哪里？', a: '存放在欧盟的服务器上。免费方案不上传任何文件：由你的浏览器打开。' },
      { q: '我的分包商需要为接收版付费吗？', a: '不需要。他们在浏览器中免费按你的要求检查文件。接收版由接收交付的一方付费。' },
    ],
  },
  dialog: {
    title: '加入 {plan} 候补名单', titleTalk: '咨询 {plan}', desc: '方案开放时我们只发一封邮件。不发简报。',
    email: '工作邮箱', emailPh: 'you@company.com', role: '你的主要工作',
    roles: { deliver: '向业主交付模型', receive: '接收分包商的模型', build: '基于它开发自己的软件', other: '其他' },
    close: '关闭', join: '加入', saving: '正在保存…', ok: '已加入名单。开放时我们会发一封邮件通知你。', err: '保存失败，请稍后再试。',
  },
  footer: { privacy: '隐私', terms: '条款', onPrem: '本地部署' },
}

const ja: PricingCopy = {
  htmlLang: 'ja',
  meta: {
    title: '料金 — IFC Viewer Online',
    description: 'ブラウザで動く機能はすべて無料：IFC ビューア、Health Score、IDS、BCF。Pro、Team、納品受付プランは EU 内の保存、クライアント用リンク、品質ゲート、納品物の受領を追加します。',
  },
  nav: { validator: 'バリデータ', sdk: 'SDK', blog: 'ブログ', open: 'ビューアを開く', theme: 'ライト／ダーク切替' },
  h1: 'ブラウザでは無料。サーバーを使うときだけ有料。',
  lead: 'IFC ファイルを開く・測る・チェックするのはずっと無料です。有料プランでは EU 内の保存、クライアント用リンク、チームの品質ゲート、協力会社からの納品を受け取る受付箱が加わります。',
  status: '有料プランはまだ販売していません。ウェイティングリストの方から順に、早期登録特典付きでご案内します。',
  pick: {
    legend: 'IFC ファイルで何をしていますか？',
    roles: {
      open: 'ときどきモデルを開いて確認する',
      solo: '個人でクライアントにモデルを納品する',
      team: '設計事務所や建設コンサルとして納品する',
      receive: '協力会社からモデルを受け取る',
      build: '自社のソフトウェアに組み込む',
    },
    why: {
      free: '無料プランで十分です：ビューア、Health Score、IDS、BCF。アップロードは不要です。',
      pro: 'Pro：ブラウザでは重すぎるファイルを開き、クライアントにリンクを送れます。',
      team: 'Team：社内標準、アップロードごとの品質ゲート、クライアント用ポータル。',
      reception: '納品受付：協力会社が送る前に貴社の要件でチェックします。',
      developer: 'Developer：ホスト型の検証 API。クライアント SDK は無料のままです。',
      enterprise: 'Enterprise：ポートフォリオ全体で納品受付を運用し、シングルサインオンに対応。',
    },
    see: 'プランを見る',
  },
  plans: {
    h2: 'モデルを納品する方へ',
    sub: 'クライアントに IFC を送る建築家、エンジニア、BIM コーディネーター。',
    show: 'プラン',
    recommended: 'あなたの業務に合うプラン',
  },
  names: { free: '無料', pro: 'Pro', team: 'Team', reception: '納品受付', developer: 'Developer', enterprise: 'Enterprise' },
  who: { free: 'IFC を扱うすべての方', pro: '個人', team: '設計事務所・建設コンサル' },
  price: {
    free: '{p}、ずっと無料',
    month: '{p} / 月（年払い）',
    editorMonth: '編集者 1 人あたり {p} / 月（年払い）',
    yearly: '年額 {y} · 月払いは {m} / 月',
    minEditors: '編集者 {n} 人から',
    founder: 'Team と納品受付の早期特典：先着 {t} 社は {m} か月間 {n}% オフ（導入事例の公開が条件）。',
  },
  groups: { files: 'ファイルと保存', share: 'クライアントとの共有', quality: 'チーム全体の品質', contract: '自動化と契約' },
  rows: {
    browser: { label: 'ブラウザで動くすべての機能', note: 'ビューア、断面、計測、44 ルールの Health Score、IDS 1.0、BCF、地図、埋め込み SDK。アカウント不要。ファイルはブラウザの外に出ません。' },
    storage: { label: 'EU 内の保存（バージョン管理付き）', pro: '20 GB', team: '編集者 1 人あたり 100 GB、共有' },
    large: { label: 'ブラウザでは重すぎるファイル', pro: '1 ファイル最大 1 GB', team: '1 ファイル最大 3 GB' },
    link: { label: 'クライアント用リンク', pro: 'パスワードと有効期限', team: '自社ロゴ入りのクライアントポータル' },
    guests: { label: 'レビュアーとゲスト', team: '無料、編集者数に含めない' },
    gate: { label: 'アップロードごとの品質ゲート' },
    standard: { label: '社内標準、ロール、ISO 19650 のステータス' },
    api: { label: 'ホスト型検証 API', pro: '月 500 回', team: 'チームあたり月 2,000 回' },
    dpa: { label: 'データ処理契約（DPA）' },
  },
  included: '含まれる',
  notIncluded: '含まれない',
  cta: { free: 'ビューアを開く', waitlist: 'ウェイティングリストに登録', talk: 'お問い合わせ' },
  reception: {
    h2: 'モデルを受け取る方へ',
    sub: '多くの協力会社からモデルを集めるゼネコン、デベロッパー、発注者、施設管理者。',
    perProject: '稼働中のプロジェクトごとに {p} / 月から（協力会社 {n} 社まで）',
    unlimited: 'ポートフォリオ：{p} / 月から、プロジェクトと協力会社は無制限',
    body: '差し戻しが必要なモデルを受け取るのはもう終わりです。協力会社は送る前に貴社の要件に対して無料でファイルをチェックします。届くのは要件を満たしたものだけで、誰の納品が良いかも分かります。',
    steps: [
      { b: '要件を公開', t: '入札や契約向けにリンクや QR で：IDS、ルール、最低スコア、命名規則。' },
      { b: '協力会社は無料でチェック', t: 'ブラウザで修正してから送ります。' },
      { b: '納品受付箱', t: 'が各ファイルを再チェックし、バージョンを保存して、BCF の指摘付きで受理または差し戻します。' },
      { b: '協力会社ごとの記録：', t: '納品数、初回受理率、スコアの推移。' },
      { b: '竣工時の引き渡しレポート', t: '受け取った情報をまとめ、維持管理にそのまま使えます。' },
    ],
  },
  more: {
    h2: '自社製品に組み込む、またはポートフォリオ全体で',
    dev: 'クライアント SDK は無料です。Developer はプラットフォーム、CDE、自動化向けのホスト型検証 API を追加します。',
    devPrice: '{p} / 月（年払い）+ 従量',
    ent: 'ポートフォリオ全体での納品受付、シングルサインオン、データ処理契約、インターネット接続不要のオンプレミス版。',
    entPrice: '年額 {p} から',
    onPrem: 'オンプレミス版バリデータ',
  },
  faq: {
    h2: 'よくある質問',
    items: [
      { q: 'どのプランが合っていますか？', a: 'モデルを開いて確認するだけなら無料。個人でクライアントに納品するなら Pro。社内の複数人が納品するなら Team（編集者 3 人から）。協力会社からモデルを受け取るなら納品受付プラン。' },
      { q: '無料のビューアはずっと無料ですか？', a: 'はい。ブラウザで動く機能はずっと無料です：ビューア、計測、断面、Health Score、44 ルール、IDS 1.0、BCF、SDK。有料プランが加えるのは、サーバーが必要な機能とチーム向けの新しいツールだけです。' },
      { q: '今すぐ支払えますか？', a: 'まだです。有料プランはウェイティングリストから順に開きます。メールアドレスを登録いただければ、プラン開始時に一度だけご連絡します。開始前に価格が変わる可能性がありますが、リストの方には早期登録特典が適用されます。' },
      { q: '有料プランのファイルはどこに保存されますか？', a: 'EU 内のサーバーです。無料プランでは何もアップロードされず、ブラウザがファイルを開きます。' },
      { q: '協力会社は納品受付プランの料金を払いますか？', a: 'いいえ。協力会社はブラウザで無料で貴社の要件に対してチェックします。料金は納品を受け取る側が支払います。' },
    ],
  },
  dialog: {
    title: '{plan} のウェイティングリスト', titleTalk: '{plan} について相談する', desc: 'プラン開始時に一度だけご連絡します。ニュースレターは送りません。',
    email: '仕事用メールアドレス', emailPh: 'you@company.co.jp', role: '主な業務',
    roles: { deliver: 'クライアントにモデルを納品', receive: '協力会社からモデルを受け取る', build: '自社ソフトに組み込む', other: 'その他' },
    close: '閉じる', join: '登録する', saving: '保存中…', ok: '登録しました。開始時に一度だけご連絡します。', err: '保存できませんでした。しばらくしてからもう一度お試しください。',
  },
  footer: { privacy: 'プライバシー', terms: '利用規約', onPrem: 'オンプレミス' },
}

const th: PricingCopy = {
  htmlLang: 'th',
  meta: {
    title: 'ราคา — IFC Viewer Online',
    description: 'ฟรีในเบราว์เซอร์: ตัวดู IFC, Health Score, IDS, BCF ส่วน Pro, Team และแผนตรวจรับเพิ่มพื้นที่เก็บในสหภาพยุโรป ลิงก์สำหรับลูกค้า และการตรวจรับงานส่งมอบ',
  },
  nav: { validator: 'ตัวตรวจสอบ', sdk: 'SDK', blog: 'บล็อก', open: 'เปิดตัวดู', theme: 'สลับโหมดสว่างหรือมืด' },
  h1: 'ฟรีในเบราว์เซอร์ จ่ายเมื่อใช้เซิร์ฟเวอร์ของเรา',
  lead: 'การเปิด วัด และตรวจไฟล์ IFC ยังฟรีตลอดไป แผนแบบชำระเงินเพิ่มพื้นที่เก็บในสหภาพยุโรป ลิงก์สำหรับลูกค้า ด่านตรวจคุณภาพของทีม และกล่องรับงานส่งมอบจากผู้รับเหมาช่วง',
  status: 'แผนแบบชำระเงินยังไม่เปิดขาย ผู้ที่อยู่ในรายชื่อรอจะได้ใช้ก่อน พร้อมข้อเสนอสำหรับสมาชิกกลุ่มแรก',
  pick: {
    legend: 'คุณใช้ไฟล์ IFC ทำอะไร',
    roles: {
      open: 'เปิดและตรวจโมเดลเป็นครั้งคราว',
      solo: 'ทำงานคนเดียว ส่งมอบโมเดลให้ลูกค้า',
      team: 'ส่งมอบโมเดลในนามสำนักงานหรือบริษัทวิศวกรรม',
      receive: 'รับโมเดลจากผู้รับเหมาช่วง',
      build: 'พัฒนาซอฟต์แวร์ต่อยอด',
    },
    why: {
      free: 'แผนฟรีเพียงพอ: ตัวดู Health Score IDS และ BCF โดยไม่ต้องอัปโหลดอะไร',
      pro: 'Pro: เปิดไฟล์ที่ใหญ่เกินเบราว์เซอร์ และส่งลิงก์ให้ลูกค้า',
      team: 'Team: มาตรฐานของบริษัท ด่านตรวจคุณภาพทุกครั้งที่อัปโหลด และพอร์ทัลสำหรับลูกค้า',
      reception: 'แผนตรวจรับ: ผู้รับเหมาช่วงตรวจตามข้อกำหนดของคุณก่อนส่ง',
      developer: 'Developer: API ตรวจสอบแบบโฮสต์ ส่วน SDK ฝั่งไคลเอนต์ยังฟรี',
      enterprise: 'Enterprise: ใช้แผนตรวจรับทั้งพอร์ตโฟลิโอ พร้อมSingle Sign-On (SSO)',
    },
    see: 'ดูแผน',
  },
  plans: {
    h2: 'สำหรับผู้ส่งมอบโมเดล',
    sub: 'สถาปนิก วิศวกร และผู้ประสานงาน BIM ที่ส่งไฟล์ IFC ให้ลูกค้า',
    show: 'แผน',
    recommended: 'เหมาะกับงานของคุณ',
  },
  names: { free: 'ฟรี', pro: 'Pro', team: 'Team', reception: 'ตรวจรับ', developer: 'Developer', enterprise: 'Enterprise' },
  who: { free: 'ทุกคนที่มีไฟล์ IFC', pro: 'หนึ่งคน', team: 'สำนักงานออกแบบและบริษัทวิศวกรรม' },
  price: {
    free: '{p} ตลอดไป',
    month: '{p} / เดือน เมื่อชำระรายปี',
    editorMonth: '{p} ต่อผู้ใช้สิทธิ์แก้ไข / เดือน เมื่อชำระรายปี',
    yearly: '{y} ต่อปี · {m} / เดือน หากชำระรายเดือน',
    minEditors: 'ขั้นต่ำ {n} ผู้ใช้สิทธิ์แก้ไข',
    founder: 'ข้อเสนอสมาชิกกลุ่มแรกสำหรับ Team และตรวจรับ: ลด {n}% เป็นเวลา {m} เดือน สำหรับ {t} ลูกค้าแรก แลกกับการเผยแพร่กรณีศึกษา',
  },
  groups: { files: 'ไฟล์และพื้นที่เก็บ', share: 'แชร์กับลูกค้า', quality: 'คุณภาพทั้งทีม', contract: 'ระบบอัตโนมัติและสัญญา' },
  rows: {
    browser: { label: 'ทุกอย่างในเบราว์เซอร์', note: 'ตัวดู ภาพตัด การวัด Health Score 44 กฎ IDS 1.0 BCF แผนที่ และ SDK สำหรับฝัง ไม่ต้องมีบัญชี ไฟล์ไม่ออกจากเบราว์เซอร์ของคุณ' },
    storage: { label: 'พื้นที่เก็บในสหภาพยุโรป พร้อมเวอร์ชัน', pro: '20 GB', team: '100 GB ต่อผู้ใช้สิทธิ์แก้ไข ใช้ร่วมกัน' },
    large: { label: 'ไฟล์ที่ใหญ่เกินเบราว์เซอร์', pro: 'สูงสุด 1 GB ต่อไฟล์', team: 'สูงสุด 3 GB ต่อไฟล์' },
    link: { label: 'ลิงก์สำหรับลูกค้า', pro: 'มีรหัสผ่านและวันหมดอายุ', team: 'พอร์ทัลลูกค้าพร้อมโลโก้ของคุณ' },
    guests: { label: 'ผู้ตรวจทานและผู้เยี่ยมชม', team: 'ฟรี ไม่นับเป็นผู้ใช้สิทธิ์แก้ไข' },
    gate: { label: 'ด่านตรวจคุณภาพทุกครั้งที่อัปโหลด' },
    standard: { label: 'มาตรฐานบริษัท บทบาท และสถานะ ISO 19650' },
    api: { label: 'API ตรวจสอบแบบโฮสต์', pro: '500 ครั้ง / เดือน', team: '2,000 ครั้ง / เดือน ต่อทีม' },
    dpa: { label: 'ข้อตกลงการประมวลผลข้อมูล (DPA)' },
  },
  included: 'รวมอยู่',
  notIncluded: 'ไม่รวม',
  cta: { free: 'เปิดตัวดู', waitlist: 'เข้ารายชื่อรอ', talk: 'ติดต่อเรา' },
  reception: {
    h2: 'สำหรับผู้รับโมเดล',
    sub: 'ผู้รับเหมาหลัก ผู้พัฒนาโครงการ เจ้าของอาคาร และผู้จัดการอาคาร ที่รวบรวมโมเดลจากผู้รับเหมาช่วงจำนวนมาก',
    perProject: 'เริ่มต้น {p} / เดือน ต่อโครงการที่ดำเนินอยู่ สูงสุด {n} ผู้รับเหมาช่วง',
    unlimited: 'พอร์ตโฟลิโอ: เริ่มต้น {p} / เดือน ไม่จำกัดโครงการและผู้รับเหมาช่วง',
    body: 'เลิกรับโมเดลที่ต้องส่งกลับไปแก้ ผู้รับเหมาช่วงตรวจไฟล์ของตนตามข้อกำหนดของคุณฟรีก่อนส่ง คุณได้รับเฉพาะงานที่ผ่าน และเห็นว่าใครส่งงานได้ดี',
    steps: [
      { b: 'เผยแพร่ข้อกำหนดของคุณ', t: 'เป็นลิงก์หรือ QR สำหรับการประมูลและสัญญา: IDS กฎ คะแนนขั้นต่ำ การตั้งชื่อ' },
      { b: 'ผู้รับเหมาช่วงตรวจฟรี', t: 'ในเบราว์เซอร์และแก้ไขก่อนส่ง' },
      { b: 'กล่องรับงานส่งมอบ', t: 'ตรวจทุกไฟล์ซ้ำ เก็บเวอร์ชัน และตรวจรับหรือตีกลับพร้อมรายการปัญหา BCF' },
      { b: 'ประวัติของผู้รับเหมาช่วงแต่ละราย:', t: 'จำนวนการส่ง การผ่านในครั้งแรก แนวโน้มคะแนน' },
      { b: 'รายงานส่งมอบเมื่อจบโครงการ', t: 'สรุปข้อมูลที่ได้รับ พร้อมใช้สำหรับงานบำรุงรักษา' },
    ],
  },
  more: {
    h2: 'พัฒนาต่อยอด หรือใช้ทั้งพอร์ตโฟลิโอ',
    dev: 'SDK ฝั่งไคลเอนต์ใช้ฟรี Developer เพิ่ม API ตรวจสอบแบบโฮสต์สำหรับแพลตฟอร์ม CDE และระบบอัตโนมัติ',
    devPrice: '{p} / เดือน เมื่อชำระรายปี + ตามการใช้งาน',
    ent: 'แผนตรวจรับทั้งพอร์ตโฟลิโอ Single Sign-On (SSO) ข้อตกลงการประมวลผลข้อมูล และตัวเลือกติดตั้งในองค์กรโดยไม่ต้องเชื่อมอินเทอร์เน็ต',
    entPrice: 'เริ่มต้น {p} / ปี',
    onPrem: 'ตัวตรวจสอบแบบติดตั้งในองค์กร',
  },
  faq: {
    h2: 'คำถามที่พบบ่อย',
    items: [
      { q: 'แผนไหนเหมาะกับฉัน', a: 'ถ้าเปิดและตรวจโมเดล ใช้แผนฟรี ถ้าทำงานคนเดียว ส่งมอบโมเดลให้ลูกค้า ใช้ Pro ถ้าหลายคนในบริษัทส่งมอบ ใช้ Team เริ่มที่สามผู้ใช้สิทธิ์แก้ไข ถ้ารับโมเดลจากผู้รับเหมาช่วง ใช้แผนตรวจรับ' },
      { q: 'ตัวดูฟรีจะฟรีตลอดไปหรือไม่', a: 'ใช่ ทุกอย่างที่ทำงานในเบราว์เซอร์ฟรีตลอดไป: ตัวดู การวัด ภาพตัด Health Score 44 กฎ IDS 1.0 BCF และ SDK แผนแบบชำระเงินเพิ่มเฉพาะสิ่งที่ต้องใช้เซิร์ฟเวอร์ของเรา หรือเครื่องมือใหม่สำหรับทีม' },
      { q: 'ชำระเงินได้แล้วหรือยัง', a: 'ยังไม่ได้ แผนแบบชำระเงินจะเปิดให้รายชื่อรอก่อน ฝากอีเมลไว้ แล้วเราจะเขียนถึงคุณครั้งเดียวเมื่อแผนของคุณเปิด ราคาอาจเปลี่ยนก่อนเปิดตัว แต่รายชื่อรอยังได้ข้อเสนอสมาชิกกลุ่มแรก' },
      { q: 'แผนแบบชำระเงินเก็บไฟล์ไว้ที่ไหน', a: 'บนเซิร์ฟเวอร์ในสหภาพยุโรป แผนฟรีไม่มีการอัปโหลดใด ๆ เบราว์เซอร์ของคุณเป็นผู้เปิดไฟล์' },
      { q: 'ผู้รับเหมาช่วงต้องจ่ายค่าแผนตรวจรับหรือไม่', a: 'ไม่ต้อง พวกเขาตรวจไฟล์ตามข้อกำหนดของคุณฟรีในเบราว์เซอร์ ผู้ที่รับงานส่งมอบเป็นผู้ชำระ' },
    ],
  },
  dialog: {
    title: 'รายชื่อรอ {plan}', titleTalk: 'คุยกับเราเรื่อง {plan}', desc: 'เราจะเขียนถึงคุณครั้งเดียวเมื่อแผนนี้เปิด ไม่มีจดหมายข่าว',
    email: 'อีเมลที่ทำงาน', emailPh: 'you@company.com', role: 'งานหลักของคุณ',
    roles: { deliver: 'ส่งมอบโมเดลให้ลูกค้า', receive: 'รับโมเดลจากผู้รับเหมาช่วง', build: 'พัฒนาซอฟต์แวร์ต่อยอด', other: 'อื่น ๆ' },
    close: 'ปิด', join: 'เข้ารายชื่อ', saving: 'กำลังบันทึก…', ok: 'คุณอยู่ในรายชื่อแล้ว เราจะเขียนถึงคุณครั้งเดียวเมื่อเปิด', err: 'บันทึกไม่สำเร็จ ลองอีกครั้งในอีกสักครู่',
  },
  footer: { privacy: 'ความเป็นส่วนตัว', terms: 'ข้อกำหนด', onPrem: 'ติดตั้งในองค์กร' },
}

export const COPY: Record<PricingLang, PricingCopy> = { en, es, de, fr, pt, it, ca, zh, ja, th }
