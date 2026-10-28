import type { PictureFieldView, PictureResultView, PictureRoundView, RoundView } from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import type { PictureRound } from '../../rooms/state.ts';
import { pictureRound } from './reducer.ts';

/** Dateinamen aus der Bildablage werden unter /images ausgeliefert, Adressen bleiben wie sie sind. */
export function imageUrl(ref: string): string {
  return /^https?:\/\//.test(ref) ? ref : `/images/${ref}`;
}

/**
 * Sicht auf die Runde. Antworten offener Felder sieht nur der Host (`privileged`) oder alle ab der Auflösung.
 * Reihum sehen alle Nummer und Text eines Tipps sofort. Bei „Alle gleichzeitig“ sieht jeder nur seine eigenen Texte,
 * ab der Auflösung die Antworten aller zu den Feldern, die der Host schon aufgerufen hat.
 */
export function pictureRoundView(room: Room, revealed: boolean, viewerId: string | null): RoundView | null {
  const r = pictureRound(room);
  if (!r) return null;
  const privileged = viewerId !== null && viewerId === room.hostId;
  const all = r.mode === 'all';
  const showAll = revealed || privileged;
  const { fields: _fields, games: _games, kind: _kind, image, original, ...category } = r.category;

  const fields: PictureFieldView[] = r.category.fields.map((f, i) => {
    const by = r.solved[f.id];
    const solved = by !== undefined;
    const answerVisible = all ? privileged || (revealed && i < r.judgeShown) : solved || showAll;
    return {
      id: f.id,
      number: i + 1,
      x: f.x,
      y: f.y,
      w: f.w,
      h: f.h,
      solved,
      ...(solved ? { solvedBy: by } : {}),
      ...(answerVisible ? { answer: f.answer } : {}),
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
    mode: r.mode,
    ...(all ? allModeView(r, revealed, viewerId) : {}),
  };
}

function allModeView(r: PictureRound, revealed: boolean, viewerId: string | null): Partial<PictureRoundView> {
  const progress = Object.fromEntries(
    r.turnOrder.map((id) => [id, { filled: Object.keys(r.answers[id] ?? {}).length, doneAt: r.doneAt[id] ?? null }]),
  );
  const out: Partial<PictureRoundView> = { startedAt: r.startedAt, progress };
  if (viewerId !== null && r.turnOrder.includes(viewerId)) out.myAnswers = { ...(r.answers[viewerId] ?? {}) };
  if (!revealed) return out;

  const called = r.category.fields.slice(0, r.judgeShown);
  const answers: Record<string, Record<string, string>> = {};
  const verdicts: Record<string, Record<string, boolean>> = {};
  for (const id of r.turnOrder) {
    answers[id] = {};
    verdicts[id] = {};
    for (const f of called) {
      const text = r.answers[id]?.[f.id];
      if (text) answers[id]![f.id] = text;
      verdicts[id]![f.id] = r.verdicts[id]?.[f.id] ?? false;
    }
  }
  out.answers = answers;
  out.verdicts = verdicts;
  out.judge = { index: r.judgeIndex, shown: r.judgeShown, complete: r.judgeShown >= r.category.fields.length };
  out.results = pictureResults(r);
  return out;
}

/** Rangfolge über die aufgerufenen Felder: Treffer absteigend, dann frühere Fertig-Zeit, nicht Fertige zuletzt. */
export function pictureResults(r: PictureRound): PictureResultView[] {
  const called = r.category.fields.slice(0, r.judgeShown);
  const time = (id: string) => r.doneAt[id] ?? Number.MAX_SAFE_INTEGER;
  return r.turnOrder
    .map((id) => ({ playerId: id, hits: called.filter((f) => r.verdicts[id]?.[f.id] === true).length, doneAt: r.doneAt[id] ?? null }))
    .sort((a, b) => b.hits - a.hits || time(a.playerId) - time(b.playerId));
}
