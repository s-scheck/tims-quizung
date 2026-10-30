import { matchGuess, type RoundView, type StillGuessView } from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import type { StillGuess } from '../../rooms/state.ts';
import { imageUrl } from '../picture/view.ts';
import { stageGuesses, stillsAwarded, stillsOver, stillsRound, stillsSolved } from './reducer.ts';

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
  const matchable = [{ rank: 1, name: answer, aliases: aliases ?? [] }];

  const toView = (g: StillGuess, withSuggestion: boolean): StillGuessView => ({
    stage: g.stage,
    text: g.text,
    status: g.status,
    ...(withSuggestion ? { suggested: matchGuess(g.text, matchable) !== null } : {}),
  });

  const allImages = revealed || privileged;
  const view: RoundView = {
    game: 'stills',
    category: privileged || revealed ? category : { ...category, title: 'Filmfotos' },
    turnOrder: [...r.turnOrder],
    turnNo: r.turnNo,
    activePlayerId: null,
    eliminated: [],
    turnDeadline: null,
    soloMode: false,
    mode: r.mode,
    thinkSeconds: r.thinkSeconds,
    points: stills.map((s) => s.points),
    images: stills.slice(0, allImages ? stills.length : r.stage + 1).map((s) => imageUrl(s.image)),
    stage: r.stage,
    stagePhase: r.stagePhase,
    buzz: r.buzz ? { playerId: r.buzz.playerId, deadline: r.buzz.deadline } : null,
    locked: [...r.locked],
    solved: stillsSolved(r),
    over,
    awarded: stillsAwarded(r),
  };
  // Wer schon getippt hat, sehen Host und Screen, Spieler nur sich selbst.
  if (r.mode === 'type' && (privileged || viewerId === null)) view.typed = stageGuesses(r, r.stage).map((g) => g.playerId);
  if (privileged || over || revealed) view.answer = answer;
  if (privileged) view.privileged = true;
  const mine = viewerId !== null ? r.guesses[viewerId] : undefined;
  if (mine) view.myGuesses = mine.map((g) => toView(g, false));
  if (revealed) {
    view.guesses = Object.fromEntries(r.turnOrder.map((id) => [id, (r.guesses[id] ?? []).map((g) => toView(g, false))]));
  } else if (privileged) {
    // Tipps zum laufenden Foto erst nach „Tipps schließen“, damit der Host nicht schon beim Eintippen mitliest.
    view.guesses = Object.fromEntries(
      r.turnOrder.map((id) => [
        id,
        (r.guesses[id] ?? []).filter((g) => g.stage < r.stage || r.stagePhase === 'judging').map((g) => toView(g, true)),
      ]),
    );
  }
  return view;
}
