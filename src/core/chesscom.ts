import type { Cadence, Issue, Partie } from './types.ts';

const CADENCE: Record<string, Cadence> = { rapid: 'rapide', blitz: 'blitz', bullet: 'bullet' };
export const CLE_STATS = { rapide: 'chess_rapid', blitz: 'chess_blitz', bullet: 'chess_bullet' } as const;

const ISSUE: Record<string, Issue> = {
  checkmated: 'mat',
  resigned: 'abandon',
  timeout: 'temps',
  abandoned: 'deconnexion',
  stalemate: 'pat',
  repetition: 'repetition',
  agreed: 'accord',
  insufficient: 'materiel',
  timevsinsufficient: 'materiel',
  '50move': '50coups',
};

type Cote = { username: string; rating: number; result: string };
export type PartieApi = {
  url: string;
  end_time: number;
  time_class: string;
  rules: string;
  rated: boolean;
  white: Cote;
  black: Cote;
  pgn?: string;
  eco?: string;
};

/** Nombre de coups joués par les blancs, lu dans le PGN. */
export function compterCoups(pgn: string | undefined): number | undefined {
  if (!pgn) return undefined;
  const debut = pgn.indexOf('\n\n');
  const corps = pgn.slice(debut < 0 ? 0 : debut).replace(/\{[^}]*\}/g, '');
  let dernier: number | undefined;
  for (const m of corps.matchAll(/(\d+)\.(?!\.)/g)) dernier = Number(m[1]);
  return dernier;
}

/** « .../openings/Sicilian-Defense-Open-2...Nc6 » devient « Sicilian Defense Open ». */
export function nomOuverture(eco: string | undefined): string | undefined {
  if (!eco) return undefined;
  const slug = eco.slice(eco.lastIndexOf('/') + 1).replace(/-\d.*$/, '');
  const nom = slug.replace(/-/g, ' ').trim();
  return nom || undefined;
}

/** Renvoie null pour les parties hors périmètre (variantes, parties quotidiennes). */
export function compacter(g: PartieApi): Partie | null {
  const cadence = CADENCE[g.time_class];
  if (!cadence || g.rules !== 'chess' || !g.white || !g.black) return null;
  const resultat = g.white.result === 'win' ? 'blancs' : g.black.result === 'win' ? 'noirs' : 'nulle';
  const code = resultat === 'blancs' ? g.black.result : g.white.result;
  const eco = g.eco ?? g.pgn?.match(/\[ECOUrl "([^"]+)"\]/)?.[1];
  return {
    id: g.url,
    fin: g.end_time,
    cadence,
    classee: g.rated,
    blancs: { pseudo: g.white.username.toLowerCase(), elo: g.white.rating },
    noirs: { pseudo: g.black.username.toLowerCase(), elo: g.black.rating },
    resultat,
    issue: ISSUE[code] ?? 'abandon',
    ouverture: nomOuverture(eco),
    coups: compterCoups(g.pgn),
  };
}
