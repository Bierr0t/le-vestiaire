import { useMemo, useRef, useState } from 'react';
import { NOM_CADENCE } from '../../core/textes.ts';
import type { PointElo } from '../../core/types.ts';
import { useVestiaire } from '../App.tsx';
import { LienPartie, Segments, Vignette, couleurSerie } from '../composants.tsx';
import { dateCourte, dateLongue } from '../donnees.ts';

export function Pantheon() {
  const { inst, cadence, maintenant, joueur, ouvrir } = useVestiaire();
  const records = inst.pantheon[cadence];
  const absolu = records.find((r) => r.cle === 'absolu');
  const gloire = records.filter((r) => !r.honte && r.cle !== 'absolu');
  const honte = records.filter((r) => r.honte);
  const roi = absolu && joueur(absolu.joueur);
  // Le record en direct prime sur celui de l'instantané.
  const valeurRoi = roi?.cadences[cadence]?.record ?? absolu?.valeur;
  const dateRoi = roi?.cadences[cadence]?.recordDate ?? absolu?.date;

  if (!records.length) return <p className="vide">Aucun record en {NOM_CADENCE[cadence].toLowerCase()}. Tout est à écrire.</p>;

  return (
    <>
      {roi && (
        <section className="trone">
          <Vignette joueur={roi} taille="xl" holo onClick={() => ouvrir('joueur', roi.cle)} />
          <div className="trone-texte">
            <h2>Record absolu</h2>
            <p className="trone-valeur">{valeurRoi}</p>
            {dateRoi && (
              <p className="trone-detail">
                {roi.nom}, le {dateLongue(dateRoi)}. {Math.floor((maintenant - dateRoi) / 86400)} jours de règne.
              </p>
            )}
          </div>
        </section>
      )}

      <Courbes />

      <section className="surface">
        <h2>Les records du groupe</h2>
        <ListeRecords records={gloire} />
      </section>

      {honte.length > 0 && (
        <section className="surface surface-honte">
          <h2>Le mur de la honte</h2>
          <ListeRecords records={honte} />
        </section>
      )}
    </>
  );
}

function ListeRecords({ records }: { records: ReturnType<typeof useVestiaire>['inst']['pantheon']['rapide'] }) {
  const { nom, ouvrir } = useVestiaire();
  return (
    <ul className="records">
      {records.map((r) => (
        <li key={r.cle} className="record">
          <span className="record-libelle">{r.libelle}</span>
          <span className="record-valeur">{r.valeur}</span>
          <span className="record-detail">
            <button className="lien" onClick={() => ouvrir('joueur', r.joueur)}>{nom(r.joueur)}</button>
            {r.date ? `, le ${dateCourte(r.date)}` : ''}
            {r.partie && <> <LienPartie url={r.partie} /></>}
          </span>
        </li>
      ))}
    </ul>
  );
}

type Periode = '3m' | '1a' | 'tout';
const PERIODES: { cle: Periode; nom: string }[] = [{ cle: '3m', nom: '3 mois' }, { cle: '1a', nom: '1 an' }, { cle: 'tout', nom: 'Tout' }];
const L = 340, H = 210, G = 36, D = 10, HAUT = 10, BAS = 24;

/** Elo en vigueur à l'instant t : celui de la dernière partie jouée avant. */
function eloA(pts: PointElo[], t: number): number | undefined {
  let lo = 0, hi = pts.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m][0] <= t) lo = m + 1; else hi = m; }
  return lo ? pts[lo - 1][1] : undefined;
}

function Courbes() {
  const { inst, cadence, maintenant } = useVestiaire();
  const [periode, setPeriode] = useState<Periode>('1a');
  const [survol, setSurvol] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const { series, t0, t1, min, max } = useMemo(() => {
    const debut = periode === 'tout' ? 0 : maintenant - (periode === '3m' ? 92 : 365) * 86400;
    // La couleur suit le joueur (son ordre dans le groupe), pas son rang ni le filtre.
    const series = inst.joueurs.map((j, i) => {
      const tous = inst.courbes[cadence][j.cle] ?? [];
      const pts = tous.filter((p) => p[0] >= debut);
      const depart = eloA(tous, debut);
      if (depart !== undefined && pts.length) pts.unshift([debut, depart]);
      const elo = j.cadences[cadence]?.elo;
      if (pts.length && elo !== undefined) pts.push([maintenant, elo]);
      return { joueur: j, couleur: couleurSerie(i), pts };
    }).filter((s) => s.pts.length > 1);
    const xs = series.flatMap((s) => s.pts.map((p) => p[0]));
    const ys = series.flatMap((s) => s.pts.map((p) => p[1]));
    const pas = (Math.max(...ys) - Math.min(...ys)) > 600 ? 200 : 100;
    return {
      series, t0: Math.min(...xs), t1: maintenant,
      min: Math.floor(Math.min(...ys) / pas) * pas, max: Math.ceil(Math.max(...ys) / pas) * pas,
    };
  }, [inst, cadence, periode, maintenant]);

  if (!series.length) return null;

  const x = (t: number) => G + ((t - t0) / (t1 - t0 || 1)) * (L - G - D);
  const y = (e: number) => HAUT + (1 - (e - min) / (max - min || 1)) * (H - HAUT - BAS);
  const pas = (max - min) > 600 ? 200 : 100;
  const graduations = Array.from({ length: Math.round((max - min) / pas) + 1 }, (_, i) => min + i * pas);
  const dates = [0, 0.5, 1].map((f) => t0 + f * (t1 - t0));

  const viser = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * L;
    setSurvol(Math.min(t1, Math.max(t0, t0 + ((px - G) / (L - G - D)) * (t1 - t0))));
  };
  const lecture = survol === null ? null : series
    .map((s) => ({ ...s, elo: eloA(s.pts, survol) }))
    .filter((s) => s.elo !== undefined)
    .sort((a, b) => b.elo! - a.elo!);

  return (
    <section className="surface">
      <div className="surface-tete">
        <h2>La course à l'Elo</h2>
        <Segments label="Période" options={PERIODES} valeur={periode} onChange={(p) => { setPeriode(p); setSurvol(null); }} />
      </div>
      <ul className="legende">
        {series.map((s) => (
          <li key={s.joueur.cle}><span className="legende-trait" style={{ background: s.couleur }} />{s.joueur.nom}</li>
        ))}
      </ul>
      <div className="graphe">
        <svg
          ref={svg} viewBox={`0 0 ${L} ${H}`} role="img"
          aria-label={`Évolution de l'Elo en ${NOM_CADENCE[cadence].toLowerCase()} pour ${series.map((s) => s.joueur.nom).join(', ')}`}
          onPointerMove={viser} onPointerDown={viser} onPointerLeave={() => setSurvol(null)}
        >
          {graduations.map((g) => (
            <g key={g}>
              <line x1={G} x2={L - D} y1={y(g)} y2={y(g)} className="grille" />
              <text x={G - 6} y={y(g) + 4} textAnchor="end" className="axe">{g}</text>
            </g>
          ))}
          {dates.map((t, i) => (
            <text key={i} x={x(t)} y={H - 6} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} className="axe">{dateCourte(t)}</text>
          ))}
          {series.map((s) => (
            <path
              key={s.joueur.cle} fill="none" stroke={s.couleur} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
              d={s.pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join('')}
            />
          ))}
          {survol !== null && lecture && (
            <>
              <line x1={x(survol)} x2={x(survol)} y1={HAUT} y2={H - BAS} className="reticule" />
              {lecture.map((s) => <circle key={s.joueur.cle} cx={x(survol)} cy={y(s.elo!)} r="4.5" fill={s.couleur} stroke="#fff" strokeWidth="2" />)}
            </>
          )}
        </svg>
        {survol !== null && lecture && (
          <div className="bulle" style={{ left: `${(x(survol) / L) * 100}%` }} data-cote={x(survol) > L / 2 ? 'gauche' : 'droite'}>
            <strong>{dateCourte(survol)}</strong>
            {lecture.map((s) => (
              <span key={s.joueur.cle}><span className="legende-trait" style={{ background: s.couleur }} />{s.joueur.nom} <b>{s.elo}</b></span>
            ))}
          </div>
        )}
      </div>
      <details className="chiffres">
        <summary>Voir les chiffres</summary>
        <table>
          <thead><tr><th scope="col">Joueur</th><th scope="col">Début</th><th scope="col">Fin</th><th scope="col">Plus haut</th><th scope="col">Plus bas</th></tr></thead>
          <tbody>
            {series.map((s) => {
              const e = s.pts.map((p) => p[1]);
              return <tr key={s.joueur.cle}><th scope="row">{s.joueur.nom}</th><td>{e[0]}</td><td>{e.at(-1)}</td><td>{Math.max(...e)}</td><td>{Math.min(...e)}</td></tr>;
            })}
          </tbody>
        </table>
      </details>
    </section>
  );
}
