import { isThinkSeconds, isValidGuess, THINK_SECONDS_DEFAULT, type ClientMsg, type StillsResultView } from '@quiz/shared';
import type { Category } from '@quiz/content';
import type { Room } from '../../rooms/room.ts';
import type { StillAttempt, StillsRound } from '../../rooms/state.ts';
import { fail, OK, type Result } from '../../rooms/result.ts';
import type { StartRoundOptions } from '../registry.ts';
import { baseRound, buildTurnOrder, toReveal } from '../common.ts';

/** Anzeigename des Spiels; Spieler sehen ihn statt des Kategorie-Titels, bis der Film aufgelöst ist. */
export const STILLS_NAME = 'Filmfotos';

export function stillsRound(room: Room): StillsRound | null {
  return room.round?.game === 'stills' ? room.round : null;
}

export function startStillsRound(room: Room, category: Category | null, opts: StartRoundOptions): Result {
  if (!category || category.kind !== 'stills') return fail('unknown_category', 'Diese Kategorie passt nicht zum Spiel');
  // Der Host kennt den Film und prüft jeden Tipp, also rät er nie mit.
  const turnOrder = buildTurnOrder(room).filter((id) => id !== room.hostId);
  if (turnOrder.length === 0) return fail('invalid_action', 'Filmfotos braucht mindestens einen Mitspieler außer dem Host');

  room.round = {
    ...baseRound(category, turnOrder),
    activePlayerId: null,
    soloMode: false,
    game: 'stills',
    category,
    mode: opts.mode === 'buzz' ? 'buzz' : 'type',
    thinkSeconds: isThinkSeconds(opts.thinkSeconds) ? opts.thinkSeconds : THINK_SECONDS_DEFAULT,
    allGuess: opts.allGuess === true,
    index: 0,
    stage: 'guessing',
    attempts: {},
    passed: [],
    holder: null,
    used: [],
    buzzVerdicts: [],
  };
  room.phase = 'playing';
  return OK;
}

export function handleStillsMessage(room: Room, playerId: string, msg: ClientMsg): Result {
  switch (msg.type) {
    case 'still_guess':
      return guess(room, playerId, msg.text);
    case 'still_close':
      return close(room, playerId);
    case 'still_judge':
      return judge(room, playerId, msg.playerId, msg.correct);
    case 'still_buzz':
      return buzz(room, playerId);
    case 'still_verdict':
      return verdict(room, playerId, msg.correct);
    case 'still_next':
      return next(room, playerId);
    case 'still_pass':
      return pass(room, playerId, msg.pass);
    case 'end_round':
      return endRound(room, playerId);
    default:
      return fail('invalid_action', 'Unbekannte Spielaktion');
  }
}

// ------------------------------------------------------------- Auswertung

const lastIndex = (r: StillsRound) => r.category.stills.length - 1;

/** Tipps zu einem Foto, je Spieler höchstens einer. */
export function attemptsAt(r: StillsRound, index: number): { playerId: string; attempt: StillAttempt }[] {
  return r.turnOrder.flatMap((playerId) => {
    const attempt = (r.attempts[playerId] ?? []).find((a) => a.index === index);
    return attempt ? [{ playerId, attempt }] : [];
  });
}

function judgedAt(r: StillsRound, index: number): boolean {
  return attemptsAt(r, index).every(({ attempt }) => attempt.status !== 'judging');
}

/**
 * Gelöst: beim Tippen das erste fertig geprüfte Foto mit Treffern, alle Treffer gewinnen;
 * beim Buzzern der Erste mit richtiger Antwort. Mit `allGuess` gibt es kein gemeinsames Lösen, dort zählen `stillsResults`.
 */
export function stillsSolved(r: StillsRound): { index: number; winners: string[] } | null {
  if (r.allGuess) return null;
  if (r.mode === 'buzz') {
    const hit = r.buzzVerdicts.find((v) => v.correct);
    return hit ? { index: hit.index, winners: [hit.playerId] } : null;
  }
  for (let index = 0; index <= r.index; index++) {
    if (r.index === index && r.stage === 'guessing') return null;
    const winners = attemptsAt(r, index)
      .filter(({ attempt }) => attempt.status === 'correct')
      .map(({ playerId }) => playerId);
    if (winners.length > 0 && judgedAt(r, index)) return { index, winners };
  }
  return null;
}

/**
 * Mit `allGuess`: alle, die ihren einen Versuch im Film verbraucht haben und schon ein Urteil haben, Treffer vor Fehlern, je nach Foto.
 * Beim Tippen zählen auch Urteile zum aktuellen Foto, die der Host bis zum Weiterschalten noch ändern kann.
 */
export function stillsResults(r: StillsRound): StillsResultView[] {
  if (!r.allGuess) return [];
  const list: StillsResultView[] =
    r.mode === 'buzz'
      ? r.buzzVerdicts.map((v) => ({ ...v }))
      : r.turnOrder.flatMap((playerId) => {
          const a = r.attempts[playerId]?.[0];
          return a && a.status !== 'judging' ? [{ playerId, index: a.index, correct: a.status === 'correct' }] : [];
        });
  return list.sort((a, b) => Number(b.correct) - Number(a.correct) || a.index - b.index);
}

/** Mit `allGuess`: Der Spieler hat seinen einen Versuch im Film verbraucht (beim Tippen auch, wenn das Urteil noch aussteht). */
export function stillsFinished(r: StillsRound, playerId: string): boolean {
  if (r.mode === 'type') return (r.attempts[playerId]?.length ?? 0) > 0;
  return r.buzzVerdicts.some((v) => v.playerId === playerId);
}

/** Raten vorbei: gelöst oder das letzte Foto ist ohne Treffer durch. Mit `allGuess`: alle haben ein Urteil oder das letzte Foto ist durch. */
export function stillsOver(r: StillsRound): boolean {
  if (r.allGuess) {
    if (r.mode === 'buzz') return r.holder === null && r.turnOrder.every((id) => stillsFinished(r, id));
    if (r.turnOrder.every((id) => (r.attempts[id] ?? []).some((a) => a.status !== 'judging'))) return true;
    return r.index >= lastIndex(r) && r.stage === 'judging' && judgedAt(r, r.index);
  }
  if (stillsSolved(r)) return true;
  if (r.index < lastIndex(r)) return false;
  if (r.mode === 'type') return r.stage === 'judging' && judgedAt(r, r.index);
  return r.holder === null && r.turnOrder.every((id) => r.used.includes(id));
}

/** Spielpunkte je Spieler aus dem Foto des Treffers, Vorbelegung der Wertung. */
export function stillsPoints(r: StillsRound): Record<string, number> {
  const points: Record<string, number> = Object.fromEntries(r.turnOrder.map((id) => [id, 0]));
  if (r.allGuess) {
    for (const x of stillsResults(r)) if (x.correct) points[x.playerId] = r.category.stills[x.index]!.points;
    return points;
  }
  const solved = stillsSolved(r);
  if (solved) for (const id of solved.winners) points[id] = r.category.stills[solved.index]!.points;
  return points;
}

// ---------------------------------------------------------------- Aktionen

function playing(room: Room): StillsRound | null {
  const round = stillsRound(room);
  return room.phase === 'playing' ? round : null;
}

function guess(room: Room, playerId: string, text: string): Result {
  const r = playing(room);
  if (!r) return fail('invalid_action', 'Gerade wird nicht gespielt');
  if (r.mode !== 'type') return fail('invalid_action', 'In dieser Runde wird gebuzzert');
  if (!r.turnOrder.includes(playerId)) return fail('not_allowed', 'Du bist in dieser Runde nicht dabei');
  if (stillsOver(r)) return fail('invalid_action', 'Das Raten ist vorbei');
  if (r.stage !== 'guessing') return fail('invalid_action', 'Die Tipps zu diesem Foto sind geschlossen');
  const list = (r.attempts[playerId] ??= []);
  if (r.allGuess && list.length > 0) return fail('invalid_action', 'Du hast für diesen Film schon getippt');
  if (list.some((a) => a.index === r.index)) return fail('invalid_action', 'Du hast zu diesem Foto schon getippt');
  const trimmed = text.trim();
  if (!isValidGuess(trimmed)) return fail('bad_message', 'Tipp muss 1 bis 60 Zeichen haben');
  list.push({ index: r.index, text: trimmed, status: 'judging' });
  r.passed = r.passed.filter((id) => id !== playerId);
  return OK;
}

/** Passen hebt den Tipp fürs nächste Foto auf. Bis „Tipps schließen“ lässt es sich zurücknehmen. */
function pass(room: Room, playerId: string, on: boolean): Result {
  const r = playing(room);
  if (!r) return fail('invalid_action', 'Gerade wird nicht gespielt');
  if (r.mode !== 'type' || !r.allGuess) return fail('invalid_action', 'Passen gibt es nur beim Tippen, wenn alle bis zum Schluss raten');
  if (!r.turnOrder.includes(playerId)) return fail('not_allowed', 'Du bist in dieser Runde nicht dabei');
  if (stillsOver(r)) return fail('invalid_action', 'Das Raten ist vorbei');
  if (r.stage !== 'guessing') return fail('invalid_action', 'Die Tipps zu diesem Foto sind geschlossen');
  if (stillsFinished(r, playerId)) return fail('invalid_action', 'Du hast für diesen Film schon getippt');
  r.passed = r.passed.filter((id) => id !== playerId);
  if (on) r.passed.push(playerId);
  return OK;
}

function close(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host schließt die Tipps');
  const r = playing(room);
  if (!r) return fail('invalid_action', 'Gerade wird nicht gespielt');
  if (r.mode !== 'type') return fail('invalid_action', 'In dieser Runde wird gebuzzert');
  if (stillsOver(r)) return fail('invalid_action', 'Das Raten ist vorbei');
  if (r.stage !== 'guessing') return fail('invalid_action', 'Die Tipps sind schon geschlossen');
  r.stage = 'judging';
  return OK;
}

/** Urteile zum aktuellen Foto lassen sich ändern, bis der Host weiterschaltet. */
function judge(room: Room, playerId: string, targetId: string, correct: boolean): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host prüft Tipps');
  const r = playing(room);
  if (!r) return fail('invalid_action', 'Gerade wird nicht gespielt');
  if (r.mode !== 'type') return fail('invalid_action', 'In dieser Runde wird gebuzzert');
  if (r.stage !== 'judging') return fail('invalid_action', 'Erst die Tipps schließen');
  const attempt = (r.attempts[targetId] ?? []).find((a) => a.index === r.index);
  if (!attempt) return fail('invalid_action', 'Zu diesem Foto gibt es keinen Tipp');
  // Mit `allGuess` gibt es kein gemeinsames Lösen, sonst sind Urteile nach einem früher gelösten Foto zu.
  const solved = stillsSolved(r);
  if (solved && solved.index < r.index) return fail('invalid_action', 'Das Raten ist vorbei');
  attempt.status = correct ? 'correct' : 'wrong';
  return OK;
}

function buzz(room: Room, playerId: string): Result {
  const r = playing(room);
  if (!r) return fail('invalid_action', 'Gerade wird nicht gespielt');
  if (r.mode !== 'buzz') return fail('invalid_action', 'In dieser Runde wird getippt');
  if (!r.turnOrder.includes(playerId)) return fail('not_allowed', 'Du bist in dieser Runde nicht dabei');
  if (stillsOver(r)) return fail('invalid_action', 'Das Raten ist vorbei');
  if (r.holder !== null) return fail('invalid_action', r.holder === playerId ? 'Du bist schon dran' : 'Jemand anderes ist schneller');
  if (r.allGuess && stillsFinished(r, playerId)) {
    return fail('invalid_action', r.used.includes(playerId) ? 'Du bist für diesen Film gesperrt' : 'Du hast den Film schon erkannt');
  }
  if (r.used.includes(playerId)) return fail('invalid_action', 'Du bist für dieses Foto gesperrt');
  r.holder = playerId;
  // Nur eine Anzeige: Kein Timer löst sie aus, der Host urteilt auch danach noch.
  r.turnDeadline = room.now + r.thinkSeconds * 1000;
  return OK;
}

function releaseBuzzer(r: StillsRound): void {
  r.holder = null;
  r.turnDeadline = null;
}

function verdict(room: Room, playerId: string, correct: boolean): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host urteilt');
  const r = playing(room);
  if (!r) return fail('invalid_action', 'Gerade wird nicht gespielt');
  const by = r.holder;
  if (by === null) return fail('invalid_action', 'Gerade hat niemand gebuzzert');
  releaseBuzzer(r);
  r.buzzVerdicts.push({ playerId: by, index: r.index, correct });
  if (!correct) r.used.push(by);
  return OK;
}

/**
 * Nächstes Foto: beim Tippen erst, wenn alles geprüft ist, beim Buzzern nicht während einer Antwort. Nach dem Lösen nur noch zum Ansehen.
 * Mit `allGuess` bleiben Fehlbuzzer für den ganzen Film gesperrt.
 */
function next(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host schaltet weiter');
  const r = playing(room);
  if (!r) return fail('invalid_action', 'Gerade wird nicht gespielt');
  if (r.index >= lastIndex(r)) return fail('invalid_action', 'Das war das letzte Foto');
  if (!stillsOver(r)) {
    if (r.mode === 'type' && r.stage !== 'judging') return fail('invalid_action', 'Erst die Tipps schließen');
    if (r.mode === 'type' && !judgedAt(r, r.index)) return fail('invalid_action', 'Erst alle Tipps prüfen');
    if (r.mode === 'buzz' && r.holder !== null) return fail('invalid_action', 'Erst die Antwort bewerten');
    r.stage = 'guessing';
    if (!r.allGuess) r.used = [];
  }
  r.passed = [];
  r.index += 1;
  return OK;
}

function endRound(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host löst auf');
  const r = playing(room);
  if (!r) return fail('invalid_action', 'Gerade läuft keine Runde');
  releaseBuzzer(r);
  toReveal(room);
  return OK;
}

// --------------------------------------------------------- Modul-Hooks

export function onPlayerRemoved(room: Room, playerId: string): void {
  const r = stillsRound(room);
  if (!r) return;
  delete r.attempts[playerId];
  r.passed = r.passed.filter((id) => id !== playerId);
  r.used = r.used.filter((id) => id !== playerId);
  r.buzzVerdicts = r.buzzVerdicts.filter((v) => v.playerId !== playerId);
  if (r.holder === playerId) releaseBuzzer(r);
}
