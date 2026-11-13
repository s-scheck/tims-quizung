import { FACE_AUTO_INTERVAL_MS, FACE_AUTO_STEP, FACE_COLS_MAX, FACE_COLS_MIN, FACE_LEVEL_MAX, FACE_POINTS, isValidGuess, matchPersonName, type ClientMsg, type FaceEffectState } from '@quiz/shared';
import type { Category, Face } from '@quiz/content';
import type { Room } from '../../rooms/room.ts';
import type { FacesRound } from '../../rooms/state.ts';
import { fail, OK, type Result } from '../../rooms/result.ts';
import type { StartRoundOptions } from '../registry.ts';
import { copiesWithJoker, JOKER_LOCKED, mirrorEntry, rankWithJoker, roundClosed, syncJoker, type JokerHooks } from '../joker.ts';
import { baseRound, buildTurnOrder, rememberTarget, scheduleRoundTimer, toReveal } from '../common.ts';

/** Mehr Versuche braucht niemand, das bremst höchstens Spam. */
export const MAX_ATTEMPTS = 50;
/** Kachelindizes dürfen über die Spaltenzahl hinaus Zeilen füllen, mehr als 64 Zeilen gibt es nie. */
const MAX_ROWS = 64;

export function facesRound(room: Room): FacesRound | null {
  return room.round?.game === 'faces' ? room.round : null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Der Host prüft immer selbst, deshalb darf er die Person auch wählen, wenn er laut Lobby mitspielt. */
function pickFace(room: Room, categoryId: string, faces: readonly Face[], targetId: string | undefined): Face | null {
  if (targetId) return faces.find((f) => f.id === targetId) ?? null;
  const played = room.playedTargets[categoryId] ?? [];
  const fresh = faces.filter((f) => !played.includes(f.id));
  const pool = fresh.length > 0 ? fresh : faces;
  return pool[Math.floor(room.random() * pool.length)] ?? null;
}

export function startFacesRound(room: Room, category: Category | null, opts: StartRoundOptions): Result {
  if (!category || category.kind !== 'faces') return fail('unknown_category', 'Diese Kategorie passt nicht zum Spiel');
  const auto = opts.faceAuto === true;
  // Im automatischen Modus kennt niemand die Antwort, also wird zufällig gewählt.
  const target = pickFace(room, category.id, category.faces, auto ? undefined : opts.targetId);
  if (!target) return fail('unknown_category', 'Person unbekannt');
  let turnOrder = buildTurnOrder(room);
  if (auto) {
    // Der Server prüft, also rät der Host mit, auch wenn er laut Lobby moderiert.
    if (room.hostId !== null && !turnOrder.includes(room.hostId)) turnOrder = [...turnOrder, room.hostId];
  } else {
    // Der Host kennt die Antwort und prüft jeden Tipp, also rät er nie mit.
    turnOrder = turnOrder.filter((id) => id !== room.hostId);
    if (turnOrder.length === 0) return fail('invalid_action', 'Wer ist das? braucht mindestens einen Mitspieler außer dem Host');
  }
  rememberTarget(room, category.id, target.id);

  const effect: FaceEffectState = {
    effect: opts.effect ?? 'blur',
    level: auto ? FACE_LEVEL_MAX : clamp(Math.round(opts.level ?? 80), 0, FACE_LEVEL_MAX),
    cols: clamp(Math.round(opts.cols ?? 6), FACE_COLS_MIN, FACE_COLS_MAX),
    revealed: [],
  };

  room.round = {
    ...baseRound(category, turnOrder),
    activePlayerId: null,
    soloMode: false,
    game: 'faces',
    category,
    target,
    startedAt: room.now,
    effect,
    attempts: {},
    solved: {},
    auto: auto ? { seed: Math.floor(room.random() * 2 ** 32), nextStepAt: null } : null,
  };
  room.phase = 'playing';
  scheduleRoundTimer(room, () => toReveal(room));
  scheduleAutoStep(room);
  return OK;
}

/** Nächste Stufe im automatischen Modus: alle 10 s wird der Effekt um 10 schwächer, bis das Bild klar ist. */
function scheduleAutoStep(room: Room): void {
  const round = facesRound(room);
  if (!round?.auto || room.phase !== 'playing') return;
  if (round.effect.level <= 0) {
    round.auto.nextStepAt = null;
    return;
  }
  round.auto.nextStepAt = room.now + FACE_AUTO_INTERVAL_MS;
  room.timers.placement = room.scheduler.schedule(FACE_AUTO_INTERVAL_MS, () => {
    room.timers.placement = null;
    if (room.phase !== 'playing' || room.round !== round) return;
    round.effect.level = Math.max(0, round.effect.level - FACE_AUTO_STEP);
    scheduleAutoStep(room);
    room.emit();
  });
}

/** Fertig ist, wer richtig lag oder per Joker kopiert. */
function everyoneSolved(round: FacesRound): boolean {
  return round.turnOrder.every((id) => round.solved[id] !== undefined || copiesWithJoker(round, id));
}

export function handleFacesMessage(room: Room, playerId: string, msg: ClientMsg): Result {
  switch (msg.type) {
    case 'face_guess':
      return guess(room, playerId, msg.text);
    case 'face_judge':
      return judge(room, playerId, msg.playerId, msg.index, msg.correct);
    case 'face_effect':
      return setEffect(room, playerId, msg.level, msg.cols, msg.revealed);
    case 'end_round':
      return endRound(room, playerId);
    default:
      return fail('invalid_action', 'Unbekannte Spielaktion');
  }
}

function guess(room: Room, playerId: string, text: string): Result {
  const round = facesRound(room);
  if (room.phase !== 'playing' || !round) return fail('invalid_action', 'Gerade wird nicht gespielt');
  if (!round.turnOrder.includes(playerId)) return fail('not_allowed', 'Du bist in dieser Runde nicht dabei');
  if (copiesWithJoker(round, playerId)) return fail('invalid_action', JOKER_LOCKED);
  if (round.solved[playerId] !== undefined) return fail('invalid_action', 'Du hast es schon');
  const trimmed = text.trim();
  if (!isValidGuess(trimmed)) return fail('bad_message', 'Tipp muss 1 bis 60 Zeichen haben');
  const list = (round.attempts[playerId] ??= []);
  if (list.length >= MAX_ATTEMPTS) return fail('invalid_action', 'Genug geraten für diese Runde');
  if (!round.auto) {
    list.push({ text: trimmed, at: room.now, status: 'judging' });
    return OK;
  }
  const correct = matchPersonName(trimmed, round.target.name, round.target.aliases);
  list.push({ text: trimmed, at: room.now, status: correct ? 'correct' : 'wrong' });
  if (correct) {
    round.solved[playerId] = room.now;
    if (everyoneSolved(round)) toReveal(room);
  }
  return OK;
}

function judge(room: Room, playerId: string, targetId: string, index: number, correct: boolean): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host prüft Tipps');
  const round = facesRound(room);
  if (round?.auto) return correctAuto(room, round, targetId, index, correct);
  if (room.phase !== 'playing' || !round) return fail('invalid_action', 'Gerade wird nicht gespielt');
  const attempt = round.attempts[targetId]?.[index];
  if (!attempt) return fail('invalid_action', 'Diesen Versuch gibt es nicht');
  if (attempt.status !== 'judging') return fail('invalid_action', 'Dieser Versuch ist schon geprüft');
  attempt.status = correct ? 'correct' : 'wrong';
  if (correct && round.solved[targetId] === undefined) round.solved[targetId] = attempt.at;
  return OK;
}

/**
 * Automatischer Modus: Der Host korrigiert in der Auflösung, was der Server falsch eingeschätzt hat.
 * Gewertet wird danach der früheste richtige Versuch.
 */
function correctAuto(room: Room, round: FacesRound, targetId: string, index: number, correct: boolean): Result {
  if (room.phase !== 'reveal') return fail('invalid_action', 'Korrigieren geht erst in der Auflösung');
  if (round.joker?.by === targetId) return fail('invalid_action', 'Wer per Joker kopiert, übernimmt die Wertung der anderen Person');
  const list = round.attempts[targetId];
  const attempt = list?.[index];
  if (!list || !attempt) return fail('invalid_action', 'Diesen Versuch gibt es nicht');
  attempt.status = correct ? 'correct' : 'wrong';
  const first = list.find((a) => a.status === 'correct');
  if (first) round.solved[targetId] = first.at;
  else delete round.solved[targetId];
  syncJoker(room);
  return OK;
}

function setEffect(room: Room, playerId: string, level?: number, cols?: number, revealed?: number[]): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host steuert den Effekt');
  const round = facesRound(room);
  if (room.phase !== 'playing' || !round) return fail('invalid_action', 'Gerade wird nicht gespielt');
  if (round.auto) return fail('invalid_action', 'Im automatischen Modus wird das Bild von selbst schärfer');
  const e = round.effect;
  if (e.effect === 'tiles') {
    if (level !== undefined) return fail('invalid_action', 'Kacheln haben keine Stärke');
    if (cols !== undefined) {
      if (e.revealed.length > 0) return fail('invalid_action', 'Die Kachelgröße steht fest, sobald etwas aufgedeckt ist');
      e.cols = clamp(Math.round(cols), FACE_COLS_MIN, FACE_COLS_MAX);
    }
    if (revealed !== undefined) {
      const limit = e.cols * MAX_ROWS;
      const merged = new Set([...e.revealed, ...revealed.filter((i) => Number.isInteger(i) && i >= 0 && i < limit)]);
      e.revealed = [...merged].sort((a, b) => a - b);
    }
    return OK;
  }
  if (cols !== undefined || revealed !== undefined) return fail('invalid_action', 'Dieser Effekt hat keine Kacheln');
  if (level === undefined) return fail('bad_message', 'Stärke fehlt');
  e.level = clamp(Math.round(level), 0, FACE_LEVEL_MAX);
  return OK;
}

function endRound(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host löst auf');
  if (room.phase !== 'playing' || !facesRound(room)) return fail('invalid_action', 'Gerade läuft keine Runde');
  toReveal(room);
  return OK;
}

/** Richtige nach Versuchszeit, bei Gleichstand nach Reihenfolge im Raum. Der Joker-Spieler teilt den Platz der kopierten Person. */
export function facesRanking(round: FacesRound): { playerId: string; at: number; rank: number }[] {
  const sorted = Object.entries(round.solved)
    .filter(([id]) => round.turnOrder.includes(id))
    .sort((a, b) => a[1] - b[1] || round.turnOrder.indexOf(a[0]) - round.turnOrder.indexOf(b[0]))
    .map(([playerId, at]) => ({ playerId, at }));
  return rankWithJoker(sorted, (row) => row.playerId, round.joker);
}

/** Spielpunkte 3/2/1 für die ersten drei Richtigen. */
export function facesPoints(round: FacesRound): Record<string, number> {
  const points: Record<string, number> = Object.fromEntries(round.turnOrder.map((id) => [id, 0]));
  for (const entry of facesRanking(round)) points[entry.playerId] = FACE_POINTS[entry.rank - 1] ?? 0;
  return points;
}

// --------------------------------------------------------- Modul-Hooks

export function onPlayerRemoved(room: Room, playerId: string): void {
  const round = facesRound(room);
  if (!round) return;
  delete round.attempts[playerId];
  delete round.solved[playerId];
}

/** Joker: erlaubt, solange man nicht richtig lag, eigene Tipps verfallen. Gespiegelt wird ab der Auflösung. */
export const facesJoker: JokerHooks = {
  blocked: (room, playerId) => (facesRound(room)?.solved[playerId] !== undefined ? 'Du hast es schon' : null),
  apply: (room, playerId) => {
    const round = facesRound(room);
    if (round) delete round.attempts[playerId];
  },
  sync: (room, joker) => {
    const round = facesRound(room);
    if (!round || !roundClosed(room)) return;
    mirrorEntry(round.attempts, joker);
    mirrorEntry(round.solved, joker);
  },
};
