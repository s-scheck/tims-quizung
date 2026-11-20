import { isTowerSnapshot, TowerSim, type TowerSimOptions, type TowerSnapshot } from './TowerSim.ts';

/**
 * Hochstapler: Wiederherstellung des eigenen Turms. Lädt das Handy die Seite neu oder verwirft iOS sie im
 * Hintergrund, finge die Physik sonst bei Stein 0 an und der Turm wäre weg. Darum liegt etwa jede Sekunde (und beim
 * Verlassen der Seite) ein Schnappschuss in `sessionStorage`, zusammen mit den schon angewandten Effekt-Ids, damit
 * kein Zauber doppelt wirkt. Der Schlüssel enthält Raumcode, Rundenstart und Spieler-Id: Aus einer alten Runde
 * kommt nichts zurück. Alles in try/catch (privater Modus, voller Speicher): Dann eben ohne Wiederherstellung.
 */

const PREFIX = 'quiz:tower:sim:';
const SAVE_MS = 1000;

interface Stored {
  snap: TowerSnapshot;
  seen: number[];
}

export interface TowerPersist {
  /** Physik dieser Runde: wiederhergestellt, wenn ein passender Stand da ist, sonst frisch. */
  readonly sim: TowerSim;
  /** Schon angewandte Effekt-Ids (aus dem Stand übernommen). */
  readonly seen: Set<number>;
  /** Wurde ein Stand wiederhergestellt? */
  readonly restored: boolean;
  /** Im Bildtakt aufrufen: speichert höchstens einmal je Sekunde. `now` aus performance.now(). */
  save(now: number): void;
  /** Sofort speichern (Seite wird verlassen oder verborgen). */
  flush(): void;
}

export function towerPersistKey(room: string, startedAt: number, playerId: string): string {
  return `${PREFIX}${room}:${startedAt}:${playerId}`;
}

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function read(key: string): Stored | null {
  try {
    const raw = storage()?.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== 'object') return null;
    const { snap, seen } = data as Record<string, unknown>;
    if (!isTowerSnapshot(snap)) return null;
    return { snap, seen: Array.isArray(seen) ? seen.filter((x): x is number => typeof x === 'number') : [] };
  } catch {
    return null;
  }
}

/** Alte Stände anderer Runden wegräumen, damit sich nichts ansammelt. */
function sweep(keep: string): void {
  try {
    const s = storage();
    if (!s) return;
    const old: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIX) && k !== keep) old.push(k);
    }
    for (const k of old) s.removeItem(k);
  } catch {
    // egal
  }
}

/** Der gerade laufende Turm, für das Speichern beim Verlassen der Seite (ein Zuhörer für alle Runden). */
let active: TowerPersist | null = null;
let listening = false;

function listen(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const flush = () => active?.flush();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

/** Öffnet die Physik einer Runde mit Wiederherstellung. Ohne Schlüssel (kein Raum, kein Spieler) nur frisch. */
export function openTowerSim(key: string | null, opts: TowerSimOptions): TowerPersist {
  const stored = key ? read(key) : null;
  let sim: TowerSim;
  try {
    sim = stored ? TowerSim.restore(opts, stored.snap) : new TowerSim(opts);
  } catch {
    sim = new TowerSim(opts);
  }
  // Passt der Stand nicht zur Runde, baut `restore` frisch; dann gelten auch die gemerkten Effekte nicht.
  const restored = stored !== null && stored.snap.seed === opts.seed && stored.snap.goalHeight === opts.goalHeight;
  const seen = new Set<number>(restored ? stored!.seen : []);
  let last = -Infinity;
  const persist: TowerPersist = {
    sim,
    seen,
    restored,
    save(now: number) {
      if (now - last < SAVE_MS) return;
      last = now;
      persist.flush();
    },
    flush() {
      if (!key) return;
      try {
        storage()?.setItem(key, JSON.stringify({ snap: sim.snapshot(), seen: [...seen] } satisfies Stored));
      } catch {
        // voll oder verboten: dann eben ohne Wiederherstellung
      }
    },
  };
  if (key) {
    sweep(key);
    active = persist;
    listen();
  }
  return persist;
}
