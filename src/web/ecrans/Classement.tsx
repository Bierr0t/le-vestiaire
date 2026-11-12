import { useLayoutEffect, useRef } from 'react';
import { classement, estInactif, type LigneClassement } from '../../core/calcul.ts';
import { NOM_CADENCE } from '../../core/textes.ts';
import { useVestiaire } from '../App.tsx';
import { Forme, Variation, Vignette } from '../composants.tsx';
import { dateCourte, ilYA } from '../donnees.ts';

/** Les cadences dont le réordonnancement a déjà été joué pendant cette visite. */
const dejaJoue = new Set<string>();

export function Classement() {
  const { inst, cadence, maintenant, ouvrir, ordrePrecedent, visitePrecedente } = useVestiaire();
  const { lignes, nonClasses, roi } = classement(inst.joueurs, cadence, maintenant);
  const elements = useRef(new Map<string, HTMLElement>());
  const ordre = lignes.map((l) => l.joueur.cle).join(',');

  // Si l'ordre a changé depuis la dernière visite, chaque joueur part de son ancienne place.
  useLayoutEffect(() => {
    const avant = ordrePrecedent[cadence];
    if (!avant || dejaJoue.has(cadence) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    dejaJoue.add(cadence);
    const actuel = ordre.split(',');
    const connus = avant.filter((c) => actuel.includes(c));
    if (connus.join(',') === actuel.filter((c) => connus.includes(c)).join(',')) return;
    const boites = new Map(actuel.map((c) => [c, elements.current.get(c)?.getBoundingClientRect()]));
    for (const cle of connus) {
      const el = elements.current.get(cle);
      const ici = boites.get(cle);
      const depart = boites.get(actuel.filter((c) => connus.includes(c))[connus.indexOf(cle)]);
      if (!el || !ici || !depart || ici === depart) continue;
      el.animate(
        [{ transform: `translate(${depart.left - ici.left}px, ${depart.top - ici.top}px)` }, { transform: 'translate(0, 0)' }],
        { duration: 500, delay: 350, easing: 'cubic-bezier(0.77, 0, 0.175, 1)', fill: 'backwards' },
      );
    }
  }, [cadence, ordre, ordrePrecedent]);

  const ref = (cle: string) => (el: HTMLElement | null) => {
    if (el) elements.current.set(cle, el); else elements.current.delete(cle);
  };

  const dernier = inst.actu[0];
  const nouveaux = inst.actu.filter((e) => e.date > visitePrecedente).length;
  const podium = lignes.length >= 3 ? lignes.slice(0, 3) : [];
  const liste = lignes.slice(podium.length);

  return (
    <>
      {dernier && (
        <button className="bandeau" onClick={() => ouvrir('actu')}>
          <span className="bandeau-texte">{dernier.texte}</span>
          <span className="bandeau-meta">
            {ilYA(dernier.date, maintenant)}
            {visitePrecedente > 0 && nouveaux > 0 && <span className="pastille-nouveau">{nouveaux > 99 ? '99+' : nouveaux} depuis ta visite</span>}
          </span>
        </button>
      )}

      {lignes.length === 0 && <p className="vide">Personne n'est classé en {NOM_CADENCE[cadence].toLowerCase()}. La place est à prendre.</p>}

      {podium.length > 0 && (
        <ol className="podium">
          {[podium[1], podium[0], podium[2]].map((l) => (
            <li key={l.joueur.cle} className={`marche marche-${l.rang}`} ref={ref(l.joueur.cle)}>
              <Vignette
                joueur={l.joueur} taille={l === podium[0] ? 'xl' : 'l'} rang={l.rang} elo={l.stat.elo} badges={l.badges}
                holo={l.joueur === roi} terne={estInactif(l.stat, maintenant)} onClick={() => ouvrir('joueur', l.joueur.cle)}
              />
              <Forme forme={l.stat.forme} />
              <span className="marche-detail">
                <Variation n={l.stat.var7} suffixe="sur 7 j" />
              </span>
              <span className="marche-ecart">{texteEcart(l)}</span>
            </li>
          ))}
        </ol>
      )}

      {liste.length > 0 && (
        <ol className="liste" start={podium.length + 1}>
          {liste.map((l) => (
            <li key={l.joueur.cle} ref={ref(l.joueur.cle)}>
              <button className="ligne" onClick={() => ouvrir('joueur', l.joueur.cle)}>
                <span className="ligne-rang">{l.rang}</span>
                <Vignette joueur={l.joueur} taille="s" terne={estInactif(l.stat, maintenant)} holo={l.joueur === roi} />
                <span className="ligne-corps">
                  <span className="ligne-nom">{l.joueur.nom} <span className="ligne-badges">{l.badges.join('')}</span></span>
                  <span className="ligne-detail"><Forme forme={l.stat.forme} /> <Variation n={l.stat.var7} suffixe="sur 7 j" /></span>
                  <span className="ligne-detail">
                    {l.stat.record != null && <>record {l.stat.record}{l.stat.recordDate ? `, le ${dateCourte(l.stat.recordDate)}` : ''}</>}
                  </span>
                  <span className="ligne-detail">{texteEcart(l)}</span>
                </span>
                <span className="ligne-elo">{l.stat.elo}</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {nonClasses.length > 0 && (
        <p className="non-classes">
          Non classé{nonClasses.length > 1 ? 's' : ''} en {NOM_CADENCE[cadence].toLowerCase()} : {nonClasses.map((j) => j.nom).join(', ')}. Courage, fuyons.
        </p>
      )}

      {inst.recaps[0] && (
        <button className="carte-action" onClick={() => ouvrir('recap', inst.recaps[0].semaine)}>
          <span className="carte-action-titre">Le récap de la semaine</span>
          <span className="carte-action-texte">{inst.recaps[0].phrase ?? 'Qui a brillé, qui a coulé.'}</span>
        </button>
      )}
    </>
  );
}

function texteEcart(l: LigneClassement): string {
  if (!l.devant || l.ecart === null) return 'en tête';
  if (l.ecart === 0) return `à égalité avec ${l.devant.nom}`;
  return `à ${l.ecart} pt${l.ecart > 1 ? 's' : ''} de ${l.devant.nom}`;
}
