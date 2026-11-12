import { useEffect, type ReactNode } from 'react';
import { NOM_CADENCE } from '../core/textes.ts';
import { CADENCES, type Cadence, type Joueur, type Res } from '../core/types.ts';

function hache(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Série de couleurs des courbes, validée pour le daltonisme sur fond blanc. Attribuée par joueur, jamais par rang. */
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const couleurSerie = (index: number) => SERIES[index] ?? '#8a8f9c';

type PropsVignette = {
  joueur: Joueur;
  taille: 'xl' | 'l' | 'm' | 's';
  rang?: number;
  elo?: number;
  badges?: string[];
  holo?: boolean;
  terne?: boolean;
  onClick?: () => void;
  refEl?: (el: HTMLElement | null) => void;
};

/** La vignette d'album : l'élément signature de l'app. */
export function Vignette({ joueur, taille, rang, elo, badges, holo, terne, onClick, refEl }: PropsVignette) {
  const h = hache(joueur.cle);
  const angle = ((h % 5) - 2) * (taille === 's' ? 0 : 0.9);
  const teinte = h % 360;
  const contenu = (
    <>
      <span
        className="vignette-photo"
        style={joueur.avatar ? { backgroundImage: `url(${joueur.avatar})` } : { background: `hsl(${teinte} 55% 42%)` }}
      >
        {!joueur.avatar && <span className="vignette-initiales">{joueur.nom.slice(0, 2)}</span>}
      </span>
      {rang !== undefined && <span className="vignette-rang">{rang}</span>}
      {badges && badges.length > 0 && <span className="vignette-badges">{badges.join('')}</span>}
      {taille !== 's' && (
        <span className="vignette-bandeau">
          <span className="vignette-nom">{joueur.nom}</span>
          {elo !== undefined && <span className="vignette-elo">{elo}</span>}
        </span>
      )}
      {holo && <span className="vignette-reflet" aria-hidden="true" />}
    </>
  );
  const classe = `vignette vignette-${taille}${holo ? ' holo' : ''}${terne ? ' terne' : ''}`;
  const style = { '--angle': `${angle}deg` } as React.CSSProperties;
  return onClick ? (
    <button ref={refEl} className={classe} style={style} onClick={onClick} aria-label={`Fiche de ${joueur.nom}`}>{contenu}</button>
  ) : (
    <span ref={refEl} className={classe} style={style}>{contenu}</span>
  );
}

export function Forme({ forme }: { forme: Res[] }) {
  if (!forme.length) return null;
  return (
    <span className="forme" aria-label={`Forme : ${forme.join(' ')}`}>
      {forme.map((r, i) => <span key={i} className={`pastille pastille-${r}`}>{r}</span>)}
    </span>
  );
}

export function Variation({ n, suffixe }: { n: number; suffixe?: string }) {
  const classe = n > 0 ? 'hausse' : n < 0 ? 'baisse' : 'stable';
  return <span className={`variation ${classe}`}>{n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '='}{suffixe ? ` ${suffixe}` : ''}</span>;
}

export function Segments<T extends string>({ options, valeur, onChange, label }: {
  options: { cle: T; nom: string }[]; valeur: T; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="segments" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.cle} className="segment" aria-pressed={o.cle === valeur} onClick={() => onChange(o.cle)}>{o.nom}</button>
      ))}
    </div>
  );
}

export function SelecteurCadence({ cadence, onChange }: { cadence: Cadence; onChange: (c: Cadence) => void }) {
  return <Segments label="Cadence" valeur={cadence} onChange={onChange} options={CADENCES.map((c) => ({ cle: c, nom: NOM_CADENCE[c] }))} />;
}

/** Feuille qui monte du bas de l'écran : fiches joueur, duel, fil d'actu… */
export function Feuille({ titre, onFermer, children }: { titre: string; onFermer: () => void; children: ReactNode }) {
  useEffect(() => {
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [onFermer]);
  return (
    <div className="voile" onClick={onFermer}>
      <section className="feuille" role="dialog" aria-modal="true" aria-label={titre} onClick={(e) => e.stopPropagation()}>
        <header className="feuille-tete">
          <h2>{titre}</h2>
          <button className="fermer" onClick={onFermer} aria-label="Fermer">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
          </button>
        </header>
        <div className="feuille-corps">{children}</div>
      </section>
    </div>
  );
}

export function LienPartie({ url, children }: { url: string; children?: ReactNode }) {
  return <a className="lien" href={url} target="_blank" rel="noreferrer">{children ?? 'Voir la partie'}</a>;
}
