import { isValidGuess, THINK_SECONDS_DEFAULT, THINK_SECONDS_MAX, THINK_SECONDS_MIN, type ClientMsg } from '@quiz/shared';
import type { Category } from '@quiz/content';
import type { Room } from '../../rooms/room.ts';
import type { StillsRound } from '../../rooms/state.ts';
import { fail, OK, type Result } from '../../rooms/result.ts';
import type { StartRoundOptions } from '../registry.ts';
import { baseRound, buildTurnOrder, removePlayerFromRound, toReveal } from '../common.ts';

export function stillsRound(room: Room): StillsRound | null {
  return room.round?.game === 'stills' ? room.round : null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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
    thinkSeconds: clamp(Math.round(opts.thinkSeconds ?? THINK_SECONDS_DEFAULT), THINK_SECONDS_MIN, THINK_SECONDS_MAX),
    stage: 0,
    stagePhase: 'guessing',
    guesses: {},
    buzz: null,
    locked: [],
    wrongBuzzes: [],
    buzzWinner: null,
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
    case 'end_round':
      return endRound(room, playerId);
    default:
      return fail('invalid_action', 'Unbekannte Spielaktion');
  }
}

// ------------------------------------------------------------- Auswertung

const lastStage = (r: StillsRound) => r.category.stills.length - 1;

/** Tipps zu einem Foto, je Spieler höchstens einer. */
export function stageGuesses(r: StillsRound, stage: number): { playerId: string; index: number }[] {
  return r.turnOrder.flatMap((playerId) => {
    const index = (r.guesses[playerId] ?? []).findIndex((g) => g.stage === stage);
    return index >= 0 ? [{ playerId, index }] : [];
  });
}

function stageJudged(r: StillsRound, stage: number): boolean {
  return stageGuesses(r, stage).every(({ playerId, index }) => r.guesses[playerId]![index]!.status !== 'judging');
}

/**
 * Gelöst: beim Tippen das erste fertig geprüfte Foto mit Treffern, alle Treffer gewinnen;
 * beim Buzzern der Erste mit richtiger Antwort.
 */
export function stillsSolved(r: StillsRound): { stage: number; winners: string[] } | null {
  if (r.mode === 'buzz') return r.buzzWinner ? { stage: r.buzzWinner.stage, winners: [r.buzzWinner.playerId] } : null;
  for (let stage = 0; stage <= r.stage; stage++) {
    if (r.stage === stage && r.stagePhase === 'guessing') return null;
    const winners = stageGuesses(r, stage)
      .filter(({ playerId, index }) => r.guesses[playerId]![index]!.status === 'correct')
      .map(({ playerId }) => playerId);
    if (winners.length > 0 && stageJudged(r, stage)) return { stage, winners };
  }
  return null;
}

/** Raten vorbei: gelöst oder das letzte Foto ist ohne Treffer durch. */
export function stillsOver(r: StillsRound): boolean {
  if (stillsSolved(r)) return true;
  if (r.stage < lastStage(r)) return false;
  if (r.mode === 'type') return r.stagePhase === 'judging' && stageJudged(r, r.stage);
  return r.buzz === null && r.turnOrder.every((id) => r.locked.includes(id));
}

/** Etappenpunkte je Spieler, Vorbelegung der Wertung. */
export function stillsAwarded(r: StillsRound): Record<string, number> {
  const awarded: Record<string, number> = Object.fromEntries(r.turnOrder.map((id) => [id, 0]));
  const solved = stillsSolved(r);
  if (solved) for (const id of solved.winners) awarded[id] = r.category.stills[solved.stage]!.points;
  return awarded;
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
  if (r.stagePhase !== 'guessing') return fail('invalid_action', 'Die Tipps zu diesem Foto sind geschlossen');
  const list = (r.guesses[playerId] ??= []);
  if (list.some((g) => g.stage === r.stage)) return fail('invalid_action', 'Du hast zu diesem Foto schon getippt');
  const trimmed = text.trim();
  if (!isValidGuess(trimmed)) return fail('bad_message', 'Tipp muss 1 bis 60 Zeichen haben');
  list.push({ stage: r.stage, text: trimmed, at: room.now, status: 'judging' });
  return OK;
}

function close(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host schließt die Tipps');
  const r = playing(room);
  if (!r) return fail('invalid_action', 'Gerade wird nicht gespielt');
  if (r.mode !== 'type') return fail('invalid_action', 'In dieser Runde wird gebuzzert');
  if (stillsOver(r)) return fail('invalid_action', 'Das Raten ist vorbei');
  if (r.stagePhase !== 'guessing') return fail('invalid_action', 'Die Tipps sind schon geschlossen');
  r.stagePhase = 'judging';
  return OK;
}

/** Urteile zum aktuellen Foto lassen sich ändern, bis der Host weiterschaltet. */
function judge(room: Room, playerId: string, targetId: string, correct: boolean): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host prüft Tipps');
  const r = playing(room);
  if (!r) return fail('invalid_action', 'Gerade wird nicht gespielt');
  if (r.mode !== 'type') return fail('invalid_action', 'In dieser Runde wird gebuzzert');
  if (r.stagePhase !== 'judging') return fail('invalid_action', 'Erst die Tipps schließen');
  const g = (r.guesses[targetId] ?? []).find((x) => x.stage === r.stage);
  if (!g) return fail('invalid_action', 'Zu diesem Foto gibt es keinen Tipp');
  const solved = stillsSolved(r);
  if (solved && solved.stage < r.stage) return fail('invalid_action', 'Das Raten ist vorbei');
  g.status = correct ? 'correct' : 'wrong';
  return OK;
}

function buzz(room: Room, playerId: string): Result {
  const r = playing(room);
  if (!r) return fail('invalid_action', 'Gerade wird nicht gespielt');
  if (r.mode !== 'buzz') return fail('invalid_action', 'In dieser Runde wird getippt');
  if (!r.turnOrder.includes(playerId)) return fail('not_allowed', 'Du bist in dieser Runde nicht dabei');
  if (stillsOver(r)) return fail('invalid_action', 'Das Raten ist vorbei');
  if (r.buzz) return fail('invalid_action', r.buzz.playerId === playerId ? 'Du bist schon dran' : 'Jemand anderes ist schneller');
  if (r.locked.includes(playerId)) return fail('invalid_action', 'Du bist für dieses Foto gesperrt');
  r.buzz = { playerId, at: room.now, deadline: room.now + r.thinkSeconds * 1000 };
  return OK;
}

/** Die Bedenkzeit ist nur eine Anzeige: Der Host urteilt auch danach noch. */
function verdict(room: Room, playerId: string, correct: boolean): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host urteilt');
  const r = playing(room);
  if (!r) return fail('invalid_action', 'Gerade wird nicht gespielt');
  if (!r.buzz) return fail('invalid_action', 'Gerade hat niemand gebuzzert');
  const by = r.buzz.playerId;
  r.buzz = null;
  if (correct) {
    r.buzzWinner = { playerId: by, stage: r.stage };
  } else {
    r.locked.push(by);
    r.wrongBuzzes.push({ playerId: by, stage: r.stage });
  }
  return OK;
}

/** Nächstes Foto: beim Tippen erst, wenn alles geprüft ist, beim Buzzern nicht während einer Antwort. Nach dem Lösen nur noch zum Ansehen. */
function next(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host schaltet weiter');
  const r = playing(room);
  if (!r) return fail('invalid_action', 'Gerade wird nicht gespielt');
  if (r.stage >= lastStage(r)) return fail('invalid_action', 'Das war das letzte Foto');
  if (!stillsOver(r)) {
    if (r.mode === 'type' && r.stagePhase !== 'judging') return fail('invalid_action', 'Erst die Tipps schließen');
    if (r.mode === 'type' && !stageJudged(r, r.stage)) return fail('invalid_action', 'Erst alle Tipps prüfen');
    if (r.mode === 'buzz' && r.buzz) return fail('invalid_action', 'Erst die Antwort bewerten');
    r.stagePhase = 'guessing';
    r.locked = [];
  }
  r.stage += 1;
  return OK;
}

function endRound(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host löst auf');
  const r = playing(room);
  if (!r) return fail('invalid_action', 'Gerade läuft keine Runde');
  r.buzz = null;
  toReveal(room);
  return OK;
}

// --------------------------------------------------------- Modul-Hooks

export function onPlayerRemoved(room: Room, playerId: string): void {
  const r = stillsRound(room);
  if (!r) return;
  delete r.guesses[playerId];
  r.locked = r.locked.filter((id) => id !== playerId);
  r.wrongBuzzes = r.wrongBuzzes.filter((w) => w.playerId !== playerId);
  if (r.buzz?.playerId === playerId) r.buzz = null;
  if (r.buzzWinner?.playerId === playerId) r.buzzWinner = null;
}

/** Der neue Host prüft ab jetzt: Er fliegt aus der Reihenfolge, seine Tipps verfallen. */
export function onHostChanged(room: Room): void {
  const r = stillsRound(room);
  const host = room.hostId;
  if (!r || host === null || !r.turnOrder.includes(host)) return;
  removePlayerFromRound(room, host);
}
