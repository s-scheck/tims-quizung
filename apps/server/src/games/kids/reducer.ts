import {
  isValidGuess,
  KIDS_COUNT_DEFAULT,
  KIDS_POINTS,
  KIDS_THINK_DEFAULT,
  isKidsThink,
  type ClientMsg,
  type FaceSolvedView,
  type GuessMode,
  type KidsPenalty,
} from '@quiz/shared';
import type { Category, Face } from '@quiz/content';
import type { Room } from '../../rooms/room.ts';
import type { KidsItem, KidsRound } from '../../rooms/state.ts';
import { fail, OK, type Result } from '../../rooms/result.ts';
import type { StartRoundOptions } from '../registry.ts';
import { baseRound, buildTurnOrder, rememberTarget, suggestionFor, toReveal } from '../common.ts';
import { MAX_ATTEMPTS } from '../faces/reducer.ts';

export function kidsRound(room: Room): KidsRound | null {
  return room.round?.game === 'kids' ? room.round : null;
}

/** Der aktuelle Promi. Fehlt nur, wenn die Runde ohne einen gezeigten Promi beendet wurde. */
export function currentItem(round: KidsRound): KidsItem | null {
  return round.items[round.index] ?? null;
}

function shuffle<T>(list: readonly T[], random: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function newItem(face: Face): KidsItem {
  return { face, stage: 'hidden', shownAt: null, attempts: {}, solved: {}, used: [], holder: null, buzzNo: 0 };
}

/** Der Host sieht Foto und Namen vorab und prüft, also rät er nie mit. Noch nicht gezeigte Personen kommen zuerst dran. */
export function startKidsRound(room: Room, category: Category | null, opts: StartRoundOptions): Result {
  if (!category || category.kind !== 'faces') return fail('unknown_category', 'Diese Kategorie passt nicht zum Spiel');
  const turnOrder = buildTurnOrder(room).filter((id) => id !== room.hostId);
  if (turnOrder.length === 0) return fail('invalid_action', 'Kinderpromis braucht mindestens einen Mitspieler außer dem Host');

  const played = room.playedTargets[category.id] ?? [];
  const fresh = shuffle(category.faces.filter((f) => !played.includes(f.id)), room.random);
  const seen = shuffle(category.faces.filter((f) => played.includes(f.id)), room.random);
  const count = Math.min(category.faces.length, Math.max(1, Math.round(opts.count ?? KIDS_COUNT_DEFAULT)));
  const faces = [...fresh, ...seen].slice(0, count);
  const mode: GuessMode = opts.mode === 'buzz' ? 'buzz' : 'type';
  const penalty: KidsPenalty = opts.penalty ?? 'none';

  room.round = {
    ...baseRound(category, turnOrder),
    activePlayerId: null,
    soloMode: false,
    game: 'kids',
    category,
    mode,
    thinkSeconds: isKidsThink(opts.thinkSeconds) ? opts.thinkSeconds : KIDS_THINK_DEFAULT,
    penalty,
    items: faces.map(newItem),
    index: 0,
  };
  room.phase = 'playing';
  return OK;
}

export function handleKidsMessage(room: Room, playerId: string, msg: ClientMsg): Result {
  switch (msg.type) {
    case 'kids_show':
      return show(room, playerId);
    case 'kids_guess':
      return guess(room, playerId, msg.text);
    case 'kids_judge':
      return judge(room, playerId, msg.playerId, msg.index, msg.correct);
    case 'kids_buzz':
      return buzz(room, playerId);
    case 'kids_verdict':
      return verdict(room, playerId, msg.correct);
    case 'kids_resolve':
      return resolve(room, playerId);
    case 'kids_next':
      return next(room, playerId);
    case 'end_round':
      return endRound(room, playerId);
    default:
      return fail('invalid_action', 'Unbekannte Spielaktion');
  }
}

/** Laufende Runde samt aktuellem Promi, sonst der passende Fehler. */
function playing(room: Room): { round: KidsRound; item: KidsItem } | Result {
  const round = kidsRound(room);
  if (room.phase !== 'playing' || !round) return fail('invalid_action', 'Gerade wird nicht gespielt');
  const item = currentItem(round);
  if (!item) return fail('invalid_action', 'Kein Promi mehr übrig');
  return { round, item };
}

function isResult(x: { round: KidsRound; item: KidsItem } | Result): x is Result {
  return 'ok' in x;
}

function show(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host zeigt den Promi');
  const p = playing(room);
  if (isResult(p)) return p;
  if (p.item.stage !== 'hidden') return fail('invalid_action', 'Dieser Promi ist schon zu sehen');
  p.item.stage = 'open';
  p.item.shownAt = room.now;
  // Erst jetzt gilt die Person als gespielt: Ein vorzeitiges Rundenende lässt ungezeigte Personen frisch.
  rememberTarget(room, p.round.category.id, p.item.face.id);
  return OK;
}

/** Tippen: Treffer per Name, Alias oder eindeutigem Nachnamen zählen sofort, alles andere prüft der Host. */
function guess(room: Room, playerId: string, text: string): Result {
  const p = playing(room);
  if (isResult(p)) return p;
  const { round, item } = p;
  if (round.mode !== 'type') return fail('invalid_action', 'In dieser Runde wird gebuzzert');
  if (!round.turnOrder.includes(playerId)) return fail('not_allowed', 'Du bist in dieser Runde nicht dabei');
  if (item.stage !== 'open') return fail('invalid_action', item.stage === 'hidden' ? 'Der Host hat den Promi noch nicht gezeigt' : 'Dieser Promi ist schon aufgelöst');
  if (item.solved[playerId] !== undefined) return fail('invalid_action', 'Du hast es schon');
  const trimmed = text.trim();
  if (!isValidGuess(trimmed)) return fail('bad_message', 'Tipp muss 1 bis 60 Zeichen haben');
  const list = (item.attempts[playerId] ??= []);
  if (list.length >= MAX_ATTEMPTS) return fail('invalid_action', 'Genug geraten für diesen Promi');
  const hit = suggestionFor(trimmed, item.face.name, item.face.aliases);
  list.push({ text: trimmed, at: room.now, status: hit ? 'correct' : 'judging' });
  if (hit) {
    item.solved[playerId] = room.now;
    settleIfDone(round, item);
  }
  return OK;
}

/** Der Host wertet einen Tipp, der nicht automatisch getroffen hat. Richtig zählt mit der Eingangszeit des Tipps. */
function judge(room: Room, playerId: string, targetId: string, index: number, correct: boolean): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host prüft Tipps');
  const p = playing(room);
  if (isResult(p)) return p;
  const { round, item } = p;
  if (round.mode !== 'type') return fail('invalid_action', 'In dieser Runde wird gebuzzert');
  const attempt = item.attempts[targetId]?.[index];
  if (!attempt) return fail('invalid_action', 'Diesen Versuch gibt es nicht');
  if (attempt.status !== 'judging') return fail('invalid_action', 'Dieser Versuch ist schon geprüft');
  attempt.status = correct ? 'correct' : 'wrong';
  if (correct && item.solved[targetId] === undefined) {
    item.solved[targetId] = attempt.at;
    settleIfDone(round, item);
  }
  return OK;
}

function buzz(room: Room, playerId: string): Result {
  const p = playing(room);
  if (isResult(p)) return p;
  const { round, item } = p;
  if (round.mode !== 'buzz') return fail('invalid_action', 'In dieser Runde wird getippt');
  if (!round.turnOrder.includes(playerId)) return fail('not_allowed', 'Du bist in dieser Runde nicht dabei');
  if (item.stage !== 'open') return fail('invalid_action', item.stage === 'hidden' ? 'Der Host hat den Promi noch nicht gezeigt' : 'Dieser Promi ist schon aufgelöst');
  if (item.holder !== null) return fail('invalid_action', 'Jemand anderes war schneller');
  if (item.used.includes(playerId)) return fail('invalid_action', 'Du hattest deinen Versuch bei diesem Promi schon');
  item.holder = playerId;
  item.buzzNo++;
  armThinkTimer(room, round, item);
  return OK;
}

/** Richtig oder Falsch des Hosts beendet die Bedenkzeit. */
function verdict(room: Room, playerId: string, correct: boolean): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host wertet');
  const p = playing(room);
  if (isResult(p)) return p;
  const { round, item } = p;
  if (round.mode !== 'buzz') return fail('invalid_action', 'In dieser Runde wird getippt');
  if (item.holder === null) return fail('invalid_action', 'Gerade hält niemand den Buzzer');
  settleBuzz(room, round, item, correct);
  return OK;
}

function resolve(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host löst auf');
  const p = playing(room);
  if (isResult(p)) return p;
  if (p.item.stage !== 'open') return fail('invalid_action', p.item.stage === 'hidden' ? 'Erst den Promi zeigen' : 'Dieser Promi ist schon aufgelöst');
  closeItem(room, p.round, p.item);
  return OK;
}

function next(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host geht weiter');
  const p = playing(room);
  if (isResult(p)) return p;
  if (p.item.stage !== 'solved') return fail('invalid_action', 'Erst den Promi auflösen');
  if (p.round.index + 1 < p.round.items.length) p.round.index++;
  else toReveal(room);
  return OK;
}

/** Vorzeitiges Ende: Der offene Promi gilt als aufgelöst, noch verdeckte fallen weg. */
function endRound(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host beendet die Runde');
  const round = kidsRound(room);
  if (room.phase !== 'playing' || !round) return fail('invalid_action', 'Gerade läuft keine Runde');
  const item = currentItem(round);
  if (item?.stage === 'open') closeItem(room, round, item);
  const shown = round.items.filter((i) => i.stage !== 'hidden').length;
  round.items = round.items.slice(0, shown);
  round.index = Math.max(0, shown - 1);
  toReveal(room);
  return OK;
}

// --------------------------------------------------------- Ablauf je Promi

function settleIfDone(round: KidsRound, item: KidsItem): void {
  if (item.stage === 'open' && round.turnOrder.every((id) => item.solved[id] !== undefined)) item.stage = 'solved';
}

function closeItem(room: Room, round: KidsRound, item: KidsItem): void {
  room.cancelTimer('turn');
  round.turnDeadline = null;
  item.holder = null;
  item.buzzNo++;
  item.stage = 'solved';
}

function armThinkTimer(room: Room, round: KidsRound, item: KidsItem): void {
  room.cancelTimer('turn');
  const ms = round.thinkSeconds * 1000;
  round.turnDeadline = room.now + ms;
  const buzzNo = item.buzzNo;
  room.timers.turn = room.scheduler.schedule(ms, () => {
    room.timers.turn = null;
    if (room.phase !== 'playing' || room.round !== round || item.holder === null || item.buzzNo !== buzzNo) return;
    settleBuzz(room, round, item, false);
    room.emit();
  });
}

/** Richtig löst den Promi auf. Falsch oder Ablauf verbraucht den Versuch; haben alle verbraucht, ist der Promi ohne Gewinner durch. */
function settleBuzz(room: Room, round: KidsRound, item: KidsItem, correct: boolean): void {
  const holder = item.holder;
  room.cancelTimer('turn');
  round.turnDeadline = null;
  item.holder = null;
  item.buzzNo++;
  if (holder === null) return;
  if (correct) {
    item.solved[holder] = room.now;
    item.stage = 'solved';
    return;
  }
  if (!item.used.includes(holder)) item.used.push(holder);
  if (round.turnOrder.every((id) => item.used.includes(id))) item.stage = 'solved';
}

// ----------------------------------------------------------------- Punkte

/** Richtige bei einem Promi nach Zeit, bei Gleichstand nach Reihenfolge im Raum. */
export function kidsRanking(round: KidsRound, item: KidsItem): FaceSolvedView[] {
  return Object.entries(item.solved)
    .filter(([id]) => round.turnOrder.includes(id))
    .sort((a, b) => a[1] - b[1] || round.turnOrder.indexOf(a[0]) - round.turnOrder.indexOf(b[0]))
    .map(([playerId, at], i) => ({ playerId, at, rank: i + 1 }));
}

/** Spielpunkte über die Runde: Tippen 3/2/1 je Promi, Buzzern 1 je Treffer, Fehlbuzzer je nach Regel −1. */
export function kidsPoints(round: KidsRound): { points: Record<string, number>; hits: Record<string, number>; misses: Record<string, number> } {
  const zero = () => Object.fromEntries(round.turnOrder.map((id) => [id, 0]));
  const points = zero();
  const hits = zero();
  const misses = zero();
  for (const item of round.items) {
    if (item.stage === 'hidden') continue;
    for (const entry of kidsRanking(round, item)) {
      hits[entry.playerId] = (hits[entry.playerId] ?? 0) + 1;
      points[entry.playerId] = (points[entry.playerId] ?? 0) + (round.mode === 'type' ? (KIDS_POINTS[entry.rank - 1] ?? 0) : 1);
    }
    for (const id of item.used) {
      if (!round.turnOrder.includes(id)) continue;
      misses[id] = (misses[id] ?? 0) + 1;
      if (round.penalty === 'minus') points[id] = (points[id] ?? 0) - 1;
    }
  }
  return { points, hits, misses };
}

// --------------------------------------------------------- Modul-Hooks

export function onPlayerRemoved(room: Room, playerId: string): void {
  const round = kidsRound(room);
  if (!round) return;
  for (const item of round.items) {
    delete item.attempts[playerId];
    delete item.solved[playerId];
    item.used = item.used.filter((id) => id !== playerId);
    if (item.holder === playerId) {
      room.cancelTimer('turn');
      round.turnDeadline = null;
      item.holder = null;
      item.buzzNo++;
    }
  }
  const item = currentItem(round);
  if (!item || item.stage !== 'open' || round.turnOrder.length === 0) return;
  if (round.mode === 'type') settleIfDone(round, item);
  else if (round.turnOrder.every((id) => item.used.includes(id))) item.stage = 'solved';
}
