// ── /integrations/ copy ×10 ───────────────────────────────────────────────────
// One section per way in. Statuses live in integrations-data.ts, never here.
// House rules: plain product names, no assistant/AI wording (the MCP server is a
// "local server for desktop tools"), limits stated as plainly as the benefits.

import type { IntegrationsLang } from '../../../src/lib/integrations/integrations-paths'
import type { PageIntegrationId } from './integrations-data'

export interface ItemCopy {
  name: string
  what: string
  who: string
  steps: [string, string, string]
  limits: string
  cta: string
}

export interface IntegrationsCopy {
  htmlLang: string
  meta: { title: string; description: string }
  h1: string
  lead: string
  crumbHome: string
  nav: { pricing: string; blog: string; open: string; theme: string }
  onPage: string
  labels: { what: string; who: string; steps: string; limits: string }
  status: { available: string; review: string; soon: string }
  free: string
  shopifyAlt: string
  items: Record<PageIntegrationId, ItemCopy>
  soon: { h2: string; folders: string; ci: string; ask: string }
  foot: { privacy: string; terms: string }
}

export const COPY: Record<IntegrationsLang, IntegrationsCopy> = {
  en: {
    htmlLang: 'en',
    meta: { title: 'Integrations: WordPress, Shopify, SDK | IFC Viewer Online', description: 'Put the IFC viewer in WordPress, Shopify, your own app or desktop tools. What each integration does, who it is for, how to install it and its limits.' },
    h1: 'Integrations',
    lead: 'The same browser viewer, inside the tools you already use. Models are processed on the reader’s device: nothing is uploaded to us.',
    crumbHome: 'Home',
    nav: { pricing: 'Pricing', blog: 'Blog', open: 'Open the viewer', theme: 'Light or dark' },
    onPage: 'On this page',
    labels: { what: 'What it does', who: 'Who it is for', steps: 'Install', limits: 'Limits' },
    status: { available: 'Available', review: 'In review', soon: 'Coming soon' },
    free: 'Free',
    shopifyAlt: 'Free theme sections on GitHub',
    items: {
      wordpress: { name: 'WordPress plugin', what: 'A block and an [ifc_viewer] shortcode that show an interactive 3D IFC model in posts and pages.', who: 'Architects, engineers and manufacturers who publish projects or products on a WordPress site.', steps: ['In WordPress, open Plugins → Add New.', 'Search “Bimo IFC Viewer”, install and activate it.', 'Add the IFC Viewer block, or paste [ifc_viewer model="…"], with a public IFC URL.'], limits: 'The IFC must be reachable by URL (media library or a public link). Very large models load slowly on phones.', cta: 'Get it on wordpress.org' },
      shopify: { name: 'Shopify app', what: 'An IFC model per product or variant, a specification table read from the model and file downloads on the product page.', who: 'Building-product manufacturers that sell or list products on Shopify.', steps: ['Install the app from the Shopify App Store once it is approved.', 'Attach an IFC file to a product or variant.', 'Add the viewer block to the product template in the theme editor.'], limits: 'The app was submitted to the Shopify App Store and is in review, so it cannot be installed yet. Plans: Free, Starter and Business. Today you can copy the free theme sections from GitHub.', cta: 'Get the free sections' },
      sdk: { name: 'JavaScript SDK', what: 'Mount the viewer in your own web app and load IFC bytes from your code, with events and an API for selection, colours and camera.', who: 'Developers of CDEs, portals and internal tools.', steps: ['Import the SDK module from /sdk/ifc-viewer.es.js.', 'Create the viewer on an element of your page.', 'Pass the IFC bytes from your app with viewer.add().'], limits: 'Runs in the browser only: you need a page to host it. The SDK does not store files for you.', cta: 'Read the documentation' },
      embed: { name: 'Embed (iframe)', what: 'Paste one iframe to show a model on any page, with the camera, colours and panels you choose in the embed builder.', who: 'Anyone with a website, blog or CMS who does not want to write code.', steps: ['Open the embed builder.', 'Paste a public IFC URL and set the view.', 'Copy the iframe into your page.'], limits: 'The model URL must allow cross-origin requests (CORS). The iframe needs about 400 px of height to be usable.', cta: 'Open the embed builder' },
      mcp: { name: 'Local server for desktop tools (MCP)', what: 'A local server that lets desktop apps and code editors that speak the Model Context Protocol validate IFC files, check IDS and open models in 3D.', who: 'BIM coordinators and developers who work with IFC files from desktop tools.', steps: ['Install Node.js 18 or newer.', 'Add “npx -y ifc-viewer-mcp” as a server in your tool’s MCP settings.', 'Restart the tool and point it at an IFC file on your disk.'], limits: 'Needs a desktop tool that supports MCP and Node.js. Validation runs on your machine; the 3D view opens in the browser.', cta: 'See the source' },
    },
    soon: { h2: 'Coming soon', folders: 'SharePoint, OneDrive and Google Drive: check every model that lands in a project folder.', ci: 'GitHub Actions: fail a pull request when a model drops below your score.', ask: 'Tell us which one you need from the viewer’s feature request form.' },
    foot: { privacy: 'Privacy', terms: 'Terms' },
  },
  es: {
    htmlLang: 'es',
    meta: { title: 'Integraciones: WordPress, Shopify y SDK | IFC Viewer', description: 'Pon el visor IFC en WordPress, Shopify, tu propia app o tus herramientas de escritorio. Qué hace cada integración, para quién es, cómo instalarla y sus límites.' },
    h1: 'Integraciones',
    lead: 'El mismo visor del navegador, dentro de las herramientas que ya usas. Los modelos se procesan en el dispositivo de quien los ve: no nos subes nada.',
    crumbHome: 'Inicio',
    nav: { pricing: 'Precios', blog: 'Blog', open: 'Abrir el visor', theme: 'Claro u oscuro' },
    onPage: 'En esta página',
    labels: { what: 'Qué hace', who: 'Para quién', steps: 'Instalación', limits: 'Límites' },
    status: { available: 'Disponible', review: 'En revisión', soon: 'Próximamente' },
    free: 'Gratis',
    shopifyAlt: 'Secciones de tema gratis en GitHub',
    items: {
      wordpress: { name: 'Plugin de WordPress', what: 'Un bloque y un shortcode [ifc_viewer] que muestran un modelo IFC en 3D interactivo en entradas y páginas.', who: 'Arquitectos, ingenierías y fabricantes que publican proyectos o productos en una web WordPress.', steps: ['En WordPress, abre Plugins → Añadir nuevo.', 'Busca “Bimo IFC Viewer”, instálalo y actívalo.', 'Añade el bloque IFC Viewer, o pega [ifc_viewer model="…"], con una URL pública del IFC.'], limits: 'El IFC debe estar accesible por URL (biblioteca de medios o enlace público). Los modelos muy grandes cargan despacio en el móvil.', cta: 'Descargar en wordpress.org' },
      shopify: { name: 'App de Shopify', what: 'Un modelo IFC por producto o variante, una tabla de especificaciones leída del modelo y descargas de archivos en la ficha de producto.', who: 'Fabricantes de productos de construcción que venden o muestran su catálogo en Shopify.', steps: ['Instala la app desde la Shopify App Store cuando esté aprobada.', 'Asocia un archivo IFC a un producto o variante.', 'Añade el bloque del visor a la plantilla de producto en el editor del tema.'], limits: 'La app se ha enviado a la Shopify App Store y está en revisión, así que aún no se puede instalar. Planes: Free, Starter y Business. Hoy puedes copiar las secciones gratuitas desde GitHub.', cta: 'Obtener las secciones gratis' },
      sdk: { name: 'SDK de JavaScript', what: 'Monta el visor en tu propia app web y carga los bytes del IFC desde tu código, con eventos y una API para selección, colores y cámara.', who: 'Desarrolladores de CDE, portales y herramientas internas.', steps: ['Importa el módulo del SDK desde /sdk/ifc-viewer.es.js.', 'Crea el visor sobre un elemento de tu página.', 'Pasa los bytes del IFC desde tu app con viewer.add().'], limits: 'Funciona solo en el navegador: necesitas una página donde alojarlo. El SDK no guarda archivos por ti.', cta: 'Leer la documentación' },
      embed: { name: 'Insertar (iframe)', what: 'Pega un iframe para mostrar un modelo en cualquier página, con la cámara, los colores y los paneles que elijas en el generador.', who: 'Cualquiera con una web, un blog o un CMS que no quiera escribir código.', steps: ['Abre el generador de inserción.', 'Pega una URL pública del IFC y ajusta la vista.', 'Copia el iframe en tu página.'], limits: 'La URL del modelo debe permitir peticiones de otro origen (CORS). El iframe necesita unos 400 px de alto para ser cómodo.', cta: 'Abrir el generador' },
      mcp: { name: 'Servidor local para herramientas de escritorio (MCP)', what: 'Un servidor local que permite a apps de escritorio y editores de código compatibles con Model Context Protocol validar IFC, comprobar IDS y abrir modelos en 3D.', who: 'Coordinadores BIM y desarrolladores que trabajan con IFC desde herramientas de escritorio.', steps: ['Instala Node.js 18 o superior.', 'Añade “npx -y ifc-viewer-mcp” como servidor en los ajustes MCP de tu herramienta.', 'Reinicia la herramienta y apúntala a un IFC de tu disco.'], limits: 'Necesita una herramienta de escritorio compatible con MCP y Node.js. La validación corre en tu equipo; la vista 3D se abre en el navegador.', cta: 'Ver el código' },
    },
    soon: { h2: 'Próximamente', folders: 'SharePoint, OneDrive y Google Drive: revisa cada modelo que llega a una carpeta del proyecto.', ci: 'GitHub Actions: bloquea un pull request si un modelo baja de tu puntuación.', ask: 'Dinos cuál necesitas desde el formulario de peticiones del visor.' },
    foot: { privacy: 'Privacidad', terms: 'Términos' },
  },
  de: {
    htmlLang: 'de',
    meta: { title: 'Integrationen: WordPress, Shopify, SDK | IFC Viewer', description: 'Den IFC-Viewer in WordPress, Shopify, deine App oder Desktop-Werkzeuge bringen. Was jede Integration kann, für wen, wie man sie installiert und ihre Grenzen.' },
    h1: 'Integrationen',
    lead: 'Derselbe Browser-Viewer in den Werkzeugen, die du schon nutzt. Modelle werden auf dem Gerät des Betrachters verarbeitet: Nichts wird zu uns hochgeladen.',
    crumbHome: 'Start',
    nav: { pricing: 'Preise', blog: 'Blog', open: 'Viewer öffnen', theme: 'Hell oder dunkel' },
    onPage: 'Auf dieser Seite',
    labels: { what: 'Was es macht', who: 'Für wen', steps: 'Installation', limits: 'Grenzen' },
    status: { available: 'Verfügbar', review: 'In Prüfung', soon: 'Demnächst' },
    free: 'Kostenlos',
    shopifyAlt: 'Kostenlose Theme-Abschnitte auf GitHub',
    items: {
      wordpress: { name: 'WordPress-Plugin', what: 'Ein Block und ein Shortcode [ifc_viewer], die ein interaktives 3D-IFC-Modell in Beiträgen und Seiten zeigen.', who: 'Architekten, Ingenieure und Hersteller, die Projekte oder Produkte auf einer WordPress-Website zeigen.', steps: ['In WordPress Plugins → Installieren öffnen.', '„Bimo IFC Viewer“ suchen, installieren und aktivieren.', 'Den Block IFC Viewer einfügen oder [ifc_viewer model="…"] mit einer öffentlichen IFC-URL.'], limits: 'Das IFC muss per URL erreichbar sein (Mediathek oder öffentlicher Link). Sehr große Modelle laden auf Smartphones langsam.', cta: 'Auf wordpress.org holen' },
      shopify: { name: 'Shopify-App', what: 'Ein IFC-Modell pro Produkt oder Variante, eine aus dem Modell gelesene Datentabelle und Datei-Downloads auf der Produktseite.', who: 'Bauprodukthersteller, die Produkte auf Shopify verkaufen oder zeigen.', steps: ['Die App nach der Freigabe aus dem Shopify App Store installieren.', 'Einem Produkt oder einer Variante eine IFC-Datei zuordnen.', 'Im Theme-Editor den Viewer-Block in die Produktvorlage einfügen.'], limits: 'Die App wurde beim Shopify App Store eingereicht und ist in Prüfung, also noch nicht installierbar. Pläne: Free, Starter und Business. Heute kannst du die kostenlosen Theme-Abschnitte von GitHub kopieren.', cta: 'Kostenlose Abschnitte holen' },
      sdk: { name: 'JavaScript-SDK', what: 'Den Viewer in deine Web-App einbinden und IFC-Bytes aus deinem Code laden, mit Events und einer API für Auswahl, Farben und Kamera.', who: 'Entwickler von CDEs, Portalen und internen Werkzeugen.', steps: ['Das SDK-Modul aus /sdk/ifc-viewer.es.js importieren.', 'Den Viewer auf einem Element deiner Seite erzeugen.', 'Die IFC-Bytes mit viewer.add() aus deiner App übergeben.'], limits: 'Läuft nur im Browser: Du brauchst eine Seite, die ihn hostet. Das SDK speichert keine Dateien für dich.', cta: 'Dokumentation lesen' },
      embed: { name: 'Einbetten (iframe)', what: 'Ein iframe einfügen und ein Modell auf jeder Seite zeigen, mit Kamera, Farben und Panels aus dem Embed-Builder.', who: 'Alle mit Website, Blog oder CMS, die keinen Code schreiben wollen.', steps: ['Den Embed-Builder öffnen.', 'Eine öffentliche IFC-URL einfügen und die Ansicht einstellen.', 'Das iframe in deine Seite kopieren.'], limits: 'Die Modell-URL muss Cross-Origin-Anfragen erlauben (CORS). Das iframe braucht etwa 400 px Höhe.', cta: 'Embed-Builder öffnen' },
      mcp: { name: 'Lokaler Server für Desktop-Werkzeuge (MCP)', what: 'Ein lokaler Server, mit dem Desktop-Apps und Code-Editoren mit Model Context Protocol IFC-Dateien prüfen, IDS testen und Modelle in 3D öffnen.', who: 'BIM-Koordinatoren und Entwickler, die mit IFC aus Desktop-Werkzeugen arbeiten.', steps: ['Node.js 18 oder neuer installieren.', '„npx -y ifc-viewer-mcp“ als Server in den MCP-Einstellungen deines Werkzeugs eintragen.', 'Das Werkzeug neu starten und auf eine IFC-Datei auf deiner Festplatte zeigen.'], limits: 'Braucht ein Desktop-Werkzeug mit MCP-Unterstützung und Node.js. Die Prüfung läuft auf deinem Rechner; die 3D-Ansicht öffnet im Browser.', cta: 'Quellcode ansehen' },
    },
    soon: { h2: 'Demnächst', folders: 'SharePoint, OneDrive und Google Drive: jedes Modell prüfen, das in einem Projektordner landet.', ci: 'GitHub Actions: einen Pull Request stoppen, wenn ein Modell unter deinen Score fällt.', ask: 'Sag uns über das Wunschformular im Viewer, was du brauchst.' },
    foot: { privacy: 'Datenschutz', terms: 'Nutzungsbedingungen' },
  },
  fr: {
    htmlLang: 'fr',
    meta: { title: 'Intégrations : WordPress, Shopify, SDK | IFC Viewer', description: 'Placez le visualiseur IFC dans WordPress, Shopify, votre app ou vos outils de bureau. Ce que fait chaque intégration, pour qui, l’installation et les limites.' },
    h1: 'Intégrations',
    lead: 'Le même visualiseur web, dans les outils que vous utilisez déjà. Les modèles sont traités sur l’appareil du lecteur : rien ne nous est envoyé.',
    crumbHome: 'Accueil',
    nav: { pricing: 'Tarifs', blog: 'Blog', open: 'Ouvrir le visualiseur', theme: 'Clair ou sombre' },
    onPage: 'Sur cette page',
    labels: { what: 'Ce que ça fait', who: 'Pour qui', steps: 'Installation', limits: 'Limites' },
    status: { available: 'Disponible', review: 'En validation', soon: 'Bientôt' },
    free: 'Gratuit',
    shopifyAlt: 'Sections de thème gratuites sur GitHub',
    items: {
      wordpress: { name: 'Plugin WordPress', what: 'Un bloc et un shortcode [ifc_viewer] qui affichent un modèle IFC 3D interactif dans les articles et les pages.', who: 'Architectes, bureaux d’études et fabricants qui publient projets ou produits sur un site WordPress.', steps: ['Dans WordPress, ouvrez Extensions → Ajouter.', 'Cherchez « Bimo IFC Viewer », installez-le et activez-le.', 'Ajoutez le bloc IFC Viewer, ou collez [ifc_viewer model="…"], avec une URL publique de l’IFC.'], limits: 'L’IFC doit être accessible par URL (médiathèque ou lien public). Les très gros modèles chargent lentement sur mobile.', cta: 'Télécharger sur wordpress.org' },
      shopify: { name: 'App Shopify', what: 'Un modèle IFC par produit ou variante, un tableau de caractéristiques lu dans le modèle et des téléchargements sur la fiche produit.', who: 'Fabricants de produits de construction qui vendent ou présentent leur catalogue sur Shopify.', steps: ['Installez l’app depuis le Shopify App Store une fois approuvée.', 'Associez un fichier IFC à un produit ou une variante.', 'Ajoutez le bloc du visualiseur au modèle produit dans l’éditeur de thème.'], limits: 'L’app a été soumise au Shopify App Store et est en validation : elle ne s’installe pas encore. Formules : Free, Starter et Business. Aujourd’hui, copiez les sections gratuites depuis GitHub.', cta: 'Obtenir les sections gratuites' },
      sdk: { name: 'SDK JavaScript', what: 'Montez le visualiseur dans votre app web et chargez les octets IFC depuis votre code, avec des événements et une API pour sélection, couleurs et caméra.', who: 'Développeurs de CDE, de portails et d’outils internes.', steps: ['Importez le module SDK depuis /sdk/ifc-viewer.es.js.', 'Créez le visualiseur sur un élément de votre page.', 'Passez les octets IFC depuis votre app avec viewer.add().'], limits: 'Fonctionne uniquement dans le navigateur : il faut une page pour l’héberger. Le SDK ne stocke pas vos fichiers.', cta: 'Lire la documentation' },
      embed: { name: 'Intégration (iframe)', what: 'Collez un iframe pour afficher un modèle sur n’importe quelle page, avec la caméra, les couleurs et les panneaux choisis dans le générateur.', who: 'Toute personne avec un site, un blog ou un CMS qui ne veut pas coder.', steps: ['Ouvrez le générateur d’intégration.', 'Collez une URL publique d’IFC et réglez la vue.', 'Copiez l’iframe dans votre page.'], limits: 'L’URL du modèle doit autoriser les requêtes cross-origin (CORS). L’iframe demande environ 400 px de hauteur.', cta: 'Ouvrir le générateur' },
      mcp: { name: 'Serveur local pour outils de bureau (MCP)', what: 'Un serveur local qui permet aux apps de bureau et éditeurs de code compatibles Model Context Protocol de valider des IFC, vérifier des IDS et ouvrir des modèles en 3D.', who: 'Coordinateurs BIM et développeurs qui travaillent l’IFC depuis des outils de bureau.', steps: ['Installez Node.js 18 ou plus récent.', 'Ajoutez « npx -y ifc-viewer-mcp » comme serveur dans les réglages MCP de votre outil.', 'Redémarrez l’outil et indiquez-lui un IFC sur votre disque.'], limits: 'Nécessite un outil de bureau compatible MCP et Node.js. La validation tourne sur votre machine ; la vue 3D s’ouvre dans le navigateur.', cta: 'Voir le code source' },
    },
    soon: { h2: 'Bientôt', folders: 'SharePoint, OneDrive et Google Drive : contrôlez chaque modèle déposé dans un dossier de projet.', ci: 'GitHub Actions : bloquez une pull request si un modèle passe sous votre score.', ask: 'Dites-nous laquelle il vous faut via le formulaire de demandes du visualiseur.' },
    foot: { privacy: 'Confidentialité', terms: 'Conditions' },
  },
  pt: {
    htmlLang: 'pt',
    meta: { title: 'Integrações: WordPress, Shopify e SDK | IFC Viewer', description: 'Coloque o visualizador IFC no WordPress, Shopify, na sua app ou em ferramentas de desktop. O que faz cada integração, para quem, como instalar e limites.' },
    h1: 'Integrações',
    lead: 'O mesmo visualizador do navegador, dentro das ferramentas que já usa. Os modelos são processados no dispositivo de quem os vê: nada é enviado para nós.',
    crumbHome: 'Início',
    nav: { pricing: 'Preços', blog: 'Blog', open: 'Abrir o visualizador', theme: 'Claro ou escuro' },
    onPage: 'Nesta página',
    labels: { what: 'O que faz', who: 'Para quem', steps: 'Instalação', limits: 'Limites' },
    status: { available: 'Disponível', review: 'Em revisão', soon: 'Em breve' },
    free: 'Grátis',
    shopifyAlt: 'Secções de tema grátis no GitHub',
    items: {
      wordpress: { name: 'Plugin WordPress', what: 'Um bloco e um shortcode [ifc_viewer] que mostram um modelo IFC 3D interativo em artigos e páginas.', who: 'Arquitetos, engenheiros e fabricantes que publicam projetos ou produtos num site WordPress.', steps: ['No WordPress, abra Plugins → Adicionar novo.', 'Procure “Bimo IFC Viewer”, instale e ative.', 'Adicione o bloco IFC Viewer, ou cole [ifc_viewer model="…"], com um URL público do IFC.'], limits: 'O IFC tem de estar acessível por URL (biblioteca multimédia ou link público). Modelos muito grandes carregam devagar no telemóvel.', cta: 'Obter em wordpress.org' },
      shopify: { name: 'App Shopify', what: 'Um modelo IFC por produto ou variante, uma tabela de especificações lida do modelo e transferências de ficheiros na página do produto.', who: 'Fabricantes de produtos de construção que vendem ou mostram o catálogo no Shopify.', steps: ['Instale a app a partir da Shopify App Store quando for aprovada.', 'Associe um ficheiro IFC a um produto ou variante.', 'Adicione o bloco do visualizador ao modelo de produto no editor do tema.'], limits: 'A app foi submetida à Shopify App Store e está em revisão, por isso ainda não pode ser instalada. Planos: Free, Starter e Business. Hoje pode copiar as secções gratuitas do GitHub.', cta: 'Obter as secções grátis' },
      sdk: { name: 'SDK JavaScript', what: 'Monte o visualizador na sua app web e carregue os bytes do IFC a partir do seu código, com eventos e uma API para seleção, cores e câmara.', who: 'Programadores de CDE, portais e ferramentas internas.', steps: ['Importe o módulo do SDK de /sdk/ifc-viewer.es.js.', 'Crie o visualizador num elemento da sua página.', 'Passe os bytes do IFC da sua app com viewer.add().'], limits: 'Funciona só no navegador: precisa de uma página para o alojar. O SDK não guarda ficheiros por si.', cta: 'Ler a documentação' },
      embed: { name: 'Incorporar (iframe)', what: 'Cole um iframe para mostrar um modelo em qualquer página, com a câmara, as cores e os painéis escolhidos no gerador.', who: 'Quem tem um site, blog ou CMS e não quer escrever código.', steps: ['Abra o gerador de incorporação.', 'Cole um URL público do IFC e ajuste a vista.', 'Copie o iframe para a sua página.'], limits: 'O URL do modelo tem de permitir pedidos de outra origem (CORS). O iframe precisa de cerca de 400 px de altura.', cta: 'Abrir o gerador' },
      mcp: { name: 'Servidor local para ferramentas de desktop (MCP)', what: 'Um servidor local que permite a apps de desktop e editores de código compatíveis com Model Context Protocol validar IFC, verificar IDS e abrir modelos em 3D.', who: 'Coordenadores BIM e programadores que trabalham com IFC em ferramentas de desktop.', steps: ['Instale o Node.js 18 ou mais recente.', 'Adicione “npx -y ifc-viewer-mcp” como servidor nas definições MCP da sua ferramenta.', 'Reinicie a ferramenta e indique um IFC do seu disco.'], limits: 'Precisa de uma ferramenta de desktop compatível com MCP e de Node.js. A validação corre no seu computador; a vista 3D abre no navegador.', cta: 'Ver o código' },
    },
    soon: { h2: 'Em breve', folders: 'SharePoint, OneDrive e Google Drive: verifique cada modelo que chega a uma pasta do projeto.', ci: 'GitHub Actions: bloqueie um pull request se um modelo descer abaixo da sua pontuação.', ask: 'Diga-nos qual precisa no formulário de pedidos do visualizador.' },
    foot: { privacy: 'Privacidade', terms: 'Termos' },
  },
  it: {
    htmlLang: 'it',
    meta: { title: 'Integrazioni: WordPress, Shopify e SDK | IFC Viewer', description: 'Porta il viewer IFC in WordPress, Shopify, nella tua app o negli strumenti desktop. Cosa fa ogni integrazione, per chi è, come installarla e i suoi limiti.' },
    h1: 'Integrazioni',
    lead: 'Lo stesso viewer del browser, dentro gli strumenti che usi già. I modelli vengono elaborati sul dispositivo di chi li guarda: non ci carichi nulla.',
    crumbHome: 'Home',
    nav: { pricing: 'Prezzi', blog: 'Blog', open: 'Apri il viewer', theme: 'Chiaro o scuro' },
    onPage: 'In questa pagina',
    labels: { what: 'Cosa fa', who: 'Per chi', steps: 'Installazione', limits: 'Limiti' },
    status: { available: 'Disponibile', review: 'In revisione', soon: 'In arrivo' },
    free: 'Gratis',
    shopifyAlt: 'Sezioni del tema gratuite su GitHub',
    items: {
      wordpress: { name: 'Plugin WordPress', what: 'Un blocco e uno shortcode [ifc_viewer] che mostrano un modello IFC 3D interattivo in articoli e pagine.', who: 'Architetti, ingegneri e produttori che pubblicano progetti o prodotti su un sito WordPress.', steps: ['In WordPress apri Plugin → Aggiungi nuovo.', 'Cerca “Bimo IFC Viewer”, installalo e attivalo.', 'Aggiungi il blocco IFC Viewer, o incolla [ifc_viewer model="…"], con un URL pubblico dell’IFC.'], limits: 'L’IFC deve essere raggiungibile via URL (libreria media o link pubblico). I modelli molto grandi si caricano lentamente sul telefono.', cta: 'Scarica da wordpress.org' },
      shopify: { name: 'App Shopify', what: 'Un modello IFC per prodotto o variante, una tabella di specifiche letta dal modello e download di file nella pagina prodotto.', who: 'Produttori di prodotti per l’edilizia che vendono o presentano il catalogo su Shopify.', steps: ['Installa l’app dallo Shopify App Store quando sarà approvata.', 'Associa un file IFC a un prodotto o a una variante.', 'Aggiungi il blocco del viewer al modello prodotto nell’editor del tema.'], limits: 'L’app è stata inviata allo Shopify App Store ed è in revisione, quindi non si può ancora installare. Piani: Free, Starter e Business. Oggi puoi copiare le sezioni gratuite da GitHub.', cta: 'Ottieni le sezioni gratuite' },
      sdk: { name: 'SDK JavaScript', what: 'Monta il viewer nella tua app web e carica i byte IFC dal tuo codice, con eventi e un’API per selezione, colori e camera.', who: 'Sviluppatori di CDE, portali e strumenti interni.', steps: ['Importa il modulo SDK da /sdk/ifc-viewer.es.js.', 'Crea il viewer su un elemento della tua pagina.', 'Passa i byte IFC dalla tua app con viewer.add().'], limits: 'Funziona solo nel browser: serve una pagina che lo ospiti. L’SDK non salva i file per te.', cta: 'Leggi la documentazione' },
      embed: { name: 'Incorpora (iframe)', what: 'Incolla un iframe per mostrare un modello in qualsiasi pagina, con la camera, i colori e i pannelli scelti nel generatore.', who: 'Chiunque abbia un sito, un blog o un CMS e non voglia scrivere codice.', steps: ['Apri il generatore di incorporamento.', 'Incolla un URL pubblico dell’IFC e imposta la vista.', 'Copia l’iframe nella tua pagina.'], limits: 'L’URL del modello deve consentire richieste cross-origin (CORS). L’iframe richiede circa 400 px di altezza.', cta: 'Apri il generatore' },
      mcp: { name: 'Server locale per strumenti desktop (MCP)', what: 'Un server locale che consente ad app desktop ed editor di codice compatibili con Model Context Protocol di validare IFC, verificare IDS e aprire modelli in 3D.', who: 'Coordinatori BIM e sviluppatori che lavorano con IFC da strumenti desktop.', steps: ['Installa Node.js 18 o successivo.', 'Aggiungi “npx -y ifc-viewer-mcp” come server nelle impostazioni MCP del tuo strumento.', 'Riavvia lo strumento e indicagli un IFC sul tuo disco.'], limits: 'Serve uno strumento desktop compatibile con MCP e Node.js. La validazione gira sul tuo computer; la vista 3D si apre nel browser.', cta: 'Vedi il codice' },
    },
    soon: { h2: 'In arrivo', folders: 'SharePoint, OneDrive e Google Drive: controlla ogni modello che arriva in una cartella di progetto.', ci: 'GitHub Actions: blocca una pull request se un modello scende sotto il tuo punteggio.', ask: 'Dicci quale ti serve dal modulo richieste del viewer.' },
    foot: { privacy: 'Privacy', terms: 'Termini' },
  },
  ca: {
    htmlLang: 'ca',
    meta: { title: 'Integracions: WordPress, Shopify i SDK | IFC Viewer', description: 'Posa el visor IFC a WordPress, Shopify, la teva app o les eines d’escriptori. Què fa cada integració, per a qui és, com instal·lar-la i els seus límits.' },
    h1: 'Integracions',
    lead: 'El mateix visor del navegador, dins de les eines que ja fas servir. Els models es processen al dispositiu de qui els mira: no ens puges res.',
    crumbHome: 'Inici',
    nav: { pricing: 'Preus', blog: 'Blog', open: 'Obrir el visor', theme: 'Clar o fosc' },
    onPage: 'En aquesta pàgina',
    labels: { what: 'Què fa', who: 'Per a qui', steps: 'Instal·lació', limits: 'Límits' },
    status: { available: 'Disponible', review: 'En revisió', soon: 'Properament' },
    free: 'Gratuït',
    shopifyAlt: 'Seccions de tema gratuïtes a GitHub',
    items: {
      wordpress: { name: 'Plugin de WordPress', what: 'Un bloc i un shortcode [ifc_viewer] que mostren un model IFC 3D interactiu en entrades i pàgines.', who: 'Arquitectes, enginyeries i fabricants que publiquen projectes o productes en un web WordPress.', steps: ['A WordPress, obre Extensions → Afegeix.', 'Cerca “Bimo IFC Viewer”, instal·la’l i activa’l.', 'Afegeix el bloc IFC Viewer, o enganxa [ifc_viewer model="…"], amb una URL pública de l’IFC.'], limits: 'L’IFC ha de ser accessible per URL (mediateca o enllaç públic). Els models molt grans carreguen a poc a poc al mòbil.', cta: 'Descarrega a wordpress.org' },
      shopify: { name: 'App de Shopify', what: 'Un model IFC per producte o variant, una taula d’especificacions llegida del model i descàrregues de fitxers a la fitxa de producte.', who: 'Fabricants de productes de construcció que venen o mostren el catàleg a Shopify.', steps: ['Instal·la l’app des de la Shopify App Store quan estigui aprovada.', 'Associa un fitxer IFC a un producte o variant.', 'Afegeix el bloc del visor a la plantilla de producte a l’editor del tema.'], limits: 'L’app s’ha enviat a la Shopify App Store i està en revisió, així que encara no es pot instal·lar. Plans: Free, Starter i Business. Avui pots copiar les seccions gratuïtes des de GitHub.', cta: 'Obtenir les seccions gratuïtes' },
      sdk: { name: 'SDK de JavaScript', what: 'Munta el visor a la teva app web i carrega els bytes de l’IFC des del teu codi, amb esdeveniments i una API per a selecció, colors i càmera.', who: 'Desenvolupadors de CDE, portals i eines internes.', steps: ['Importa el mòdul de l’SDK des de /sdk/ifc-viewer.es.js.', 'Crea el visor sobre un element de la teva pàgina.', 'Passa els bytes de l’IFC des de la teva app amb viewer.add().'], limits: 'Funciona només al navegador: cal una pàgina on allotjar-lo. L’SDK no desa fitxers per tu.', cta: 'Llegir la documentació' },
      embed: { name: 'Inserir (iframe)', what: 'Enganxa un iframe per mostrar un model a qualsevol pàgina, amb la càmera, els colors i els panells que triïs al generador.', who: 'Qualsevol amb un web, un blog o un CMS que no vulgui escriure codi.', steps: ['Obre el generador d’inserció.', 'Enganxa una URL pública de l’IFC i ajusta la vista.', 'Copia l’iframe a la teva pàgina.'], limits: 'La URL del model ha de permetre peticions d’un altre origen (CORS). L’iframe necessita uns 400 px d’alçada.', cta: 'Obrir el generador' },
      mcp: { name: 'Servidor local per a eines d’escriptori (MCP)', what: 'Un servidor local que permet a apps d’escriptori i editors de codi compatibles amb Model Context Protocol validar IFC, comprovar IDS i obrir models en 3D.', who: 'Coordinadors BIM i desenvolupadors que treballen amb IFC des d’eines d’escriptori.', steps: ['Instal·la Node.js 18 o posterior.', 'Afegeix “npx -y ifc-viewer-mcp” com a servidor a la configuració MCP de la teva eina.', 'Reinicia l’eina i indica-li un IFC del teu disc.'], limits: 'Cal una eina d’escriptori compatible amb MCP i Node.js. La validació corre al teu ordinador; la vista 3D s’obre al navegador.', cta: 'Veure el codi' },
    },
    soon: { h2: 'Properament', folders: 'SharePoint, OneDrive i Google Drive: revisa cada model que arriba a una carpeta del projecte.', ci: 'GitHub Actions: bloqueja un pull request si un model baixa de la teva puntuació.', ask: 'Digues-nos quina necessites des del formulari de peticions del visor.' },
    foot: { privacy: 'Privadesa', terms: 'Condicions' },
  },
  zh: {
    htmlLang: 'zh',
    meta: { title: '集成：WordPress、Shopify、SDK | IFC Viewer Online', description: '把 IFC 查看器放进 WordPress、Shopify、您自己的应用或桌面工具。每个集成的功能、适用对象、安装步骤和限制。' },
    h1: '集成',
    lead: '同一个浏览器查看器，放进您已在使用的工具中。模型在查看者的设备上处理：不会上传给我们。',
    crumbHome: '首页',
    nav: { pricing: '价格', blog: '博客', open: '打开查看器', theme: '浅色或深色' },
    onPage: '本页内容',
    labels: { what: '功能', who: '适用对象', steps: '安装', limits: '限制' },
    status: { available: '可用', review: '审核中', soon: '即将推出' },
    free: '免费',
    shopifyAlt: 'GitHub 上的免费主题区块',
    items: {
      wordpress: { name: 'WordPress 插件', what: '一个区块和一个 [ifc_viewer] 短代码，在文章和页面中显示可交互的 3D IFC 模型。', who: '在 WordPress 网站上发布项目或产品的建筑师、工程师和制造商。', steps: ['在 WordPress 中打开 插件 → 安装插件。', '搜索 “Bimo IFC Viewer”，安装并启用。', '添加 IFC Viewer 区块，或粘贴 [ifc_viewer model="…"]，并填入公开的 IFC 地址。'], limits: 'IFC 必须能通过 URL 访问（媒体库或公开链接）。超大模型在手机上加载较慢。', cta: '在 wordpress.org 获取' },
      shopify: { name: 'Shopify 应用', what: '每个商品或变体一个 IFC 模型、从模型读取的规格表，以及商品页面上的文件下载。', who: '在 Shopify 上销售或展示产品的建材制造商。', steps: ['应用获批后，从 Shopify App Store 安装。', '为商品或变体关联一个 IFC 文件。', '在主题编辑器中把查看器区块加入商品模板。'], limits: '应用已提交 Shopify App Store，正在审核，暂时无法安装。套餐：Free、Starter 和 Business。现在可以从 GitHub 复制免费的主题区块。', cta: '获取免费区块' },
      sdk: { name: 'JavaScript SDK', what: '把查看器挂载到您自己的 Web 应用中，从代码加载 IFC 字节，并提供选择、颜色和相机的事件与 API。', who: 'CDE、门户和内部工具的开发者。', steps: ['从 /sdk/ifc-viewer.es.js 导入 SDK 模块。', '在页面元素上创建查看器。', '用 viewer.add() 从应用传入 IFC 字节。'], limits: '只在浏览器中运行：需要一个承载它的页面。SDK 不替您存储文件。', cta: '阅读文档' },
      embed: { name: '嵌入（iframe）', what: '粘贴一个 iframe，即可在任意页面显示模型，相机、颜色和面板可在嵌入生成器中设置。', who: '拥有网站、博客或 CMS 但不想写代码的人。', steps: ['打开嵌入生成器。', '粘贴公开的 IFC 地址并设置视图。', '把 iframe 复制到您的页面。'], limits: '模型地址必须允许跨域请求（CORS）。iframe 需要约 400 px 高度才好用。', cta: '打开嵌入生成器' },
      mcp: { name: '桌面工具本地服务器（MCP）', what: '一个本地服务器，让支持 Model Context Protocol 的桌面应用和代码编辑器验证 IFC、检查 IDS 并以 3D 打开模型。', who: '在桌面工具中处理 IFC 文件的 BIM 协调员和开发者。', steps: ['安装 Node.js 18 或更新版本。', '在工具的 MCP 设置中添加服务器 “npx -y ifc-viewer-mcp”。', '重启工具，并指向磁盘上的 IFC 文件。'], limits: '需要支持 MCP 的桌面工具和 Node.js。验证在您的电脑上运行；3D 视图在浏览器中打开。', cta: '查看源代码' },
    },
    soon: { h2: '即将推出', folders: 'SharePoint、OneDrive 和 Google Drive：检查进入项目文件夹的每个模型。', ci: 'GitHub Actions：模型分数低于标准时阻止拉取请求。', ask: '请通过查看器中的功能请求表单告诉我们您需要哪一个。' },
    foot: { privacy: '隐私', terms: '条款' },
  },
  ja: {
    htmlLang: 'ja',
    meta: { title: '連携：WordPress・Shopify・SDK | IFC Viewer Online', description: 'IFC ビューアを WordPress、Shopify、自社アプリ、デスクトップツールに。各連携の機能、対象、インストール手順、制限をまとめました。' },
    h1: '連携',
    lead: '同じブラウザビューアを、いつものツールの中で。モデルは閲覧者の端末で処理され、当社には何もアップロードされません。',
    crumbHome: 'ホーム',
    nav: { pricing: '料金', blog: 'ブログ', open: 'ビューアを開く', theme: 'ライト／ダーク' },
    onPage: 'このページの内容',
    labels: { what: 'できること', who: '対象', steps: 'インストール', limits: '制限' },
    status: { available: '利用可能', review: '審査中', soon: '近日公開' },
    free: '無料',
    shopifyAlt: 'GitHub の無料テーマセクション',
    items: {
      wordpress: { name: 'WordPress プラグイン', what: '投稿や固定ページにインタラクティブな 3D IFC モデルを表示するブロックと [ifc_viewer] ショートコード。', who: 'WordPress サイトでプロジェクトや製品を公開する建築家、エンジニア、メーカー。', steps: ['WordPress で プラグイン → 新規追加 を開く。', '「Bimo IFC Viewer」を検索してインストールし、有効化する。', 'IFC Viewer ブロックを追加するか、公開 IFC の URL で [ifc_viewer model="…"] を貼り付ける。'], limits: 'IFC は URL でアクセスできる必要があります（メディアライブラリや公開リンク）。非常に大きなモデルはスマートフォンでは読み込みが遅くなります。', cta: 'wordpress.org で入手' },
      shopify: { name: 'Shopify アプリ', what: '商品やバリエーションごとの IFC モデル、モデルから読み取った仕様表、商品ページでのファイルダウンロード。', who: 'Shopify で製品を販売・掲載する建材メーカー。', steps: ['承認後、Shopify App Store からアプリをインストールする。', '商品またはバリエーションに IFC ファイルを紐づける。', 'テーマエディタで商品テンプレートにビューアブロックを追加する。'], limits: 'アプリは Shopify App Store に申請済みで審査中のため、まだインストールできません。プラン：Free、Starter、Business。現在は GitHub から無料のテーマセクションをコピーできます。', cta: '無料セクションを入手' },
      sdk: { name: 'JavaScript SDK', what: '自社の Web アプリにビューアを組み込み、コードから IFC バイトを読み込む。選択・色・カメラのイベントと API 付き。', who: 'CDE、ポータル、社内ツールの開発者。', steps: ['/sdk/ifc-viewer.es.js から SDK モジュールをインポートする。', 'ページの要素にビューアを作成する。', 'viewer.add() でアプリから IFC バイトを渡す。'], limits: 'ブラウザでのみ動作し、ホストするページが必要です。SDK はファイルを保存しません。', cta: 'ドキュメントを読む' },
      embed: { name: '埋め込み（iframe）', what: 'iframe を 1 つ貼るだけで任意のページにモデルを表示。カメラ、色、パネルは埋め込みビルダーで設定。', who: 'コードを書かずに Web サイト、ブログ、CMS で見せたい人。', steps: ['埋め込みビルダーを開く。', '公開 IFC の URL を貼り、ビューを設定する。', 'iframe をページにコピーする。'], limits: 'モデルの URL はクロスオリジン要求（CORS）を許可している必要があります。iframe には約 400 px の高さが必要です。', cta: '埋め込みビルダーを開く' },
      mcp: { name: 'デスクトップツール用ローカルサーバー（MCP）', what: 'Model Context Protocol に対応したデスクトップアプリやコードエディタから、IFC の検証、IDS チェック、3D 表示ができるローカルサーバー。', who: 'デスクトップツールで IFC を扱う BIM コーディネーターと開発者。', steps: ['Node.js 18 以降をインストールする。', 'ツールの MCP 設定にサーバー「npx -y ifc-viewer-mcp」を追加する。', 'ツールを再起動し、ディスク上の IFC ファイルを指定する。'], limits: 'MCP 対応のデスクトップツールと Node.js が必要です。検証は手元の PC で実行され、3D 表示はブラウザで開きます。', cta: 'ソースを見る' },
    },
    soon: { h2: '近日公開', folders: 'SharePoint・OneDrive・Google Drive：プロジェクトフォルダに届くモデルをすべてチェック。', ci: 'GitHub Actions：モデルが基準スコアを下回るとプルリクエストを止める。', ask: '必要なものはビューアの機能リクエストフォームからお知らせください。' },
    foot: { privacy: 'プライバシー', terms: '利用規約' },
  },
  th: {
    htmlLang: 'th',
    meta: { title: 'การผสานรวม: WordPress, Shopify, SDK | IFC Viewer', description: 'ใส่ตัวแสดงผล IFC ใน WordPress, Shopify, แอปของคุณ หรือเครื่องมือเดสก์ท็อป แต่ละแบบทำอะไร เหมาะกับใคร ติดตั้งอย่างไร และมีข้อจำกัดอะไร' },
    h1: 'การผสานรวม',
    lead: 'ตัวแสดงผลบนเบราว์เซอร์ตัวเดิม ในเครื่องมือที่คุณใช้อยู่แล้ว โมเดลประมวลผลบนอุปกรณ์ของผู้ชม ไม่มีการอัปโหลดมาที่เรา',
    crumbHome: 'หน้าแรก',
    nav: { pricing: 'ราคา', blog: 'บล็อก', open: 'เปิดตัวแสดงผล', theme: 'สว่างหรือมืด' },
    onPage: 'ในหน้านี้',
    labels: { what: 'ทำอะไรได้', who: 'เหมาะกับใคร', steps: 'การติดตั้ง', limits: 'ข้อจำกัด' },
    status: { available: 'พร้อมใช้', review: 'กำลังตรวจสอบ', soon: 'เร็วๆ นี้' },
    free: 'ฟรี',
    shopifyAlt: 'ส่วนของธีมฟรีบน GitHub',
    items: {
      wordpress: { name: 'ปลั๊กอิน WordPress', what: 'บล็อกและชอร์ตโค้ด [ifc_viewer] ที่แสดงโมเดล IFC 3D แบบโต้ตอบได้ในโพสต์และหน้า', who: 'สถาปนิก วิศวกร และผู้ผลิตที่เผยแพร่โครงการหรือสินค้าบนเว็บไซต์ WordPress', steps: ['ใน WordPress เปิด ปลั๊กอิน → เพิ่มใหม่', 'ค้นหา “Bimo IFC Viewer” ติดตั้งและเปิดใช้งาน', 'เพิ่มบล็อก IFC Viewer หรือวาง [ifc_viewer model="…"] พร้อม URL สาธารณะของ IFC'], limits: 'ไฟล์ IFC ต้องเข้าถึงได้ผ่าน URL (คลังสื่อหรือลิงก์สาธารณะ) โมเดลขนาดใหญ่มากจะโหลดช้าบนมือถือ', cta: 'รับที่ wordpress.org' },
      shopify: { name: 'แอป Shopify', what: 'โมเดล IFC ต่อสินค้าหรือตัวเลือก ตารางสเปกที่อ่านจากโมเดล และการดาวน์โหลดไฟล์บนหน้าสินค้า', who: 'ผู้ผลิตวัสดุก่อสร้างที่ขายหรือแสดงสินค้าบน Shopify', steps: ['ติดตั้งแอปจาก Shopify App Store เมื่อได้รับอนุมัติ', 'ผูกไฟล์ IFC กับสินค้าหรือตัวเลือก', 'เพิ่มบล็อกตัวแสดงผลในเทมเพลตสินค้าผ่านตัวแก้ไขธีม'], limits: 'แอปส่งเข้า Shopify App Store แล้วและอยู่ระหว่างตรวจสอบ จึงยังติดตั้งไม่ได้ แพ็กเกจ: Free, Starter และ Business ตอนนี้คุณคัดลอกส่วนของธีมฟรีจาก GitHub ได้', cta: 'รับส่วนของธีมฟรี' },
      sdk: { name: 'JavaScript SDK', what: 'ฝังตัวแสดงผลในเว็บแอปของคุณและโหลดไบต์ IFC จากโค้ด พร้อมอีเวนต์และ API สำหรับการเลือก สี และกล้อง', who: 'นักพัฒนา CDE พอร์ทัล และเครื่องมือภายใน', steps: ['นำเข้าโมดูล SDK จาก /sdk/ifc-viewer.es.js', 'สร้างตัวแสดงผลบนองค์ประกอบในหน้าของคุณ', 'ส่งไบต์ IFC จากแอปด้วย viewer.add()'], limits: 'ทำงานในเบราว์เซอร์เท่านั้น ต้องมีหน้าเว็บสำหรับโฮสต์ SDK ไม่เก็บไฟล์ให้คุณ', cta: 'อ่านเอกสาร' },
      embed: { name: 'ฝัง (iframe)', what: 'วาง iframe เดียวเพื่อแสดงโมเดลในหน้าใดก็ได้ ตั้งค่ากล้อง สี และแผงได้ในตัวสร้างโค้ดฝัง', who: 'ทุกคนที่มีเว็บไซต์ บล็อก หรือ CMS และไม่อยากเขียนโค้ด', steps: ['เปิดตัวสร้างโค้ดฝัง', 'วาง URL สาธารณะของ IFC และตั้งค่ามุมมอง', 'คัดลอก iframe ไปใส่ในหน้าของคุณ'], limits: 'URL ของโมเดลต้องอนุญาตคำขอข้ามโดเมน (CORS) iframe ต้องสูงประมาณ 400 px จึงใช้งานสะดวก', cta: 'เปิดตัวสร้างโค้ดฝัง' },
      mcp: { name: 'เซิร์ฟเวอร์ภายในเครื่องสำหรับเครื่องมือเดสก์ท็อป (MCP)', what: 'เซิร์ฟเวอร์ภายในเครื่องที่ให้แอปเดสก์ท็อปและโปรแกรมแก้ไขโค้ดที่รองรับ Model Context Protocol ตรวจสอบ IFC ตรวจ IDS และเปิดโมเดลเป็น 3D', who: 'ผู้ประสานงาน BIM และนักพัฒนาที่ทำงานกับ IFC จากเครื่องมือเดสก์ท็อป', steps: ['ติดตั้ง Node.js 18 ขึ้นไป', 'เพิ่ม “npx -y ifc-viewer-mcp” เป็นเซิร์ฟเวอร์ในการตั้งค่า MCP ของเครื่องมือ', 'รีสตาร์ตเครื่องมือแล้วชี้ไปที่ไฟล์ IFC ในดิสก์ของคุณ'], limits: 'ต้องมีเครื่องมือเดสก์ท็อปที่รองรับ MCP และ Node.js การตรวจสอบทำบนเครื่องของคุณ มุมมอง 3D เปิดในเบราว์เซอร์', cta: 'ดูซอร์สโค้ด' },
    },
    soon: { h2: 'เร็วๆ นี้', folders: 'SharePoint, OneDrive และ Google Drive: ตรวจทุกโมเดลที่เข้ามาในโฟลเดอร์โครงการ', ci: 'GitHub Actions: หยุด pull request เมื่อโมเดลได้คะแนนต่ำกว่าเกณฑ์', ask: 'บอกเราว่าคุณต้องการแบบไหนผ่านแบบฟอร์มคำขอฟีเจอร์ในตัวแสดงผล' },
    foot: { privacy: 'ความเป็นส่วนตัว', terms: 'ข้อกำหนด' },
  },
}
