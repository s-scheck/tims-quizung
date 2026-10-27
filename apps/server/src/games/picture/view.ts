import type { PictureFieldView, RoundView } from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import { pictureRound } from './reducer.ts';

/** Dateinamen aus der Bildablage werden unter /images ausgeliefert, Adressen bleiben wie sie sind. */
export function imageUrl(ref: string): string {
  return /^https?:\/\//.test(ref) ? ref : `/images/${ref}`;
}

/**
 * Sicht auf die Runde. Antworten offener Felder sieht nur der Host (`privileged`) oder alle ab der Auflösung.
 * Nummer und Text eines Tipps sehen alle sofort.
 */
export function pictureRoundView(room: Room, revealed: boolean, viewerId: string | null): RoundView | null {
  const r = pictureRound(room);
  if (!r) return null;
  const privileged = viewerId !== null && viewerId === room.hostId;
  const showAll = revealed || privileged;
  const { fields: _fields, games: _games, kind: _kind, image, original, ...category } = r.category;

  const fields: PictureFieldView[] = r.category.fields.map((f, i) => {
    const by = r.solved[f.id];
    const solved = by !== undefined;
    return {
      id: f.id,
      number: i + 1,
      x: f.x,
      y: f.y,
      w: f.w,
      h: f.h,
      solved,
      ...(solved ? { solvedBy: by } : {}),
      ...(solved || showAll ? { answer: f.answer } : {}),
    };
  });

  const g = r.guess;
  return {
    game: 'picture',
    category,
    image: imageUrl(image),
    ...(original ? { original: imageUrl(original) } : {}),
    turnOrder: [...r.turnOrder],
    turnNo: r.turnNo,
    activePlayerId: r.activePlayerId,
    eliminated: [...r.eliminated],
    turnDeadline: r.turnDeadline,
    soloMode: r.soloMode,
    fields,
    lives: { ...r.lives },
    maxLives: r.maxLives,
    hits: { ...r.hits },
    wrongGuesses: r.wrongGuesses.map((w) => ({ ...w })),
    guess: g ? { ...g } : null,
    ...(privileged ? { privileged: true } : {}),
  };
}
