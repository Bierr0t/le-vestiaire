# Le Vestiaire — Specs produit

Version 1.0 du 12 novembre 2026. Périmètre : V2 complète, livrée en une fois.

## 1. Vision

Le Vestiaire est le tableau d'affichage d'un groupe de potes qui jouent aux échecs sur chess.com. On l'ouvre depuis le groupe de discussion, on sait en cinq secondes qui est devant, et on repart avec de quoi chambrer.

**Pour qui.** Bi3rmat, Colabyl, fabosinho, titoumidway et les suivants. Entre 4 et 12 joueurs, tous sur téléphone, tous arrivés par un lien partagé.

**Le travail du produit.** Répondre à trois questions, dans cet ordre :

1. Qui est devant, là, maintenant ?
2. Qu'est-ce qui a bougé depuis ma dernière visite ?
3. Qu'est-ce que je peux envoyer au groupe pour énerver quelqu'un ?

**Principes.**

- Le classement d'abord. Tout le reste est à un tap.
- Chaque chiffre est une munition. Une statistique qui ne sert ni à se vanter ni à chambrer n'a pas sa place.
- Zéro compte, zéro réglage. Le lien suffit.
- On chambre les résultats, jamais les personnes. Les vannes portent sur le jeu (une série, un drapeau tombé, une absence), pas sur le joueur.

## 2. Périmètre

**Livré.**

- Classement par cadence (rapide par défaut, blitz, bullet).
- Duels : matrice des confrontations et fiche duel.
- Panthéon : records du groupe et courbes d'Elo comparées.
- Album : fiche de chaque joueur et trophées à collectionner.
- Fil d'actu, badges, titres hebdomadaires.
- Récap de la semaine, partageable en image.
- Notifications dans le canal du groupe.
- Installation sur l'écran d'accueil (PWA).

**Non livré.**

- Parties quotidiennes (par correspondance), variantes (960, etc.), problèmes.
- Analyse de parties ou de coups.
- Comptes, commentaires, paris entre joueurs.
- Plusieurs groupes sur la même instance.

## 3. Architecture et données

### 3.1 Vue d'ensemble

Le projet d'origine prévoyait une app 100 % navigateur. La V2 demande des notifications et un historique complet dès la première visite ; il faut donc un traitement planifié. L'architecture retenue reste sans serveur à maintenir.

```
  chess.com (API publique)
        │
        ├──► Collecteur (tâche planifiée, toutes les 30 min)
        │       • télécharge les nouvelles parties
        │       • recalcule toutes les statistiques
        │       • détecte les événements
        │       • publie instantane.json
        │       • envoie les notifications
        │
        └──► App web (dans le navigateur)
                • lit instantane.json (affichage immédiat)
                • rafraîchit l'Elo et le mois en cours en direct
```

| Brique | Choix | Raison |
|---|---|---|
| App web | React, Vite, TypeScript, CSS natif avec variables | Statique, déployable partout |
| Collecteur | Script Node (TypeScript) lancé par GitHub Actions | Gratuit, pas de serveur |
| Hébergement | GitHub Pages | Gratuit, lien public stable |
| Calculs | Un seul module partagé entre collecteur et app | Une seule définition de chaque statistique |
| Graphiques | SVG écrit à la main, sans bibliothèque | Contrôle total du rendu, poids minimal |
| Image du récap | Dessin sur canvas, puis partage natif du téléphone | Envoi direct dans WhatsApp, aucune dépendance |
| Tests | Vitest sur le module de calcul, avec jeux de parties figés | Les règles de calcul sont le cœur du produit |

**Conséquence sur la gestion du groupe.** La liste des joueurs vit dans un fichier `groupe.json` du dépôt, et non dans l'URL comme annoncé dans la proposition. Ajouter un pote revient à ajouter une ligne ; il apparaît au passage suivant du collecteur. C'est le prix du lien unique et des notifications. Voir la décision D2.

### 3.2 API chess.com

Vérifié le 12/11/2026 : les quatre comptes répondent, sans clé, avec `access-control-allow-origin: *`.

| Point d'accès | Usage |
|---|---|
| `/pub/player/{pseudo}` | Avatar, nom, pays, dernière connexion |
| `/pub/player/{pseudo}/stats` | Elo actuel, record et date, bilan V/N/D par cadence |
| `/pub/player/{pseudo}/games/archives` | Liste des mois disponibles |
| `/pub/player/{pseudo}/games/{AAAA}/{MM}` | Toutes les parties du mois |

Règles d'usage :

- Requêtes en série, jamais en parallèle (l'API renvoie 429 sinon).
- En cas de 429 : attendre, puis réessayer avec un délai doublé, trois fois au maximum.
- Le collecteur envoie `If-None-Match` avec l'ETag mémorisé pour ne pas retélécharger un mois inchangé.
- Un mois terminé n'est téléchargé qu'une fois.

### 3.3 Volume

| Joueur | Mois d'archives | Parties (rapide + blitz + bullet) |
|---|---|---|
| Colabyl | 80 | environ 12 700 |
| fabosinho | 71 | environ 5 150 |
| Bi3rmat | 17 | environ 1 800 |
| titoumidway | 12 | environ 590 |

Le premier passage du collecteur télécharge 180 mois (quelques minutes). Les suivants ne touchent que le mois en cours.

### 3.4 Modèle de données

Partie compactée, stockée par le collecteur (le PGN complet n'est pas conservé) :

```ts
type Partie = {
  id: string;            // URL chess.com de la partie
  fin: number;           // horodatage de fin (secondes)
  cadence: 'rapide' | 'blitz' | 'bullet';
  classee: boolean;
  blancs: { pseudo: string; elo: number };
  noirs:  { pseudo: string; elo: number };
  resultat: 'blancs' | 'noirs' | 'nulle';
  issue: 'mat' | 'abandon' | 'temps' | 'pat' | 'repetition' | 'accord'
       | 'materiel' | '50coups' | 'deconnexion';
  ouverture?: string;    // nom lisible, tiré du champ eco
  coups?: number;
};
```

`instantane.json`, lu par l'app :

```ts
type Instantane = {
  genereLe: number;
  joueurs: Joueur[];                  // profil, Elo, records, forme, badges, titre
  classements: Record<Cadence, LigneClassement[]>;
  duels: Duel[];                      // une entrée par paire de joueurs
  pantheon: Record<Cadence, RecordGroupe[]>;
  courbes: Record<Cadence, Record<string, PointElo[]>>;  // un point par jour joué
  actu: Evenement[];                  // 100 derniers
  trophees: Record<string, TropheeObtenu[]>;
  recap: RecapSemaine;
};
```

Stockage : les parties compactées et l'instantané sont poussés sur une branche `donnees` du dépôt. Seul l'instantané est servi à l'app (objectif : moins de 300 Ko compressé).

### 3.5 Fraîcheur

- À l'ouverture, l'app affiche l'instantané immédiatement.
- Elle interroge ensuite `/stats` pour chaque joueur, puis met à jour l'écran. L'Elo, le record et le bilan sont donc à jour à quelques secondes près ; la forme, les séries et les duels suivent le collecteur (30 minutes au plus).
- Le bouton d'actualisation de l'en-tête relance cette mise à jour.
- L'heure de la dernière mise à jour est toujours visible.

## 4. Règles de calcul

Sauf mention contraire, une statistique porte sur une cadence et sur les parties classées de variante standard.

### 4.1 Classement

| Donnée | Règle |
|---|---|
| Elo actuel | `stats.chess_{cadence}.last.rating` |
| Rang | Tri par Elo décroissant. Égalité : même rang, ordre par record personnel |
| Écart | Elo du joueur précédent moins Elo du joueur |
| Variation 7 jours | Elo actuel moins Elo à l'issue de la dernière partie jouée il y a plus de 7 jours |
| Forme | Résultat des 5 dernières parties, la plus récente à droite |
| Série en cours | Nombre de victoires (ou de défaites) consécutives. Une nulle remet à zéro |
| Record personnel | `best.rating` et `best.date` |
| Non classé | Aucune statistique dans la cadence. Listé sous le classement, sans rang |
| Inactif | Aucune partie dans la cadence depuis 14 jours. Garde son rang |

### 4.2 Duels

Un duel est l'ensemble des parties entre deux membres du groupe.

- Par défaut, toutes cadences confondues et parties amicales incluses : entre potes, les parties sont rares et souvent non classées. Un filtre permet de restreindre à une cadence.
- Bilan : victoires, nulles, défaites de chacun.
- Meneur : celui qui a le plus de victoires. À égalité : « match nul, tout reste à faire ».
- Série en cours : victoires consécutives du même joueur dans le duel.
- Bête noire d'un joueur : l'adversaire du groupe contre qui son pourcentage de points est le plus bas, avec 5 parties au minimum.
- Victime préférée : l'inverse.
- Paire sans aucune partie : « jamais affrontés », avec un bouton qui ouvre un défi sur chess.com.

### 4.3 Records du groupe

| Record | Règle |
|---|---|
| Record absolu | Plus haut `best.rating` du groupe dans la cadence |
| Plus longue série de victoires | Sur tout l'historique |
| Plus longue série de défaites | Sur tout l'historique |
| Plus gros gain en un jour | Elo en fin de journée moins Elo en début de journée (jour civil, heure de Paris) |
| Plus grosse chute en un jour | Idem, en négatif |
| Plus grand nombre de parties en un jour | Jour civil, heure de Paris |
| Plus beau scalp | Victoire contre l'adversaire le mieux classé |
| Plus grosse perf | Victoire avec le plus grand écart d'Elo défavorable |
| Mat le plus rapide | Victoire par mat en le moins de coups |
| Plus longue partie | En nombre de coups |

Limite connue : l'API donne l'Elo après la partie, pas avant. Les écarts d'Elo d'une partie sont donc calculés à partir de l'Elo de sortie de la partie précédente du joueur.

### 4.4 Fiche joueur

- Elo, record et bilan V/N/D dans les trois cadences.
- Pourcentage de victoire avec les blancs et avec les noirs.
- Répartition des victoires et des défaites par issue (mat, abandon, temps).
- Trois ouvertures les plus jouées avec chaque couleur, et le pourcentage de points de chacune.
- Heure de la journée où le joueur gagne le plus et celle où il perd le plus (tranches de 3 heures, 20 parties au minimum par tranche).
- Dix dernières parties, avec lien vers chess.com.

## 5. Écrans

Navigation par une barre de quatre onglets en bas d'écran : Classement, Duels, Panthéon, Album. Le sélecteur de cadence est commun aux trois premiers et son choix est mémorisé sur l'appareil.

Les maquettes ci-dessous montrent la structure des écrans. Les Elo du podium sont réels (12/11/2026) ; les scores de duels, la forme et les variations sont inventés pour l'exemple.

### 5.1 Classement (accueil)

```
┌──────────────────────────────┐
│ Le Vestiaire          il y a 2 min │
│ [ Rapide ][ Blitz ][ Bullet ]│
│                              │
│ ► fabosinho repasse devant   │
│   Bi3rmat. Ça pique.      ›  │
│                              │
│        ┌────────┐            │
│  ┌─────┤   1    ├─────┐      │
│  │  2  │Colabyl │  3  │      │
│  │fabo │ 1573   │Bi3r │      │
│  │1571 │        │1559 │      │
│  └─────┴────────┴─────┘      │
│                              │
│ 4  titoumidway        706    │
│    V V D V N   +12 sur 7 j   │
│    record 750, le 14/10/26   │
│    à 853 pts de Bi3rmat      │
│                              │
│ Non classés en blitz : …     │
├──────────────────────────────┤
│ Classement Duels Panthéon Album │
└──────────────────────────────┘
```

- Le podium montre les trois premiers sous forme de vignettes. Les suivants sont en liste.
- Chaque vignette et chaque ligne ouvre la fiche du joueur.
- Le bandeau d'actu montre l'événement le plus récent. Un tap ouvre le fil complet.
- À l'ouverture, si l'ordre a changé depuis la dernière visite sur cet appareil, les vignettes partent de leur ancienne place et glissent vers la nouvelle. C'est le seul mouvement automatique de l'app.
- Avec moins de trois joueurs classés dans la cadence, le podium laisse place à une liste simple.

### 5.2 Duels

```
┌──────────────────────────────┐
│ Duels      [ Toutes cadences ▾ ] │
│                              │
│          Bi3r  Cola  fabo  tito │
│ Bi3rmat   —    4-2   1-3   5-0  │
│ Colabyl  2-4    —    3-3   2-0  │
│ fabosinho 3-1  3-3    —    —    │
│ titoumid. 0-5  0-2    —    —    │
│                              │
│ Le duel du moment            │
│ Colabyl 3 – 3 fabosinho      │
└──────────────────────────────┘
```

- La matrice se lit par ligne : victoires du joueur de la ligne, puis victoires du joueur de la colonne. Les nulles apparaissent dans la fiche.
- La case est teintée du côté du meneur.
- Au-delà de 6 joueurs, la matrice défile horizontalement et la première colonne reste fixe.
- Le duel du moment est la paire la plus serrée ayant joué dans les 30 derniers jours.
- Un tap sur une case ouvre la fiche duel : les deux vignettes face à face, le bilan, la série en cours, la dernière partie, la plus grosse perf de chacun, la liste des parties.

### 5.3 Panthéon

- En tête : le record absolu de la cadence, avec la vignette holographique de son détenteur, la date et le nombre de jours de règne.
- Dessous : la liste des records du groupe (section 4.3). Chaque record indique son détenteur, la valeur, la date et un lien vers la partie quand il y en a une.
- Courbes d'Elo comparées : une ligne par joueur, sélecteur 3 mois, 1 an, tout. Un tap sur la courbe affiche les Elo de tous les joueurs à cette date. Un tableau des chiffres est disponible sous le graphique.
- Les records peu flatteurs (plus longue série de défaites, plus grosse chute) sont regroupés sous « Le mur de la honte ».

### 5.4 Album

- Une grille de vignettes, une par joueur, avec son titre de la semaine.
- Un tap ouvre la fiche joueur (section 4.4), qui se termine par sa page de trophées : emplacements vides pour ceux qui restent à décrocher, vignettes collées pour les autres.
- Un trophée non obtenu affiche sa condition. Un trophée obtenu affiche la date et la partie.

### 5.5 Fil d'actu

Liste chronologique des événements, groupés par jour. Les événements survenus depuis la dernière visite sont marqués. Chaque événement a un bouton « Envoyer au groupe » qui ouvre le partage natif avec le texte et le lien.

### 5.6 Le groupe

Accessible depuis l'en-tête de l'Album : liste des joueurs suivis, date d'arrivée, et la marche à suivre pour ajouter quelqu'un (voir D2).

## 6. Gamification

### 6.1 Événements du fil d'actu

| Événement | Déclencheur | Exemple de texte |
|---|---|---|
| Dépassement | Changement d'ordre dans une cadence | « fabosinho repasse devant Bi3rmat en rapide. Ça pique. » |
| Nouveau leader | Changement du n° 1 | « Colabyl prend la tête. Profitez-en, ça ne dure jamais. » |
| Record personnel | `best.rating` augmente | « titoumidway bat son record : 762. Champagne tiède. » |
| Record absolu | Record du groupe battu | « Bi3rmat n'est plus recordman. fabosinho : 1781. » |
| Série chaude | 5 victoires de suite, puis 7, puis 10 | « Colabyl enchaîne 5 victoires. Quelqu'un l'arrête ? » |
| Série froide | 5 défaites de suite, puis 7, puis 10 | « Bi3rmat : 5 défaites de rang. Pose le téléphone. » |
| Duel | Partie entre deux membres | « Colabyl bat fabosinho. 4-3 dans le duel. » |
| Palier | Franchissement d'une centaine, vers le haut ou vers le bas | « fabosinho repasse sous les 1500. On ne dit rien. » |
| Retour | Partie après 14 jours d'absence | « Revoilà titoumidway, 23 jours plus tard. » |
| Trophée | Trophée décroché | « Bi3rmat décroche Le Braqueur. » |

Chaque type d'événement dispose de trois à cinq formulations, tirées au hasard, pour éviter la répétition.

### 6.2 Badges

Affichés sur la vignette et la ligne du joueur. Trois au maximum, par ordre de priorité.

| Badge | Condition |
|---|---|
| 👑 | Détient le record absolu de la cadence |
| 🔥 | Série de 3 victoires ou plus |
| 🥶 | Série de 3 défaites ou plus |
| 📈 | Meilleure progression du groupe sur 30 jours |
| 📉 | Pire évolution du groupe sur 30 jours |
| 💤 | Inactif depuis 14 jours |

### 6.3 Titres de la semaine

Un titre par joueur, recalculé chaque lundi sur les 7 jours écoulés, toutes cadences confondues. Un joueur éligible à plusieurs titres reçoit le premier de la liste ; un titre n'est attribué qu'une fois.

| Titre | Attribué à |
|---|---|
| Le Patron | Le n° 1 en rapide |
| Le Stakhanoviste | Celui qui a joué le plus de parties |
| L'Ascenseur | La plus grande amplitude d'Elo (maximum moins minimum) |
| Le Pendu | Le plus de défaites au temps |
| Le Tilté | La plus longue série de défaites |
| Le Fantôme | Aucune partie de la semaine |
| La Lanterne rouge | Le dernier en rapide |
| Le Figurant | Aucun des précédents |

### 6.4 Trophées

Acquis définitivement, calculés sur tout l'historique.

| Trophée | Condition |
|---|---|
| Le Centurion | 100 victoires dans une cadence |
| Le Millénaire | 1 000 parties jouées |
| L'Invincible | 10 victoires de suite |
| Le Braqueur | Victoire contre un adversaire à +200 Elo |
| Le Fossoyeur | Mat en moins de 10 coups |
| Le Marathonien | 30 parties en un jour |
| L'Insomniaque | Victoire entre 3 h et 5 h du matin |
| Le Maître du temps | 50 victoires au temps |
| Le Régicide | Victoire contre le n° 1 du groupe du moment |
| Le Grand Chelem | Victoire contre chaque autre membre du groupe |
| Le Phénix | Retour à son record après une chute de 150 points |
| Le Triple couronné | N° 1 du groupe dans les trois cadences en même temps |
| Le Recordman | A détenu le record absolu au moins un jour |

## 7. Récap de la semaine et notifications

### 7.1 Récap

Généré chaque lundi à 8 h pour la semaine écoulée. Consultable dans l'app et exportable en image verticale (1080 × 1920), envoyée par le partage natif du téléphone.

Contenu :

- le classement rapide, avec les montées et descentes de la semaine ;
- le joueur de la semaine (plus fort gain d'Elo) et le naufragé (plus forte perte) ;
- les duels joués et leur score ;
- les titres attribués ;
- la phrase de la semaine : l'événement le plus marquant.

Les récaps précédents restent consultables (12 dernières semaines).

### 7.2 Notifications

Le collecteur poste dans un canal de groupe les événements suivants : dépassement, nouveau leader, record absolu, série de 5 et plus, duel entre membres, récap du lundi. Les autres événements restent dans le fil d'actu.

- Un message par événement, avec le texte du fil et le lien vers l'app.
- Pas d'envoi entre 23 h et 8 h : les messages sont regroupés et envoyés à 8 h.
- Cinq messages par jour au maximum ; au-delà, un message de synthèse.

Le canal dépend de la messagerie du groupe (décision D1). WhatsApp n'offre pas d'envoi automatique simple dans un groupe ; les options réalistes sont un bot Telegram, un webhook Discord ou ntfy.

## 8. Design et UX

### 8.1 Parti pris : l'album de vignettes

Le monde du produit, ce sont des potes, un classement et de la mauvaise foi. La référence retenue est l'album d'autocollants de foot : chaque joueur est une vignette, les trophées sont des autocollants à coller sur sa page, et le détenteur du record absolu a la seule vignette brillante de l'album.

L'audace est concentrée sur un seul élément : la vignette. Tout le reste (listes, matrice, courbes) est plat, calme et lisible.

### 8.2 Couleurs

| Nom | Valeur | Rôle |
|---|---|---|
| Bleu album | `#1D3BA8` | Fond de l'app |
| Blanc vignette | `#FFFFFF` | Vignettes, surfaces de lecture |
| Encre | `#0E1433` | Texte sur fond blanc |
| Jaune maillot | `#FFD23F` | Leader, action principale, onglet actif |
| Vert | `#2FBF71` | Victoire, hausse |
| Rouge carton | `#E5383B` | Défaite, baisse |

Un seul thème : le bleu est l'identité du produit, il n'y a pas de mode sombre. Le reflet holographique (dégradé et reflet animé) est réservé à la vignette du recordman.

Victoire et défaite ne reposent jamais sur la couleur seule : la forme est notée V, N, D, et les variations portent un signe.

### 8.3 Typographie

| Police | Rôle |
|---|---|
| Big Shoulders Display, graisses 700 et 900 | Elo, rangs, pseudos sur les vignettes, titres d'écran. Les chiffres se lisent comme des numéros de maillot |
| Hanken Grotesk, graisses 400 et 600 | Tout le reste, avec chiffres tabulaires |

Échelle : 13, 15, 18, 24, 40, 72 px. Le 72 est réservé à l'Elo du leader. Les libellés sont en bas de casse ; pas de capitales espacées.

### 8.4 La vignette

- Bord blanc de 6 px, coins arrondis de 10 px, légère rotation (entre −2° et +2°, fixe par joueur).
- Avatar chess.com en fond, bandeau bas avec le pseudo et l'Elo.
- Coin supérieur : le rang. Coin opposé : les badges.
- Joueur sans avatar : ses initiales sur un aplat de couleur dérivé du pseudo.
- Joueur inactif : vignette désaturée.

### 8.5 Mouvement

| Moment | Comportement |
|---|---|
| Réordonnancement du classement | Les vignettes glissent vers leur nouvelle place, 400 ms. Une fois par visite |
| Appui sur un élément tactile | Réduction à 0,97, 120 ms |
| Changement de cadence | Les chiffres changent sans transition de page |
| Trophée décroché, vu pour la première fois | L'autocollant se pose sur son emplacement, 500 ms, léger rebond |
| Ouverture d'une fiche | Montée depuis le bas, 250 ms |

Avec `prefers-reduced-motion`, les déplacements sont remplacés par des fondus. Seuls `transform` et `opacity` sont animés.

### 8.6 Ton

- Tutoiement, phrases courtes, pas de point d'exclamation.
- La vanne suit le fait, jamais l'inverse : « Bi3rmat : 5 défaites de rang. Pose le téléphone. »
- Les boutons disent ce qu'ils font : « Envoyer au groupe », « Voir la partie », « Défier sur chess.com ».
- Les erreurs restent sérieuses : « chess.com ne répond pas. Les chiffres datent de 14 h 32. » suivi de « Réessayer ».
- Écran vide : « Jamais affrontés. Il serait temps. »

### 8.7 Socle mobile

- Conçu pour 360 px de large ; au-delà de 768 px, le contenu est centré dans une colonne de 560 px.
- Hauteur en `100dvh`, marges de sécurité (`env(safe-area-inset-*)`) sur l'en-tête et la barre d'onglets.
- Zones tactiles de 44 px au minimum, `touch-action: manipulation`, pas de surbrillance au tap.
- Styles de survol réservés aux appareils à pointeur fin.
- `overscroll-behavior: none` sur la page.
- `theme-color` égal au bleu album.
- Contraste AA sur tous les textes, focus clavier visible.
- Validation sur un vrai téléphone (iOS et Android) avant livraison.

## 9. Cas limites et performance

| Cas | Comportement |
|---|---|
| Pseudo introuvable ou compte fermé | Signalé sur l'écran Le groupe ; le joueur est retiré des classements, son historique est conservé |
| Joueur sans partie dans une cadence | Listé comme non classé |
| chess.com indisponible | L'app affiche l'instantané et son heure |
| Collecteur en échec | L'instantané précédent reste en ligne ; au-delà de 3 heures, un avertissement s'affiche dans l'app |
| Changement de pseudo | À répercuter à la main dans `groupe.json` |
| Compte sanctionné pour triche par chess.com | Vignette marquée, joueur exclu des records |
| Égalité d'Elo | Même rang |
| Parties abandonnées avant le 2e coup | Comptées dans le bilan, exclues du mat le plus rapide |
| Nouveau joueur ajouté | Ses trophées historiques sont attribués sans générer d'événement ni de notification |

Objectifs de performance, sur un téléphone de milieu de gamme en 4G :

- classement affiché en moins d'une seconde ;
- Elo rafraîchi en direct en moins de trois secondes ;
- poids total de l'app inférieur à 200 Ko compressé, hors polices et instantané.

## 10. Plan de livraison

Tout part en ligne en une fois ; les lots ordonnent la construction.

| Lot | Contenu | Terminé quand |
|---|---|---|
| 1. Socle de données | Collecteur, module de calcul, instantané | Les chiffres de l'instantané égalent ceux de chess.com pour les quatre joueurs, et les tests passent |
| 2. Classement | Socle visuel, vignettes, podium, sélecteur de cadence, rafraîchissement en direct | Le classement des trois cadences est juste et lisible sur téléphone |
| 3. Duels | Matrice, fiche duel | Le bilan de chaque paire correspond au décompte manuel des parties |
| 4. Panthéon | Records, courbes comparées | Chaque record renvoie à une partie ou une date vérifiable |
| 5. Album | Fiche joueur, trophées, titres | Les trophées de chaque joueur sont justifiés par une partie |
| 6. Vie du groupe | Fil d'actu, récap en image, notifications | Un dépassement réel produit une ligne dans le fil et un message dans le canal |
| 7. Finitions | PWA, test sur téléphones, mise en ligne | Le lien fonctionne sur les téléphones du groupe |

Critères d'acceptation transverses :

- Aucune statistique affichée ne contredit chess.com.
- Chaque écran est utilisable d'une main, sans zoom ni défilement horizontal (sauf la matrice au-delà de 6 joueurs).
- L'app reste consultable quand chess.com ne répond pas.
- Ajouter un joueur ne demande aucune modification de code.

## 11. Décisions

| N° | Décision | Recommandation | Bloque |
|---|---|---|---|
| D1 | Canal des notifications | Tranché le 12/11/2026 : ntfy | Lot 6 |
| D2 | Ajout d'un joueur par fichier `groupe.json` plutôt que depuis l'interface | Tranché le 12/11/2026 : accepté | Lot 1 |
| D3 | Hébergement GitHub Pages et GitHub Actions, dépôt public | Tranché le 12/11/2026 : accepté | Lot 1 |
| D4 | Nom « Le Vestiaire » | Tranché le 12/11/2026 : gardé | Rien |
