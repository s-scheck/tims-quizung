import { TOWER_SPECIALS, type TowerOffer, type TowerSpecial } from '@quiz/shared';
import type { SimEvent } from './TowerSim.ts';
import { isTowerMuted, setTowerMuted as setAudioMuted, towerSound, wakeTowerAudio } from './towerAudio.ts';
import { setTowerHaptics, towerHaptics } from './towerHaptics.ts';

/**
 * Hochstapler: Klang und Vibration zu allem, was am eigenen Handy passiert. Eine Stelle für alle Zuordnungen,
 * damit die Komponenten nur Ereignisse durchreichen.
 */

export { isTowerMuted, wakeTowerAudio };

/** Ton und Vibration zusammen stumm schalten (wird gemerkt). */
export function setTowerMuted(on: boolean): void {
  setAudioMuted(on);
  setTowerHaptics(!on);
}
setTowerHaptics(!isTowerMuted());

/** Größe eines Steins für die Tonhöhe beim Aufsetzen. */
const SIZE: Record<number, number> = { 0: 1.2, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1.3, 9: 1.1 };

let finished = false;

/** Ereignisse der Physik (nach `sim.drain()`). */
export function towerSimFeedback(events: readonly SimEvent[]): void {
  for (const e of events) {
    switch (e.type) {
      case 'spawn':
        finished = false;
        break;
      case 'shift':
        towerSound.shift(e.x);
        break;
      case 'turn':
        towerSound.turn(e.dir);
        break;
      case 'land':
        towerSound.land(e.impact, SIZE[e.form] ?? 1);
        towerHaptics.land(e.impact);
        break;
      case 'bump':
        towerSound.bump(e.impact);
        towerHaptics.bump(e.impact);
        break;
      case 'lost':
        towerSound.lost();
        towerHaptics.lost();
        break;
      case 'wobble':
        towerSound.wobble(e.amount);
        break;
      case 'hold':
        towerSound.hold(e.progress);
        break;
      case 'holdLost':
        towerSound.holdLost();
        break;
      case 'mark':
        towerSound.mark();
        towerHaptics.mark();
        break;
      case 'finish':
        // Die Meldung wiederholt sich, solange das Rennen offen ist; gefeiert wird einmal.
        if (!finished) {
          towerSound.finish();
          towerHaptics.finish();
        }
        finished = true;
        break;
      case 'vines':
        towerSound.vines();
        towerHaptics.magic();
        break;
      case 'petrify':
        towerSound.petrify();
        towerHaptics.magic();
        break;
      case 'vanish':
        towerSound.vanish();
        towerHaptics.magic();
        break;
    }
  }
}

/**
 * Ein Zauber kommt laut Server an (einmal je Effekt, wenn er mich betrifft). Abgefangene klingen nach Schild,
 * dunkle Treffer nach ihrer Art; eigene helle Zauber ohne eigenes Sim-Ereignis bekommen hier ihren Klang.
 */
export function towerEffectFeedback(e: { special: TowerSpecial; by: string; target: string; blocked?: boolean }, me: string | null): void {
  if (e.blocked) {
    if (e.target === me || e.by === me) {
      towerSound.shieldBlock();
      towerHaptics.shield();
    }
    return;
  }
  if (e.target !== me) return;
  if (e.by !== me && TOWER_SPECIALS[e.special].group === 'dark') {
    towerSound.hit(e.special);
    towerHaptics.hit();
    return;
  }
  if (e.special === 'shield') towerSound.shieldUp();
  else if (e.special === 'beam') towerSound.beam();
  else if (e.special === 'shrink') towerSound.shrink();
}

/** Eigenen Zauber abgeschickt. */
export function towerCastFeedback(): void {
  towerSound.cast();
}

let lastOffer: TowerOffer | null = null;

/**
 * Angebot und Vorrat aus dem Server-Stand: klingt, wenn ein neues Angebot erscheint, und je nach Wahl hell
 * oder dunkel, sobald es zum Vorrat wird. Darf bei jedem Stand aufgerufen werden, reagiert nur auf Wechsel.
 */
export function towerOfferFeedback(offer: TowerOffer | null, stock: TowerSpecial | null): void {
  const prev = lastOffer;
  lastOffer = offer ? { ...offer } : null;
  if (offer && (!prev || prev.light !== offer.light || prev.dark !== offer.dark)) {
    towerSound.offer();
    towerHaptics.offer();
    return;
  }
  if (!offer && prev && stock) {
    if (stock === prev.light) towerSound.light();
    else if (stock === prev.dark) towerSound.dark();
  }
}
