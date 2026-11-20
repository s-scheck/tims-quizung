/**
 * Dungeon-Vibration über `navigator.vibrate`, wo es das gibt (Android-Browser; iOS ignoriert es still).
 * Kurz und sparsam, gedrosselt. Schaltet mit dem Ton zusammen stumm.
 */

let enabled = true;
let last = -Infinity;

export function setDungeonHaptics(on: boolean): void {
  enabled = on;
}

function buzz(pattern: number | number[], gapMs = 60): void {
  if (!enabled || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  const now = performance.now();
  if (now - last < gapMs) return;
  last = now;
  try {
    navigator.vibrate(pattern);
  } catch {
    // nicht erlaubt (ohne Nutzergeste) oder nicht vorhanden
  }
}

export const dungeonHaptics = {
  tap: () => buzz(8, 80),
  enter: () => buzz([14, 40, 10], 150),
  heartbeat: () => buzz([18, 140, 12], 400),
  correct: () => buzz([20, 60, 40], 300),
  wrong: () => buzz([70, 40, 30], 300),
  key: () => buzz([8, 40, 8, 40, 8], 200),
  exit: () => buzz([40, 60, 40, 60, 140], 500),
};
