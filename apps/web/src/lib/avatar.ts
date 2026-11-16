import { AVATAR_PARTS, HEAD_CENTER_IN_HAT, HEAD_INSET, RIG, type AvatarPart, type HeadShape, type PlayerView, type RoomView } from '@quiz/shared';
import { playerColor } from './format.ts';

/** Bild-URL je Teil. Fehlt ein Teil, bleibt es leer. */
export type FigureParts = Partial<Record<AvatarPart, string>>;

/** Auf dem Handy gespeicherte Figur, Teile als PNG-Data-URLs (Kopf mit Form und Farbe). */
export interface LocalAvatar {
  shape: HeadShape;
  color: string;
  parts: FigureParts;
}

const INK = '#1f1f1f';

function svgUrl(w: number, h: number, body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)}`;
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] ?? c);
}

/** Standardfigur: Strichmännchen in der Spielerfarbe, Kopf mit Kürzel. Liegt auf demselben Rig. */
export function defaultFigure(color: string, label: string): FigureParts {
  const line = `stroke="${color}" stroke-width="14" stroke-linecap="round" fill="none"`;
  const head = RIG.head;
  const r = head.w / 2 - HEAD_INSET;
  return {
    head: svgUrl(
      head.w,
      head.h,
      `<circle cx="${head.w / 2}" cy="${head.h / 2}" r="${r}" fill="${color}" stroke="${INK}" stroke-width="4"/>` +
        `<text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="Nunito, system-ui, sans-serif" font-weight="900" font-size="38" fill="${INK}">${escapeXml(label)}</text>`,
    ),
    torso: svgUrl(RIG.torso.w, RIG.torso.h, `<path d="M60 4 V136 M12 16 H108 M38 140 H82" ${line}/>`),
    armL: svgUrl(RIG.armL.w, RIG.armL.h, `<path d="M25 12 V126" ${line}/>`),
    armR: svgUrl(RIG.armR.w, RIG.armR.h, `<path d="M25 12 V126" ${line}/>`),
    legL: svgUrl(RIG.legL.w, RIG.legL.h, `<path d="M28 10 V130" ${line}/>`),
    legR: svgUrl(RIG.legR.w, RIG.legR.h, `<path d="M28 10 V130" ${line}/>`),
  };
}

export function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

/** Figur eines Spielers aus der Sicht: hochgeladene Teile oder die Standardfigur. */
export function figureOf(view: RoomView, player: PlayerView): FigureParts {
  const avatar = player.avatar;
  if (!avatar) return defaultFigure(playerColor(view.players.findIndex((p) => p.id === player.id)), initials(player.name));
  const parts: FigureParts = {};
  for (const part of avatar.parts) parts[part] = `/api/rooms/${view.code}/avatar/${encodeURIComponent(player.id)}/${part}?v=${avatar.v}`;
  return parts;
}

export function figureById(view: RoomView, id: string): FigureParts | null {
  const player = view.players.find((p) => p.id === id);
  return player ? figureOf(view, player) : null;
}

/** Kopf mit Kopfbedeckung: Maße für einen Kopf mit `size` px Durchmesser, Anker in der Kopfmitte. */
export function headBox(size: number): { scale: number; w: number; h: number; anchorX: number; anchorY: number } {
  const scale = size / (RIG.head.w - 2 * HEAD_INSET);
  return { scale, w: RIG.hat.w * scale, h: RIG.hat.h * scale, anchorX: HEAD_CENTER_IN_HAT.x * scale, anchorY: HEAD_CENTER_IN_HAT.y * scale };
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Dasselbe wie `Head.svelte` als HTML-Text, für Leaflet-Pins. */
export function headHtml(parts: FigureParts, size: number): string {
  const b = headBox(size);
  const h = RIG.head;
  const headImg = parts.head
    ? `<img src="${escapeAttr(parts.head)}" alt="" draggable="false" style="position:absolute;left:${(h.at.x - RIG.hat.at.x) * b.scale}px;top:${(h.at.y - RIG.hat.at.y) * b.scale}px;width:${h.w * b.scale}px;height:${h.h * b.scale}px">`
    : '';
  const hatImg = parts.hat ? `<img src="${escapeAttr(parts.hat)}" alt="" draggable="false" style="position:absolute;inset:0;width:100%;height:100%">` : '';
  return `<div class="quiz-head" style="position:relative;width:${b.w}px;height:${b.h}px">${headImg}${hatImg}</div>`;
}

export function hasAnyPart(parts: FigureParts): boolean {
  return AVATAR_PARTS.some((p) => !!parts[p]);
}

/** Data-URL als Datei für den Upload. */
async function toFile(dataUrl: string, name: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: 'image/png' });
}

/** Figur in den Raum hochladen. Danach ist sie für dieses Spiel fest. */
export async function uploadAvatar(code: string, token: string, avatar: LocalAvatar): Promise<{ ok: true } | { ok: false; message: string }> {
  const form = new FormData();
  form.set('token', token);
  form.set('shape', avatar.shape);
  for (const part of AVATAR_PARTS) {
    const url = avatar.parts[part];
    if (url) form.set(part, await toFile(url, `${part}.png`));
  }
  try {
    const res = await fetch(`/api/rooms/${code}/avatar`, { method: 'POST', body: form });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, message: body?.error ?? `Fehler ${res.status}` };
  } catch {
    return { ok: false, message: 'Keine Verbindung zum Server' };
  }
}

/** Haltung der Figur, als CSS-Animation auf dem Rig. */
export type Pose = 'idle' | 'cheer' | 'sad' | 'wave' | 'walk' | 'still';

/** Zwischenstand im Editor, bleibt beim Schließen erhalten. Teile sind die reinen Zeichnungen (Kopf ohne Form). */
export interface AvatarDraft {
  step: number;
  shape: HeadShape;
  headColor: string;
  drawings: FigureParts;
}

export function emptyDraft(): AvatarDraft {
  return { step: 0, shape: 'circle', headColor: '#f2c9a0', drawings: {} };
}
