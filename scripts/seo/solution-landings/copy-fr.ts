// French copy of the two solution pages. Source: copy-en.ts.
// Rules for translators: scripts/seo/solution-landings/TRANSLATING.md.
import type { LangCopy } from './types'

export const copy: LangCopy = {
  ui: {
    home: 'IFC Viewer Online',
    sources: 'Sources',
    readOn: 'consulté le',
    preview: 'Aperçu',
    faqLabel: 'FAQ',
    faqTitle: 'Les questions des acheteurs',
    related: 'À lire aussi',
    pricing: 'Offres et tarifs',
    postReception: 'Contrôler les modèles IFC des sous-traitants',
    postClash: 'Détection de conflits dans le navigateur',
    postBatch: 'Valider de nombreux fichiers IFC à la fois',
  },
  pages: {
    contractors: {
      title: 'Réception de modèles IFC pour entreprises et promoteurs',
      desc: 'Vos sous-traitants vérifient gratuitement leur IFC selon vos exigences avant l’envoi ; vous ne revoyez que ce qui passe. Offre Reception en aperçu.',
      nav: 'Pour les entreprises',
      kicker: 'Pour entreprises générales et promoteurs · Offre Reception · Aperçu',
      h1: ['Ne recevez que des modèles IFC déjà conformes', 'pour les entreprises générales et promoteurs qui reçoivent des modèles de sous-traitants'],
      lead: 'Publiez vos exigences sous la forme d’un seul lien. Chaque sous-traitant y vérifie son modèle gratuitement, dans le navigateur, et le corrige avant l’envoi. Vous voyez qui a livré, ce qui passe et pourquoi le reste est renvoyé, avec un rapport prêt pour le maître d’ouvrage.',
      cta: 'Parlez-nous',
      cta2: 'Comment fonctionne le contrôle',
      note: 'Aperçu : l’offre Reception est conçue et présentée ici avec des données d’exemple. Elle n’est pas encore en vente et rien n’est enregistré. Vérifier un modèle est gratuit et fonctionne dès aujourd’hui.',
      hero: {
        alt: 'Vue d’ensemble Reception d’un projet résidentiel avec des données d’exemple : actions du jour, heures et euros économisés estimés, et fournisseurs par jalon',
        cap: 'Le chantier d’un coup d’œil, avec des données d’exemple : ce qu’il faut contrôler aujourd’hui, les économies estimées avec leurs hypothèses et chaque fournisseur par jalon. Interface en espagnol.',
      },
      sections: [
        {
          kind: 'text', label: 'Le problème', h2: 'Les mauvais modèles sont découverts par celui qui les reçoit',
          ps: [
            'Selon l’ISO 19650-2, le contrôle et l’acceptation du modèle d’information relèvent de la partie désignante : l’entreprise ou le promoteur qui le reçoit. Le guide du UK BIM Framework décrit ce contrôle comme une étape du flux de travail de l’environnement de données commun.',
            'Skanska UK affirme que ses objectifs dépendent "critically" (de manière critique) d’informations de qualité venant de sa chaîne d’approvisionnement. Les BIM managers d’entreprises décrivent de grandes difficultés à faire descendre et remonter l’information dans la chaîne par e-mail et FTP.',
            'En pratique, un coordinateur ouvre chaque livraison, retrouve les mêmes propriétés manquantes et les mêmes noms erronés, rédige les motifs à la main et attend la version suivante. Le sous-traitant ne découvre les règles qu’après avoir été refusé.',
          ],
          sources: ['ukbimPartC', 'skanska', 'cmTier2'],
        },
        {
          kind: 'flow', label: 'Comment ça marche', h2: 'De vos exigences au rapport pour le maître d’ouvrage',
          sub: 'Toutes les captures ci-dessous montrent la conception de Reception avec des données d’exemple (projet "Mirador del Turia", dix fournisseurs). L’interface est en espagnol.',
          steps: [
            { h: 'Publiez vos exigences sous forme de lien', p: 'Règles, IDS et score minimal par statut ISO 19650. Les sous-traitants reçoivent la version approuvée ; un ancien lien continue de fonctionner.', alt: 'Bibliothèque de règles avec un changement de version, son effet sur le même modèle et un bouton pour créer le lien destiné aux sous-traitants', cap: 'Ce qui change entre deux versions de règles et le lien envoyé aux sous-traitants.' },
            { h: 'Les sous-traitants vérifient gratuitement avant l’envoi', p: 'Sans compte. Ils voient le score, ce qui échoue, les éléments concernés et le [guide de correction](fix) de chaque règle, si bien que la plupart des erreurs sont corrigées avant de vous parvenir.', alt: 'Page fournisseur sans compte affichant un score de 84, un nom de fichier erroné et la liste des corrections', cap: 'La page que voit un sous-traitant : ce qui passe, ce qui échoue et comment renommer le fichier.' },
            { h: 'Traitez une file, pas une boîte de réception', p: 'Les livraisons arrivent déjà vérifiées, avec le nom de fichier lu selon l’ISO 19650 et un avant-après par rapport à la version précédente. Des raccourcis clavier vous font avancer dans la file.', alt: 'Fenêtre de contrôle avec quatre versions d’une livraison, le nom de fichier ISO 19650 découpé en champs et le score des exigences', cap: 'Une livraison : ses versions, son nom de fichier champ par champ et ses exigences.' },
            { h: 'Renvoyez-la avec des motifs exploitables', p: 'Chaque motif renvoie aux éléments en 3D et à la façon de les corriger. Tout est journalisé avec un hachage chaîné et exporté en CSV.', alt: 'Décision de renvoyer une livraison avec les motifs en échec cochés et les éléments listés', cap: 'Renvoyer un modèle : les motifs, les éléments et une note pour le fournisseur.' },
            { h: 'Suivez les conflits entre disciplines dans le temps', p: 'Détection de conflits dans le navigateur, classés par coût estimé, avec la tendance entre les analyses.', alt: 'Panneau des conflits avec la tendance entre analyses et les conflits classés par coût estimé', cap: 'Les conflits avec leur tendance et leur coût estimé (hôtel d’exemple fédéré).' },
            { h: 'Informez le maître d’ouvrage sans rien rédiger', p: 'Une page projet avec le dernier score, les livraisons acceptées, les conflits résolus et le prochain jalon. L’envoi est simulé dans l’aperçu.', alt: 'Page projet pour le maître d’ouvrage avec le Health Score du modèle, les conflits résolus et le calendrier', cap: 'Ce que voit le maître d’ouvrage en ouvrant le lien de suivi.' },
            { h: 'Envoyez le rapport hebdomadaire à la direction de chantier', p: 'Reçu, conforme, manquant et le temps gagné estimé, rédigé pour être copié ou téléchargé.', alt: 'Rapport hebdomadaire des livraisons pour la direction de chantier avec un résumé par fournisseur', cap: 'Le rapport hebdomadaire, généré à partir des livraisons.' },
          ],
        },
        {
          kind: 'table', label: 'Économies estimées', h2: 'Environ 22 heures de coordinateur par mois, selon nos hypothèses',
          sub: 'Une estimation, pas une mesure. Remplacez les chiffres par les vôtres : la vue d’ensemble de Reception permet de modifier chaque hypothèse.',
          head: ['Tâche', 'Hypothèse', 'Part économisée (supposée)', 'Minutes par mois'],
          rows: [
            ['Contrôler les livraisons à la main', '40 livraisons × 25 min', '80 %', '800'],
            ['Préparer la réunion de synthèse', '4 réunions × 90 min', '70 %', '252'],
            ['Rédiger le rapport pour le maître d’ouvrage', '8 rapports × 45 min', '80 %', '288'],
            ['Total', '', '', '1 340 min ≈ 22 h'],
          ],
          after: [
            'À 45 € de l’heure, cela fait environ 1 000 € par mois. L’offre Reception est prévue à partir de 290 € par projet et par mois : selon ces hypothèses, elle rapporterait environ trois fois son coût. Les reprises et pénalités évitées ne sont pas comptées.',
          ],
        },
        {
          kind: 'table', label: 'Comparaison', h2: 'À côté d’un environnement de données commun',
          sub: 'Chaque colonne d’éditeur ne reprend que ce que la page de cet éditeur indiquait le jour où nous l’avons lue. Quand une page ne dit rien, la cellule le précise.',
          head: ['', 'Catenda Hub', 'Dalux Box', 'Autodesk Construction Cloud', 'IFC Viewer Online Reception (aperçu)'],
          rows: [
            ['Prix publié', 'Par projet, selon le montant des travaux : environ 400 € par mois pour un projet de 10 M€, environ 1 100 € pour 50 M€ ; devis sur demande', 'Aucun sur la page produit ; formulaire de contact', 'Aucun ; devis par bundle, avec une tarification par utilisateur, par projet et par compte', 'Prévu : à partir de 290 € par projet et par mois avec 15 fournisseurs, ou 790 € en illimité. Pas encore en vente'],
            ['Licence requise pour les fournisseurs', 'Non : "Your subs don\'t need a licence to log a defect" (vos sous-traitants n’ont pas besoin de licence pour signaler un défaut)', 'Non indiqué sur la page', 'Non indiqué sur la page', 'Sans compte : ils vérifient gratuitement dans le navigateur'],
            ['Vérification des modèles selon les exigences', 'Non indiqué sur la page tarifs', 'Oui : valider les données et la géométrie du modèle selon les exigences du projet', 'Le bundle Model Management mentionne la préparation des modèles, la coordination et la détection de conflits', 'Règles et IDS 1.0 avec un score par livraison. La vérification est gratuite aujourd’hui ; la boîte de réception est en aperçu'],
            ['Approbation des modèles reçus', 'Non indiqué sur la page tarifs', 'Circuits d’approbation et convention de nommage des fichiers imposable', 'Non indiqué sur la page tarifs', 'Accepter ou renvoyer avec motifs et éléments 3D (aperçu)'],
          ],
          after: [
            'Cela ne remplace pas votre CDE. Cela se place avant : quel que soit votre CDE, le modèle arrive déjà vérifié selon vos exigences, et le fournisseur les connaissait avant l’envoi.',
          ],
          sources: ['catenda', 'dalux', 'acc'],
        },
        {
          kind: 'cols', label: 'Gratuit et aperçu', h2: 'Ce qui fonctionne aujourd’hui et ce qui est en aperçu',
          cols: [
            { h: 'Gratuit, disponible aujourd’hui', items: ['Ouvrir et vérifier n’importe quel IFC dans le navigateur, sans rien téléverser', 'Vos fichiers IDS 1.0 et 44 règles avec un Health Score', 'Import et export BCF, comparaison de versions', 'Les [guides de correction](fix) de chaque règle'] },
            { h: 'Offre Reception, en aperçu', items: ['Lien d’exigences avec versions par statut ISO 19650', 'File de livraisons avec acceptation ou renvoi motivé', 'Fiche fournisseur et journal avec hachage chaîné', 'Page maître d’ouvrage et rapport hebdomadaire'] },
          ],
        },
      ],
      faq: [
        ['Puis-je utiliser Reception aujourd’hui ?', 'Pas encore. L’offre est conçue et présentée avec des données d’exemple. Si vous recevez des modèles de sous-traitants, [parlez-nous](pricing) : nous cherchons quelques projets pilotes. Vérifier un modèle selon vos exigences est gratuit et fonctionne aujourd’hui dans le [visualiseur](viewer).'],
        ['Les sous-traitants paient-ils ou ont-ils besoin d’un compte ?', 'Non. Ils ouvrent votre lien et vérifient leur modèle gratuitement dans le navigateur. C’est celui qui reçoit et gère les livraisons qui paie.'],
        ['Est-ce que cela remplace Catenda, Dalux ou Autodesk Construction Cloud ?', 'Non. Cela vérifie le modèle avant qu’il n’atteigne votre CDE et fonctionne quel que soit le CDE utilisé. Chaque CDE a son propre flux ; voir la comparaison ci-dessus avec la date à laquelle nous avons lu leurs pages.'],
        ['Le modèle est-il téléversé pour être vérifié ?', 'Pour la vérification gratuite, non : elle s’exécute dans le navigateur du sous-traitant. Dans Reception, la livraison que vous acceptez est stockée pour vous dans l’UE.'],
        ['Combien cela coûtera-t-il ?', 'C’est prévu à partir de 290 € par projet et par mois avec 15 fournisseurs, ou 790 € pour des projets illimités. Les prix peuvent changer avant le lancement ; voir les [offres](pricing).'],
        ['D’où vient le chiffre d’économies ?', 'Des hypothèses du tableau ci-dessus : nombre de livraisons, minutes par tâche et part économisée par tâche. Ce sont des hypothèses, pas des mesures, et vous pouvez les modifier dans la vue d’ensemble.'],
      ],
      faqSources: ['catenda', 'dalux', 'acc'],
      bottom: ['Vous recevez des modèles de sous-traitants ?', 'Dites-nous combien de projets et de fournisseurs vous avez. Nous sélectionnons quelques projets pilotes pour Reception.'],
    },
    engineering: {
      title: 'Coordination BIM pour bureaux d’études — offre Team',
      desc: 'Des modèles acceptés du premier coup : règles partagées, conflits, tickets avec correction suggérée, contrôle avant publication. Offre Team en aperçu.',
      nav: 'Pour les bureaux d’études',
      kicker: 'Pour bureaux d’études et agences de conception · Offre Team · Aperçu',
      h1: ['Livrez des modèles que le client accepte du premier coup', 'pour les bureaux d’études et agences qui coordonnent plusieurs disciplines'],
      lead: 'Un seul jeu de règles pour l’entreprise, la détection de conflits dans le navigateur, des tickets avec la vue caméra et une correction suggérée, et un verrou qui empêche de publier un modèle sous votre score minimal. Le client voit l’avancement sans que vous ayez à l’écrire.',
      cta: 'Rejoindre la liste d’attente Team',
      cta2: 'La détection de conflits dans le navigateur',
      note: 'Aperçu : l’offre Team est conçue et présentée ici avec des données d’exemple. Elle n’est pas encore en vente et rien n’est enregistré. Vérifier un modèle avec votre IDS est gratuit et fonctionne dès aujourd’hui.',
      hero: {
        alt: 'Tableau de bord Team avec des données d’exemple : Health Score par projet et sa tendance, tickets ouverts par personne et échéances menacées',
        cap: 'Le tableau de bord de l’équipe, avec des données d’exemple : santé de chaque projet, charge par personne et échéances menacées. Interface en espagnol.',
      },
      sections: [
        {
          kind: 'text', label: 'Le problème', h2: 'Les refus viennent de détails que personne n’a vérifiés',
          ps: [
            'Les clients envoient désormais leurs propres exigences d’information, souvent en IDS. Une livraison où manque un nom de propriété ou une classification est renvoyée, et la correction coûte plus cher que la vérification.',
            'Un consultant BIM décrit un problème de validation de données IFC qui a coûté des semaines, dû à des noms de propriétés qui ne correspondaient pas à ce qui était demandé. L’ISO 19650-2 fait de la vérification avant partage une étape de l’équipe de réalisation, pas du client.',
            'Dans un bureau, les règles vivent dans la tête ou le tableur d’une seule personne, les conflits sont passés en revue en réunion et les tickets finissent dans des fils d’e-mails, sans la vue qui les explique.',
          ],
          sources: ['bimCorner', 'ukbimPartC'],
        },
        {
          kind: 'flow', label: 'Comment ça marche', h2: 'Des règles de l’entreprise au modèle publié',
          sub: 'Toutes les captures ci-dessous montrent la conception de Team avec des données d’exemple. L’interface est en espagnol.',
          steps: [
            { h: 'Écrivez les règles une fois, sous forme de phrases', p: 'Classe, condition, exigence et gravité, y compris la géométrie (dégagement devant les portes, hauteur libre) et les relations (porte dans un mur). Chaque règle est en IDS 1.0.', alt: 'Éditeur de règles avec des règles de géométrie et de relation, les résultats sur le modèle d’exemple et un ticket créé avec sa correction', cap: 'Règles de géométrie et de relation vérifiées sur un modèle d’exemple.' },
            { h: 'Gérez-les à l’échelle de l’entreprise', p: 'Une bibliothèque partagée avec versions, auteur, relecture et approbation (l’auteur n’approuve pas sa propre règle), commentaires et export en IDS.', alt: 'Bibliothèque de règles de l’entreprise avec une version en relecture, les changements de v2 à v3 et des commentaires', cap: 'Un jeu de règles en relecture : ce qui a changé, qui l’approuve et l’historique.' },
            { h: 'Détectez les conflits dans le navigateur', p: 'Conflits physiques et de dégagement entre disciplines, regroupés, avec des règles pour ignorer ce qui est accepté et un coût estimé pour chacun.', alt: 'Panneau des conflits sur un modèle de tour avec des règles d’exclusion masquant les conflits acceptés', cap: 'Règles d’exclusion sur un modèle de tour : 1 569 résultats sur 4 827 masqués.' },
            { h: 'Faites de chaque échec un ticket avec sa correction', p: 'Assigné, avec une échéance, la caméra enregistrée et une correction suggérée par logiciel auteur, tirée de nos guides de correction. Les invités commentent gratuitement ; BCF en entrée et en sortie.', alt: 'Ticket avec une correction suggérée pour plusieurs logiciels auteurs, responsable, échéance et commentaires', cap: 'Un ticket avec sa correction suggérée, son responsable et son échéance.' },
            { h: 'Bloquez un modèle insuffisant avant sa publication', p: 'Rien n’atteint le statut Publié sous votre score minimal, avec un relecteur optionnel et un historique de ce qui est passé et pourquoi.', alt: 'Contrôle avant publication avec un score minimal de 80 et l’historique des modèles publiés et retenus', cap: 'Le contrôle avant publication et son historique.' },
            { h: 'Tenez le client informé', p: 'Des points d’avancement par phase construits à partir des données en direct : score, livraisons, tickets et jalons. L’envoi est simulé dans l’aperçu.', alt: 'Écran de point d’avancement client avec le choix d’une phase, d’un modèle et des destinataires', cap: 'Un point d’avancement client par phase du projet.' },
          ],
        },
        {
          kind: 'table', label: 'Économies estimées', h2: 'Environ 17 heures par mois, selon nos hypothèses',
          sub: 'Une estimation pour une équipe de trois, pas une mesure. Remplacez les chiffres par les vôtres.',
          head: ['Tâche', 'Hypothèse', 'Part économisée (supposée)', 'Minutes par mois'],
          rows: [
            ['Vérifier les livraisons avant l’envoi', '12 livraisons × 60 min', '60 %', '432'],
            ['Préparer la réunion de synthèse', '4 réunions × 90 min', '70 %', '252'],
            ['Reprendre les livraisons renvoyées', '3 renvois × 120 min', '50 %', '180'],
            ['Rédiger les points d’avancement client', '8 points × 30 min', '70 %', '168'],
            ['Total', '', '', '1 032 min ≈ 17 h'],
          ],
          after: [
            'À 45 € de l’heure, cela fait environ 775 € par mois. Team est prévu à 59 € par éditeur et par mois en facturation annuelle, trois éditeurs minimum (177 € par mois) : selon ces hypothèses, l’offre rapporterait environ quatre fois son coût.',
          ],
        },
        {
          kind: 'table', label: 'Comparaison', h2: 'À côté des outils de coordination habituels',
          sub: 'Chaque colonne d’éditeur ne reprend que ce que la page de cet éditeur indiquait le jour où nous l’avons lue.',
          head: ['', 'BIMcollab', 'Solibri', 'IFC Viewer Online Team (aperçu)'],
          rows: [
            ['Prix publié', 'Basic 12,50 €, Advanced 18,75 €, Enterprise 25 € par utilisateur et par mois en facturation annuelle', 'Par licence et par an : Essential 1 428 €, Advanced 2 109 €, Premium 2 772 €', 'Prévu : 59 € par éditeur et par mois en facturation annuelle, trois éditeurs minimum. Pas encore en vente'],
            ['Tickets', 'Gestion des tickets basée sur BCF avec des plug-ins pour les outils BIM', 'Gestion des tickets BCF dès Essential', 'Tickets avec caméra, échéance et correction suggérée ; BCF en entrée et en sortie (aperçu)'],
            ['Règles', 'Règles de conflits et smart views partagées pour BIMcollab Zoom', 'Règles prédéfinies dès Essential ; règles personnalisées dès Advanced ; gouvernance des règles en Premium', 'Règles sous forme de phrases, IDS 1.0, bibliothèque partagée avec approbation (aperçu)'],
            ['Invités', 'Un ou deux comptes invités par utilisateur payant, selon l’offre', 'Non indiqué sur la page tarifs', 'Les invités commentent gratuitement'],
          ],
          after: [
            'Solibri est le meilleur choix pour une vérification approfondie par règles sur poste de travail, et BIMcollab pour un vaste flux de tickets entre outils. Team s’adresse aux bureaux qui veulent les règles, les conflits, les tickets et le point client au même endroit, dans le navigateur.',
          ],
          sources: ['bimcollab', 'solibri'],
        },
        {
          kind: 'cols', label: 'Gratuit et aperçu', h2: 'Ce qui fonctionne aujourd’hui et ce qui est en aperçu',
          cols: [
            { h: 'Gratuit, disponible aujourd’hui', items: ['Ouvrir et fédérer plusieurs fichiers IFC dans le navigateur', 'Vérifier chaque modèle avec votre IDS 1.0 et 44 règles', 'Import et export BCF, comparaison de versions', 'Les [guides de correction](fix) de chaque règle'] },
            { h: 'Offre Team, en aperçu', items: ['Bibliothèque de règles de l’entreprise avec approbation', 'Détection de conflits entre disciplines', 'Tickets partagés avec correction suggérée, contrôle avant publication', 'Points d’avancement client par phase'] },
          ],
        },
      ],
      faq: [
        ['Puis-je utiliser Team aujourd’hui ?', 'Pas encore. L’offre est conçue et présentée avec des données d’exemple. [Rejoignez la liste d’attente](pricing) pour être prévenu de son ouverture. Vérifier un modèle avec votre IDS est gratuit et fonctionne aujourd’hui dans le [visualiseur](viewer).'],
        ['La détection de conflits est-elle gratuite ?', 'Non. La détection de conflits entre disciplines est un nouvel outil et sera payante. Ouvrir, fédérer et vérifier chaque modèle reste gratuit. Plus de détails dans l’article sur la [détection de conflits dans le navigateur](postClash).'],
        ['Pouvons-nous utiliser l’IDS de notre client ?', 'Oui, et cette partie est gratuite dès aujourd’hui. Dans Team, vous pouvez aussi importer un IDS dans la bibliothèque de l’entreprise et en conserver les versions.'],
        ['Est-ce que cela remplace BIMcollab ou Solibri ?', 'Pas pour toutes les équipes. Voir la comparaison ci-dessus, avec les prix de leurs pages et la date à laquelle nous les avons lues.'],
        ['Combien cela coûtera-t-il ?', 'C’est prévu à 59 € par éditeur et par mois en facturation annuelle, trois éditeurs minimum ; les invités sont gratuits. Les prix peuvent changer avant le lancement ; voir les [offres](pricing).'],
        ['Pouvons-nous vérifier tout un dossier de modèles ?', 'Cela fait aussi partie de l’aperçu payant : découvrez comment fonctionne la [validation par lots](postBatch).'],
      ],
      faqSources: ['bimcollab', 'solibri'],
      bottom: ['Vous coordonnez plusieurs disciplines ?', 'Rejoignez la liste d’attente Team et dites-nous combien d’éditeurs vous avez. Nous vous écrirons à l’ouverture.'],
    },
  },
}
