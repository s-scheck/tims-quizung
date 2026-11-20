/**
 * Hochstapler-Vibration über `navigator.vibrate`, wo es das gibt (Android-Browser; iOS ignoriert es still).
 * Kurz und sparsam, gedrosselt, damit sich nichts überlagert. Schaltet mit dem Ton zusammen stumm.
 */

let enabled = true;
let last = -Infinity;

export function setTowerHaptics(on: boolean): void {
  enabled = on;
}

/** Vibriert nach Muster (ms an/aus …). `gapMs`: so lange nach dem letzten Muster nichts Neues. */
export function buzz(pattern: number | number[], gapMs = 60): void {
  if (!enabled || typeof navigator === 'undefined') return;
  const now = performance.now();
  if (now - last < gapMs) return;
  last = now;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // nicht erlaubt (ohne Nutzergeste) oder nicht vorhanden
  }
}

export const towerHaptics = {
  land: (impact: number) => impact > 0.2 && buzz(Math.round(6 + 22 * Math.min(1, impact)), 80),
  bump: (impact: number) => impact > 0.55 && buzz(8, 150),
  lost: () => buzz([28, 40, 22], 200),
  hit: () => buzz([20, 40, 60], 200),
  thud: () => buzz([34, 20, 12], 120),
  mark: () => buzz(18, 150),
  offer: () => buzz([10, 50, 10], 150),
  magic: () => buzz(25, 150),
  finish: () => buzz([40, 60, 40, 60, 140], 500),
};
