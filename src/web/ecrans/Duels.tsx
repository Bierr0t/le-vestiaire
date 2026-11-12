import { useState } from 'react';
import { bilanDuel, type Filtre } from '../../core/calcul.ts';
import { NOM_CADENCE, NOM_ISSUE } from '../../core/textes.ts';
import type { Duel } from '../../core/types.ts';
import { useVestiaire } from '../App.tsx';
import { Feuille, LienPartie, Segments, Vignette } from '../composants.tsx';
import { dateCourte, partager } from '../donnees.ts';

const FILTRES: { cle: Filtre; nom: string }[] = [
  { cle: 'toutes', nom: 'Toutes' },
  { cle: 'rapide', nom: 'Rapide' },
  { cle: 'blitz', nom: 'Blitz' },
  { cle: 'bullet', nom: 'Bullet' },
];

function trouver(duels: Duel[], x: string, y: string): Duel | undefined {
  const [a, b] = [x, y].sort();
  return duels.find((d) => d.a === a && d.b === b);
}

export function Duels() {
  const { inst, maintenant, ouvrir, nom } = useVestiaire();
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const joueurs = inst.joueurs.filter((j) => !j.introuvable);

  // Le duel du moment : la paire la plus serrée ayant joué dans les 30 derniers jours, sinon le duel le plus récent.
  const joues = inst.duels.filter((d) => d.parties.length > 0);
  const recents = joues.filter((d) => maintenant - d.parties[0].fin < 30 * 86400);
  const serre = (d: Duel) => { const b = bilanDuel(d, 'toutes'); return Math.abs(b.va - b.vb) / d.parties.length; };
  const vedette = recents.length
    ? [...recents].sort((x, y) => serre(x) - serre(y))[0]
    : [...joues].sort((x, y) => y.parties[0].fin - x.parties[0].fin)[0];
  const bv = vedette && bilanDuel(vedette, 'toutes');

  return (
    <>
      <Segments label="Cadence des duels" options={FILTRES} valeur={filtre} onChange={setFiltre} />

      <div className="matrice-cadre">
        <table className="matrice">
          <caption>Victoires du joueur de la ligne, puis de celui de la colonne</caption>
          <thead>
            <tr>
              <td />
              {joueurs.map((j) => <th key={j.cle} scope="col">{j.nom.slice(0, 5)}</th>)}
            </tr>
          </thead>
          <tbody>
            {joueurs.map((ligne) => (
              <tr key={ligne.cle}>
                <th scope="row">{ligne.nom}</th>
                {joueurs.map((col) => {
                  if (col === ligne) return <td key={col.cle} className="case-soi" aria-hidden="true" />;
                  const d = trouver(inst.duels, ligne.cle, col.cle);
                  const b = d && bilanDuel(d, filtre);
                  const [moi, lui] = b ? (d!.a === ligne.cle ? [b.va, b.vb] : [b.vb, b.va]) : [0, 0];
                  const joue = b && b.parties.length > 0;
                  const etat = !joue ? 'vide' : moi > lui ? 'mene' : moi < lui ? 'subit' : 'egal';
                  return (
                    <td key={col.cle}>
                      <button
                        className={`case case-${etat}`} onClick={() => ouvrir('duel', ligne.cle, col.cle)}
                        aria-label={joue ? `${ligne.nom} ${moi}, ${col.nom} ${lui}` : `${ligne.nom} et ${col.nom} ne se sont jamais affrontés`}
                      >
                        {joue ? `${moi}-${lui}` : '·'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {vedette && bv ? (
        <button className="carte-action" onClick={() => ouvrir('duel', vedette.a, vedette.b)}>
          <span className="carte-action-titre">{recents.length ? 'Le duel du moment' : 'Le dernier duel en date'}</span>
          <span className="affiche">
            <span>{nom(vedette.a)}</span>
            <span className="affiche-score">{bv.va} – {bv.vb}</span>
            <span>{nom(vedette.b)}</span>
          </span>
          <span className="carte-action-texte">Dernière partie le {dateCourte(vedette.parties[0].fin)}</span>
        </button>
      ) : (
        <p className="vide">Aucun duel pour l'instant. Vous vous évitez ?</p>
      )}
    </>
  );
}

export function FicheDuel({ a, b, onFermer }: { a: string; b: string; onFermer: () => void }) {
  const { inst, joueur, annoncer } = useVestiaire();
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const ja = joueur(a), jb = joueur(b);
  if (!ja || !jb) return null;
  const d = trouver(inst.duels, a, b);
  const bilan = d ? bilanDuel(d, filtre) : undefined;
  // Le bilan est exprimé dans l'ordre alphabétique des clés : on le remet dans l'ordre demandé.
  const inverse = d ? d.a !== a : false;
  const va = bilan ? (inverse ? bilan.vb : bilan.va) : 0;
  const vb = bilan ? (inverse ? bilan.va : bilan.vb) : 0;
  const parties = bilan?.parties ?? [];
  const meneur = va > vb ? ja : vb > va ? jb : null;
  const autre = meneur === ja ? jb : ja;

  const perf = (cle: string) => {
    let top: { ecart: number; fin: number; id: string } | undefined;
    for (const p of d?.parties ?? []) {
      if (p.gagnant !== cle || !p.classee) continue;
      const [moi, lui] = (d!.a === cle) ? [p.eloA, p.eloB] : [p.eloB, p.eloA];
      if (lui - moi > (top?.ecart ?? 0)) top = { ecart: lui - moi, fin: p.fin, id: p.id };
    }
    return top;
  };
  const perfs = [{ j: ja, p: perf(a) }, { j: jb, p: perf(b) }].filter((x) => x.p);

  const verdict = !parties.length
    ? 'Jamais affrontés. Il serait temps.'
    : !meneur
      ? 'Match nul, tout reste à faire.'
      : `${meneur.nom} mène. ${autre.nom} cherche encore la solution.`;

  const envoyer = async () => {
    const r = await partager(parties.length ? `${ja.nom} ${va} – ${vb} ${jb.nom}. ${verdict}` : `${ja.nom} et ${jb.nom} : ${verdict}`);
    if (r === 'copie') annoncer('Copié, prêt à coller dans le groupe');
    if (r === 'echec') annoncer("Le partage n'a pas marché");
  };

  return (
    <Feuille titre={`${ja.nom} contre ${jb.nom}`} onFermer={onFermer}>
      <Segments label="Cadence du duel" options={FILTRES} valeur={filtre} onChange={setFiltre} />
      <div className="face-a-face">
        <Vignette joueur={ja} taille="l" />
        <div className="score">
          <span className="score-chiffres">{va} – {vb}</span>
          {bilan && bilan.n > 0 && <span className="score-nulles">{bilan.n} nulle{bilan.n > 1 ? 's' : ''}</span>}
        </div>
        <Vignette joueur={jb} taille="l" />
      </div>
      <p className="verdict">{verdict}</p>

      {bilan?.serie && bilan.serie.n >= 2 && (
        <p className="fait">Série en cours : {bilan.serie.n} victoires de suite pour {joueur(bilan.serie.qui)?.nom}.</p>
      )}
      {perfs.map(({ j, p }) => (
        <p className="fait" key={j.cle}>
          Plus grosse perf de {j.nom} : victoire avec {p!.ecart} points de retard, le {dateCourte(p!.fin)}. <LienPartie url={p!.id} />
        </p>
      ))}

      <div className="actions">
        <button className="bouton" onClick={envoyer}>Envoyer au groupe</button>
        <a className="bouton bouton-second" href={`https://www.chess.com/member/${jb.cle}`} target="_blank" rel="noreferrer">Défier sur chess.com</a>
      </div>

      {parties.length > 0 && (
        <>
          <h3>Les {parties.length > 1 ? `${parties.length} parties` : 'parties'}</h3>
          <ul className="parties">
            {parties.map((p) => (
              <li key={p.id}>
                <a href={p.id} target="_blank" rel="noreferrer" className="partie">
                  <span className="partie-date">{dateCourte(p.fin)}</span>
                  <span className="partie-resultat">
                    {p.gagnant ? `${joueur(p.gagnant)?.nom} gagne` : 'Nulle'}
                    <span className="partie-detail">{NOM_CADENCE[p.cadence]}, {NOM_ISSUE[p.issue]}{p.classee ? '' : ', amicale'}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </Feuille>
  );
}
