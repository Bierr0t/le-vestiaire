import { describe, expect, it } from 'vitest';
import { bilanDuel, calculer, classement, familleOuverture, recordsJoueur, serieEnCours, vue } from './calcul.ts';
import { compacter, compterCoups, nomOuverture } from './chesscom.ts';
import { lundiDe, paris, tsParis } from './temps.ts';
import type { Partie, Source } from './types.ts';

const T0 = tsParis('2026-10-05', 12); // un lundi midi
let n = 0;

/** Partie classée : `a` (blancs) contre `b`, avec les Elo d'après-partie. */
function partie(a: string, b: string, res: Partie['resultat'], eloA: number, eloB: number, quand: number, extra: Partial<Partie> = {}): Partie {
  return {
    id: `https://www.chess.com/game/live/${++n}`, fin: quand, cadence: 'rapide', classee: true,
    blancs: { pseudo: a, elo: eloA }, noirs: { pseudo: b, elo: eloB }, resultat: res, issue: 'mat', ...extra,
  };
}

function source(cle: string, parties: Partie[], elo: number, record = elo): Source {
  return {
    cle, nom: cle.toUpperCase(), profil: {}, parties,
    stats: { chess_rapid: { last: { rating: elo, date: T0 }, best: { rating: record, date: T0 }, record: { win: 1, loss: 1, draw: 0 } } },
  };
}

describe('lecture chess.com', () => {
  it('compte les coups sans se faire piéger par les pendules', () => {
    const pgn = '[Event "Live"]\n[Result "1-0"]\n\n1. e4 {[%clk 0:09:59.9]} 1... e5 {[%clk 0:09:58.1]} 2. Qh5 {[%clk 0:09:50]} 2... Ke7 {[%clk 0:09:40]} 3. Qxe5# {[%clk 0:09:45.3]} 1-0';
    expect(compterCoups(pgn)).toBe(3);
  });

  it('nomme et regroupe les ouvertures', () => {
    const nom = nomOuverture('https://www.chess.com/openings/Sicilian-Defense-Open-2...Nc6-3.d4');
    expect(nom).toBe('Sicilian Defense Open');
    expect(familleOuverture(nom!)).toBe('Sicilian Defense');
    expect(familleOuverture('Caro Kann Defense Advance Variation')).toBe('Caro Kann Defense');
  });

  it('compacte une partie et écarte les variantes', () => {
    const brute = {
      url: 'u', end_time: 1, time_class: 'blitz', rules: 'chess', rated: true,
      white: { username: 'Alice', rating: 1200, result: 'timeout' },
      black: { username: 'Bob', rating: 1210, result: 'win' },
    };
    expect(compacter(brute)).toMatchObject({ cadence: 'blitz', resultat: 'noirs', issue: 'temps', blancs: { pseudo: 'alice' } });
    expect(compacter({ ...brute, rules: 'chess960' })).toBeNull();
    expect(compacter({ ...brute, time_class: 'daily' })).toBeNull();
  });
});

describe('temps', () => {
  it('raisonne en heure de Paris, été comme hiver', () => {
    expect(paris(tsParis('2026-07-14', 3))).toEqual({ jour: '2026-07-14', heure: 3 });
    expect(paris(tsParis('2026-12-25', 23))).toEqual({ jour: '2026-12-25', heure: 23 });
    expect(lundiDe('2026-11-12')).toBe('2026-11-09');
    expect(lundiDe('2026-11-15')).toBe('2026-11-09');
  });
});

describe('séries et records', () => {
  const suite = (res: string) => [...res].map((r, i) =>
    vue(partie('a', 'x', r === 'V' ? 'blancs' : r === 'D' ? 'noirs' : 'nulle', 1000 + i, 1000, T0 + i * 60), 'a'));

  it('mesure la série en cours, coupée par une nulle', () => {
    expect(serieEnCours(suite('DVVV'))).toBe(3);
    expect(serieEnCours(suite('VDD'))).toBe(-2);
    expect(serieEnCours(suite('VVN'))).toBe(0);
    expect(serieEnCours(suite('VNVV'))).toBe(2);
  });

  it('trouve les records d\'un joueur', () => {
    const j1 = [partie('a', 'x', 'blancs', 1000, 900, T0), partie('a', 'x', 'blancs', 1010, 1300, T0 + 60, { coups: 7 })];
    const j2 = [partie('a', 'x', 'noirs', 1000, 900, T0 + 86400), partie('a', 'x', 'noirs', 970, 900, T0 + 86460, { coups: 80 })];
    const r = recordsJoueur([...j1, ...j2].map((p) => vue(p, 'a')));
    expect(r.serieV?.valeur).toBe(2);
    expect(r.serieD?.valeur).toBe(2);
    expect(r.scalp?.valeur).toBe(1300);
    expect(r.perf?.valeur).toBe(300);
    expect(r.matRapide?.valeur).toBe(7);
    expect(r.longue?.valeur).toBe(80);
    expect(r.chuteJour?.valeur).toBe(-40);
    expect(r.partiesJour?.valeur).toBe(2);
  });
});

describe('calcul complet', () => {
  // a et b se croisent : b est devant, puis a le dépasse et bat b en duel.
  const pa = [partie('a', 'x', 'blancs', 1480, 1400, T0), partie('a', 'x', 'blancs', 1510, 1400, T0 + 3600)];
  const pb = [partie('b', 'y', 'blancs', 1500, 1400, T0 - 3600)];
  const duel = partie('a', 'b', 'blancs', 1520, 1490, T0 + 7200);
  const amical = partie('b', 'a', 'blancs', 1490, 1520, T0 + 9000, { classee: false, cadence: 'blitz' });
  const sources = [
    source('a', [...pa, duel, amical], 1520),
    source('b', [...pb, duel, amical], 1490, 1500),
    { cle: 'c', nom: 'C', profil: {}, stats: {}, parties: [] } satisfies Source,
  ];
  const maintenant = T0 + 8 * 86400;
  const inst = calculer(sources, maintenant);

  it('classe les joueurs et isole les non classés', () => {
    const { lignes, nonClasses, roi } = classement(inst.joueurs, 'rapide', maintenant);
    expect(lignes.map((l) => [l.joueur.cle, l.rang, l.ecart])).toEqual([['a', 1, null], ['b', 2, 30]]);
    expect(nonClasses.map((j) => j.cle)).toEqual(['c']);
    expect(roi?.cle).toBe('a');
    expect(lignes[0].stat.forme).toEqual(['V', 'V', 'V']);
  });

  it('compte les duels une seule fois, amicales comprises', () => {
    expect(inst.duels).toHaveLength(1);
    const d = inst.duels[0];
    expect(bilanDuel(d, 'toutes')).toMatchObject({ va: 1, vb: 1, meneur: null });
    expect(bilanDuel(d, 'rapide')).toMatchObject({ va: 1, vb: 0, meneur: 'a' });
    expect(bilanDuel(d, 'toutes').serie).toEqual({ qui: 'b', n: 1 });
  });

  it('raconte le changement de leader et les duels', () => {
    const types = inst.actu.map((e) => e.type);
    expect(types).toContain('leader');
    expect(types.filter((t) => t === 'duel')).toHaveLength(2);
    const leader = inst.actu.find((e) => e.type === 'leader')!;
    expect(leader.joueurs).toEqual(['a', 'b']);
    expect(leader.texte).toContain('A');
    expect(new Set(inst.actu.map((e) => e.id)).size).toBe(inst.actu.length);
  });

  it('décerne le Régicide et produit le récap de la semaine', () => {
    expect(inst.joueurs.find((j) => j.cle === 'b')!.trophees.map((t) => t.cle)).toContain('regicide');
    const r = inst.recaps[0];
    expect(r.semaine).toBe('2026-10-05');
    expect(r.classement.map((l) => l.cle)).toEqual(['a', 'b']);
    expect(r.titres.find((t) => t.cle === 'a')?.nom).toBe('Le Patron');
    expect(r.titres.find((t) => t.cle === 'c')?.nom).toBe('Le Fantôme');
    expect(r.duels[0]).toMatchObject({ va: 1, vb: 1 });
  });

  it('est stable : deux calculs donnent le même fil', () => {
    expect(calculer(sources, maintenant).actu).toEqual(inst.actu);
  });
});
