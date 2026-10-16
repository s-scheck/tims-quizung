import { matchGuess, type ClientMsg, type MatchableCard } from '@quiz/shared';
import type { Category } from '@quiz/content';
import type { Room } from '../../rooms/room.ts';
import type { RiskPass, RiskRound } from '../../rooms/state.ts';
import { fail, OK, type Result } from '../../rooms/result.ts';
import type { StartRoundOptions } from '../registry.ts';
import { baseRound, buildTurnOrder, scheduleRoundTimer, toReveal } from '../common.ts';

export function riskRound(room: Room): RiskRound | null {
  return room.round?.game === 'risk' ? room.round : null;
}

export function currentPass(round: RiskRound): RiskPass {
  return round.passes[round.passes.length - 1]!;
}

/** In früheren Durchgängen getroffene Plätze, die sind gesperrt. */
export function blockedRanks(round: RiskRound): Set<number> {
  const out = new Set<number>();
  for (const pass of round.passes.slice(0, -1)) {
    for (const guess of Object.values(pass.guesses)) if (guess.rank !== null) out.add(guess.rank);
  }
  return out;
}

function matchable(round: RiskRound): MatchableCard[] {
  return round.category.items.map((item, i) => ({ rank: i + 1, name: item.name, ...(item.aliases ? { aliases: item.aliases } : {}) }));
}

export function startRiskRound(room: Room, category: Category | null, opts: StartRoundOptions): Result {
  if (!category || category.kind !== 'ranked') return fail('unknown_category', 'Diese Kategorie passt nicht zum Spiel');
  const turnOrder = buildTurnOrder(room);
  if (turnOrder.length === 0) return fail('invalid_action', 'Ohne Mitspieler geht es nicht los');
  const rules = {
    duplicates: opts.duplicates ?? room.riskRules.duplicates,
    missPoints: opts.missPoints ?? room.riskRules.missPoints,
  };
  room.riskRules = rules;
  room.round = {
    ...baseRound(category, turnOrder),
    activePlayerId: null,
    soloMode: false,
    game: 'risk',
    category,
    rules,
    passes: [{ guesses: {} }],
  };
  room.phase = 'playing';
  scheduleRoundTimer(room, () => toReveal(room));
  return OK;
}

export function handleRiskMessage(room: Room, playerId: string, msg: ClientMsg): Result {
  switch (msg.type) {
    case 'risk_guess':
      return logIn(room, playerId, msg.text);
    case 'end_round':
      return endPass(room, playerId);
    case 'risk_correct':
      return correct(room, playerId, msg.playerId, msg.rank);
    case 'next_pass':
      return nextPass(room, playerId);
    default:
      return fail('invalid_action', 'Unbekannte Spielaktion');
  }
}

/** Alle Teilnehmer haben eingeloggt: Durchgang direkt auflösen. */
function revealIfComplete(room: Room, round: RiskRound): void {
  const guesses = currentPass(round).guesses;
  if (round.turnOrder.length > 0 && round.turnOrder.every((id) => guesses[id])) toReveal(room);
}

function logIn(room: Room, playerId: string, rawText: string): Result {
  const round = riskRound(room);
  if (room.phase !== 'playing' || !round) return fail('invalid_action', 'Gerade wird nicht gespielt');
  if (!round.turnOrder.includes(playerId)) return fail('not_allowed', 'Du bist in dieser Runde nicht dabei');
  const pass = currentPass(round);
  if (pass.guesses[playerId]) return fail('invalid_action', 'Du hast schon eingeloggt');
  const text = rawText.trim();
  if (!text) return fail('invalid_action', 'Bitte etwas eintippen');
  const rank = matchGuess(text, matchable(round));
  if (rank !== null && blockedRanks(round).has(rank)) {
    return fail('invalid_action', `${round.category.items[rank - 1]!.name} ist schon aufgedeckt`);
  }
  pass.guesses[playerId] = { text, rank };
  revealIfComplete(room, round);
  return OK;
}

function endPass(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host löst den Durchgang auf');
  if (room.phase !== 'playing' || !riskRound(room)) return fail('invalid_action', 'Gerade läuft kein Durchgang');
  toReveal(room);
  return OK;
}

function correct(room: Room, playerId: string, targetId: string, rank: number | null): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host korrigiert');
  const round = riskRound(room);
  if (room.phase !== 'reveal' || !round) return fail('invalid_action', 'Korrigieren geht nur in der Auflösung');
  const guess = currentPass(round).guesses[targetId];
  if (!guess) return fail('invalid_action', 'Dieser Spieler hat keinen Tipp abgegeben');
  if (rank !== null && rank > round.category.items.length) return fail('invalid_action', 'Diesen Platz gibt es nicht');
  if (rank !== null && blockedRanks(round).has(rank)) return fail('invalid_action', 'Dieser Platz wurde schon früher aufgedeckt');
  guess.rank = rank;
  return OK;
}

function nextPass(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host startet den nächsten Durchgang');
  const round = riskRound(room);
  if (room.phase !== 'reveal' || !round) return fail('invalid_action', 'Erst den Durchgang auflösen');
  if (round.turnOrder.length === 0) return fail('invalid_action', 'Ohne Mitspieler geht es nicht weiter');
  round.passes.push({ guesses: {} });
  round.turnNo++;
  room.phase = 'playing';
  scheduleRoundTimer(room, () => toReveal(room));
  return OK;
}

// --------------------------------------------------------- Modul-Hooks

export function onPlayerRemoved(room: Room, playerId: string): void {
  const round = riskRound(room);
  if (!round) return;
  delete currentPass(round).guesses[playerId];
  if (room.phase === 'playing') revealIfComplete(room, round);
}
