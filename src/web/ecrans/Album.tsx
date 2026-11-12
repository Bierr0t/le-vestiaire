import { useEffect, useState } from 'react';
import { classement, rivaux } from '../../core/calcul.ts';
import { NOM_CADENCE, NOM_ISSUE, TROPHEES } from '../../core/textes.ts';
import { CADENCES, type Bilan, type Cadence, type Issue } from '../../core/types.ts';
import { useVestiaire } from '../App.tsx';
import { Feuille, Forme, LienPartie, Vignette } from '../composants.tsx';
import { dateCourte, dateLongue, memoire } from '../donnees.ts';

export function Album() {
  const { inst, ouvrir, maintenant } = useVestiaire();
  const { roi } = classement(inst.joueurs, 'rapide', maintenant);
  return (
    <>
      <div className="album-tete">
        <h2>L'album</h2>
        <button className="lien-clair" onClick={() => ouvrir('groupe')}>Le groupe et les notifications</button>
      </div>
      <ul className="album">
        {inst.joueurs.map((j) => (
          <li key={j.cle}>
            <Vignette joueur={j} taille="l" elo={j.cadences.rapide?.elo} holo={j === roi} terne={j.introuvable} onClick={() => ouvrir('joueur', j.cle)} />
            <span className="album-titre">{j.introuvable ? 'Introuvable' : j.titre.nom}</span>
            <span className="album-detail">{j.introuvable ? 'Compte fermé ou pseudo changé' : `${j.trophees.length} trophée${j.trophees.length > 1 ? 's' : ''} sur ${TROPHEES.length}`}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

const pct = (b: Bilan) => { const t = b.v + b.n + b.d; return t ? Math.round((100 * (b.v + b.n / 2)) / t) : 0; };
const TRANCHES = ['minuit – 3 h', '3 h – 6 h', '6 h – 9 h', '9 h – midi', 'midi – 15 h', '15 h – 18 h', '18 h – 21 h', '21 h – minuit'];

function Issues({ titre, issues }: { titre: string; issues: Partial<Record<Issue, number>> }) {
  const lignes = (Object.entries(issues) as [Issue, number][]).sort((a, b) => b[1] - a[1]);
  const total = lignes.reduce((s, [, n]) => s + n, 0);
  if (!total) return null;
  return (
    <div className="issues">
      <h4>{titre}</h4>
      {lignes.slice(0, 4).map(([issue, n]) => (
        <div key={issue} className="jauge">
          <span className="jauge-nom">{NOM_ISSUE[issue]}</span>
          <span className="jauge-piste"><span className="jauge-barre" style={{ width: `${(100 * n) / total}%` }} /></span>
          <span className="jauge-valeur">{Math.round((100 * n) / total)} %</span>
        </div>
      ))}
    </div>
  );
}

export function FicheJoueur({ cle, onFermer }: { cle: string; onFermer: () => void }) {
  const ctx = useVestiaire();
  const j = ctx.joueur(cle);
  const [cadence, setCadence] = useState<Cadence>(() => (j?.cadences[ctx.cadence] ? ctx.cadence : CADENCES.find((c) => j?.cadences[c]) ?? 'rapide'));
  // Trophées jamais vus sur cet appareil : leur autocollant se pose à l'ouverture.
  const [vus] = useState(() => new Set(memoire.lire<string[]>('trophees', [])));
  useEffect(() => {
    if (!j) return;
    memoire.ecrire('trophees', [...new Set([...vus, ...j.trophees.map((t) => `${j.cle}|${t.cle}`)])]);
  }, [j, vus]);

  if (!j) return <Feuille titre="Joueur inconnu" onFermer={onFermer}><p>Ce joueur ne fait pas partie du groupe.</p></Feuille>;

  const stat = j.cadences[cadence];
  const fiche = j.fiches[cadence];
  const { beteNoire, victime } = rivaux(j.cle, ctx.inst.duels);
  const { roi } = classement(ctx.inst.joueurs, cadence, ctx.maintenant);
  const obtenus = new Map(j.trophees.map((t) => [t.cle, t]));

  return (
    <Feuille titre={j.nom} onFermer={onFermer}>
      <div className="fiche-tete">
        <Vignette joueur={j} taille="l" holo={j === roi} />
        <div>
          <p className="fiche-titre">{j.titre.nom}</p>
          <p className="fiche-raison">{j.titre.raison}</p>
          <a className="lien" href={`https://www.chess.com/member/${j.cle}`} target="_blank" rel="noreferrer">Profil chess.com</a>
        </div>
      </div>

      <div className="trio">
        {CADENCES.map((c) => {
          const s = j.cadences[c];
          return (
            <button key={c} className="trio-case" aria-pressed={c === cadence} onClick={() => setCadence(c)} disabled={!s}>
              <span className="trio-nom">{NOM_CADENCE[c]}</span>
              <span className="trio-elo">{s ? s.elo : '–'}</span>
              <span className="trio-record">{s?.record != null ? `record ${s.record}` : 'non classé'}</span>
            </button>
          );
        })}
      </div>

      {(beteNoire || victime) && (
        <div className="rivaux">
          {beteNoire && <p><strong>Bête noire :</strong> {ctx.nom(beteNoire.adversaire)} ({beteNoire.v}-{beteNoire.d}). Il y a un problème.</p>}
          {victime && <p><strong>Victime préférée :</strong> {ctx.nom(victime.adversaire)} ({victime.v}-{victime.d}). Un abonnement.</p>}
        </div>
      )}

      {stat && fiche ? (
        <>
          <h3>En {NOM_CADENCE[cadence].toLowerCase()}</h3>
          <dl className="chiffres-cles">
            <div><dt>Bilan</dt><dd>{stat.v} V, {stat.n} N, {stat.d} D</dd></div>
            <div><dt>Record</dt><dd>{stat.record ?? '–'}{stat.recordDate ? `, le ${dateCourte(stat.recordDate)}` : ''}</dd></div>
            <div><dt>Avec les blancs</dt><dd>{pct(fiche.blancs)} % des points</dd></div>
            <div><dt>Avec les noirs</dt><dd>{pct(fiche.noirs)} % des points</dd></div>
            <div><dt>Forme</dt><dd><Forme forme={stat.forme} /></dd></div>
            <div>
              <dt>Série en cours</dt>
              <dd>{stat.serie === 0 ? 'aucune' : `${Math.abs(stat.serie)} ${stat.serie > 0 ? 'victoire' : 'défaite'}${Math.abs(stat.serie) > 1 ? 's' : ''}`}</dd>
            </div>
          </dl>

          {(fiche.heures.meilleure || fiche.heures.pire) && (
            <p className="fait">
              {fiche.heures.meilleure && <>Son créneau : {TRANCHES[fiche.heures.meilleure.tranche]} ({fiche.heures.meilleure.pct} % des points). </>}
              {fiche.heures.pire && <>À éviter : {TRANCHES[fiche.heures.pire.tranche]} ({fiche.heures.pire.pct} %).</>}
            </p>
          )}

          <div className="deux-colonnes">
            <Issues titre="Victoires par" issues={fiche.victoires} />
            <Issues titre="Défaites par" issues={fiche.defaites} />
          </div>

          {(['blancs', 'noirs'] as const).map((couleur) => fiche.ouvertures[couleur].length > 0 && (
            <div key={couleur}>
              <h4>Ouvertures avec les {couleur}</h4>
              <ul className="ouvertures">
                {fiche.ouvertures[couleur].map((o) => (
                  <li key={o.nom}><span>{o.nom}</span><span>{o.n} parties, {o.pct} %</span></li>
                ))}
              </ul>
            </div>
          ))}

          {fiche.dernieres.length > 0 && (
            <>
              <h4>Dernières parties</h4>
              <ul className="parties">
                {fiche.dernieres.map((p) => (
                  <li key={p.id}>
                    <a href={p.id} target="_blank" rel="noreferrer" className="partie">
                      <span className={`pastille pastille-${p.res}`}>{p.res}</span>
                      <span className="partie-resultat">
                        {ctx.joueur(p.adversaire)?.nom ?? p.adversaire} ({p.eloAdv})
                        <span className="partie-detail">{dateCourte(p.fin)}, avec les {p.couleur}, {NOM_ISSUE[p.issue]}</span>
                      </span>
                      <span className="partie-elo">{p.elo}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <p className="vide-clair">Non classé en {NOM_CADENCE[cadence].toLowerCase()}.</p>
      )}

      <h3>Trophées, {j.trophees.length} sur {TROPHEES.length}</h3>
      <ul className="trophees">
        {TROPHEES.map((t) => {
          const o = obtenus.get(t.cle);
          const neuf = o && !vus.has(`${j.cle}|${t.cle}`);
          return (
            <li key={t.cle} className={`trophee${o ? ' obtenu' : ''}${neuf ? ' pose' : ''}`}>
              <span className="trophee-pastille" aria-hidden="true">{o ? t.emoji : '?'}</span>
              <span className="trophee-nom">{t.nom}</span>
              <span className="trophee-detail">{t.condition}</span>
              {o && (
                <span className="trophee-date">
                  Décroché le {dateCourte(o.date)}. {o.partie && <LienPartie url={o.partie} />}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Feuille>
  );
}

export function Groupe({ onFermer }: { onFermer: () => void }) {
  const { inst, annoncer } = useVestiaire();
  const lien = location.href.split('#')[0];
  const copier = async () => {
    try { await navigator.clipboard.writeText(lien); annoncer('Lien copié'); } catch { annoncer('Copie impossible'); }
  };
  return (
    <Feuille titre="Le groupe" onFermer={onFermer}>
      <ul className="groupe">
        {inst.joueurs.map((j) => (
          <li key={j.cle}>
            <Vignette joueur={j} taille="s" terne={j.introuvable} />
            <span>
              <strong>{j.nom}</strong>
              <span className="partie-detail">
                {j.introuvable ? 'Introuvable sur chess.com : compte fermé ou pseudo changé'
                  : j.triche ? 'Compte sanctionné par chess.com, exclu des records'
                  : j.inscritLe ? `Sur chess.com depuis le ${dateLongue(j.inscritLe)}` : ''}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <h3>Recevoir les notifications</h3>
      {inst.ntfy ? (
        <>
          <p>Les dépassements, les records, les séries et les duels arrivent sur ton téléphone avec ntfy, une app gratuite. Rien entre 23 h et 8 h, cinq messages par jour au plus.</p>
          <div className="actions">
            <a className="bouton" href={`https://ntfy.sh/${inst.ntfy}`} target="_blank" rel="noreferrer">S'abonner aux notifications</a>
          </div>
          <p className="partie-detail">Dans l'app ntfy, le sujet à suivre est <code>{inst.ntfy}</code>.</p>
        </>
      ) : (
        <p>Les notifications ne sont pas configurées.</p>
      )}

      <h3>Inviter un pote</h3>
      <p>Pour le suivre, son pseudo chess.com doit être ajouté à la liste du groupe. Demande à celui qui gère l'app : c'est une ligne dans <code>groupe.json</code>, et il apparaît dans la demi-heure.</p>
      <div className="actions">
        <button className="bouton bouton-second" onClick={copier}>Copier le lien de l'app</button>
      </div>
    </Feuille>
  );
}
