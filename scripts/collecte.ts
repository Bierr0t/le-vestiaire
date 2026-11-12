/**
 * Collecteur : télécharge les parties depuis chess.com, recalcule l'instantané
 * et envoie les notifications ntfy. Lancé toutes les 30 minutes par GitHub Actions.
 *
 *   npm run collecte            collecte + calcul + notifications
 *   npm run collecte -- --muet  sans notifications
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculer } from '../src/core/calcul.ts';
import { compacter, type PartieApi } from '../src/core/chesscom.ts';
import { paris } from '../src/core/temps.ts';
import type { Evenement, Partie, ProfilApi, Source, StatsApi } from '../src/core/types.ts';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DONNEES = join(RACINE, 'donnees');
const API = 'https://api.chess.com/pub/player';
const MUET = process.argv.includes('--muet');
const MAX_NOTIFS_JOUR = 5;

type Etat = {
  /** Mois terminés déjà téléchargés, par joueur. */
  complets: Record<string, string[]>;
  etags: Record<string, string>;
  /** Identifiants d'événements déjà traités (envoyés ou volontairement ignorés). */
  notifies: string[];
  joueursConnus: string[];
  envois: { jour: string; n: number; synthese: boolean };
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function lireJson<T>(chemin: string, defaut: T): Promise<T> {
  try { return JSON.parse(await readFile(chemin, 'utf8')); } catch { return defaut; }
}
async function ecrireJson(chemin: string, v: unknown) {
  await mkdir(dirname(chemin), { recursive: true });
  await writeFile(chemin, JSON.stringify(v));
}

/** Requêtes en série, avec reprise sur 429. Renvoie null sur 404 et 'inchange' sur 304. */
async function api<T>(chemin: string, etat?: Etat): Promise<T | null | 'inchange'> {
  const url = `${API}/${chemin}`;
  for (let essai = 0, delai = 2000; ; essai++, delai *= 2) {
    const headers: Record<string, string> = { 'User-Agent': 'le-vestiaire (statistiques entre amis)' };
    const etag = etat?.etags[chemin];
    if (etag) headers['If-None-Match'] = etag;
    const r = await fetch(url, { headers });
    await pause(150);
    if (r.status === 304) return 'inchange';
    if (r.status === 404 || r.status === 410) return null;
    if (r.ok) {
      const e = r.headers.get('etag');
      if (etat && e) etat.etags[chemin] = e;
      return (await r.json()) as T;
    }
    if (essai >= 3) throw new Error(`${url} : HTTP ${r.status}`);
    await pause(delai);
  }
}

async function collecter(nom: string, etat: Etat): Promise<Source> {
  const cle = nom.toLowerCase();
  const dossier = join(DONNEES, 'parties', cle);
  const profil = (await api<ProfilApi>(cle)) as ProfilApi | null;
  if (!profil) {
    console.log(`  ${nom} : introuvable sur chess.com`);
    return { cle, nom, profil: null, stats: null, parties: await chargerParties(dossier) };
  }
  const stats = (await api<StatsApi>(`${cle}/stats`)) as StatsApi | null;
  const archives = ((await api<{ archives: string[] }>(`${cle}/games/archives`)) as { archives: string[] } | null)?.archives ?? [];

  const moisCourant = new Date().toISOString().slice(0, 7);
  const complets = new Set(etat.complets[cle] ?? []);
  let telecharges = 0;
  for (const url of archives) {
    const [annee, mois] = url.split('/').slice(-2);
    const cleMois = `${annee}-${mois}`;
    if (complets.has(cleMois)) continue;
    const chemin = `${cle}/games/${annee}/${mois}`;
    const r = await api<{ games: PartieApi[] }>(chemin, cleMois === moisCourant ? etat : undefined);
    if (r && r !== 'inchange') {
      const parties = r.games.map(compacter).filter((p): p is Partie => p !== null);
      await ecrireJson(join(dossier, `${cleMois}.json`), parties);
      telecharges++;
    }
    if (cleMois < moisCourant) complets.add(cleMois);
  }
  etat.complets[cle] = [...complets].sort();
  const parties = await chargerParties(dossier);
  console.log(`  ${nom} : ${parties.length} parties (${telecharges} mois téléchargés)`);
  return { cle, nom, profil, stats, parties };
}

async function chargerParties(dossier: string): Promise<Partie[]> {
  let fichiers: string[] = [];
  try { fichiers = await readdir(dossier); } catch { return []; }
  const lots = await Promise.all(fichiers.filter((f) => f.endsWith('.json')).map((f) => lireJson<Partie[]>(join(dossier, f), [])));
  return lots.flat();
}

async function ntfy(sujet: string, titre: string, message: string, lien: string) {
  const headers: Record<string, string> = { Title: encodeURIComponent(titre) === titre ? titre : `=?UTF-8?B?${Buffer.from(titre).toString('base64')}?=` };
  if (lien) headers.Click = lien;
  const r = await fetch(`https://ntfy.sh/${sujet}`, { method: 'POST', body: message, headers });
  if (!r.ok) throw new Error(`ntfy : HTTP ${r.status}`);
}

async function notifier(actu: Evenement[], etat: Etat, groupe: { ntfy?: string; url?: string }, nouveaux: Set<string>, premierPassage: boolean) {
  const deja = new Set(etat.notifies);
  const candidats = actu.filter((e) => e.notif && !deja.has(e.id)).reverse();
  const { jour, heure } = paris(Date.now() / 1000);
  if (etat.envois.jour !== jour) etat.envois = { jour, n: 0, synthese: false };

  // Premier passage, joueur fraîchement ajouté ou événement trop ancien : on marque sans envoyer.
  const frais = Date.now() / 1000 - 2 * 86400;
  const aEnvoyer: Evenement[] = [];
  for (const e of candidats) {
    if (premierPassage || e.date < frais || e.joueurs.some((j) => nouveaux.has(j))) deja.add(e.id);
    else aEnvoyer.push(e);
  }
  const silence = heure >= 23 || heure < 8;
  if (aEnvoyer.length && groupe.ntfy && !MUET && !silence) {
    for (const e of aEnvoyer) {
      if (etat.envois.n < MAX_NOTIFS_JOUR) {
        await ntfy(groupe.ntfy, 'Le Vestiaire', e.texte, groupe.url ?? '');
        etat.envois.n++;
      } else if (!etat.envois.synthese) {
        await ntfy(groupe.ntfy, 'Le Vestiaire', 'Ça bouge encore. La suite est dans le fil d\'actu.', groupe.url ?? '');
        etat.envois.synthese = true;
      }
      deja.add(e.id);
    }
    console.log(`  ${aEnvoyer.length} événement(s) notifié(s)`);
  } else if (aEnvoyer.length) {
    console.log(`  ${aEnvoyer.length} événement(s) en attente (${silence ? 'plage de silence' : MUET ? 'mode muet' : 'pas de sujet ntfy'})`);
    if (MUET) for (const e of aEnvoyer) deja.add(e.id);
  }
  etat.notifies = [...deja].slice(-2000);
}

async function main() {
  const groupe = await lireJson<{ joueurs: string[]; ntfy?: string; url?: string }>(join(RACINE, 'groupe.json'), { joueurs: [] });
  const cheminEtat = join(DONNEES, 'etat.json');
  const etat = await lireJson<Etat>(cheminEtat, {
    complets: {}, etags: {}, notifies: [], joueursConnus: [], envois: { jour: '', n: 0, synthese: false },
  });
  const premierPassage = etat.joueursConnus.length === 0;

  console.log(`Collecte de ${groupe.joueurs.length} joueurs`);
  const sources: Source[] = [];
  for (const nom of groupe.joueurs) sources.push(await collecter(nom, etat));

  const instantane = calculer(sources, Math.floor(Date.now() / 1000), groupe.ntfy);
  const nouveaux = new Set(sources.map((s) => s.cle).filter((c) => !etat.joueursConnus.includes(c)));
  await notifier(instantane.actu, etat, groupe, nouveaux, premierPassage);
  etat.joueursConnus = sources.map((s) => s.cle);

  await ecrireJson(cheminEtat, etat);
  await ecrireJson(join(DONNEES, 'instantane.json'), instantane);
  await ecrireJson(join(RACINE, 'public', 'instantane.json'), instantane);
  const taille = JSON.stringify(instantane).length;
  console.log(`Instantané écrit : ${Math.round(taille / 1024)} Ko, ${instantane.actu.length} événements, ${instantane.duels.length} duels`);
}

main().catch((e) => { console.error(e); process.exit(1); });
