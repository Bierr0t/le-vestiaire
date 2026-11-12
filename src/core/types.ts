export type Cadence = 'rapide' | 'blitz' | 'bullet';
export const CADENCES: Cadence[] = ['rapide', 'blitz', 'bullet'];

export type Issue =
  | 'mat' | 'abandon' | 'temps' | 'pat' | 'repetition' | 'accord'
  | 'materiel' | '50coups' | 'deconnexion';

/** Partie compactée, telle que stockée par le collecteur. */
export type Partie = {
  id: string;
  fin: number;
  cadence: Cadence;
  classee: boolean;
  blancs: { pseudo: string; elo: number };
  noirs: { pseudo: string; elo: number };
  resultat: 'blancs' | 'noirs' | 'nulle';
  issue: Issue;
  ouverture?: string;
  coups?: number;
};

export type Res = 'V' | 'N' | 'D';
export type Bilan = { v: number; n: number; d: number };

export type StatCadence = {
  elo: number;
  record: number | null;
  recordDate: number | null;
  v: number;
  n: number;
  d: number;
  forme: Res[];
  /** Positif : victoires de suite. Négatif : défaites de suite. */
  serie: number;
  var7: number;
  var30: number;
  derniere: number | null;
};

export type PartieResume = {
  id: string;
  fin: number;
  res: Res;
  couleur: 'blancs' | 'noirs';
  adversaire: string;
  eloAdv: number;
  elo: number;
  issue: Issue;
};

export type Ouverture = { nom: string; n: number; pct: number };

export type FicheCadence = {
  blancs: Bilan;
  noirs: Bilan;
  victoires: Partial<Record<Issue, number>>;
  defaites: Partial<Record<Issue, number>>;
  ouvertures: { blancs: Ouverture[]; noirs: Ouverture[] };
  heures: { meilleure?: { tranche: number; pct: number }; pire?: { tranche: number; pct: number } };
  dernieres: PartieResume[];
};

export type TropheeObtenu = { cle: string; date: number; partie?: string };

export type Joueur = {
  cle: string;
  nom: string;
  avatar?: string;
  inscritLe?: number;
  introuvable?: boolean;
  triche?: boolean;
  titre: { nom: string; raison: string };
  cadences: Partial<Record<Cadence, StatCadence>>;
  fiches: Partial<Record<Cadence, FicheCadence>>;
  trophees: TropheeObtenu[];
};

export type DuelPartie = {
  id: string;
  fin: number;
  cadence: Cadence;
  classee: boolean;
  /** Clé du gagnant, ou null pour une nulle. */
  gagnant: string | null;
  eloA: number;
  eloB: number;
  issue: Issue;
};

/** a < b par ordre alphabétique des clés. Parties de la plus récente à la plus ancienne. */
export type Duel = { a: string; b: string; parties: DuelPartie[] };

export type RecordGroupe = {
  cle: string;
  libelle: string;
  joueur: string;
  valeur: string;
  date: number | null;
  partie?: string;
  honte: boolean;
};

export type TypeEvenement =
  | 'depassement' | 'leader' | 'record' | 'absolu' | 'serieChaude' | 'serieFroide'
  | 'duel' | 'palier' | 'retour' | 'trophee' | 'recap';

export type Evenement = {
  id: string;
  type: TypeEvenement;
  date: number;
  cadence?: Cadence;
  joueurs: string[];
  texte: string;
  partie?: string;
  /** Vrai si l'événement mérite une notification dans le canal du groupe. */
  notif: boolean;
};

export type Recap = {
  /** Lundi de la semaine, au format AAAA-MM-JJ. */
  semaine: string;
  classement: { cle: string; elo: number; delta: number; rang: number; rangAvant: number | null }[];
  joueurSemaine?: { cle: string; delta: number; cadence: Cadence };
  naufrage?: { cle: string; delta: number; cadence: Cadence };
  duels: { a: string; b: string; va: number; vb: number; n: number }[];
  titres: { cle: string; nom: string; raison: string }[];
  phrase?: string;
};

export type PointElo = [fin: number, elo: number];

export type Instantane = {
  genereLe: number;
  ntfy?: string;
  joueurs: Joueur[];
  duels: Duel[];
  pantheon: Record<Cadence, RecordGroupe[]>;
  courbes: Record<Cadence, Record<string, PointElo[]>>;
  actu: Evenement[];
  recaps: Recap[];
};

/** Données brutes chess.com utiles au calcul. */
export type StatsApi = Partial<Record<'chess_rapid' | 'chess_blitz' | 'chess_bullet', {
  last?: { rating: number; date: number };
  best?: { rating: number; date: number };
  record?: { win: number; loss: number; draw: number };
}>>;

export type ProfilApi = { avatar?: string; joined?: number; status?: string };

export type Source = {
  cle: string;
  nom: string;
  profil: ProfilApi | null;
  stats: StatsApi | null;
  parties: Partie[];
};
