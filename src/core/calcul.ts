import { CLE_STATS } from './chesscom.ts';
import { NOM_TROPHEE, phrase } from './textes.ts';
import { JOUR, ajouterJours, lundiDe, paris, tsParis } from './temps.ts';
import {
  CADENCES,
  type Bilan, type Cadence, type Duel, type Evenement, type FicheCadence, type Instantane,
  type Issue, type Joueur, type Ouverture, type Partie, type PartieResume, type PointElo,
  type Recap, type RecordGroupe, type Res, type Source, type StatCadence, type TropheeObtenu,
} from './types.ts';

// ---------------------------------------------------------------------------
// Vue d'une partie du point de vue d'un joueur
// ---------------------------------------------------------------------------

type Vue = {
  p: Partie;
  res: Res;
  couleur: 'blancs' | 'noirs';
  elo: number;
  adv: string;
  eloAdv: number;
};

export function vue(p: Partie, cle: string): Vue {
  const couleur = p.blancs.pseudo === cle ? 'blancs' : 'noirs';
  const moi = p[couleur];
  const autre = couleur === 'blancs' ? p.noirs : p.blancs;
  const res: Res = p.resultat === 'nulle' ? 'N' : p.resultat === couleur ? 'V' : 'D';
  return { p, res, couleur, elo: moi.elo, adv: autre.pseudo, eloAdv: autre.elo };
}

const points = (b: Bilan) => b.v + b.n / 2;
const total = (b: Bilan) => b.v + b.n + b.d;
const pct = (b: Bilan) => (total(b) ? Math.round((100 * points(b)) / total(b)) : 0);
const vide = (): Bilan => ({ v: 0, n: 0, d: 0 });
const compter = (b: Bilan, r: Res) => { b[r === 'V' ? 'v' : r === 'N' ? 'n' : 'd']++; };
const court = (id: string) => id.slice(id.lastIndexOf('/') + 1);

// ---------------------------------------------------------------------------
// Statistiques d'un joueur dans une cadence (parties classées, ordre chronologique)
// ---------------------------------------------------------------------------

export function serieEnCours(vues: Vue[]): number {
  let n = 0;
  for (let i = vues.length - 1; i >= 0; i--) {
    const r = vues[i].res;
    if (r === 'N') break;
    if (n === 0) n = r === 'V' ? 1 : -1;
    else if ((n > 0) === (r === 'V')) n += n > 0 ? 1 : -1;
    else break;
  }
  return n;
}

/** Elo à l'issue de la dernière partie strictement antérieure à `ts`. */
function eloAvant(vues: Vue[], ts: number): number | undefined {
  let lo = 0, hi = vues.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (vues[m].p.fin < ts) lo = m + 1; else hi = m;
  }
  return lo > 0 ? vues[lo - 1].elo : undefined;
}

function statCadence(src: Source, cad: Cadence, vues: Vue[], maintenant: number): StatCadence | undefined {
  const s = src.stats?.[CLE_STATS[cad]];
  if (!s?.last) return undefined;
  const elo = s.last.rating;
  return {
    elo,
    record: s.best?.rating ?? null,
    recordDate: s.best?.date ?? null,
    v: s.record?.win ?? 0,
    n: s.record?.draw ?? 0,
    d: s.record?.loss ?? 0,
    forme: vues.slice(-5).map((v) => v.res),
    serie: serieEnCours(vues),
    var7: elo - (eloAvant(vues, maintenant - 7 * JOUR) ?? vues[0]?.elo ?? elo),
    var30: elo - (eloAvant(vues, maintenant - 30 * JOUR) ?? vues[0]?.elo ?? elo),
    derniere: vues.at(-1)?.p.fin ?? s.last.date ?? null,
  };
}

function resume(v: Vue): PartieResume {
  return {
    id: v.p.id, fin: v.p.fin, res: v.res, couleur: v.couleur,
    adversaire: v.adv, eloAdv: v.eloAdv, elo: v.elo, issue: v.p.issue,
  };
}

/** « Scandinavian Defense Mieses Kotrc Variation » devient « Scandinavian Defense ». */
export function familleOuverture(nom: string): string {
  const m = nom.match(/^.*?\b(Game|Defense|Opening|Gambit|Attack|System)\b/);
  return m ? m[0] : nom;
}

function topOuvertures(vues: Vue[]): Ouverture[] {
  const m = new Map<string, Bilan>();
  for (const v of vues) {
    if (!v.p.ouverture) continue;
    const famille = familleOuverture(v.p.ouverture);
    let b = m.get(famille);
    if (!b) m.set(famille, (b = vide()));
    compter(b, v.res);
  }
  return [...m.entries()]
    .map(([nom, b]) => ({ nom, n: total(b), pct: pct(b) }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);
}

function ficheCadence(vues: Vue[]): FicheCadence {
  const f: FicheCadence = {
    blancs: vide(), noirs: vide(), victoires: {}, defaites: {},
    ouvertures: {
      blancs: topOuvertures(vues.filter((v) => v.couleur === 'blancs')),
      noirs: topOuvertures(vues.filter((v) => v.couleur === 'noirs')),
    },
    heures: {},
    dernieres: vues.slice(-10).reverse().map(resume),
  };
  const tranches = Array.from({ length: 8 }, vide);
  for (const v of vues) {
    compter(f[v.couleur], v.res);
    const cible = v.res === 'V' ? f.victoires : v.res === 'D' ? f.defaites : null;
    if (cible) cible[v.p.issue] = (cible[v.p.issue] ?? 0) + 1;
    compter(tranches[Math.floor(paris(v.p.fin).heure / 3)], v.res);
  }
  const jouees = tranches.map((b, tranche) => ({ tranche, n: total(b), pct: pct(b) })).filter((t) => t.n >= 20);
  if (jouees.length >= 2) {
    jouees.sort((a, b) => b.pct - a.pct);
    f.heures = { meilleure: jouees[0], pire: jouees.at(-1) };
  }
  return f;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

type Candidat = { valeur: number; date: number; partie?: string };
type Records = Partial<Record<string, Candidat>>;

const DEF_RECORDS: { cle: string; libelle: string; honte: boolean; min?: boolean; fmt: (v: number) => string }[] = [
  { cle: 'serieV', libelle: 'Plus longue série de victoires', honte: false, fmt: (v) => `${v} victoires` },
  { cle: 'gainJour', libelle: 'Plus gros gain en un jour', honte: false, fmt: (v) => `+${v}` },
  { cle: 'scalp', libelle: 'Plus beau scalp', honte: false, fmt: (v) => `${v} Elo` },
  { cle: 'perf', libelle: 'Plus grosse perf', honte: false, fmt: (v) => `+${v} d'écart` },
  { cle: 'matRapide', libelle: 'Mat le plus rapide', honte: false, min: true, fmt: (v) => `${v} coups` },
  { cle: 'longue', libelle: 'Plus longue partie', honte: false, fmt: (v) => `${v} coups` },
  { cle: 'partiesJour', libelle: 'Le plus de parties en un jour', honte: false, fmt: (v) => `${v} parties` },
  { cle: 'serieD', libelle: 'Plus longue série de défaites', honte: true, fmt: (v) => `${v} défaites` },
  { cle: 'chuteJour', libelle: 'Plus grosse chute en un jour', honte: true, min: true, fmt: (v) => `${v}` },
];

export function recordsJoueur(vues: Vue[]): Records {
  const r: Records = {};
  const proposer = (cle: string, c: Candidat, min = false) => {
    const a = r[cle];
    if (!a || (min ? c.valeur < a.valeur : c.valeur > a.valeur)) r[cle] = c;
  };
  let sv = 0, sd = 0;
  let jour = '', debutJour: number | undefined, nJour = 0;
  let prec: Vue | undefined;
  const cloreJour = () => {
    if (!prec) return;
    proposer('partiesJour', { valeur: nJour, date: prec.p.fin });
    if (debutJour !== undefined) {
      const delta = prec.elo - debutJour;
      if (delta > 0) proposer('gainJour', { valeur: delta, date: prec.p.fin });
      if (delta < 0) proposer('chuteJour', { valeur: delta, date: prec.p.fin }, true);
    }
  };
  for (const v of vues) {
    const j = paris(v.p.fin).jour;
    if (j !== jour) {
      cloreJour();
      jour = j; nJour = 0; debutJour = prec?.elo;
    }
    nJour++;
    sv = v.res === 'V' ? sv + 1 : 0;
    sd = v.res === 'D' ? sd + 1 : 0;
    const ref = { date: v.p.fin, partie: v.p.id };
    if (sv) proposer('serieV', { valeur: sv, ...ref });
    if (sd) proposer('serieD', { valeur: sd, ...ref });
    if (v.res === 'V') {
      proposer('scalp', { valeur: v.eloAdv, ...ref });
      if (prec && v.eloAdv > prec.elo) proposer('perf', { valeur: v.eloAdv - prec.elo, ...ref });
      if (v.p.issue === 'mat' && v.p.coups && v.p.coups >= 2) proposer('matRapide', { valeur: v.p.coups, ...ref }, true);
    }
    if (v.p.coups) proposer('longue', { valeur: v.p.coups, ...ref });
    prec = v;
  }
  cloreJour();
  return r;
}

// ---------------------------------------------------------------------------
// Calcul complet
// ---------------------------------------------------------------------------

type Brut = Omit<Evenement, 'texte'> & { cleUnique: string; texte: string };

const SEUILS_SERIE = [5, 7, 10];
const PRIORITE: Record<string, number> = {
  absolu: 9, leader: 8, depassement: 7, serieChaude: 6, serieFroide: 6, record: 5, trophee: 4, duel: 3, palier: 2, retour: 1,
};

export function calculer(sources: Source[], maintenant: number, ntfy?: string): Instantane {
  const actifs = sources.filter((s) => s.profil && !s.profil.status?.startsWith('closed'));
  const membres = new Set(actifs.map((s) => s.cle));
  const nom = Object.fromEntries(sources.map((s) => [s.cle, s.nom]));
  const horsRecords = new Set(sources.filter((s) => s.profil?.status?.includes('fair_play')).map((s) => s.cle));

  // --- Par joueur ----------------------------------------------------------
  const vuesClassees: Record<string, Record<Cadence, Vue[]>> = {};
  const joueurs: Joueur[] = [];
  const pantheon = { rapide: [], blitz: [], bullet: [] } as Record<Cadence, RecordGroupe[]>;
  const courbes = { rapide: {}, blitz: {}, bullet: {} } as Record<Cadence, Record<string, PointElo[]>>;
  const candidats: Record<Cadence, Record<string, { joueur: string; c: Candidat }>> = { rapide: {}, blitz: {}, bullet: {} };

  for (const src of sources) {
    const tri = [...src.parties].sort((a, b) => a.fin - b.fin);
    const j: Joueur = {
      cle: src.cle, nom: src.nom,
      avatar: src.profil?.avatar,
      inscritLe: src.profil?.joined,
      introuvable: !src.profil || src.profil.status?.startsWith('closed') || undefined,
      triche: horsRecords.has(src.cle) || undefined,
      titre: { nom: 'Le Figurant', raison: 'Rien à signaler cette semaine' },
      cadences: {}, fiches: {}, trophees: [],
    };
    vuesClassees[src.cle] = { rapide: [], blitz: [], bullet: [] };
    for (const cad of CADENCES) {
      const vues = tri.filter((p) => p.cadence === cad && p.classee).map((p) => vue(p, src.cle));
      vuesClassees[src.cle][cad] = vues;
      if (j.introuvable) continue;
      const stat = statCadence(src, cad, vues, maintenant);
      if (!stat) continue;
      j.cadences[cad] = stat;
      j.fiches[cad] = ficheCadence(vues);

      const pts: PointElo[] = [];
      let jour = '';
      for (const v of vues) {
        const jv = paris(v.p.fin).jour;
        if (jv === jour) pts[pts.length - 1] = [v.p.fin, v.elo];
        else { pts.push([v.p.fin, v.elo]); jour = jv; }
      }
      courbes[cad][src.cle] = pts;

      if (horsRecords.has(src.cle)) continue;
      const rec = recordsJoueur(vues);
      for (const def of DEF_RECORDS) {
        const c = rec[def.cle];
        if (!c) continue;
        const a = candidats[cad][def.cle];
        if (!a || (def.min ? c.valeur < a.c.valeur : c.valeur > a.c.valeur)) candidats[cad][def.cle] = { joueur: src.cle, c };
      }
    }
    joueurs.push(j);
  }

  for (const cad of CADENCES) {
    const classes = joueurs.filter((j) => j.cadences[cad]?.record != null && !j.triche);
    const roi = classes.sort((a, b) => b.cadences[cad]!.record! - a.cadences[cad]!.record!)[0];
    if (roi) {
      pantheon[cad].push({
        cle: 'absolu', libelle: 'Record absolu', joueur: roi.cle,
        valeur: String(roi.cadences[cad]!.record), date: roi.cadences[cad]!.recordDate, honte: false,
      });
    }
    for (const def of DEF_RECORDS) {
      const x = candidats[cad][def.cle];
      if (!x) continue;
      pantheon[cad].push({
        cle: def.cle, libelle: def.libelle, joueur: x.joueur, valeur: def.fmt(x.c.valeur),
        date: x.c.date, partie: x.c.partie, honte: def.honte,
      });
    }
  }

  // --- Chronologie commune (parties dédoublonnées) -------------------------
  const uniques = new Map<string, Partie>();
  for (const s of actifs) for (const p of s.parties) uniques.set(p.id, p);
  const chrono = [...uniques.values()].sort((a, b) => a.fin - b.fin);

  const duels = new Map<string, Duel>();
  const bruts = new Map<string, Brut>();
  const trophees = new Map<string, Map<string, TropheeObtenu>>(actifs.map((s) => [s.cle, new Map()]));

  const emettre = (e: Omit<Brut, 'id' | 'texte'> & { texte: (id: string) => string }) => {
    const id = e.cleUnique;
    bruts.set(id, { ...e, id, texte: e.texte(id) });
  };
  const decerner = (cle: string, trophee: string, p: Partie) => {
    const t = trophees.get(cle)!;
    if (t.has(trophee)) return;
    t.set(trophee, { cle: trophee, date: p.fin, partie: p.id });
    emettre({
      cleUnique: `trophee|${cle}|${trophee}`, type: 'trophee', date: p.fin, joueurs: [cle], partie: p.id, notif: false,
      texte: (id) => phrase('trophee', id, { a: nom[cle], n: NOM_TROPHEE[trophee] }),
    });
  };

  type Etat = { elo?: number; n: number; max: number; serie: number; pic: number; creux: number; victoires: number };
  const etat: Record<Cadence, Record<string, Etat>> = { rapide: {}, blitz: {}, bullet: {} };
  for (const cad of CADENCES) for (const s of actifs) etat[cad][s.cle] = { n: 0, max: 0, serie: 0, pic: 0, creux: 0, victoires: 0 };
  const maxGroupe: Record<Cadence, { val: number; cle?: string }> = { rapide: { val: 0 }, blitz: { val: 0 }, bullet: { val: 0 } };
  const derniere: Record<string, number> = {};
  const totalParties: Record<string, number> = {};
  const auTemps: Record<string, number> = {};
  const parJour: Record<string, { jour: string; n: number }> = {};
  const battus: Record<string, Set<string>> = {};

  const classes = (cad: Cadence) => actifs.filter((s) => etat[cad][s.cle].elo !== undefined).map((s) => s.cle);
  const leader = (cad: Cadence): string | undefined => {
    const c = classes(cad);
    if (c.length < 2) return undefined;
    return c.reduce((a, b) => (etat[cad][b].elo! > etat[cad][a].elo! ? b : a));
  };

  for (const p of chrono) {
    const cad = p.cadence;
    const dedans = [p.blancs.pseudo, p.noirs.pseudo].filter((c) => membres.has(c));
    const { jour, heure } = paris(p.fin);
    const patronAvant = leader('rapide');

    for (const m of dedans) {
      const v = vue(p, m);
      if (derniere[m] && p.fin - derniere[m] >= 14 * JOUR) {
        const n = Math.floor((p.fin - derniere[m]) / JOUR);
        emettre({
          cleUnique: `retour|${m}|${court(p.id)}`, type: 'retour', date: p.fin, joueurs: [m], notif: false,
          texte: (id) => phrase('retour', id, { a: nom[m], n }),
        });
      }
      derniere[m] = p.fin;

      totalParties[m] = (totalParties[m] ?? 0) + 1;
      if (totalParties[m] === 1000) decerner(m, 'millenaire', p);
      const pj = parJour[m];
      if (pj?.jour === jour) pj.n++; else parJour[m] = { jour, n: 1 };
      if (parJour[m].n === 30) decerner(m, 'marathonien', p);

      if (v.res === 'V') {
        const e = etat[cad][m];
        if (++e.victoires === 100) decerner(m, 'centurion', p);
        if (p.issue === 'temps' && (auTemps[m] = (auTemps[m] ?? 0) + 1) === 50) decerner(m, 'maitreTemps', p);
        if (p.issue === 'mat' && p.coups && p.coups >= 2 && p.coups < 10) decerner(m, 'fossoyeur', p);
        if (heure >= 3 && heure < 5) decerner(m, 'insomniaque', p);
        if (p.classee && e.elo !== undefined && v.eloAdv - e.elo >= 200) decerner(m, 'braqueur', p);
      }
    }

    // Duel entre deux membres
    if (dedans.length === 2) {
      const [a, b] = [...dedans].sort();
      const cleDuel = `${a}|${b}`;
      let d = duels.get(cleDuel);
      if (!d) duels.set(cleDuel, (d = { a, b, parties: [] }));
      const gagnant = p.resultat === 'nulle' ? null : p[p.resultat].pseudo;
      d.parties.push({
        id: p.id, fin: p.fin, cadence: cad, classee: p.classee, gagnant,
        eloA: vue(p, a).elo, eloB: vue(p, b).elo, issue: p.issue,
      });
      if (gagnant) {
        const perdant = gagnant === a ? b : a;
        const vg = d.parties.filter((x) => x.gagnant === gagnant).length;
        const vp = d.parties.filter((x) => x.gagnant === perdant).length;
        emettre({
          cleUnique: `duel|${court(p.id)}`, type: 'duel', date: p.fin, cadence: cad, joueurs: [gagnant, perdant], partie: p.id, notif: true,
          texte: (id) => phrase('duel', id, { a: nom[gagnant], b: nom[perdant], s: `${vg}-${vp}` }),
        });
        (battus[gagnant] ??= new Set()).add(perdant);
        if (membres.size >= 3 && battus[gagnant].size === membres.size - 1) decerner(gagnant, 'grandChelem', p);
        if (patronAvant === perdant) decerner(gagnant, 'regicide', p);
      } else {
        emettre({
          cleUnique: `duel|${court(p.id)}`, type: 'duel', date: p.fin, cadence: cad, joueurs: [a, b], partie: p.id, notif: true,
          texte: (id) => phrase('nulle', id, { a: nom[a], b: nom[b] }),
        });
      }
    }

    if (!p.classee) continue;

    const avant = Object.fromEntries(classes(cad).map((c) => [c, etat[cad][c].elo!]));
    const leaderAvant = leader(cad);

    for (const m of dedans) {
      const v = vue(p, m);
      const e = etat[cad][m];
      const prec = e.elo;
      e.elo = v.elo;
      e.n++;

      e.serie = v.res === 'N' ? 0 : v.res === 'V' ? Math.max(e.serie, 0) + 1 : Math.min(e.serie, 0) - 1;
      const abs = Math.abs(e.serie);
      if (SEUILS_SERIE.includes(abs)) {
        const type = e.serie > 0 ? 'serieChaude' : 'serieFroide';
        emettre({
          cleUnique: `${type}|${cad}|${m}|${abs}|${court(p.id)}`, type, date: p.fin, cadence: cad, joueurs: [m], partie: p.id, notif: true,
          texte: (id) => phrase(type, id, { a: nom[m], n: abs, c: cad }),
        });
      }
      if (e.serie === 10) decerner(m, 'invincible', p);

      if (prec !== undefined && Math.floor(prec / 100) !== Math.floor(v.elo / 100)) {
        const haut = v.elo > prec;
        const n = haut ? Math.floor(v.elo / 100) * 100 : Math.floor(prec / 100) * 100;
        emettre({
          cleUnique: `palier|${cad}|${m}|${lundiDe(jour)}`, type: 'palier', date: p.fin, cadence: cad, joueurs: [m], notif: false,
          texte: (id) => phrase(haut ? 'palier' : 'palierBas', id, { a: nom[m], n, c: cad }),
        });
      }

      if (v.elo > e.max) {
        if (e.n > 30) {
          emettre({
            cleUnique: `record|${cad}|${m}|${jour}`, type: 'record', date: p.fin, cadence: cad, joueurs: [m], partie: p.id, notif: false,
            texte: (id) => phrase('record', id, { a: nom[m], n: v.elo, c: cad }),
          });
        }
        e.max = v.elo;
      }

      const mg = maxGroupe[cad];
      if (v.elo > mg.val && !horsRecords.has(m)) {
        if (mg.cle && e.n > 30 && classes(cad).length >= 2) {
          const ancien = mg.cle;
          const soi = ancien === m;
          emettre({
            cleUnique: `absolu|${cad}|${m}|${jour}`, type: 'absolu', date: p.fin, cadence: cad, joueurs: soi ? [m] : [m, ancien], partie: p.id, notif: true,
            texte: (id) => phrase(soi ? 'absoluSoi' : 'absolu', id, { a: nom[m], b: nom[ancien], n: v.elo, c: cad }),
          });
          decerner(m, 'recordman', p);
        }
        mg.val = v.elo; mg.cle = m;
      }

      if (v.elo >= e.pic) {
        if (e.pic && e.pic - e.creux >= 150) decerner(m, 'phenix', p);
        e.pic = v.elo; e.creux = v.elo;
      } else e.creux = Math.min(e.creux, v.elo);
    }

    // Dépassements et changement de leader
    const leaderApres = leader(cad);
    const nouveauLeader = leaderAvant && leaderApres && leaderAvant !== leaderApres;
    if (nouveauLeader) {
      emettre({
        cleUnique: `leader|${cad}|${jour}`, type: 'leader', date: p.fin, cadence: cad, joueurs: [leaderApres, leaderAvant], notif: true,
        texte: (id) => phrase('leader', id, { a: nom[leaderApres], b: nom[leaderAvant], c: cad }),
      });
    }
    for (const m of dedans) {
      for (const autre of Object.keys(avant)) {
        if (autre === m || avant[m] === undefined) continue;
        const ap = etat[cad][m].elo!, apAutre = etat[cad][autre].elo!;
        const monte = avant[m] < avant[autre] && ap > apAutre;
        const descend = avant[m] > avant[autre] && ap < apAutre;
        if (!monte && !descend) continue;
        const [devant, derriere] = monte ? [m, autre] : [autre, m];
        if (nouveauLeader && devant === leaderApres && derriere === leaderAvant) continue;
        emettre({
          cleUnique: `depassement|${cad}|${[m, autre].sort().join('+')}|${jour}`, type: 'depassement', date: p.fin, cadence: cad,
          joueurs: [devant, derriere], notif: true,
          texte: (id) => phrase('depassement', id, { a: nom[devant], b: nom[derriere], c: cad }),
        });
      }
    }

    const l = CADENCES.map(leader);
    if (l[0] && l[0] === l[1] && l[1] === l[2]) decerner(l[0], 'tripleCouronne', p);
  }

  for (const j of joueurs) j.trophees = [...(trophees.get(j.cle)?.values() ?? [])].sort((a, b) => a.date - b.date);
  for (const d of duels.values()) d.parties.reverse();

  // --- Récaps hebdomadaires -----------------------------------------------
  const evenements = [...bruts.values()].sort((a, b) => b.date - a.date);
  const lundiCourant = lundiDe(paris(maintenant).jour);
  const recaps: Recap[] = [];
  for (let i = 1; i <= 12; i++) {
    const r = recapSemaine(ajouterJours(lundiCourant, -7 * i), actifs, vuesClassees, chrono, membres, evenements, nom);
    if (r) recaps.push(r);
  }
  for (const t of recaps[0]?.titres ?? []) {
    const j = joueurs.find((x) => x.cle === t.cle);
    if (j) j.titre = { nom: t.nom, raison: t.raison };
  }
  for (const r of recaps) {
    const date = tsParis(ajouterJours(r.semaine, 7), 8);
    const id = `recap|${r.semaine}`;
    evenements.push({ id, cleUnique: id, type: 'recap', date, joueurs: [], notif: true, texte: phrase('recap', id, {}) });
  }
  evenements.sort((a, b) => b.date - a.date);

  const actu: Evenement[] = evenements
    .filter((e) => e.date > maintenant - 90 * JOUR && e.date <= maintenant)
    .slice(0, 100)
    .map(({ cleUnique: _, ...e }) => e);

  return { genereLe: maintenant, ntfy, joueurs, duels: [...duels.values()], pantheon, courbes, actu, recaps };
}

// ---------------------------------------------------------------------------
// Récap d'une semaine (du lundi au dimanche, heure de Paris)
// ---------------------------------------------------------------------------

function recapSemaine(
  lundi: string,
  actifs: Source[],
  vues: Record<string, Record<Cadence, Vue[]>>,
  chrono: Partie[],
  membres: Set<string>,
  evenements: Brut[],
  nom: Record<string, string>,
): Recap | null {
  const debut = tsParis(lundi, 0);
  const fin = tsParis(ajouterJours(lundi, 7), 0);
  const dans = (ts: number) => ts >= debut && ts < fin;

  type Ligne = { cle: string; elo: number; avant?: number };
  const lignes: Ligne[] = [];
  let joueurSemaine: Recap['joueurSemaine'], naufrage: Recap['naufrage'];
  const semaine: Record<string, { n: number; auTemps: number; serieD: number; amplitude: number }> = {};

  for (const s of actifs) {
    const st = { n: 0, auTemps: 0, serieD: 0, amplitude: 0 };
    semaine[s.cle] = st;
    for (const cad of CADENCES) {
      const v = vues[s.cle][cad];
      const eloFin = eloAvant(v, fin);
      if (eloFin === undefined) continue;
      const eloDebut = eloAvant(v, debut);
      if (cad === 'rapide') lignes.push({ cle: s.cle, elo: eloFin, avant: eloDebut });
      const jouees = v.filter((x) => dans(x.p.fin));
      if (!jouees.length) continue;
      const delta = eloFin - (eloDebut ?? jouees[0].elo);
      if (delta > 0 && (!joueurSemaine || delta > joueurSemaine.delta)) joueurSemaine = { cle: s.cle, delta, cadence: cad };
      if (delta < 0 && (!naufrage || delta < naufrage.delta)) naufrage = { cle: s.cle, delta, cadence: cad };
      const elos = jouees.map((x) => x.elo).concat(eloDebut ?? []);
      st.amplitude = Math.max(st.amplitude, Math.max(...elos) - Math.min(...elos));
      let sd = 0;
      for (const x of jouees) {
        sd = x.res === 'D' ? sd + 1 : 0;
        st.serieD = Math.max(st.serieD, sd);
      }
    }
  }

  const duels = new Map<string, Recap['duels'][number]>();
  let activite = false;
  for (const p of chrono) {
    if (!dans(p.fin)) continue;
    activite = true;
    const dedans = [p.blancs.pseudo, p.noirs.pseudo].filter((c) => membres.has(c));
    for (const m of dedans) {
      semaine[m].n++;
      if (p.issue === 'temps' && vue(p, m).res === 'D') semaine[m].auTemps++;
    }
    if (dedans.length === 2) {
      const [a, b] = [...dedans].sort();
      let d = duels.get(`${a}|${b}`);
      if (!d) duels.set(`${a}|${b}`, (d = { a, b, va: 0, vb: 0, n: 0 }));
      const g = p.resultat === 'nulle' ? null : p[p.resultat].pseudo;
      if (g === a) d.va++; else if (g === b) d.vb++; else d.n++;
    }
  }
  if (!activite) return null;

  lignes.sort((a, b) => b.elo - a.elo);
  const ordreAvant = lignes.filter((l) => l.avant !== undefined).sort((a, b) => b.avant! - a.avant!).map((l) => l.cle);
  const classement = lignes.map((l, i) => {
    const ra = ordreAvant.indexOf(l.cle);
    return { cle: l.cle, elo: l.elo, delta: l.elo - (l.avant ?? l.elo), rang: i + 1, rangAvant: ra < 0 ? null : ra + 1 };
  });

  // Titres : chaque titre va au meilleur candidat encore sans titre.
  const titres: Recap['titres'] = [];
  const pris = new Set<string>();
  const donner = (cle: string | undefined, t: string, raison: string) => {
    if (!cle || pris.has(cle)) return;
    pris.add(cle);
    titres.push({ cle, nom: t, raison });
  };
  const meilleur = (f: (cle: string) => number, minimum: number) => {
    const c = actifs.map((s) => s.cle).filter((k) => !pris.has(k) && f(k) >= minimum).sort((a, b) => f(b) - f(a));
    return c[0];
  };
  donner(classement[0]?.cle, 'Le Patron', `N° 1 en rapide avec ${classement[0]?.elo}`);
  let c = meilleur((k) => semaine[k].n, 1);
  if (c) donner(c, 'Le Stakhanoviste', `${semaine[c].n} parties dans la semaine`);
  c = meilleur((k) => semaine[k].amplitude, 1);
  if (c) donner(c, "L'Ascenseur", `${semaine[c].amplitude} points entre le haut et le bas`);
  c = meilleur((k) => semaine[k].auTemps, 1);
  if (c) donner(c, 'Le Pendu', `${semaine[c].auTemps} défaite${semaine[c].auTemps > 1 ? 's' : ''} au temps`);
  c = meilleur((k) => semaine[k].serieD, 3);
  if (c) donner(c, 'Le Tilté', `${semaine[c].serieD} défaites de suite`);
  for (const s of actifs) if (semaine[s.cle].n === 0) donner(s.cle, 'Le Fantôme', 'Aucune partie de la semaine');
  if (classement.length >= 3) donner(classement.at(-1)!.cle, 'La Lanterne rouge', 'Dernier en rapide');
  for (const s of actifs) donner(s.cle, 'Le Figurant', 'Rien à signaler cette semaine');

  const marquant = evenements
    .filter((e) => dans(e.date))
    .sort((a, b) => (PRIORITE[b.type] ?? 0) - (PRIORITE[a.type] ?? 0) || b.date - a.date)[0];

  void nom;
  return { semaine: lundi, classement, joueurSemaine, naufrage, duels: [...duels.values()], titres, phrase: marquant?.texte };
}

// ---------------------------------------------------------------------------
// Fonctions utilisées aussi par l'app
// ---------------------------------------------------------------------------

export type Filtre = Cadence | 'toutes';

export function bilanDuel(d: Duel, filtre: Filtre) {
  const parties = filtre === 'toutes' ? d.parties : d.parties.filter((p) => p.cadence === filtre);
  let va = 0, vb = 0, n = 0;
  for (const p of parties) {
    if (p.gagnant === d.a) va++; else if (p.gagnant === d.b) vb++; else n++;
  }
  let serie: { qui: string; n: number } | undefined;
  for (const p of parties) {
    if (!p.gagnant) break;
    if (!serie) serie = { qui: p.gagnant, n: 1 };
    else if (serie.qui === p.gagnant) serie.n++;
    else break;
  }
  return { parties, va, vb, n, serie, meneur: va > vb ? d.a : vb > va ? d.b : null };
}

/** Bête noire et victime préférée d'un joueur : 5 parties au minimum contre l'adversaire. */
export function rivaux(cle: string, duels: Duel[]) {
  const scores = duels
    .filter((d) => d.a === cle || d.b === cle)
    .map((d) => {
      const b = bilanDuel(d, 'toutes');
      const [v, def] = d.a === cle ? [b.va, b.vb] : [b.vb, b.va];
      const t = v + def + b.n;
      return { adversaire: d.a === cle ? d.b : d.a, v, d: def, n: b.n, t, pct: t ? (v + b.n / 2) / t : 0 };
    })
    .filter((s) => s.t >= 5)
    .sort((a, b) => a.pct - b.pct);
  const pire = scores[0], top = scores.at(-1);
  return {
    beteNoire: pire && pire.pct < 0.5 ? pire : undefined,
    victime: top && top.pct > 0.5 ? top : undefined,
  };
}

export type LigneClassement = { joueur: Joueur; stat: StatCadence; rang: number; ecart: number | null; devant?: Joueur; badges: string[] };

const INACTIF = 14 * JOUR;

export function classement(joueurs: Joueur[], cad: Cadence, maintenant: number) {
  const classes = joueurs
    .filter((j) => j.cadences[cad] && !j.introuvable)
    .sort((a, b) => b.cadences[cad]!.elo - a.cadences[cad]!.elo || (b.cadences[cad]!.record ?? 0) - (a.cadences[cad]!.record ?? 0));
  const eligibles = classes.filter((j) => !j.triche);
  const roi = [...eligibles].sort((a, b) => (b.cadences[cad]!.record ?? 0) - (a.cadences[cad]!.record ?? 0))[0];
  const par30 = [...eligibles].sort((a, b) => b.cadences[cad]!.var30 - a.cadences[cad]!.var30);
  const hausse = par30[0]?.cadences[cad]!.var30 > 0 ? par30[0] : undefined;
  const baisse = par30.length > 1 && par30.at(-1)!.cadences[cad]!.var30 < 0 ? par30.at(-1) : undefined;

  const lignes: LigneClassement[] = classes.map((joueur, i) => {
    const stat = joueur.cadences[cad]!;
    const devant = classes[i - 1];
    const exAequo = devant && devant.cadences[cad]!.elo === stat.elo;
    const badges: string[] = [];
    if (joueur === roi) badges.push('👑');
    if (stat.serie >= 3) badges.push('🔥');
    if (stat.serie <= -3) badges.push('🥶');
    if (joueur === hausse) badges.push('📈');
    if (joueur === baisse) badges.push('📉');
    if (stat.derniere && maintenant - stat.derniere > INACTIF) badges.push('💤');
    return {
      joueur, stat, rang: i + 1, devant,
      ecart: devant ? devant.cadences[cad]!.elo - stat.elo : null,
      badges: badges.slice(0, 3),
      exAequo,
    } as LigneClassement & { exAequo?: boolean };
  });
  for (let i = 1; i < lignes.length; i++) if ((lignes[i] as any).exAequo) lignes[i].rang = lignes[i - 1].rang;
  const nonClasses = joueurs.filter((j) => !j.cadences[cad] && !j.introuvable);
  return { lignes, nonClasses, roi };
}

export const estInactif = (stat: StatCadence, maintenant: number) =>
  !!stat.derniere && maintenant - stat.derniere > INACTIF;

export type { Vue, Issue };
