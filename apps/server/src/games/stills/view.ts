import type { RoundView, StillAttemptView } from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import type { StillAttempt } from '../../rooms/state.ts';
import { suggestionFor } from '../common.ts';
import { imageUrl } from '../picture/view.ts';
import { attemptsAt, STILLS_NAME, stillsOver, stillsPoints, stillsRound, stillsSolved } from './reducer.ts';

/**
 * Sicht auf die Runde. Lösung, alle Fotos und die Tipps des aktuellen Fotos ab „Tipps schließen“ sieht nur der Host (`privileged`).
 * Spieler sehen die freigegebenen Fotos und ihre eigenen Tipps mit Urteil; Lösung und Gewinner, sobald das Raten vorbei ist.
 * Den Kategorie-Titel („Film 7“) sehen Spieler erst in der Auflösung.
 */
export function stillsRoundView(room: Room, revealed: boolean, viewerId: string | null): RoundView | null {
  const r = stillsRound(room);
  if (!r) return null;
  const privileged = viewerId !== null && viewerId === room.hostId;
  const over = stillsOver(r);
  const { stills, games: _games, kind: _kind, answer, aliases, ...category } = r.category;

  const toView = (a: StillAttempt, withSuggestion: boolean): StillAttemptView => ({
    index: a.index,
    text: a.text,
    status: a.status,
    ...(withSuggestion ? { suggested: suggestionFor(a.text, answer, aliases) } : {}),
  });

  const allImages = revealed || privileged;
  const view: RoundView = {
    game: 'stills',
    category: privileged || revealed ? category : { ...category, title: STILLS_NAME },
    turnOrder: [...r.turnOrder],
    turnNo: r.turnNo,
    activePlayerId: null,
    eliminated: [],
    turnDeadline: r.turnDeadline,
    soloMode: false,
    mode: r.mode,
    thinkSeconds: r.thinkSeconds,
    stagePoints: stills.map((s) => s.points),
    images: stills.slice(0, allImages ? stills.length : r.index + 1).map((s) => imageUrl(s.image)),
    index: r.index,
    stage: r.stage,
    solved: stillsSolved(r),
    over,
    points: stillsPoints(r),
  };
  if (r.mode === 'buzz') view.buzzer = { holder: r.holder, deadline: r.turnDeadline, used: [...r.used] };
  // Wer schon getippt hat, sehen Host und Screen, Spieler nur sich selbst.
  if (r.mode === 'type' && (privileged || viewerId === null)) view.typed = attemptsAt(r, r.index).map((a) => a.playerId);
  if (privileged || over || revealed) view.answer = answer;
  if (privileged) view.privileged = true;
  const mine = viewerId !== null ? r.attempts[viewerId] : undefined;
  if (mine) view.myAttempts = mine.map((a) => toView(a, false));
  if (revealed) {
    view.attempts = Object.fromEntries(r.turnOrder.map((id) => [id, (r.attempts[id] ?? []).map((a) => toView(a, false))]));
  } else if (privileged) {
    // Tipps zum laufenden Foto erst nach „Tipps schließen“, damit der Host nicht schon beim Eintippen mitliest.
    view.attempts = Object.fromEntries(
      r.turnOrder.map((id) => [id, (r.attempts[id] ?? []).filter((a) => a.index < r.index || r.stage === 'judging').map((a) => toView(a, true))]),
    );
  }
  return view;
}
