import type { Cadence, Issue, TypeEvenement } from './types.ts';

export const NOM_CADENCE: Record<Cadence, string> = { rapide: 'Rapide', blitz: 'Blitz', bullet: 'Bullet' };

export const NOM_ISSUE: Record<Issue, string> = {
  mat: 'mat',
  abandon: 'abandon',
  temps: 'au temps',
  pat: 'pat',
  repetition: 'répétition',
  accord: 'nulle par accord',
  materiel: 'matériel insuffisant',
  '50coups': 'règle des 50 coups',
  deconnexion: 'déconnexion',
};

/** Trophées, dans l'ordre d'affichage de l'album. */
export const TROPHEES: { cle: string; nom: string; condition: string; emoji: string }[] = [
  { cle: 'centurion', nom: 'Le Centurion', condition: '100 victoires dans une cadence', emoji: '🏛️' },
  { cle: 'millenaire', nom: 'Le Millénaire', condition: '1 000 parties jouées', emoji: '🗿' },
  { cle: 'invincible', nom: "L'Invincible", condition: '10 victoires de suite', emoji: '🛡️' },
  { cle: 'braqueur', nom: 'Le Braqueur', condition: 'Battre un adversaire à +200 Elo', emoji: '🥷' },
  { cle: 'fossoyeur', nom: 'Le Fossoyeur', condition: 'Mater en moins de 10 coups', emoji: '⚰️' },
  { cle: 'marathonien', nom: 'Le Marathonien', condition: '30 parties en un jour', emoji: '🏃' },
  { cle: 'insomniaque', nom: "L'Insomniaque", condition: 'Gagner entre 3 h et 5 h du matin', emoji: '🦉' },
  { cle: 'maitreTemps', nom: 'Le Maître du temps', condition: '50 victoires au temps', emoji: '⏱️' },
  { cle: 'regicide', nom: 'Le Régicide', condition: 'Battre le n° 1 du groupe', emoji: '🗡️' },
  { cle: 'grandChelem', nom: 'Le Grand Chelem', condition: 'Battre chaque autre membre du groupe', emoji: '🧹' },
  { cle: 'phenix', nom: 'Le Phénix', condition: 'Retrouver son record après une chute de 150 points', emoji: '🐦‍🔥' },
  { cle: 'tripleCouronne', nom: 'Le Triple couronné', condition: 'N° 1 du groupe dans les trois cadences à la fois', emoji: '👑' },
  { cle: 'recordman', nom: 'Le Recordman', condition: 'Avoir détenu le record absolu du groupe', emoji: '🥇' },
];

export const NOM_TROPHEE: Record<string, string> = Object.fromEntries(TROPHEES.map((t) => [t.cle, t.nom]));

/**
 * Formulations du fil d'actu. {a} est le joueur principal, {b} le second,
 * {n} une valeur, {c} la cadence, {s} un score.
 */
const PHRASES: Record<TypeEvenement | 'nulle' | 'absoluSoi' | 'palierBas', string[]> = {
  depassement: [
    '{a} repasse devant {b} en {c}. Ça pique.',
    '{a} double {b} en {c}. Sans clignotant.',
    '{b} regarde désormais le dos de {a} en {c}.',
  ],
  leader: [
    '{a} prend la tête en {c}. Profitez-en, ça ne dure jamais.',
    'Nouveau patron en {c} : {a}. {b} rend les clés.',
    '{a} déloge {b} du sommet en {c}.',
  ],
  record: [
    '{a} bat son record en {c} : {n}. Champagne tiède.',
    'Nouveau sommet pour {a} en {c} : {n}.',
    '{a} n\'avait jamais été aussi haut en {c} : {n}.',
  ],
  absolu: [
    '{b} n\'est plus recordman en {c}. {a} : {n}.',
    'Record absolu en {c} : {a} monte à {n}. {b} peut ranger sa couronne.',
    '{a} efface {b} des tablettes en {c} : {n}.',
  ],
  absoluSoi: [
    '{a} améliore son propre record absolu en {c} : {n}.',
    '{a} relève encore la barre en {c} : {n}. Personne ne suit.',
  ],
  serieChaude: [
    '{a} enchaîne {n} victoires en {c}. Quelqu\'un l\'arrête ?',
    '{n} victoires de suite pour {a} en {c}. Suspect.',
    '{a} est injouable en {c} : {n} de rang.',
  ],
  serieFroide: [
    '{a} : {n} défaites de rang en {c}. Pose le téléphone.',
    '{n} défaites de suite pour {a} en {c}. On pense fort.',
    '{a} creuse en {c} : {n} défaites d\'affilée.',
  ],
  duel: [
    '{a} bat {b}. {s} dans le duel.',
    '{a} s\'offre {b}. {s} au compteur.',
    '{b} tombe face à {a}. Ça fait {s}.',
  ],
  nulle: [
    '{a} et {b} se quittent sur une nulle. Courageux.',
    'Nulle entre {a} et {b}. Personne n\'a osé.',
  ],
  palier: [
    '{a} passe la barre des {n} en {c}.',
    '{a} entre dans le club des {n} en {c}.',
  ],
  palierBas: [
    '{a} repasse sous les {n} en {c}. On ne dit rien.',
    '{a} quitte le club des {n} en {c}. Par la petite porte.',
  ],
  retour: [
    'Revoilà {a}, {n} jours plus tard.',
    '{a} se souvient de son mot de passe après {n} jours.',
    'Retour de {a} après {n} jours. On avait lancé un avis de recherche.',
  ],
  trophee: [
    '{a} décroche {n}.',
    'Nouvelle vignette pour {a} : {n}.',
  ],
  recap: ['Le récap de la semaine est arrivé.'],
};

function hache(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Le choix de la formulation dépend de l'identifiant : il est stable d'un calcul à l'autre. */
export function phrase(type: keyof typeof PHRASES, id: string, v: Record<string, string | number>): string {
  const liste = PHRASES[type];
  return liste[hache(id) % liste.length].replace(/\{(\w)\}/g, (_, k) => String(v[k] ?? ''));
}
