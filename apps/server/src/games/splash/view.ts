import { coverage, type RoundView, type SplashAnswerView, type SplashRoundView, type SplashStepView } from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import type { SplashRound } from '../../rooms/state.ts';
import { answerers, splashRound } from './reducer.ts';

/** Sichtbare Fläche je Spieler in Prozent, auf eine Nachkommastelle. */
export function coverageByPlayer(r: SplashRound): Record<string, number> {
  const byOwner = coverage(r.grid);
  return Object.fromEntries(r.owners.map((id, i) => [id, Math.round((byOwner[i + 1] ?? 0) * 10) / 10]));
}

/**
 * Sicht auf die Runde. Fremde Antworten bleiben bis zum Ende der Frage geheim, nur wer schon geantwortet hat ist
 * öffentlich. Lösung und Antworten sieht der moderierende Host sofort, alle anderen ab `done`. Die Prozente gibt es
 * erst in der Auflösung, die Flecken selbst sind von Anfang an sichtbar.
 */
export function splashRoundView(room: Room, revealed: boolean, viewerId: string | null): RoundView | null {
  const r = splashRound(room);
  if (!r) return null;
  const privileged = viewerId !== null && room.isModerator(viewerId);
  const { questions: _q, games: _g, kind: _k, ...category } = r.category;

  let step: SplashStepView | null = null;
  const s = r.step;
  if (s) {
    const open = privileged || s.stage === 'done' || revealed;
    const showAnswers = open || (privileged && s.stage === 'judging');
    const mine = viewerId ? s.answers[viewerId] : undefined;
    step = {
      no: s.no,
      stage: s.stage,
      question: s.question.q,
      ...(s.choices ? { choices: [...s.choices] } : {}),
      askedTo: s.askedTo,
      startedAt: s.startedAt,
      answered: answerers(r).filter((id) => s.answers[id]),
      ...(mine ? { myAnswer: { ...(mine.text !== undefined ? { text: mine.text } : {}), ...(mine.choice !== undefined ? { choice: mine.choice } : {}) } } : {}),
      ...(open ? { answer: s.question.answer, ...(s.correctChoice !== null ? { correctChoice: s.correctChoice } : {}) } : {}),
      ...(showAnswers
        ? {
            answers: Object.entries(s.answers).map(
              ([playerId, a]): SplashAnswerView => ({
                playerId,
                ...(a.text !== undefined ? { text: a.text } : {}),
                ...(a.choice !== undefined ? { choice: a.choice } : {}),
                correct: a.correct,
                ms: a.ms,
              }),
            ),
          }
        : {}),
      shooters: [...s.shooters],
      shotIndex: s.shotIndex,
      shot: s.shot ? { ...s.shot, wind: s.shot.wind ? { ...s.shot.wind } : null } : null,
      skipped: [...s.skipped],
    };
  }

  const view: SplashRoundView = {
    game: 'splash',
    category,
    turnOrder: [...r.turnOrder],
    turnNo: r.turnNo,
    activePlayerId: r.activePlayerId,
    eliminated: [],
    turnDeadline: r.turnDeadline,
    soloMode: false,
    options: { ...r.options },
    startedAt: r.startedAt,
    totalSteps: r.totalSteps,
    step,
    blobs: r.blobs.map((b) => ({ ...b, landing: { ...b.landing }, path: b.path.map((p) => ({ ...p })) })),
    ...(revealed ? { coverage: coverageByPlayer(r) } : {}),
    ...(privileged ? { privileged: true } : {}),
  };
  return view;
}
