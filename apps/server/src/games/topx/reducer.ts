import { isValidGuess, matchGuess, sortCards, type ClientMsg } from '@quiz/shared';
import type { Category } from '@quiz/content';
import type { Room } from '../../rooms/room.ts';
import type { TopXCard, TopXRound } from '../../rooms/state.ts';
import { fail, OK, type Result } from '../../rooms/result.ts';
import type { StartRoundOptions } from '../registry.ts';
import { baseRound, buildTurnOrder, scheduleTurnTimer, settleTurn } from '../common.ts';

/** Spannung im Automatik-Modus, bis der Server auflöst. */
export const SUSPENSE_MS = 1500;
/** Anzeige des Ergebnisses, bis der Zug wechselt. */
export const RESULT_MS = 1500;

export function topxRound(room: Room): TopXRound | null {
  return room.round?.game === 'topx' ? room.round : null;
}

/** Prüft der moderierende Host die Tipps von Hand? */
export function hostJudges(room: Room): boolean {
  return room.hostId !== null && room.isModerator(room.hostId);
}

export function startTopXRound(room: Room, category: Category, opts: StartRoundOptions): Result {
  if (category.kind !== 'ranked') return fail('unknown_category', 'Diese Kategorie passt nicht zum Spiel');
  const turnOrder = buildTurnOrder(room);
  if (turnOrder.length === 0) return fail('invalid_action', 'Ohne Mitspieler geht es nicht los');
  const lives = opts.lives ?? room.defaultLives;
  room.defaultLives = lives;

  const cards: TopXCard[] = sortCards(category.items, category.order).map((item, i) => ({
    rank: i + 1,
    name: item.name,
    value: item.value,
    ...(item.label !== undefined ? { label: item.label } : {}),
    aliases: item.aliases ?? [],
  }));

  room.round = {
    ...baseRound(category, turnOrder),
    game: 'topx',
    category,
    cards,
    revealed: {},
    lives: Object.fromEntries(turnOrder.map((id) => [id, lives])),
    maxLives: lives,
    hits: Object.fromEntries(turnOrder.map((id) => [id, 0])),
    wrongGuesses: [],
    guess: null,
  };
  room.phase = 'playing';
  scheduleTurnTimer(room);
  return OK;
}

export function handleTopXMessage(room: Room, playerId: string, msg: ClientMsg): Result {
  switch (msg.type) {
    case 'guess':
      return guess(room, playerId, msg.turnNo, msg.text);
    case 'judge':
      return judge(room, playerId, msg.turnNo, msg.correct, msg.rank);
    default:
      return fail('invalid_action', 'Unbekannte Spielaktion');
  }
}

function guess(room: Room, playerId: string, turnNo: number, text: string): Result {
  const round = topxRound(room);
  if (room.phase !== 'playing' || !round) return fail('invalid_action', 'Gerade wird nicht gespielt');
  if (round.activePlayerId !== playerId) return fail('not_your_turn', 'Du bist nicht dran');
  if (round.turnNo !== turnNo) return fail('invalid_action', 'Zug ist schon vorbei');
  if (round.guess) return fail('invalid_action', 'Ein Tipp wird gerade ausgewertet');
  const trimmed = text.trim();
  if (!isValidGuess(trimmed)) return fail('bad_message', 'Tipp muss 1 bis 60 Zeichen haben');

  const match = matchGuess(trimmed, round.cards);
  // Ein Treffer auf eine schon aufgedeckte Karte zählt als Fehltipp, deshalb kein Vorschlag.
  const suggestion = match !== null && round.revealed[match] === undefined ? match : null;
  round.turnDeadline = null;
  room.cancelTimer('turn');

  if (hostJudges(room)) {
    round.guess = { by: playerId, text: trimmed, status: 'judging', matchRank: suggestion, resolveAt: null, applyAt: null };
    return OK;
  }
  const now = room.now;
  round.guess = {
    by: playerId,
    text: trimmed,
    status: 'pending',
    matchRank: suggestion,
    resolveAt: now + SUSPENSE_MS,
    applyAt: now + SUSPENSE_MS + RESULT_MS,
  };
  room.timers.placement = room.scheduler.schedule(SUSPENSE_MS, () => resolveGuess(room));
  return OK;
}

/** Automatische Auflösung nach der Spannungspause. */
function resolveGuess(room: Room): void {
  room.timers.placement = null;
  const round = topxRound(room);
  const g = round?.guess;
  if (!round || !g || g.status !== 'pending') return;
  decide(room, round, g.matchRank !== null && round.revealed[g.matchRank] === undefined ? g.matchRank : null);
  room.emit();
}

/** Setzt das Ergebnis eines Tipps und plant den Zugwechsel. `rank` null bedeutet falsch. */
function decide(room: Room, round: TopXRound, rank: number | null): void {
  const g = round.guess!;
  if (rank !== null) {
    round.revealed[rank] = g.by;
    round.hits[g.by] = (round.hits[g.by] ?? 0) + 1;
    g.matchRank = rank;
    g.status = 'correct';
  } else {
    round.wrongGuesses.push({ by: g.by, text: g.text });
    loseLife(round, g.by);
    g.status = 'wrong';
  }
  g.resolveAt = room.now;
  g.applyAt = room.now + RESULT_MS;
  room.cancelTimer('placement');
  room.timers.placement = room.scheduler.schedule(RESULT_MS, () => applyGuess(room));
}

function applyGuess(room: Room): void {
  room.timers.placement = null;
  const round = topxRound(room);
  const g = round?.guess;
  if (!round || !g || (g.status !== 'correct' && g.status !== 'wrong')) return;
  round.guess = null;
  settleTurn(room, {});
  room.emit();
}

function judge(room: Room, playerId: string, turnNo: number, correct: boolean, rank?: number): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host prüft Tipps');
  const round = topxRound(room);
  if (room.phase !== 'playing' || !round) return fail('invalid_action', 'Gerade wird nicht gespielt');
  const g = round.guess;
  if (!g || g.status !== 'judging') return fail('invalid_action', 'Kein Tipp zu prüfen');
  if (round.turnNo !== turnNo) return fail('invalid_action', 'Zug ist schon vorbei');
  if (correct) {
    if (rank === undefined) return fail('bad_message', 'Welche Karte wurde getroffen?');
    if (!round.cards.some((c) => c.rank === rank)) return fail('invalid_action', 'Diesen Platz gibt es nicht');
    if (round.revealed[rank] !== undefined) return fail('invalid_action', 'Diese Karte ist schon aufgedeckt');
    decide(room, round, rank);
  } else {
    decide(room, round, null);
  }
  return OK;
}

function loseLife(round: TopXRound, playerId: string): void {
  const left = Math.max(0, (round.lives[playerId] ?? 0) - 1);
  round.lives[playerId] = left;
  if (left === 0 && round.turnOrder.includes(playerId) && !round.eliminated.includes(playerId)) {
    round.eliminated.push(playerId);
  }
}

// --------------------------------------------------------- Modul-Hooks

export function isBusy(room: Room): boolean {
  return topxRound(room)?.guess !== null;
}

export function isRoundComplete(room: Room): boolean {
  const round = topxRound(room);
  return !!round && Object.keys(round.revealed).length === round.cards.length;
}

export function penalizeActive(room: Room): void {
  const round = topxRound(room);
  if (round?.activePlayerId) loseLife(round, round.activePlayerId);
}

export function clearTurn(): void {}

export function onReveal(room: Room): void {
  const round = topxRound(room);
  if (round) round.guess = null;
}

/** Der neue Host spielt mit: ein Tipp, der auf die Prüfung wartet, wird automatisch entschieden. */
export function onHostChanged(room: Room): void {
  const round = topxRound(room);
  const g = round?.guess;
  if (!round || !g || g.status !== 'judging' || hostJudges(room)) return;
  decide(room, round, g.matchRank !== null && round.revealed[g.matchRank] === undefined ? g.matchRank : null);
}
