/**
 * Figuren: jedes Teil wird einzeln gemalt und auf ein festes Rig gesetzt, damit alle Figuren gleich animiert werden.
 * Alle Maße in Rig-Einheiten. Die Figur ist 200 × 450 groß, oben steht Platz für die Kopfbedeckung, unten die Füße.
 */

export type AvatarPart = 'head' | 'hat' | 'torso' | 'armL' | 'armR' | 'legL' | 'legR';
/** Reihenfolge im Editor. `armL`/`legL` sind die Teile auf der linken Bildschirmseite. */
export const AVATAR_PARTS: readonly AvatarPart[] = ['head', 'hat', 'torso', 'armL', 'armR', 'legL', 'legR'];

export type HeadShape = 'circle' | 'square';
export const HEAD_SHAPES: readonly HeadShape[] = ['circle', 'square'];

/** Öffentliche Angaben zur Figur eines Spielers. Fehlende Teile wurden leer gelassen. */
export interface AvatarInfo {
  v: number;
  shape: HeadShape;
  parts: AvatarPart[];
}

export interface Point {
  x: number;
  y: number;
}

export interface PartRig {
  /** Größe der Zeichenfläche. */
  w: number;
  h: number;
  /** Gelenk in der Zeichenfläche: Drehpunkt der Animation. */
  pivot: Point;
  /** Blasse Hilfslinie vom Gelenk aus, nur im Editor. */
  bone: Point | null;
  /** Lage der linken oberen Ecke der Zeichenfläche in der Figur. */
  at: Point;
}

export const FIGURE_W = 200;
export const FIGURE_H = 450;
/** Höhe der Fußsohlen in der Figur; darauf steht sie auf der Plattform. */
export const FIGURE_GROUND = 442;
/** Zeichenflächen haben doppelte Auflösung, damit die Figur auf dem Fernseher nicht verschwimmt. */
export const AVATAR_RES = 2;

/** Kopf: die Form sitzt mit 10 Einheiten Rand in der Fläche. */
export const HEAD_INSET = 10;

/**
 * Das Rig. Der Kopf dreht sich am Hals, die Kopfbedeckung hängt am Kopf (gleiches Gelenk).
 * Arme drehen sich an den Schultern, Beine an den Hüften, der Torso um die Mitte seiner Unterkante.
 */
export const RIG: Record<AvatarPart, PartRig> = {
  hat: { w: 200, h: 180, pivot: { x: 100, y: 172 }, bone: null, at: { x: 0, y: 0 } },
  head: { w: 120, h: 120, pivot: { x: 60, y: 112 }, bone: null, at: { x: 40, y: 60 } },
  torso: { w: 120, h: 150, pivot: { x: 60, y: 140 }, bone: { x: 60, y: 8 }, at: { x: 40, y: 170 } },
  armL: { w: 50, h: 140, pivot: { x: 25, y: 12 }, bone: { x: 25, y: 128 }, at: { x: 25, y: 173 } },
  armR: { w: 50, h: 140, pivot: { x: 25, y: 12 }, bone: { x: 25, y: 128 }, at: { x: 125, y: 173 } },
  legL: { w: 56, h: 140, pivot: { x: 28, y: 10 }, bone: { x: 28, y: 132 }, at: { x: 50, y: 302 } },
  legR: { w: 56, h: 140, pivot: { x: 28, y: 10 }, bone: { x: 28, y: 132 }, at: { x: 94, y: 302 } },
};

/** Mitte des Kopfes in der Fläche der Kopfbedeckung, z. B. als Ankerpunkt des Karten-Pins. */
export const HEAD_CENTER_IN_HAT: Point = {
  x: RIG.head.at.x - RIG.hat.at.x + RIG.head.w / 2,
  y: RIG.head.at.y - RIG.hat.at.y + RIG.head.h / 2,
};

/** Höchstgröße je hochgeladenem Teil. */
export const AVATAR_PART_MAX_BYTES = 300 * 1024;

export function isAvatarPart(x: unknown): x is AvatarPart {
  return typeof x === 'string' && (AVATAR_PARTS as readonly string[]).includes(x);
}

export function isHeadShape(x: unknown): x is HeadShape {
  return typeof x === 'string' && (HEAD_SHAPES as readonly string[]).includes(x);
}

/**
 * Plattformhöhen von 0 bis 1 nach Gesamtpunkten: der Beste ganz oben, 0 oder weniger ist der Boden.
 * Haben alle 0 oder weniger, stehen alle am Boden.
 */
export function podiumHeights(scores: Record<string, number>): Record<string, number> {
  const max = Math.max(0, ...Object.values(scores));
  return Object.fromEntries(Object.entries(scores).map(([id, s]) => [id, max > 0 ? Math.max(0, s) / max : 0]));
}
