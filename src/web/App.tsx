import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Cadence, Instantane, Joueur } from '../core/types.ts';
import { SelecteurCadence } from './composants.tsx';
import { charger, enDirect, ilYA, memoire } from './donnees.ts';
import { Classement } from './ecrans/Classement.tsx';
import { Duels, FicheDuel } from './ecrans/Duels.tsx';
import { Pantheon } from './ecrans/Pantheon.tsx';
import { Album, FicheJoueur, Groupe } from './ecrans/Album.tsx';
import { Actu, FicheRecap } from './ecrans/Actu.tsx';

type Onglet = 'classement' | 'duels' | 'pantheon' | 'album';
const ONGLETS: { cle: Onglet; nom: string; icone: string }[] = [
  { cle: 'classement', nom: 'Classement', icone: 'M4 20v-6h5v6zM9.5 20V8h5v12zM15 20v-9h5v9z' },
  { cle: 'duels', nom: 'Duels', icone: 'M5 4l9 9M4 5l9 9-2 2-3-1-3 3-2-2 3-3-1-3zM19 4l-4.5 4.5M20 5l-4.5 4.5M13 15l3-1 3 3-2 2-3-3z' },
  { cle: 'pantheon', nom: 'Panthéon', icone: 'M7 4h10v5a5 5 0 01-10 0zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M12 14v4M8 20h8' },
  { cle: 'album', nom: 'Album', icone: 'M5 4h6v7H5zM13 4h6v7h-6zM5 13h6v7H5zM13 13h6v7h-6z' },
];

type Contexte = {
  inst: Instantane;
  maintenant: number;
  cadence: Cadence;
  /** Horodatage de la visite précédente sur cet appareil (0 à la première). */
  visitePrecedente: number;
  ordrePrecedent: Partial<Record<Cadence, string[]>>;
  joueur: (cle: string) => Joueur | undefined;
  nom: (cle: string) => string;
  ouvrir: (...feuille: string[]) => void;
  annoncer: (message: string) => void;
};
const Ctx = createContext<Contexte | null>(null);
export const useVestiaire = () => useContext(Ctx)!;

function lireRoute(): { onglet: Onglet; feuille: string[] } {
  const [, onglet, ...feuille] = location.hash.replace(/^#/, '').split('/').map(decodeURIComponent);
  return { onglet: ONGLETS.some((o) => o.cle === onglet) ? (onglet as Onglet) : 'classement', feuille: feuille.filter(Boolean) };
}

type Visite = { ts: number; ordre: Partial<Record<Cadence, string[]>> };

export function App() {
  const [inst, setInst] = useState<Instantane | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [direct, setDirect] = useState<{ etat: 'attente' | 'ok' | 'echec'; ts: number }>({ etat: 'attente', ts: 0 });
  const [route, setRoute] = useState(lireRoute);
  const [cadence, setCadence] = useState<Cadence>(() => memoire.lire<Cadence>('cadence', 'rapide'));
  const [maintenant, setMaintenant] = useState(() => Math.floor(Date.now() / 1000));
  const [toast, setToast] = useState<string | null>(null);
  const [visite] = useState<Visite>(() => memoire.lire<Visite>('visite', { ts: 0, ordre: {} }));

  const rafraichir = useCallback(async (base: Instantane) => {
    setDirect((d) => ({ ...d, etat: 'attente' }));
    try {
      setInst(await enDirect(base));
      setDirect({ etat: 'ok', ts: Math.floor(Date.now() / 1000) });
    } catch {
      setDirect({ etat: 'echec', ts: base.genereLe });
    }
  }, []);

  useEffect(() => {
    charger().then((i) => { setInst(i); rafraichir(i); }, (e) => setErreur(String(e.message ?? e)));
  }, [rafraichir]);

  useEffect(() => {
    const suivre = () => setRoute(lireRoute());
    window.addEventListener('hashchange', suivre);
    const horloge = setInterval(() => setMaintenant(Math.floor(Date.now() / 1000)), 30000);
    return () => { window.removeEventListener('hashchange', suivre); clearInterval(horloge); };
  }, []);

  useEffect(() => { memoire.ecrire('cadence', cadence); }, [cadence]);

  // La visite est enregistrée après quelques secondes : le temps de montrer ce qui a changé.
  useEffect(() => {
    if (!inst || direct.etat === 'attente') return;
    const t = setTimeout(() => {
      const ordre: Visite['ordre'] = {};
      for (const cad of ['rapide', 'blitz', 'bullet'] as Cadence[]) {
        ordre[cad] = inst.joueurs.filter((j) => j.cadences[cad]).sort((a, b) => b.cadences[cad]!.elo - a.cadences[cad]!.elo).map((j) => j.cle);
      }
      memoire.ecrire('visite', { ts: Math.floor(Date.now() / 1000), ordre });
    }, 4000);
    return () => clearTimeout(t);
  }, [inst, direct.etat]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const ouvrir = useCallback((...feuille: string[]) => {
    location.hash = `/${lireRoute().onglet}/${feuille.map(encodeURIComponent).join('/')}`;
  }, []);
  const fermer = useCallback(() => {
    if (history.length > 1 && lireRoute().feuille.length) history.back();
    else location.hash = `/${lireRoute().onglet}`;
  }, []);

  const ctx = useMemo<Contexte | null>(() => {
    if (!inst) return null;
    const index = new Map(inst.joueurs.map((j) => [j.cle, j]));
    return {
      inst, maintenant, cadence,
      visitePrecedente: visite.ts,
      ordrePrecedent: visite.ordre,
      joueur: (cle) => index.get(cle),
      nom: (cle) => index.get(cle)?.nom ?? cle,
      ouvrir,
      annoncer: setToast,
    };
  }, [inst, maintenant, cadence, visite, ouvrir]);

  if (erreur) {
    return (
      <main className="plein">
        <h1 className="marque">Le Vestiaire</h1>
        <p>Les données ne sont pas encore là. Le collecteur n'a peut-être pas tourné.</p>
        <button className="bouton" onClick={() => location.reload()}>Réessayer</button>
      </main>
    );
  }
  if (!ctx || !inst) return <main className="plein"><h1 className="marque">Le Vestiaire</h1><p>On ouvre l'album…</p></main>;

  const fraicheur =
    direct.etat === 'attente' ? 'mise à jour…'
    : direct.etat === 'ok' ? ilYA(direct.ts, maintenant)
    : `chess.com ne répond pas, chiffres ${ilYA(inst.genereLe, maintenant)}`;
  const vieux = maintenant - inst.genereLe > 3 * 3600 && direct.etat !== 'ok';
  const [feuille, a, b] = route.feuille;

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <header className="tete">
          <div className="tete-ligne">
            <h1 className="marque">Le Vestiaire</h1>
            <button className="fraicheur" onClick={() => rafraichir(inst)} disabled={direct.etat === 'attente'} aria-label={`Actualiser. Dernière mise à jour ${fraicheur}`}>
              <svg className={direct.etat === 'attente' ? 'tourne' : ''} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path d="M20 12a8 8 0 11-2.6-5.9M20 4v5h-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {fraicheur}
            </button>
          </div>
          {route.onglet !== 'album' && route.onglet !== 'duels' && <SelecteurCadence cadence={cadence} onChange={setCadence} />}
          {vieux && <p className="alerte">Le collecteur est en retard : les séries et les duels datent de {ilYA(inst.genereLe, maintenant)}.</p>}
        </header>

        <main className="ecran" key={route.onglet}>
          {route.onglet === 'classement' && <Classement />}
          {route.onglet === 'duels' && <Duels />}
          {route.onglet === 'pantheon' && <Pantheon />}
          {route.onglet === 'album' && <Album />}
        </main>

        <nav className="onglets" aria-label="Sections">
          {ONGLETS.map((o) => (
            <a key={o.cle} href={`#/${o.cle}`} className="onglet" aria-current={o.cle === route.onglet ? 'page' : undefined}>
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d={o.icone} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>
              {o.nom}
            </a>
          ))}
        </nav>

        {feuille === 'joueur' && a && <FicheJoueur cle={a} onFermer={fermer} />}
        {feuille === 'duel' && a && b && <FicheDuel a={a} b={b} onFermer={fermer} />}
        {feuille === 'actu' && <Actu onFermer={fermer} />}
        {feuille === 'recap' && <FicheRecap semaine={a} onFermer={fermer} />}
        {feuille === 'groupe' && <Groupe onFermer={fermer} />}

        <div className="toast" role="status" data-visible={toast ? '' : undefined}>{toast}</div>
      </div>
    </Ctx.Provider>
  );
}
