/** Dates en heure de Paris : le groupe y vit, les « jours » et les « semaines » s'y comptent. */

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
});

const memo = new Map<number, { jour: string; heure: number }>();

export function paris(ts: number): { jour: string; heure: number } {
  let r = memo.get(ts);
  if (!r) {
    const p: Record<string, string> = {};
    for (const x of fmt.formatToParts(ts * 1000)) p[x.type] = x.value;
    r = { jour: `${p.year}-${p.month}-${p.day}`, heure: Number(p.hour) % 24 };
    memo.set(ts, r);
  }
  return r;
}

export function ajouterJours(jour: string, n: number): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lundi de la semaine contenant ce jour. */
export function lundiDe(jour: string): string {
  const d = new Date(`${jour}T00:00:00Z`).getUTCDay();
  return ajouterJours(jour, -((d + 6) % 7));
}

/** Horodatage (secondes) d'une heure pleine, un jour donné, à Paris. */
export function tsParis(jour: string, heure: number): number {
  let t = Date.parse(`${jour}T${String(heure).padStart(2, '0')}:00:00Z`) / 1000 - 3600;
  if (paris(t).heure !== heure) t -= 3600;
  return t;
}

export const JOUR = 86400;
