# Le Vestiaire

Le tableau d'affichage d'un groupe de potes qui jouent aux échecs sur chess.com : classement, duels, records, trophées, fil d'actu chambreur et récap de la semaine.

Les specs complètes sont dans [SPECS.md](SPECS.md).

## Ajouter ou retirer un joueur

Modifier la liste `joueurs` de `groupe.json` avec son pseudo chess.com, puis pousser sur `main`. Il apparaît à la mise en ligne suivante.

## Comment ça marche

- `scripts/collecte.ts` télécharge les parties depuis l'API publique de chess.com, calcule toutes les statistiques et écrit `instantane.json`. Il envoie aussi les notifications ntfy.
- GitHub Actions le lance toutes les 30 minutes, sauvegarde les parties sur la branche `donnees` et publie l'app sur GitHub Pages.
- L'app (`src/web`) affiche l'instantané, puis rafraîchit l'Elo en direct depuis chess.com.
- Les règles de calcul vivent dans `src/core` et sont testées.

## En local

```sh
npm install
npm run collecte -- --muet   # télécharge les parties, sans notifier (1 à 2 minutes la première fois)
npm run dev                  # l'app sur http://localhost:5173
npm test
```

## Notifications

Le sujet ntfy est dans `groupe.json`. Chacun s'y abonne depuis l'app (Album, puis « Le groupe et les notifications »). Rien n'est envoyé entre 23 h et 8 h, ni plus de cinq messages par jour.
