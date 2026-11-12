import { CLE_STATS } from '../core/chesscom.ts';
import { CADENCES, type Instantane, type StatsApi } from '../core/types.ts';

export async function charger(): Promise<Instantane> {
  const r = await fetch(`./instantane.json?t=${Math.floor(Date.now() / 60000)}`);
  if (!r.ok) throw new Error(`instantane.json : HTTP ${r.status}`);
  return r.json();
}

/**
 * Rafraîchit Elo, record et bilan depuis chess.com, sans attendre le collecteur.
 * Requêtes en série : l'API refuse les rafales.
 */
export async function enDirect(inst: Instantane): Promise<Instantane> {
  const joueurs = [];
  for (const j of inst.joueurs) {
    if (j.introuvable) { joueurs.push(j); continue; }
    const r = await fetch(`https://api.chess.com/pub/player/${j.cle}/stats`);
    if (!r.ok) throw new Error(`chess.com : HTTP ${r.status}`);
    const stats: StatsApi = await r.json();
    const cadences = { ...j.cadences };
    for (const cad of CADENCES) {
      const s = stats[CLE_STATS[cad]];
      const avant = cadences[cad];
      if (!s?.last || !avant) continue;
      cadences[cad] = {
        ...avant,
        elo: s.last.rating,
        record: s.best?.rating ?? avant.record,
        recordDate: s.best?.date ?? avant.recordDate,
        v: s.record?.win ?? avant.v,
        n: s.record?.draw ?? avant.n,
        d: s.record?.loss ?? avant.d,
        var7: avant.var7 + s.last.rating - avant.elo,
        var30: avant.var30 + s.last.rating - avant.elo,
        derniere: Math.max(avant.derniere ?? 0, s.last.date ?? 0) || null,
      };
    }
    joueurs.push({ ...j, cadences });
  }
  return { ...inst, joueurs };
}

/** Mémoire locale de l'appareil. Peut être indisponible (navigation privée) : tout est optionnel. */
export const memoire = {
  lire<T>(cle: string, defaut: T): T {
    try {
      const v = localStorage.getItem(`vestiaire.${cle}`);
      return v === null ? defaut : (JSON.parse(v) as T);
    } catch { return defaut; }
  },
  ecrire(cle: string, v: unknown) {
    try { localStorage.setItem(`vestiaire.${cle}`, JSON.stringify(v)); } catch { /* tant pis */ }
  },
};

const fmtCourt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const fmtLong = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtJour = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtHeure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export const dateCourte = (ts: number) => fmtCourt.format(ts * 1000);
export const dateLongue = (ts: number) => fmtLong.format(ts * 1000);
export const jourLong = (ts: number) => fmtJour.format(ts * 1000);
export const heure = (ts: number) => fmtHeure.format(ts * 1000).replace(':', ' h ');

export function ilYA(ts: number, maintenant: number): string {
  const s = Math.max(0, maintenant - ts);
  if (s < 90) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}

export const signe = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

export async function partager(texte: string, url = location.href.split('#')[0]): Promise<'partage' | 'copie' | 'echec'> {
  try {
    if (navigator.share) {
      await navigator.share({ text: texte, url });
      return 'partage';
    }
    await navigator.clipboard.writeText(`${texte} ${url}`);
    return 'copie';
  } catch (e) {
    return (e as Error).name === 'AbortError' ? 'partage' : 'echec';
  }
}
