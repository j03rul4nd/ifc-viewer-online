import type { HelpCopy } from './types'

export const fr: HelpCopy = {
  ui: {
    hub: 'Aide : recevoir des livraisons IFC',
    hubIntro: 'Guides courts pour l’espace de travail payant : configurer un projet, préparer les fournisseurs, lire un verdict, connecter vos outils et la conservation de vos données.',
    preview: 'Aperçu : ces fonctions ne sont pas encore ouvertes à l’inscription. Les guides décrivent leur fonctionnement actuel.',
    all: 'Tous les guides',
    home: 'IFC Viewer Online',
    pricing: 'Offres',
  },
  topics: {
    setup: {
      title: 'Configurer un projet',
      desc: 'D’un espace de travail vide à la première livraison contrôlée, en cinq étapes.',
      sections: [
        ['1. Créer le projet', 'Un projet correspond à un chantier ou à un contrat. Donnez-lui un nom, un code court (2 à 6 lettres majuscules, placé au début de chaque nom de fichier) et le score minimum qu’une livraison doit atteindre. Tout reste modifiable plus tard.'],
        ['2. Définir les exigences', 'Choisissez un modèle (un profil EIR) ou importez votre propre IDS. Les fournisseurs sont contrôlés selon celui-ci avant l’envoi, puis à nouveau sur le serveur à l’arrivée du fichier.'],
        ['3. Inviter les fournisseurs', 'Chaque fournisseur reçoit son propre lien de dépôt ; aucun compte n’est nécessaire. Le lien n’est affiché qu’une fois : copiez le message prêt à l’emploi et envoyez-le depuis votre propre messagerie.'],
        ['4. Connecter un dossier ou un webhook', 'Les livraisons peuvent aussi arriver d’un dossier SharePoint ou Drive surveillé, et chaque verdict peut être envoyé à vos outils par webhook. Les deux sont facultatifs.'],
        ['5. Envoyer une livraison de test', 'La liste de démarrage fait passer un petit IFC public par les mêmes contrôles que le fichier d’un fournisseur, pour que vous voyiez un verdict dans la boîte de réception avant toute livraison.'],
      ],
    },
    suppliers: {
      title: 'Préparer vos fournisseurs',
      desc: 'Ce que voit un fournisseur, ce qu’il doit respecter et ce que signifie chaque erreur.',
      sections: [
        ['Leur lien', 'Le lien ouvre une page avec les exigences du projet, la règle de nommage des fichiers et la prochaine échéance. Toute personne disposant du lien peut livrer au nom de ce fournisseur : il ne doit donc pas être partagé. En cas de fuite, créez-en un nouveau depuis la fiche du fournisseur : l’ancien cesse aussitôt de fonctionner.'],
        ['Le contrôle gratuit', 'Quand un fournisseur choisit un fichier, celui-ci est contrôlé dans son propre navigateur : s’il s’agit d’un IFC complet, la règle de nommage et le score. Il voit ce qu’il faut corriger, avec un guide gratuit pour chaque règle, avant tout envoi.'],
        ['Le nom du fichier', 'Les noms suivent ISO 19650 : code du projet, code propre au fournisseur, volume, niveau, type, rôle, numéro, statut (S0 à S4) et révision, par exemple `TNO-ESTRUC-ZZ-02-M3-S-0001-S2-P01.ifc`. Un nom qui ne respecte pas la règle est aussi refusé par le serveur.'],
        ['En cas d’échec', 'Trop volumineux : exportez sans les éléments inutilisés ou divisez la maquette. Pas un IFC : exportez à nouveau en IFC, un fichier natif renommé ne fonctionne pas. Endommagé : le fichier a été tronqué pendant l’export ou le téléchargement, exportez-le à nouveau. Trop de tentatives : attendez une minute ; rien n’est perdu.'],
      ],
    },
    verdict: {
      title: 'Lire un verdict',
      desc: 'L’état du fichier, le verdict automatique et votre revue sont trois choses distinctes.',
      sections: [
        ['Le fichier', 'Chaque livraison reçoit d’abord un état de fichier : ok, endommagé (tronqué ou non fermé, jamais noté), pas un IFC, ou pas le fichier déclaré (son SHA-256 diffère).'],
        ['Le verdict automatique', 'Un fichier qui s’ouvre est noté de 0 à 100 selon vos exigences. Au niveau du minimum du projet ou au-dessus, il est accepté automatiquement ; en dessous, il est rejeté avec le motif. Ce verdict est celui du serveur, et il est conservé.'],
        ['Votre revue', 'Une personne peut accepter ou renvoyer toute livraison avec un motif, et cette décision est scellée dans le registre avec l’empreinte du fichier. Une livraison ne peut pas être acceptée avant d’avoir été validée ; la renvoyer plus tôt reste possible.'],
        ['Le registre', 'Chaque réception et chaque décision sont conservées dans l’ordre, avec leur auteur et leur date. Exportez-le à tout moment depuis l’onglet du projet, en ZIP (JSON et CSV) ou en JSON.'],
      ],
    },
    api: {
      title: 'API et webhooks',
      desc: 'Livraisons, verdicts et événements pour vos propres outils.',
      sections: [
        ['Livraisons', 'La liste des livraisons renvoie, pour chacune, l’état du fichier, le verdict automatique (`auto`) et la revue d’une personne (`review`) dans des champs séparés. `verdict` reste la valeur effective pour les intégrations plus anciennes. Le contrat complet est décrit en OpenAPI.'],
        ['Webhooks', 'Choisissez les événements (reçue, validée, acceptée, renvoyée) et une adresse https. Chaque appel est signé avec HMAC-SHA256 sur l’horodatage et le corps ; le secret n’est affiché qu’une fois. Les adresses de réseaux privés sont refusées.'],
        ['Dossiers surveillés', 'Un dossier SharePoint ou Drive peut livrer au nom d’un fournisseur. Plusieurs fichiers sont traités en même temps, et le rapport est écrit à côté de chaque maquette. Un fichier en échec à cause du réseau est retenté au contrôle suivant.'],
        ['Limites', 'Les pages publiques autorisent 60 requêtes par minute et par adresse, et l’API authentifiée 600 par minute et par utilisateur. Au-delà, la réponse est un 429 avec `Retry-After: 60`.'],
      ],
    },
    security: {
      title: 'Sécurité et vos données',
      desc: 'Comment les données de chaque entreprise sont cloisonnées, et comment tout récupérer.',
      sections: [
        ['Chaque entreprise à part', 'Chaque requête est filtrée par entreprise, et la base de données l’impose aussi elle-même (sécurité au niveau des lignes) : une entreprise ne lit ni ne modifie jamais les données d’une autre, même en demandant un identifiant connu.'],
        ['Rôles', 'Les propriétaires et administrateurs gèrent les personnes, les liens des fournisseurs, les webhooks et la suppression des projets. Les éditeurs examinent les livraisons, les relecteurs commentent et les lecteurs consultent. Un fournisseur ne voit jamais que ses propres livraisons.'],
        ['Journal d’audit', 'L’invitation ou la révocation d’un fournisseur, les décisions, les liens clients, les webhooks, les automatisations, les rôles, le logo, les exports et les suppressions laissent chacun une ligne indiquant qui et quand.'],
        ['Tout récupérer', 'Depuis l’onglet du projet, exportez tout (livraisons avec les deux verdicts, le registre et les problèmes) ou supprimez le projet. La suppression exige de saisir le nom du projet, efface aussi les fichiers et ne laisse qu’une ligne dans le journal d’audit.'],
      ],
    },
  },
}
