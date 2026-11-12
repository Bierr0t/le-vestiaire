import { useState } from 'react';
import { NOM_CADENCE } from '../../core/textes.ts';
import type { Evenement, Recap } from '../../core/types.ts';
import { useVestiaire } from '../App.tsx';
import { Feuille, LienPartie, Variation } from '../composants.tsx';
import { heure, jourLong, partager, signe } from '../donnees.ts';

const ICONE: Record<Evenement['type'], string> = {
  depassement: '↕️', leader: '👑', record: '📈', absolu: '🥇', serieChaude: '🔥', serieFroide: '🥶',
  duel: '⚔️', palier: '🚪', retour: '👋', trophee: '🏅', recap: '📰',
};

export function Actu({ onFermer }: { onFermer: () => void }) {
  const { inst, visitePrecedente, annoncer, ouvrir } = useVestiaire();
  const jours = new Map<string, Evenement[]>();
  for (const e of inst.actu) {
    const j = jourLong(e.date);
    if (!jours.has(j)) jours.set(j, []);
    jours.get(j)!.push(e);
  }
  const envoyer = async (e: Evenement) => {
    const r = await partager(e.texte);
    if (r === 'copie') annoncer('Copié, prêt à coller dans le groupe');
    if (r === 'echec') annoncer("Le partage n'a pas marché");
  };
  return (
    <Feuille titre="Le fil d'actu" onFermer={onFermer}>
      {inst.actu.length === 0 && <p>Rien à signaler. Jouez un peu.</p>}
      {[...jours.entries()].map(([jour, evenements]) => (
        <section key={jour} className="actu-jour">
          <h3>{jour}</h3>
          <ul className="actu">
            {evenements.map((e) => (
              <li key={e.id} className={e.date > visitePrecedente && visitePrecedente > 0 ? 'nouveau' : undefined}>
                <span className="actu-icone" aria-hidden="true">{ICONE[e.type]}</span>
                <div className="actu-corps">
                  <p>{e.texte}</p>
                  <p className="actu-meta">
                    {heure(e.date)}
                    {e.date > visitePrecedente && visitePrecedente > 0 && <span className="actu-neuf">nouveau</span>}
                    {e.partie && <LienPartie url={e.partie} />}
                    {e.type === 'recap'
                      ? <button className="lien" onClick={() => ouvrir('recap', e.id.split('|')[1])}>Voir le récap</button>
                      : <button className="lien" onClick={() => envoyer(e)}>Envoyer au groupe</button>}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Feuille>
  );
}

const jourMois = (iso: string, decalage = 0) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + decalage);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
};
const titreSemaine = (r: Recap) => `Semaine du ${jourMois(r.semaine)} au ${jourMois(r.semaine, 6)}`;

export function FicheRecap({ semaine, onFermer }: { semaine?: string; onFermer: () => void }) {
  const { inst, nom, annoncer, ouvrir } = useVestiaire();
  const [occupe, setOccupe] = useState(false);
  const index = Math.max(0, inst.recaps.findIndex((r) => r.semaine === semaine));
  const r = inst.recaps[index];
  if (!r) return <Feuille titre="Le récap" onFermer={onFermer}><p>Pas encore de semaine complète à raconter.</p></Feuille>;

  const envoyer = async () => {
    setOccupe(true);
    try {
      const image = await dessiner(r, nom);
      const fichier = new File([image], `vestiaire-${r.semaine}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [fichier] })) {
        await navigator.share({ files: [fichier], text: titreSemaine(r) });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(image);
        a.download = fichier.name;
        a.click();
        URL.revokeObjectURL(a.href);
        annoncer('Image enregistrée');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') annoncer("L'image n'a pas pu être créée");
    } finally { setOccupe(false); }
  };

  return (
    <Feuille titre="Le récap de la semaine" onFermer={onFermer}>
      <div className="recap-nav">
        <button className="lien" disabled={index >= inst.recaps.length - 1} onClick={() => ouvrir('recap', inst.recaps[index + 1].semaine)}>Semaine d'avant</button>
        <strong>{titreSemaine(r)}</strong>
        <button className="lien" disabled={index === 0} onClick={() => ouvrir('recap', inst.recaps[index - 1].semaine)}>Semaine d'après</button>
      </div>

      {r.phrase && <p className="verdict">{r.phrase}</p>}

      <h3>Le classement rapide</h3>
      <ol className="recap-classement">
        {r.classement.map((l) => (
          <li key={l.cle}>
            <span className="ligne-rang">{l.rang}</span>
            <span className="recap-nom">
              {nom(l.cle)}
              {l.rangAvant !== null && l.rangAvant !== l.rang && (
                <span className={l.rangAvant > l.rang ? 'variation hausse' : 'variation baisse'}>
                  {l.rangAvant > l.rang ? `▲ ${l.rangAvant - l.rang}` : `▼ ${l.rang - l.rangAvant}`}
                </span>
              )}
            </span>
            <Variation n={l.delta} />
            <span className="recap-elo">{l.elo}</span>
          </li>
        ))}
      </ol>

      <div className="deux-colonnes">
        {r.joueurSemaine && (
          <div className="encart encart-haut">
            <h4>Le joueur de la semaine</h4>
            <p className="encart-nom">{nom(r.joueurSemaine.cle)}</p>
            <p>{signe(r.joueurSemaine.delta)} en {NOM_CADENCE[r.joueurSemaine.cadence].toLowerCase()}</p>
          </div>
        )}
        {r.naufrage && (
          <div className="encart encart-bas">
            <h4>Le naufragé</h4>
            <p className="encart-nom">{nom(r.naufrage.cle)}</p>
            <p>{signe(r.naufrage.delta)} en {NOM_CADENCE[r.naufrage.cadence].toLowerCase()}</p>
          </div>
        )}
      </div>

      {r.duels.length > 0 && (
        <>
          <h3>Les duels</h3>
          <ul className="ouvertures">
            {r.duels.map((d) => <li key={d.a + d.b}><span>{nom(d.a)} contre {nom(d.b)}</span><span>{d.va} – {d.vb}{d.n ? `, ${d.n} nulle${d.n > 1 ? 's' : ''}` : ''}</span></li>)}
          </ul>
        </>
      )}

      <h3>Les titres</h3>
      <ul className="titres">
        {r.titres.map((t) => (
          <li key={t.cle}><strong>{t.nom}</strong><span>{nom(t.cle)}</span><span className="partie-detail">{t.raison}</span></li>
        ))}
      </ul>

      <div className="actions">
        <button className="bouton" onClick={envoyer} disabled={occupe}>{occupe ? 'Création de l\'image…' : 'Envoyer l\'image au groupe'}</button>
      </div>
    </Feuille>
  );
}

/** Dessine le récap en image verticale 1080 × 1920, prête pour une messagerie. */
async function dessiner(r: Recap, nom: (cle: string) => string): Promise<Blob> {
  const TITRE = '"Big Shoulders Display", sans-serif';
  const TEXTE = '"Hanken Grotesk Variable", sans-serif';
  await Promise.all([document.fonts.load(`900 100px ${TITRE}`), document.fonts.load(`600 40px ${TEXTE}`), document.fonts.load(`400 40px ${TEXTE}`)]);
  const c = document.createElement('canvas');
  c.width = 1080; c.height = 1920;
  const g = c.getContext('2d')!;
  const BLEU = '#1D3BA8', BLANC = '#FFFFFF', ENCRE = '#0E1433', JAUNE = '#FFD23F', VERT = '#1E9E5A', ROUGE = '#D42C30';

  g.fillStyle = BLEU; g.fillRect(0, 0, 1080, 1920);
  g.textBaseline = 'alphabetic';

  const ecrire = (t: string, x: number, y: number, police: string, couleur: string, align: CanvasTextAlign = 'left') => {
    g.font = police; g.fillStyle = couleur; g.textAlign = align; g.fillText(t, x, y);
  };
  /** Écrit un texte sur plusieurs lignes et renvoie l'ordonnée de la ligne suivante. */
  const paragraphe = (t: string, x: number, y: number, largeur: number, interligne: number, police: string, couleur: string) => {
    g.font = police; g.fillStyle = couleur; g.textAlign = 'left';
    let ligne = '';
    for (const mot of t.split(' ')) {
      if (g.measureText(`${ligne} ${mot}`).width > largeur && ligne) { g.fillText(ligne, x, y); y += interligne; ligne = mot; }
      else ligne = ligne ? `${ligne} ${mot}` : mot;
    }
    g.fillText(ligne, x, y);
    return y + interligne;
  };
  const carte = (x: number, y: number, l: number, h: number, angle: number) => {
    g.save();
    g.translate(x + l / 2, y + h / 2); g.rotate((angle * Math.PI) / 180);
    g.fillStyle = 'rgba(14,20,51,.28)'; g.beginPath(); g.roundRect(-l / 2 + 6, -h / 2 + 10, l, h, 28); g.fill();
    g.fillStyle = BLANC; g.beginPath(); g.roundRect(-l / 2, -h / 2, l, h, 28); g.fill();
    g.restore();
  };

  ecrire('Le Vestiaire', 72, 150, `900 104px ${TITRE}`, JAUNE);
  ecrire(titreSemaine(r), 72, 212, `600 40px ${TEXTE}`, BLANC);

  let y = 290;
  if (r.phrase) {
    g.font = `600 46px ${TEXTE}`;
    y = paragraphe(r.phrase, 72, y + 30, 936, 60, `600 46px ${TEXTE}`, BLANC) + 10;
  }

  // Classement : une grande vignette blanche.
  const lignes = r.classement.slice(0, 8);
  const hl = lignes.length > 5 ? 92 : 118;
  const hc = 130 + lignes.length * hl;
  carte(56, y, 968, hc, -0.6);
  ecrire('Le classement rapide', 104, y + 86, `900 60px ${TITRE}`, ENCRE);
  lignes.forEach((l, i) => {
    const yl = y + 130 + i * hl + hl * 0.62;
    if (i === 0) { g.fillStyle = JAUNE; g.beginPath(); g.roundRect(88, yl - hl * 0.62 + 8, 904, hl - 12, 18); g.fill(); }
    ecrire(String(l.rang), 120, yl, `900 ${hl > 100 ? 68 : 56}px ${TITRE}`, ENCRE);
    ecrire(nom(l.cle), 196, yl, `900 ${hl > 100 ? 64 : 52}px ${TITRE}`, ENCRE);
    ecrire(String(l.elo), 960, yl, `900 ${hl > 100 ? 68 : 56}px ${TITRE}`, ENCRE, 'right');
    if (l.delta) ecrire(signe(l.delta), 770, yl - 4, `600 38px ${TEXTE}`, l.delta > 0 ? VERT : ROUGE, 'right');
  });
  y += hc + 50;

  // Joueur de la semaine et naufragé, côte à côte.
  const encarts = [
    r.joueurSemaine && { titre: 'Le joueur de la semaine', j: r.joueurSemaine, couleur: VERT },
    r.naufrage && { titre: 'Le naufragé', j: r.naufrage, couleur: ROUGE },
  ].filter((e): e is NonNullable<typeof e> => !!e);
  if (encarts.length) {
    const le = encarts.length === 2 ? 468 : 968;
    encarts.forEach((e, i) => {
      const x = 56 + i * (le + 32);
      carte(x, y, le, 250, i ? 0.8 : -0.8);
      ecrire(e.titre, x + 36, y + 62, `600 34px ${TEXTE}`, ENCRE);
      ecrire(nom(e.j.cle), x + 36, y + 142, `900 68px ${TITRE}`, ENCRE);
      ecrire(`${signe(e.j.delta)} en ${NOM_CADENCE[e.j.cadence].toLowerCase()}`, x + 36, y + 206, `600 40px ${TEXTE}`, e.couleur);
    });
    y += 300;
  }

  // Titres : autant que la place le permet.
  ecrire('Les titres', 72, y + 60, `900 60px ${TITRE}`, JAUNE);
  y += 126;
  for (const t of r.titres) {
    if (y > 1800) break;
    ecrire(t.nom, 72, y, `900 52px ${TITRE}`, BLANC);
    const l = g.measureText(t.nom).width;
    ecrire(nom(t.cle), 72 + l + 24, y, `600 40px ${TEXTE}`, BLANC);
    y += 74;
  }

  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('canvas'))), 'image/png'));
}
