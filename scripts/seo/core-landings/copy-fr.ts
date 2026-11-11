import type { LangCopy } from './types'

// French (France) copy for the six landing families. Translated from copy-en.ts:
// same structure, same figures. Vendor quotes stay in English inside « ».

export const copy: LangCopy = {
  ui: {
    home: 'IFC Viewer Online',
    sources: 'Sources',
    readOn: 'consulté le',
    faqLabel: 'FAQ',
    faqTitle: 'Questions',
    related: 'Pages liées',
    fix: 'Corriger les erreurs IFC',
    blogSolibri: 'Solibri ou un validateur dans le navigateur : le comparatif détaillé',
    pricing: 'Tarifs',
    embedCta: 'Lancer la validation sur un IFC d’exemple',
    embedSub: 'Charge le validateur dans cette page. Rien n’est téléversé.',
  },
  pages: {
    // ─────────────────────────────────────────────────────────────────────────
    validator: {
      title: 'Validation IFC en Ligne — Validateur IFC Gratuit, 44 Règles',
      desc: 'Contrôlez un fichier IFC dans votre navigateur : 44 règles, IDS 1.0 et Health Score de 0 à 100. Sans téléversement. Gratuit, sans compte. IFC2x3, IFC4, IFC4x3.',
      nav: 'Validateur IFC',
      kicker: '44 règles · IDS 1.0 · Le fichier reste dans votre navigateur · Gratuit',
      h1: ['Validation IFC en ligne', 'Ce qui ne va pas dans le fichier, et où'],
      lead: 'Déposez un fichier IFC et obtenez un Health Score de 0 à 100, la liste des problèmes regroupés par règle et les éléments en défaut mis en évidence dans le modèle 3D. Le fichier est lu dans l’onglet de votre navigateur et n’est pas téléversé.',
      cta: 'Valider un fichier IFC',
      cta2: 'ou ouvrir le modèle d’exemple',
      note: 'Sans compte. IFC2x3, IFC4, IFC4x1 et IFC4x3, jusqu’à 2 Go par fichier.',
      shots: [
        { alt: 'Validation IFC d’une maison à deux niveaux dans le navigateur : Health Score de 77, une erreur et 161 avertissements, les trois corrections qui font regagner le plus de points, et la vue 3D qui parcourt les 119 éléments sans type', cap: 'Le modèle d’exemple public Duplex (2,3 Mo, 7181 entités) obtient 77. « Show in 3D » sur la première correction cadre les 119 éléments sans type, avec un compteur pour les parcourir un par un.' },
        { alt: 'Liste des problèmes de validation IFC regroupés par règle, avec le nombre d’éléments en défaut pour chaque règle et l’explication de la correction', cap: 'Chaque règle s’ouvre sur ses éléments et sur les étapes pour la corriger dans Revit, Archicad ou Tekla.' },
      ],
      sections: [
        {
          kind: 'cols', label: 'Périmètre', h2: 'Ce que le contrôle couvre, et ce qu’il ne couvre pas',
          sub: 'Il y a 44 règles réparties en huit groupes. 25 s’exécutent par défaut ; les 19 autres s’activent depuis un profil, car elles demandent une décision de votre part (un niveau de LOD, un modèle de nommage, un système de classification).',
          cols: [
            { h: 'Il vérifie', items: [
              'Identifiants : GlobalId en double et GlobalId qui ne sont pas des GUID IFC valides de 22 caractères.',
              'Structure : un seul IfcProject, la chaîne Projet → Site → Bâtiment → Niveau, les éléments sans niveau, les agrégations rompues ou circulaires, les ouvertures sans élément hôte.',
              'Niveaux : altitudes manquantes, en double ou dans le désordre.',
              'Données : noms vides, noms en double, valeurs de propriétés vides, éléments sans type ou sans matériau, espaces sans surface au sol.',
              'Qualité de l’export : plus de 5 % d’éléments en IfcBuildingElementProxy, un modèle à plus de 10 km de l’origine, plus de 500 Ko par élément, des unités de longueur impériales.',
              'Sur demande : jeux de propriétés requis par classe, modèles de nommage, classification, propriétés et quantités LOD 100–400, champs projet et auteur ISO 19650, systèmes MEP.',
              'Vos propres exigences : un fichier IDS 1.0, l’un des cinq profils intégrés (livraison de base, revue qualité, coordination BIM, ISO 19650, LOD 300) ou un profil que vous définissez.',
            ] },
            { h: 'Il ne vérifie pas', items: [
              'Les clashs entre deux modèles. Les règles de clash comparent des boîtes englobantes à l’intérieur d’un seul modèle, avec un chevauchement de 5 cm, jusqu’à 800 éléments et 100 résultats. C’est un premier filtre, pas de la coordination.',
              'La réglementation du bâtiment : accessibilité, sécurité incendie, issues de secours ou hauteurs libres. Aucune règle ici ne lit un texte réglementaire.',
              'Le schéma IFC en entier. Ce n’est pas un test de conformité EXPRESS : il exécute ces 44 règles et votre IDS.',
              'Les codes ISO 19650. La règle sur le nom de fichier lit le nom écrit dans l’en-tête de l’IFC et compte ses champs ; elle ne vérifie pas chaque code.',
              'Les fichiers natifs. Il lit l’IFC, pas les fichiers Revit ou Archicad.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Limites', h2: 'Les limites, chiffrées',
          head: ['', 'Limite'],
          rows: [
            ['Taille de fichier', 'Un fichier de 2 Go est refusé. Un avis s’affiche à partir de 200 Mo et un avertissement de mémoire à partir de 1 Go. Sur les téléphones, les tablettes et les ordinateurs dotés de 4 Go de mémoire ou moins, l’avertissement commence à 80 Mo.'],
            ['Formats', 'IFC2x3, IFC4, IFC4x1 et IFC4x3, en .ifc ou dans un .ifczip ou un .zip.'],
            ['Règles', '44 au total, 25 actives par défaut. La sévérité et les seuils se modifient règle par règle.'],
            ['IDS', 'IDS 1.0 avec ses six facettes. Les restrictions totalDigits, fractionDigits et whiteSpace ne sont pas lues. Jusqu’à 200 éléments en défaut sont listés par spécification.'],
            ['Corrections automatiques', 'Les GlobalId invalides ou en double, et les noms vides ou en double. Tout le reste se modifie à la main ou se corrige dans le logiciel de modélisation.'],
            ['Vitesse', 'Le modèle d’exemple de l’image (2,3 Mo, 7181 entités) a été validé en 20 secondes environ sur l’ordinateur utilisé pour ces captures. Le temps augmente avec le nombre d’entités.'],
            ['Connexion', 'La page doit se charger depuis internet. Elle ne fonctionne pas hors ligne.'],
          ],
        },
        {
          kind: 'text', label: 'Votre fichier', h2: 'Ce que devient le fichier',
          ps: [
            'L’IFC est ouvert par du code qui s’exécute dans l’onglet de votre navigateur. Il n’est envoyé ni à nous ni à personne d’autre : il n’y a donc pas de téléversement à attendre, ni rien à supprimer ensuite.',
            'Pour rouvrir un modèle plus vite, le navigateur garde une copie convertie de sa géométrie dans son propre stockage privé, sur votre ordinateur (jusqu’à 4 Go, les plus anciennes sont supprimées en premier). Effacer les données du site dans votre navigateur la supprime.',
            'Deux choses quittent bien le navigateur, et vous gardez la main sur les deux. Des statistiques d’utilisation sans cookies enregistrent qu’un fichier a été ouvert, sa taille et son nombre d’éléments, jamais son contenu ; elles peuvent être désactivées et respectent Do Not Track. Et si vous cliquez sur Share, le lien lui-même contient le score, le nom du fichier et les 50 premiers problèmes avec le nom de leurs éléments : toute personne qui a le lien peut donc les lire.',
          ],
        },
        { kind: 'shot', label: 'Le résultat', h2: 'Du score à l’élément', sub: 'Essayez ici sur le modèle d’exemple, puis ouvrez votre propre fichier.' },
        {
          kind: 'steps', label: 'Déroulement', h2: 'Du fichier à un IFC corrigé',
          steps: [
            ['Ouvrez le fichier', 'Faites glisser le .ifc dans la page. Plusieurs fichiers peuvent être ouverts en même temps ; chacun est validé séparément.'],
            ['Lisez le verdict', 'Le score, les erreurs et les avertissements, et les trois corrections qui font regagner le plus de points. Un clic met en évidence les éléments en défaut.'],
            ['Corrigez ce qui peut l’être ici', 'Régénérez les GlobalId invalides, renommez par lots, modifiez les noms et les valeurs de propriétés. Chaque modification peut être annulée.'],
            ['Exportez', 'L’IFC corrigé, réécrit par le parseur, et les constats en BCF 2.1, CSV, JSON, rapport de livraison HTML ou feuille de calcul COBie.'],
          ],
        },
        {
          kind: 'text', label: 'Prix', h2: 'Ce que ça coûte',
          ps: [
            'Rien. La visionneuse, les 44 règles, l’IDS, les corrections et tous les exports de cette page sont gratuits, sans compte, y compris pour un usage commercial. Le code source est public sous licence MIT sur [GitHub](github).',
            'Les offres payantes (Pro à 19 € par mois, Team à 35 € par éditeur et par mois) concernent ce qui demande un serveur, comme le stockage des modèles et les jeux de règles enregistrés. Elles ne sont pas encore en vente ; la [page des tarifs](pricing) indique ce que chacune comprendra.',
          ],
        },
      ],
      faq: [
        ['Le fichier IFC est-il téléversé sur un serveur ?', 'Non. Le fichier est lu par du code qui s’exécute dans l’onglet de votre navigateur. Seules des statistiques d’utilisation anonymes (taille du fichier et nombre d’éléments, jamais le contenu) et les liens de partage que vous créez vous-même quittent le navigateur.'],
        ['Quelles versions d’IFC lit-il ?', 'IFC2x3, IFC4, IFC4x1 et IFC4x3, en fichiers .ifc ou dans des archives .ifczip et .zip. Les fichiers de 2 Go ou plus sont refusés.'],
        ['Remplace-t-il un outil de détection de clashs ?', 'Non. Les règles de clash comparent des boîtes englobantes à l’intérieur d’un seul modèle et sont désactivées par défaut. Elles repèrent les chevauchements évidents avant que vous ne transmettiez un modèle ; la coordination entre disciplines demande un outil de détection de clashs.'],
        ['Puis-je contrôler un modèle par rapport à mes propres exigences ?', 'Oui. Chargez un fichier IDS 1.0, ou partez de l’un des sept jeux d’exigences prêts à l’emploi (livraison ISO 19650, LOD 200 et LOD 400, remise COBie, entre autres). Vous pouvez aussi créer un profil de validation avec vos propres modèles de nommage et vos jeux de propriétés requis.'],
        ['Puis-je corriger les erreurs et réexporter l’IFC ?', 'Les GlobalId et les noms peuvent être corrigés automatiquement ; les noms, les descriptions et les valeurs de propriétés se modifient à la main, avec annulation possible. L’export réécrit l’IFC avec ces changements. La géométrie et les relations ne sont pas modifiables.'],
        ['Fonctionne-t-il sans connexion internet ?', 'Non. La page doit se charger depuis internet. Pour les réseaux sans accès à internet, il existe une [installation sur site](onprem).'],
      ],
      bottom: ['Contrôlez un fichier maintenant', 'Gratuit, sans compte, et le fichier reste dans votre navigateur.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    cloud: {
      title: 'Validateur IFC Cloud — Valider en ligne sans téléverser',
      desc: 'Contrôle IFC depuis une page web sans téléverser le modèle : 44 règles, IDS 1.0 et Health Score calculés dans le navigateur. Gratuit, sans compte, jusqu’à 2 Go.',
      nav: 'Validateur IFC cloud',
      kicker: 'En ligne · Sans téléversement · 44 règles · IDS 1.0 · Gratuit',
      h1: ['Validateur IFC cloud', 'sans le téléversement'],
      lead: 'Un outil de contrôle IFC dans le cloud suppose en général d’envoyer le modèle sur le serveur de quelqu’un d’autre. Celui-ci est une page web qui fait le travail dans votre propre navigateur : la même commodité, et le fichier ne quitte jamais votre ordinateur.',
      cta: 'Valider un fichier IFC',
      cta2: 'ou ouvrir le modèle d’exemple',
      note: 'Sans compte. Fonctionne dans Chrome, Edge, Firefox et Safari. Jusqu’à 2 Go par fichier.',
      shots: [
        { alt: 'Contrôle IDS d’un modèle IFC dans le navigateur : la spécification « Walls declare a FireRating in Pset_WallCommon » échoue pour les 57 murs d’une maison à deux niveaux affichée en 3D', cap: 'Un IDS 1.0 d’exemple contrôlé sur le modèle : aucun des 57 murs ne déclare de résistance au feu. Le modèle et l’IDS sont tous deux lus dans l’onglet du navigateur.' },
        { alt: 'Boîte de dialogue d’export d’une validation IFC avec les formats JSON, CSV, certificat, BCF, rapport de livraison et COBie', cap: 'Les constats sortent sous forme de fichiers que vous téléchargez : BCF 2.1, CSV, JSON, rapport de livraison HTML ou feuille de calcul COBie.' },
      ],
      sections: [
        {
          kind: 'table', label: 'Téléversement ou navigateur', h2: 'Un service de contrôle qui téléverse, et une page qui ne téléverse pas',
          sub: 'Solibri WebChecker est l’exemple publié le plus clair d’un service de contrôle dans le cloud : c’est donc lui qui sert de comparaison ici. Sa colonne reprend la page de Solibri.',
          head: ['', 'Solibri WebChecker (Beta)', 'IFC Viewer Online'],
          rows: [
            ['Où va le modèle', 'Téléversé sur le service. Les données sont stockées dans l’UE ou aux États-Unis, au choix lors de la création du projet', 'Nulle part. Il est lu dans l’onglet de votre navigateur'],
            ['Durée de conservation des résultats', '30 jours, puis suppression', 'Jusqu’à la fermeture de l’onglet. Vous gardez ce que vous exportez'],
            ['Taille de fichier', 'Jusqu’à 5 Go par fichier IFC', 'Moins de 2 Go par fichier, et moins encore sur un ordinateur qui a peu de mémoire'],
            ['Compte', 'Un Solibri ID et une offre Solibri Advanced ou Premium', 'Aucun'],
            ['Coût d’un contrôle', '50 jetons. Advanced comprend 1750 jetons par an, Premium 17500 ; un pack de 5000 jetons coûte 250 €', 'Gratuit'],
            ['Contrôles', 'Le contrôle Model Health de Solibri, ou un jeu de règles personnalisé (.cset) préparé dans l’application de bureau Solibri', '44 règles fixes et vos fichiers IDS 1.0'],
            ['Résultats', 'PDF et BCF ; fichiers SMC avec Premium', 'BCF 2.1, CSV, JSON, rapport HTML, feuille de calcul COBie. Pas de fichier PDF : le rapport HTML s’imprime depuis le navigateur'],
          ],
          after: [
            'Un serveur se justifie quand les fichiers dépassent ce qu’un navigateur peut contenir, quand les résultats doivent rester accessibles à toute une équipe projet, ou quand les contrôles doivent tourner sans intervention. Rien de tout cela ne se passe ici : cette page contrôle le fichier d’une personne, sur l’ordinateur de cette personne.',
            'Le navigateur l’emporte quand le modèle ne doit pas sortir des murs, quand personne ne validera un nouveau fournisseur cette semaine, ou quand vous avez simplement besoin d’une réponse sur un fichier.',
          ],
          sources: ['solibriWebchecker', 'solibriPricing'],
        },
        {
          kind: 'cols', label: 'Périmètre', h2: 'Ce qu’il vérifie, et ce qu’il ne vérifie pas',
          cols: [
            { h: 'Il vérifie', items: [
              '44 règles en huit groupes : identifiants, structure spatiale, niveaux, noms, valeurs de propriétés, types, matériaux, qualité de l’export. 25 s’exécutent par défaut.',
              'Les fichiers IDS 1.0, avec les six facettes : entité, attribut, propriété, classification, matériau et « part of ».',
              'Cinq profils de validation intégrés (livraison de base, revue qualité, coordination BIM, ISO 19650, LOD 300), ou le vôtre.',
            ] },
            { h: 'Il ne vérifie pas', items: [
              'Les clashs entre modèles. Uniquement des boîtes englobantes à l’intérieur d’un seul modèle, règle désactivée par défaut.',
              'La réglementation du bâtiment ou des règles de conception écrites pour votre projet. Il n’y a pas d’éditeur de règles ; les exigences s’expriment en IDS.',
              'Les lots de fichiers. Chaque fichier est ouvert par une personne ; rien ne s’exécute de façon planifiée.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Limites', h2: 'Les limites, chiffrées',
          head: ['', 'Limite'],
          rows: [
            ['Taille de fichier', 'Un fichier de 2 Go est refusé. Un avis s’affiche à partir de 200 Mo et un avertissement de mémoire à partir de 1 Go ; sur les téléphones, les tablettes et les ordinateurs dotés de 4 Go de mémoire ou moins, il commence à 80 Mo.'],
            ['Formats', 'IFC2x3, IFC4, IFC4x1 et IFC4x3, en .ifc ou dans un .ifczip ou un .zip.'],
            ['IDS', 'IDS 1.0. Les restrictions totalDigits, fractionDigits et whiteSpace ne sont pas lues. Jusqu’à 200 éléments en défaut sont listés par spécification.'],
            ['Partage', 'Un lien de partage contient le score et les 50 premiers problèmes dans l’URL, jusqu’à 8000 caractères. Le modèle n’y figure pas.'],
            ['Connexion', 'La page doit se charger depuis internet. Elle ne fonctionne pas hors ligne.'],
          ],
        },
        {
          kind: 'text', label: 'Votre fichier', h2: 'Ce que devient le fichier',
          ps: [
            'L’IFC est ouvert par du code qui s’exécute dans l’onglet de votre navigateur et n’est envoyé nulle part. Vous pouvez le vérifier vous-même : ouvrez les outils de développement du navigateur, surveillez l’onglet Réseau et déposez un fichier.',
            'Le navigateur garde une copie convertie de la géométrie dans son stockage privé, sur votre ordinateur (jusqu’à 4 Go), pour rouvrir le modèle plus vite. Effacer les données du site la supprime.',
            'Des statistiques d’utilisation sans cookies enregistrent la taille du fichier et le nombre d’éléments, jamais le contenu, et peuvent être désactivées. Un lien de partage, si vous en créez un, contient le score, le nom du fichier et jusqu’à 50 problèmes avec le nom des éléments.',
          ],
        },
        { kind: 'shot', label: 'Le résultat', h2: 'Essayez sur un modèle d’exemple', sub: 'La démo ci-dessous s’exécute dans cette page. Ouvrez ensuite votre propre fichier.' },
        {
          kind: 'text', label: 'Prix', h2: 'Ce que ça coûte',
          ps: [
            'Rien : la visionneuse, les règles, l’IDS et les exports sont gratuits et ne demandent pas de compte. Le code est public sous licence MIT sur [GitHub](github).',
            'Les offres payantes qui ajoutent un serveur (modèles stockés, jeux de règles enregistrés, travail en équipe) sont décrites sur la [page des tarifs](pricing) et ne sont pas encore en vente.',
          ],
        },
      ],
      faq: [
        ['Est-ce un service cloud ?', 'Il est distribué par le web comme un service cloud, mais le contrôle est fait par votre navigateur. Il n’y a ni téléversement, ni file d’attente, ni copie du modèle stockée de notre côté.'],
        ['Comment vérifier que rien n’est téléversé ?', 'Ouvrez les outils de développement de votre navigateur, allez dans l’onglet Réseau et déposez un fichier IFC. Vous verrez se charger les fichiers de la page elle-même, et aucune requête qui transporte le modèle.'],
        ['Quelle taille de fichier accepte-t-il ?', 'Les fichiers de 2 Go ou plus sont refusés, et la limite pratique dépend de la mémoire de l’ordinateur : un avertissement s’affiche à partir de 1 Go, ou de 80 Mo sur les téléphones et les machines dotées de 4 Go de mémoire ou moins. Solibri WebChecker accepte jusqu’à 5 Go par fichier (solibri.com/solutions/webchecker, consulté le 2026-11-10).'],
        ['Puis-je l’automatiser ?', 'Pas depuis cette page : chaque fichier est ouvert par une personne. Il existe un serveur MCP (ifc-viewer-mcp) qui exécute la même validation sur votre propre machine depuis un assistant ou un script ; voir le [code source sur GitHub](github).'],
        ['Est-il utilisable pour des modèles confidentiels ?', 'Le modèle reste sur votre ordinateur, ce qui est en général ce que demande un accord de confidentialité. Vérifiez deux points au regard de votre propre politique : les statistiques d’utilisation anonymes (elles peuvent être désactivées) et les liens de partage (ils contiennent des noms de fichiers et d’éléments).'],
      ],
      faqSources: ['solibriWebchecker'],
      bottom: ['Contrôlez un fichier sans le téléverser', 'Gratuit, sans compte. Le modèle reste sur votre ordinateur.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    onprem: {
      title: 'Validateur IFC on-premise — Validation BIM en réseau isolé',
      desc: 'Visionneuse IFC, validateur à 44 règles et contrôles IDS servis depuis votre réseau, sans internet. Image de conteneur, installation, formation et support.',
      nav: 'Validation IFC on-premise',
      kicker: 'On-premise · Sans connexion internet · Votre serveur',
      h1: ['Validateur IFC on-premise', 'pour les réseaux qui restent fermés'],
      lead: 'L’application publique lit déjà les fichiers IFC dans le navigateur, mais la page elle-même se charge depuis internet. Là où ce n’est pas autorisé, la même visionneuse, le même validateur et les mêmes contrôles IDS sont servis depuis un conteneur sur votre propre serveur.',
      cta: 'Demander un pilote',
      cta2: '',
      note: 'Un seul site, un périmètre fixe : installation, configuration avec vos exigences, une séance de formation et une période de support.',
      shots: [
        { alt: 'Validateur IFC avec la liste des profils de validation intégrés ouverte : livraison de base, revue qualité, coordination BIM, conformité ISO 19650 et conception LOD 300', cap: 'Les profils intégrés. Pendant le pilote, vos propres profils et fichiers IDS sont chargés et testés sur vos modèles.' },
        { alt: 'Résultat d’un contrôle IDS dans le validateur IFC : une spécification en échec, 0 mur sur 57 avec une propriété FireRating, avec des boutons pour mettre en évidence, isoler et exporter', cap: 'Un modèle contrôlé par rapport à un fichier IDS : les 57 murs ne satisfont pas l’exigence de résistance au feu. En on-premise, le modèle et les exigences restent sur votre réseau.' },
      ],
      sections: [
        {
          kind: 'cols', label: 'Pour qui', h2: 'Quand « rien n’est téléversé » ne suffit pas',
          cols: [
            { h: 'C’est adapté quand', items: [
              'Les postes de travail n’ont pas d’accès à internet, ou n’ont pas le droit d’en charger des logiciels.',
              'Il vous faut une seule version auditée, qui ne change pas tant que vous ne l’avez pas décidé.',
              'Les modèles des entreprises doivent être contrôlés par rapport à votre IDS ou à votre EIR sans passer par un tiers.',
              'Vous voulez quelqu’un à appeler quand ça ne fonctionne pas.',
            ] },
            { h: 'Vous n’en avez pas besoin quand', items: [
              'Votre politique interdit seulement de téléverser les modèles. Le [validateur public](validator) ne les téléverse pas.',
              'Vous avez le personnel pour l’héberger vous-mêmes. Le code est sous licence MIT et comprend un Dockerfile : construisez l’image et servez-la. Le pilote ajoute la configuration, la formation et le support, pas un produit différent.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Ce que vous recevez', h2: 'Ce qui est installé, et ce qui ne l’est pas',
          head: ['', 'Détail'],
          rows: [
            ['Logiciel', 'La visionneuse, les 44 règles avec le Health Score, IDS 1.0, BCF 2.1 et 3.0, plusieurs modèles à la fois, les mesures et les coupes. Une application web statique servie par nginx depuis un conteneur ; le contrôle s’exécute dans le navigateur de chaque utilisateur.'],
            ['Serveur', 'Toute machine capable de faire tourner un conteneur. Elle ne fait que servir des fichiers et demande donc peu de ressources : le travail est fait par les postes de travail.'],
            ['Connexions', 'Aucune connexion sortante et aucune statistique d’utilisation dans cette version.'],
            ['Indisponible hors ligne', 'Le contexte cartographique 3D (relief, bâtiments OpenStreetMap) et les modèles d’exemple en ligne, parce qu’ils sont téléchargés depuis internet.'],
            ['Vos exigences', 'Vos fichiers IDS, vos profils de validation et vos modèles de nommage, chargés et testés sur vos propres modèles.'],
            ['Mises à jour', 'Un nouveau fichier image, livré par le canal que vous choisissez. Rien ne se met à jour tout seul.'],
            ['Matériel', 'Votre propre serveur ou machine virtuelle. Une passerelle préconfigurée peut être fournie sur demande.'],
          ],
        },
        {
          kind: 'table', label: 'Alternatives', h2: 'L’autre option pour réseau isolé que nous connaissons',
          sub: 'Si vous comparez, voici ce que Solibri publie sur son offre hors ligne.',
          head: ['', 'Solibri Security+', 'IFC Viewer Online on-premise'],
          rows: [
            ['Présenté comme', '« Fully offline operation (no telemetry) », « Air-gapped by design », « Controlled update cycles »', 'Un conteneur sur votre serveur ; aucune connexion sortante'],
            ['Prix', 'Non publié ; « Talk with an expert »', 'Devis par pilote, après un appel de cadrage'],
            ['Contrôles', 'La validation par règles de Solibri', '44 règles fixes et IDS 1.0 ; clashs par boîtes englobantes uniquement'],
          ],
          after: [
            'Solibri est le meilleur choix quand il vous faut la détection de clashs entre disciplines ou des règles écrites pour votre organisation. Cette installation est plus modeste : ouvrir un livrable, le contrôler par rapport à vos exigences et renvoyer les constats.',
          ],
          sources: ['solibriPricing'],
        },
        {
          kind: 'steps', label: 'Pilote', h2: 'Comment se déroule un pilote',
          steps: [
            ['Appel de cadrage', 'Les règles de votre réseau, la taille de vos modèles, vos exigences et les personnes qui l’utiliseront.'],
            ['Installation', 'Sur votre serveur, avec vos fichiers IDS et vos profils chargés.'],
            ['Formation', 'Une séance avec vos coordinateurs BIM, sur vos propres modèles.'],
            ['Décision', 'Après la période de support, vous décidez de l’étendre ou non à d’autres sites.'],
          ],
        },
        {
          kind: 'form', label: 'Demander un pilote', h2: 'Parlez-nous de votre environnement',
          sub: 'Le formulaire ouvre un message dans votre propre logiciel de messagerie. Rien n’est envoyé à nos serveurs.',
          org: 'Organisation', sector: 'Secteur',
          sectors: ['Défense / sécurité', 'Énergie / réseaux', 'Transport / infrastructures', 'Administration publique', 'Industrie / fabrication', 'Entreprise du secteur AEC', 'Autre'],
          deploy: 'Réseau', deploys: ['Aucun accès à internet', 'Réseau privé, internet restreint', 'Cloud privé dans notre région', 'Pas encore décidé'],
          hw: 'Matériel', hws: ['Notre propre serveur ou machine virtuelle', 'Une passerelle préconfigurée', 'Pas encore décidé'],
          need: 'Que devez-vous contrôler, et quelle est la taille approximative des modèles ?',
          submit: 'Ouvrir l’e-mail', direct: 'Ou écrivez à', subject: 'Pilote de validation IFC on-premise',
        },
      ],
      faq: [
        ['Quelque chose sort-il de notre réseau ?', 'Non. Le conteneur sert l’application à vos navigateurs et n’établit aucune connexion sortante ; cette version ne contient aucune statistique d’utilisation. Les modèles sont lus dans le navigateur de chaque utilisateur et ne sont pas stockés sur le serveur.'],
        ['Quelle différence avec l’application publique ?', 'Le programme est le même. Ce qui change : l’endroit d’où il est servi, le fait que ce soit une version figée, et l’absence des fonctions qui ont besoin d’internet (le contexte cartographique et les modèles d’exemple en ligne).'],
        ['Pouvons-nous l’héberger nous-mêmes, sans vous ?', 'Oui. Le code source est public sous licence MIT et comprend un Dockerfile et une configuration nginx. Le pilote s’adresse aux équipes qui veulent qu’il soit configuré, expliqué et supporté.'],
        ['Quelle taille peuvent avoir les modèles ?', 'La même que dans l’application publique : moins de 2 Go par fichier, avec pour limite pratique la mémoire de chaque poste de travail, puisque le contrôle s’exécute dans le navigateur.'],
        ['Combien ça coûte ?', 'Un pilote fait l’objet d’un devis après l’appel de cadrage, car il dépend du nombre de sites et du support dont vous avez besoin. Il n’existe pas encore de grille tarifaire publique.'],
      ],
      bottom: ['Votre réseau est connecté ? Alors c’est déjà gratuit', 'Le validateur public lit le fichier dans votre navigateur et ne téléverse rien.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    solibri: {
      title: 'Alternative à Solibri gratuite — Valider l’IFC en ligne',
      desc: 'Quand un validateur gratuit dans le navigateur suffit, quand il faut Solibri : prix, clashs, règles et IDS d’après les pages de Solibri lues le 2026-11-10.',
      nav: 'Alternative à Solibri',
      kicker: 'Gratuit · Dans le navigateur · Comparé aux offres publiées par Solibri',
      h1: ['Alternative à Solibri gratuite', 'pour contrôler un IFC avant sa livraison'],
      lead: 'Solibri est une plateforme de contrôle par règles vendue en offres allant de 99 € à 2772 € par licence et par an. IFC Viewer Online est une page web gratuite qui ouvre un IFC, exécute 44 règles fixes et votre IDS, et montre ce qui échoue. Elle remplace Solibri pour certaines tâches et pas pour d’autres ; cette page dit lesquelles.',
      cta: 'Valider un fichier IFC',
      cta2: 'ou ouvrir le modèle d’exemple',
      note: 'Sans compte, rien à installer, et le fichier n’est pas téléversé.',
      heroSources: ['solibriPricing'],
      shots: [
        { alt: 'Modèle IFC contrôlé dans le navigateur avec la règle de clash activée : Health Score de 70, 36 clashs entre éléments en tête de la liste des corrections, et les éléments concernés mis en évidence dans la vue 3D', cap: 'Le modèle d’exemple avec la règle de clash activée : 36 chevauchements entre boîtes englobantes, et le score passe de 77 à 70. C’est un premier filtre à l’intérieur d’un seul modèle, pas la détection de clashs que vend Solibri.' },
        { alt: 'Contrôle IDS dans le navigateur : une spécification IDS qui exige une résistance au feu sur les murs, en échec pour les 57 murs du modèle IFC affiché en 3D', cap: 'Un fichier IDS 1.0 contrôlé sur le modèle, gratuitement et sans compte : il manque à 57 murs la résistance au feu que demande la spécification.' },
      ],
      sections: [
        {
          kind: 'table', label: 'Comparaison', h2: 'Solibri et IFC Viewer Online, côte à côte',
          sub: 'La colonne Solibri ne dit que ce que Solibri publie. Quand ses pages ne précisent pas un point (systèmes d’exploitation, limites de taille de fichier), il n’y a pas de ligne.',
          head: ['', 'Solibri', 'IFC Viewer Online'],
          rows: [
            ['Prix', 'Starter 99 €, Essential 1428 €, Advanced 2109 €, Premium 2772 € : prix de départ par licence et par an. Security+ sur demande', 'Gratuit. Les offres payantes pour les fonctions serveur ne sont pas encore en vente'],
            ['Contrôle de modèles', 'À partir d’Essential. Starter sert à visualiser les modèles et à examiner les résultats : « Model checking is performed in Solibri Essential, Advanced, or Premium »', 'Inclus : 44 règles fixes, 25 actives par défaut'],
            ['Détection de clashs', 'Essential : contrôle des clashs par règles, clashs durs et clashs souples. Advanced : une matrice de clashs entre disciplines avec tolérances', 'Boîtes englobantes uniquement, à l’intérieur d’un seul modèle, chevauchement de 5 cm, jusqu’à 800 éléments et 100 résultats. Désactivée par défaut'],
            ['Vos propres règles', 'Advanced et Premium : « Custom rule creation and modification »', 'Pas d’éditeur de règles. Vous pouvez activer ou désactiver des règles, changer leur sévérité et définir des modèles de nommage et des jeux de propriétés requis ; tout le reste s’exprime en IDS'],
            ['IDS', 'Essential contrôle les propriétés requises par rapport à des définitions IDS. Advanced ajoute des workflows IDS, un éditeur IDS et un validateur IDS', 'IDS 1.0 avec ses six facettes. Trois restrictions (totalDigits, fractionDigits, whiteSpace) ne sont pas lues'],
            ['BCF', 'À partir d’Essential : « BCF issue management and CDE integrations »', 'Lit et écrit les fichiers BCF 2.1 et 3.0. Pas de connexion à un serveur BCF ni à un CDE'],
            ['Modèles Revit natifs', 'À partir d’Essential : « IFC and native Revit model federation »', 'IFC uniquement'],
            ['Métrés', 'Advanced : « Quantity / Information Takeoff (QTO / ITO) »', 'Additionne les quantités déjà écrites dans l’IFC. Pas de règles de métré'],
            ['Sans internet', 'Security+ : « Fully offline operation (no telemetry) »', 'La page se charge depuis internet ; le fichier n’est pas téléversé. Il existe une [installation sur site](onprem)'],
          ],
          after: [
            'Choisissez Solibri quand vous coordonnez plusieurs disciplines et qu’il vous faut une vraie détection de clashs, quand votre organisation écrit ses propres règles, ou quand le contrôle doit être encadré sur de nombreux projets. Rien sur cette page ne fait cela.',
            'Choisissez IFC Viewer Online quand vous voulez savoir aujourd’hui si un IFC est bon à envoyer : identifiants, structure, noms, propriétés, votre IDS. C’est aussi l’outil des personnes qui gravitent autour d’une équipe Solibri sans avoir de licence : l’architecte qui exporte le modèle, le client qui le reçoit.',
            'Beaucoup d’équipes utiliseront les deux : un contrôle rapide dans le navigateur avant l’export, et Solibri pour la coordination.',
          ],
          sources: ['solibriPricing', 'solibriStarter', 'solibriEssential', 'solibriAdvanced'],
        },
        {
          kind: 'text', label: 'Solibri aujourd’hui', h2: 'Si vous cherchez Solibri Office ou Solibri Anywhere',
          ps: [
            'Le site de Solibri classe Solibri Office, CheckPoint, Anywhere et Site parmi ses anciens produits (« legacy »), qui sont « no longer available for new customers ». Les offres actuelles sont Starter, Essential, Advanced, Premium et Security+.',
            'La version gratuite de Solibri Anywhere fonctionne toujours pour celles et ceux qui l’ont déjà, sur les versions antérieures à la 26.4.0 ; Solibri indique que ce droit d’utilisation gratuit n’est pas disponible dans les versions plus récentes. Si vous utilisiez Anywhere pour ouvrir et consulter des fichiers IFC, la [visionneuse](viewer) le fait gratuitement, dans le navigateur, sur n’importe quel système d’exploitation.',
          ],
          sources: ['solibriLegacy', 'solibriPricing'],
        },
        {
          kind: 'cols', label: 'Périmètre', h2: 'Ce que vous obtenez ici, et ce que vous n’obtenez pas',
          cols: [
            { h: 'Vous obtenez', items: [
              'Un Health Score de 0 à 100 et les corrections qui font regagner le plus de points.',
              'Les éléments en défaut mis en évidence dans le modèle 3D, et listés par règle, par niveau ou par classe.',
              'Des contrôles IDS 1.0 et cinq profils de validation intégrés, de la livraison de base à l’ISO 19650 et au LOD 300.',
              'Des corrections automatiques pour les GlobalId et les noms, la modification manuelle des noms et des valeurs de propriétés, et l’IFC corrigé.',
              'Les constats en BCF 2.1, CSV, JSON, rapport HTML ou feuille de calcul COBie.',
            ] },
            { h: 'Vous n’obtenez pas', items: [
              'La détection de clashs entre modèles, ni au niveau de la géométrie réelle.',
              'Un éditeur de règles, le contrôle réglementaire (accessibilité, incendie, issues de secours) ou l’analyse des espaces.',
              'Un suivi des problèmes avec attribution sur un serveur. Les fichiers BCF s’échangent à la main.',
              'Les fichiers de 2 Go ou plus. La limite dépend de la mémoire de votre ordinateur.',
            ] },
          ],
        },
        { kind: 'shot', label: 'Essayez', h2: 'Lancez-le sur un modèle d’exemple', sub: 'La démo ci-dessous charge le validateur dans cette page.' },
        {
          kind: 'text', label: 'Prix', h2: 'Ce que ça coûte',
          ps: [
            'La visionneuse, les règles, l’IDS, les corrections et les exports sont gratuits, sans compte, y compris pour les projets commerciaux. Le code source est public sous licence MIT sur [GitHub](github).',
            'Les offres payantes (Pro à 19 € par mois, Team à 35 € par éditeur et par mois) ajouteront ce qui demande un serveur ; elles ne sont pas encore en vente. Voir la [page des tarifs](pricing).',
          ],
        },
      ],
      faq: [
        ['IFC Viewer Online remplace-t-il Solibri ?', 'Pour contrôler un IFC avant sa livraison (identifiants, structure spatiale, noms, propriétés, IDS), oui. Pour la détection de clashs entre disciplines, les règles personnalisées et la gouvernance sur plusieurs projets, non : c’est à cela que servent Solibri Essential et Advanced.'],
        ['Combien coûte Solibri ?', 'Solibri publie des prix de départ par licence et par an : Starter 99 €, Essential 1428 €, Advanced 2109 € et Premium 2772 €. Le prix de Security+ est sur demande (solibri.com/pricing, consulté le 2026-11-10).'],
        ['Existe-t-il une version gratuite de Solibri ?', 'Solibri Anywhere, qui avait une version gratuite, est désormais un ancien produit et n’est plus proposé aux nouveaux clients ; les utilisateurs gratuits existants peuvent conserver les versions antérieures à la 26.4.0 (solibri.com/products/legacy-products, consulté le 2026-11-10). L’offre actuelle la moins chère est Starter, à 99 € par an.'],
        ['L’offre Starter à 99 € contrôle-t-elle les modèles ?', 'D’après Solibri, Starter sert à l’inspection visuelle et à l’examen de résultats produits par d’autres : « Model checking is performed in Solibri Essential, Advanced, or Premium » (solibri.com/products/starter, consulté le 2026-11-10).'],
        ['Que fait Solibri que cet outil ne fait pas ?', 'La détection de clashs sur la géométrie réelle et entre modèles, des règles écrites pour votre organisation, des règles de métré, les modèles Revit natifs, les serveurs BCF et les connexions aux CDE, et une offre entièrement hors ligne. Voir le tableau ci-dessus.'],
        ['Puis-je utiliser les deux ?', 'Oui, et cette répartition est courante : les auteurs et les clients contrôlent un fichier dans le navigateur avant son envoi, et l’équipe de coordination fait tourner Solibri sur le modèle fédéré.'],
      ],
      faqSources: ['solibriPricing', 'solibriLegacy', 'solibriStarter'],
      bottom: ['Contrôlez un fichier avant de décider', 'Cela prend une minute, ne coûte rien, et le modèle reste sur votre ordinateur.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    webchecker: {
      title: 'Alternative à Solibri WebChecker — Contrôleur IFC gratuit',
      desc: 'Solibri WebChecker exige une offre Advanced ou Premium et téléverse l’IFC. Cette alternative gratuite le contrôle dans le navigateur. Qui fait quoi, sources.',
      nav: 'Alternative à Solibri WebChecker',
      kicker: 'Gratuit · Sans offre Solibri · Le fichier n’est pas téléversé',
      h1: ['Alternative à Solibri WebChecker', 'qui contrôle l’IFC dans votre propre navigateur'],
      lead: 'Solibri WebChecker (Beta) fait tourner en ligne le moteur de contrôle de Solibri : vous téléversez un IFC, il est contrôlé sur le service de Solibri, et vous téléchargez un PDF ou un BCF. Il est fourni avec les offres Advanced et Premium. Si vous avez besoin d’un contrôle web sans offre, ou sans téléverser le modèle, cette page le fait dans votre navigateur, avec moins de contrôles.',
      cta: 'Valider un fichier IFC',
      cta2: 'ou ouvrir le modèle d’exemple',
      note: 'Sans compte et sans jetons. Jusqu’à 2 Go par fichier.',
      heroSources: ['solibriWebchecker'],
      shots: [
        { alt: 'Contrôle IFC sur le web : la liste des problèmes regroupés par règle avec le nombre d’éléments en défaut, dans le panneau de validation de la visionneuse du navigateur', cap: 'Les constats d’un contrôle, regroupés par règle. Rien n’a été téléversé pour les produire.' },
        { alt: 'Export d’un contrôle IFC depuis le navigateur avec les formats BCF, CSV, JSON, rapport de livraison et COBie', cap: 'Les résultats sortent en BCF 2.1, CSV, JSON, rapport HTML ou feuille de calcul COBie. Il n’y a pas de fichier PDF ; le rapport HTML s’imprime depuis le navigateur.' },
      ],
      sections: [
        {
          kind: 'table', label: 'Comparaison', h2: 'Solibri WebChecker et IFC Viewer Online',
          sub: 'La colonne WebChecker est tirée de la page de Solibri.',
          head: ['', 'Solibri WebChecker (Beta)', 'IFC Viewer Online'],
          rows: [
            ['Accès', 'Inclus dans Solibri Advanced (à partir de 2109 € par an) et Premium (à partir de 2772 €). Absent de Starter, Essential et Security+, et « not a standalone product ». Demande un Solibri ID', 'Ouvrez la page. Sans compte'],
            ['Coût par contrôle', '50 jetons. Advanced comprend 1750 jetons par an (environ 35 contrôles), Premium 17500 (environ 350). Jetons supplémentaires : 5000 pour 250 €, 10000 pour 450 €, 25000 pour 750 €', 'Gratuit, quel que soit le nombre de contrôles'],
            ['Où va le modèle', 'Téléversé. Résidence des données dans l’UE ou aux États-Unis, au choix lors de la création du projet', 'Il reste dans l’onglet de votre navigateur'],
            ['Conservation des résultats', '30 jours', 'Jusqu’à la fermeture de l’onglet ; exportez ce dont vous avez besoin'],
            ['Taille de fichier', 'Jusqu’à 5 Go par fichier IFC', 'Moins de 2 Go, et moins encore sur un ordinateur qui a peu de mémoire'],
            ['Contrôles', 'Contrôle Model Health (structure et classification, nommage et identifiants, propriétés clés via des contrôles fondés sur l’IDS, clashs géométriques durs entre disciplines), ou un jeu de règles .cset personnalisé créé dans l’application de bureau', '44 règles fixes et des fichiers IDS 1.0. Clashs par boîtes englobantes, à l’intérieur d’un seul modèle uniquement'],
            ['Résultats', 'PDF et BCF (1.0, 2.0, 2.1 ou 3.0) ; fichiers SMC pour les utilisateurs Premium', 'BCF 2.1, CSV, JSON, rapport HTML, feuille de calcul COBie'],
          ],
          after: [
            'WebChecker est le meilleur outil quand votre équipe BIM maintient déjà des jeux de règles Solibri et veut que les intervenants du projet exécutent exactement ceux-là, quand les fichiers dépassent 2 Go, ou quand il vous faut les clashs durs entre disciplines dans le rapport.',
            'Cette page est le meilleur outil quand vous n’avez pas d’offre Advanced ou Premium, quand le modèle ne doit pas être téléversé, ou quand vous contrôlez souvent et ne voulez pas compter des jetons.',
          ],
          sources: ['solibriWebchecker', 'solibriPricing'],
        },
        {
          kind: 'cols', label: 'Périmètre', h2: 'Ce que ce contrôle couvre, et ce qu’il ne couvre pas',
          cols: [
            { h: 'Il vérifie', items: [
              'Identifiants, structure spatiale, niveaux, noms, valeurs de propriétés, types et matériaux : 44 règles, 25 actives par défaut.',
              'Les fichiers IDS 1.0 avec leurs six facettes.',
              'Cinq profils de validation intégrés, ou vos propres modèles de nommage et jeux de propriétés requis.',
            ] },
            { h: 'Il ne vérifie pas', items: [
              'Les jeux de règles Solibri. Un fichier .cset ne peut pas être chargé ici.',
              'Les clashs durs entre disciplines, les règles d’accessibilité ou l’analyse des espaces.',
              'Les fichiers de 2 Go ou plus.',
            ] },
          ],
          sources: ['solibriWebchecker'],
        },
        {
          kind: 'text', label: 'Votre fichier', h2: 'Ce que devient le fichier',
          ps: [
            'L’IFC est lu par du code qui s’exécute dans l’onglet de votre navigateur et n’est pas téléversé. Le navigateur garde une copie convertie de la géométrie dans son stockage privé, sur votre ordinateur (jusqu’à 4 Go), pour le rouvrir plus vite ; effacer les données du site la supprime.',
            'Des statistiques d’utilisation sans cookies enregistrent la taille du fichier et le nombre d’éléments, jamais le contenu, et peuvent être désactivées. Un lien de partage, si vous en créez un, contient dans l’URL le score, le nom du fichier et jusqu’à 50 problèmes.',
          ],
        },
        { kind: 'shot', label: 'Essayez', h2: 'Lancez un contrôle sur un modèle d’exemple', sub: 'La démo ci-dessous charge le validateur dans cette page.' },
        {
          kind: 'text', label: 'Prix', h2: 'Ce que ça coûte',
          ps: [
            'Rien, et il n’y a pas de jetons. La visionneuse, les règles, l’IDS et les exports sont gratuits et sans compte. Le code est public sous licence MIT sur [GitHub](github).',
            'Les offres payantes qui ajoutent un serveur sont décrites sur la [page des tarifs](pricing) et ne sont pas encore en vente. Les autres offres et leurs prix sont comparés sur [une page à part](solibri).',
          ],
        },
      ],
      faq: [
        ['Qu’est-ce que Solibri WebChecker ?', 'Selon les termes de Solibri, « a browser-based model validation service that runs Solibri’s rules-based checking engine online ». Les utilisateurs téléversent des modèles IFC, lancent le contrôle Model Health ou un jeu de règles personnalisé, et exportent un PDF ou un BCF (solibri.com/solutions/webchecker, consulté le 2026-11-10).'],
        ['Solibri WebChecker est-il gratuit ?', 'Non. Il est inclus dans Solibri Advanced et Premium et n’est pas vendu séparément. Chaque contrôle consomme 50 jetons, pris sur la dotation annuelle de l’offre ou sur des packs de jetons qui commencent à 250 € pour 5000 jetons (solibri.com/solutions/webchecker, consulté le 2026-11-10).'],
        ['WebChecker téléverse-t-il mon modèle ?', 'Oui : Solibri le décrit comme un service où les utilisateurs téléversent des modèles IFC, avec des données stockées dans l’UE ou aux États-Unis et des résultats conservés 30 jours (solibri.com/solutions/webchecker, consulté le 2026-11-10). IFC Viewer Online, lui, lit le fichier dans votre navigateur.'],
        ['Puis-je exécuter mes jeux de règles Solibri ici ?', 'Non. Les jeux de règles Solibri (.cset) ne s’exécutent que dans Solibri. Les exigences qui peuvent s’écrire en IDS 1.0 peuvent être contrôlées ici.'],
        ['Lequel trouve le plus de problèmes ?', 'Ils ne cherchent pas les mêmes choses. Le contrôle Model Health de WebChecker comprend les clashs durs entre disciplines, ce que cette page ne fait pas. Cette page donne un score et des corrections automatiques pour les identifiants et les noms. Pour la coordination, utilisez Solibri.'],
      ],
      faqSources: ['solibriWebchecker'],
      bottom: ['Lancez un contrôle web maintenant', 'Sans offre, sans jetons, sans téléversement.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    mac: {
      title: 'Visionneuse IFC pour Mac gratuite, sans installation, Safari',
      desc: 'Ouvrez des fichiers IFC sur Mac dans Safari, Chrome ou Firefox : vue 3D, propriétés, coupes, mesures et validation. Rien à installer, sans compte, gratuit.',
      nav: 'Visionneuse IFC pour Mac',
      kicker: 'macOS · Safari, Chrome, Firefox, Edge · Rien à installer · Gratuit',
      h1: ['Visionneuse IFC pour Mac', 'qui fonctionne dans le navigateur que vous avez déjà'],
      lead: 'Il n’y a pas d’application à télécharger : la visionneuse est une page web. Ouvrez-la dans Safari ou Chrome sous macOS, déposez un fichier IFC et vous obtenez le modèle 3D, l’arborescence spatiale, les propriétés de chaque élément, des coupes, des mesures et un rapport de validation. Le fichier n’est pas téléversé.',
      cta: 'Ouvrir la visionneuse',
      cta2: 'ou ouvrir le modèle d’exemple',
      note: 'Sans compte. IFC2x3, IFC4, IFC4x1 et IFC4x3, jusqu’à 2 Go par fichier.',
      shots: [
        { alt: 'Visionneuse IFC dans une fenêtre de navigateur de 1440 par 900, la taille d’un écran de MacBook : une maison à deux niveaux en 3D, l’arborescence spatiale à gauche et, à droite, les attributs IFC et les jeux de propriétés d’un mur sélectionné', cap: 'La visionneuse dans une fenêtre de 1440 × 900, la taille par défaut d’un écran de MacBook Air (capture réalisée dans Chrome). À droite, les attributs et les jeux de propriétés du mur sélectionné.' },
        { alt: 'Plan de coupe traversant un modèle IFC de maison dans la visionneuse du navigateur, avec le mobilier intérieur visible, dans une fenêtre de 1440 par 900', cap: 'Un plan de coupe à travers le même modèle, déplacé avec le curseur ou en le faisant glisser dans la vue. Aucun plug-in n’intervient.' },
      ],
      sections: [
        {
          kind: 'cols', label: 'Sur Mac', h2: 'Ce qui fonctionne sous macOS, et à quoi s’attendre',
          cols: [
            { h: 'Ça fonctionne', items: [
              'Dans Safari, Chrome, Firefox et Edge sous macOS. La page a besoin de WebGL et de WebAssembly, que ces navigateurs intègrent.',
              'L’ouverture de fichiers .ifc et d’archives .ifczip ou .zip, en les faisant glisser dans la fenêtre ou avec le bouton Open.',
              'Plusieurs modèles à la fois, chacun avec sa propre arborescence et ses propriétés.',
              'Sur iPad ou iPhone aussi, avec des fichiers plus petits.',
            ] },
            { h: 'À garder en tête', items: [
              'Ce n’est pas une application macOS : pas d’icône dans le Dock, pas d’aperçu Quick Look, et les fichiers .ifc ne s’ouvrent pas par un double-clic.',
              'La page doit se charger depuis internet. Elle ne fonctionne pas hors ligne.',
              'La limite de taille de fichier est de 2 Go et, en pratique, la mémoire du Mac : un avertissement s’affiche à partir de 1 Go, ou de 80 Mo sur les machines dotées de 4 Go de mémoire ou moins ainsi que sur iPad et iPhone.',
              'Les captures de cette page ont été réalisées dans Chrome. Si quelque chose s’affiche mal dans Safari, essayez Chrome.',
            ] },
          ],
        },
        {
          kind: 'cols', label: 'Outils', h2: 'Ce que vous pouvez faire avec un modèle',
          cols: [
            { h: 'Consulter', items: [
              'Orbite, panoramique et zoom ; masquer et isoler des éléments ; parcourir l’arborescence spatiale.',
              'Des plans de coupe et des plans d’étage 2D tirés du modèle, exportés en DXF, SVG ou PDF.',
              'Mesurer des distances, des surfaces, des angles et des dégagements.',
              'Lire chaque jeu de propriétés et les quantités écrites dans le fichier.',
            ] },
            { h: 'Contrôler et corriger', items: [
              'Une validation avec 44 règles et un Health Score de 0 à 100 ; voir le [validateur IFC](validator).',
              'Des contrôles IDS 1.0 par rapport à vos propres exigences.',
              'Modifier les noms et les valeurs de propriétés, corriger les GlobalId, et exporter l’IFC corrigé ou un GLB.',
              'Ouvrir et écrire des fichiers BCF 2.1 et 3.0.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Comparaison', h2: 'Autres façons d’ouvrir un IFC sur Mac',
          sub: 'Flinker est l’autre visionneuse gratuite dans le navigateur sur laquelle on nous interroge. Sa colonne dit ce que Flinker publie.',
          head: ['', 'Flinker', 'IFC Viewer Online'],
          rows: [
            ['Ce que c’est', '« The IFC viewer for Microsoft » : SharePoint, Teams, Excel, Power BI, Windows et le navigateur', 'Une visionneuse, un validateur et un éditeur dans une page web'],
            ['Sur Mac', 'La visionneuse dans le navigateur. L’application de bureau est pour Windows ; le site ne mentionne pas macOS', 'N’importe quel navigateur récent sous macOS'],
            ['Pour commencer', '« Open a model without creating an account »', 'Sans compte'],
            ['Formats', 'IFC 2x3, 4 et 4x3 ; BCF 2.1 et 3.0 ; IDS 1.0 ; DXF ; superposition de PDF', 'IFC2x3, IFC4, IFC4x1 et IFC4x3 ; BCF 2.1 et 3.0 ; IDS 1.0'],
            ['Le fichier', 'Analysé dans le navigateur ; il reste sur l’appareil ou dans le stockage Microsoft que vous choisissez', 'Lu dans le navigateur ; non téléversé'],
            ['Contrôle', 'Contrôles d’exigences IDS avec mise en évidence des éléments conformes et non conformes', '44 règles avec un Health Score, plus l’IDS'],
            ['Prix', 'Community : gratuit. Enterprise : prix par déploiement', 'Gratuit'],
          ],
          after: [
            'Choisissez Flinker quand vos projets vivent déjà dans SharePoint et Teams : ouvrir le modèle à côté des documents, c’est ce pour quoi il est conçu, et cette visionneuse ne se connecte pas à Microsoft 365.',
            'Choisissez IFC Viewer Online quand vous voulez aussi savoir si le modèle est bon : la validation, le score et les corrections font la différence.',
            'À propos de Solibri : les pages produit que nous avons lues le même jour n’indiquent pas sur quels systèmes d’exploitation ses offres fonctionnent, donc nous ne le disons pas. Vérifiez la configuration requise de Solibri avant d’acheter pour un Mac.',
          ],
          sources: ['flinkerViewer', 'solibriPricing'],
        },
        { kind: 'shot', label: 'Essayez', h2: 'Ouvrez le modèle d’exemple', sub: 'La démo ci-dessous s’exécute dans cette page, dans le navigateur que vous utilisez en ce moment.' },
        {
          kind: 'text', label: 'Prix', h2: 'Ce que ça coûte',
          ps: [
            'Rien. Il n’y a ni licence, ni période d’essai, ni compte. Le code est public sous licence MIT sur [GitHub](github). Les offres payantes qui ajoutent un serveur figurent sur la [page des tarifs](pricing) et ne sont pas encore en vente.',
          ],
        },
      ],
      faq: [
        ['Existe-t-il une visionneuse IFC pour Mac qui ne demande aucune installation ?', 'Oui : celle-ci est une page web. Ouvrez-la dans Safari, Chrome, Firefox ou Edge sous macOS et déposez le fichier. Il n’y a rien à télécharger ni à installer.'],
        ['Fonctionne-t-elle dans Safari ?', 'Oui. Elle a besoin de WebGL et de WebAssembly, que les versions actuelles de Safari intègrent. Les captures de cette page ont été réalisées dans Chrome : essayez donc Chrome si un modèle s’affiche mal.'],
        ['L’IFC est-il téléversé quand je l’ouvre ?', 'Non. Le fichier est lu par du code qui s’exécute dans l’onglet du navigateur. Seules des statistiques d’utilisation anonymes (taille du fichier et nombre d’éléments) quittent le navigateur, et elles peuvent être désactivées.'],
        ['Puis-je ouvrir des fichiers Revit ou Archicad ?', 'Non, uniquement de l’IFC. Exportez d’abord un IFC depuis le logiciel de modélisation.'],
        ['Fonctionne-t-elle hors ligne sur un Mac ?', 'Non. La page doit se charger depuis internet à chaque fois, même si le modèle lui-même n’est jamais envoyé.'],
        ['Flinker est-il disponible pour Mac ?', 'La visionneuse de Flinker fonctionne dans le navigateur et peut donc s’utiliser ainsi sur un Mac ; son application de bureau est publiée pour Windows et son site ne mentionne pas macOS (flinker.app/products/ifc-viewer, consulté le 2026-11-10).'],
      ],
      faqSources: ['flinkerViewer'],
      bottom: ['Ouvrez un IFC sur votre Mac', 'Dans le navigateur, gratuitement, sans rien installer.'],
    },
  },
}
