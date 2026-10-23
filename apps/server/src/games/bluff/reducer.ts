import { BLUFF_TEXT_MAX, shuffle, type ClientMsg } from '@quiz/shared';
import type { Category } from '@quiz/content';
import type { Room } from '../../rooms/room.ts';
import type { BluffEntry, BluffRound } from '../../rooms/state.ts';
import { fail, OK, type Result } from '../../rooms/result.ts';
import type { StartRoundOptions } from '../registry.ts';
import { baseRound, buildTurnOrder, pickTarget, rememberTarget, toReveal } from '../common.ts';

export const TRUTH_POINTS = 2;
export const VOTE_POINTS = 1;

export function bluffRound(room: Room): BluffRound | null {
  return room.round?.game === 'bluff' ? room.round : null;
}

export function startBluffRound(room: Room, category: Category | null, opts: StartRoundOptions): Result {
  if (!category || category.kind !== 'prompts') return fail('unknown_category', 'Diese Kategorie passt nicht zum Spiel');
  const picked = pickTarget(room, category.id, category.prompts, opts.targetId);
  if ('error' in picked) return picked.error;
  const turnOrder = buildTurnOrder(room);
  if (turnOrder.length === 0) return fail('invalid_action', 'Ohne Mitspieler geht es nicht los');
  rememberTarget(room, category.id, picked.target.id);
  const prompt = picked.target;

  room.round = {
    ...baseRound(category, turnOrder),
    activePlayerId: null,
    soloMode: false,
    game: 'bluff',
    category,
    prompt: { id: prompt.id, name: prompt.name, answer: prompt.answer },
    stage: 'writing',
    texts: {},
    votes: {},
    entries: [],
  };
  room.phase = 'playing';
  return OK;
}

export function handleBluffMessage(room: Room, playerId: string, msg: ClientMsg): Result {
  switch (msg.type) {
    case 'submit_text':
      return submitText(room, playerId, msg.text);
    case 'vote':
      return vote(room, playerId, msg.entryId);
    case 'advance':
      return advance(room, playerId);
    default:
      return fail('invalid_action', 'Unbekannte Spielaktion');
  }
}

function participantRound(room: Room, playerId: string): { round: BluffRound } | { error: Result } {
  const round = bluffRound(room);
  if (room.phase !== 'playing' || !round) return { error: fail('invalid_action', 'Gerade wird nicht gespielt') };
  if (!round.turnOrder.includes(playerId)) return { error: fail('not_allowed', 'Du bist in dieser Runde nicht dabei') };
  return { round };
}

function submitText(room: Room, playerId: string, text: string): Result {
  const r = participantRound(room, playerId);
  if ('error' in r) return r.error;
  if (r.round.stage !== 'writing') return fail('invalid_action', 'Die Schreibphase ist vorbei');
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0 || trimmed.length > BLUFF_TEXT_MAX) {
    return fail('bad_message', `Text muss 1 bis ${BLUFF_TEXT_MAX} Zeichen haben`);
  }
  r.round.texts[playerId] = trimmed;
  return OK;
}

function vote(room: Room, playerId: string, entryId: string): Result {
  const r = participantRound(room, playerId);
  if ('error' in r) return r.error;
  if (r.round.stage !== 'voting') return fail('invalid_action', 'Gerade wird nicht abgestimmt');
  const entry = r.round.entries.find((e) => e.id === entryId);
  if (!entry) return fail('invalid_action', 'Diesen Eintrag gibt es nicht');
  if (entry.authorId === playerId) return fail('invalid_action', 'Nicht auf den eigenen Text stimmen');
  r.round.votes[playerId] = entryId;
  return OK;
}

function advance(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host schaltet weiter');
  const round = bluffRound(room);
  if (room.phase !== 'playing' || !round) return fail('invalid_action', 'Gerade läuft keine Bluff-Runde');
  switch (round.stage) {
    case 'writing': {
      const authors = round.turnOrder.filter((id) => round.texts[id] !== undefined);
      const items: BluffEntry[] = [...authors.map((id) => ({ id: '', authorId: id })), { id: '', authorId: null }];
      round.entries = shuffle(items, room.random).map((e, i) => ({ id: `e${i + 1}`, authorId: e.authorId }));
      round.stage = 'voting';
      return OK;
    }
    case 'voting':
      round.stage = 'votes_shown';
      return OK;
    case 'votes_shown':
      toReveal(room);
      return OK;
  }
}

export function entryText(round: BluffRound, entry: BluffEntry): string {
  return entry.authorId === null ? round.prompt.answer : (round.texts[entry.authorId] ?? '');
}

/**
 * Rundenpunkte: 1 je Stimme auf einen eigenen Text, 2 für die eigene Stimme auf die Wahrheit.
 * `visible` blendet in der Show-Auflösung Einträge aus, die der Moderator noch nicht aufgedeckt hat (Wahrheit: null).
 */
export function bluffPoints(round: BluffRound, visible: (authorId: string | null) => boolean = () => true): Record<string, number> {
  const points: Record<string, number> = Object.fromEntries(round.turnOrder.map((id) => [id, 0]));
  for (const [voter, entryId] of Object.entries(round.votes)) {
    const entry = round.entries.find((e) => e.id === entryId);
    if (!entry || !visible(entry.authorId)) continue;
    if (entry.authorId === null) {
      if (voter in points) points[voter] = (points[voter] ?? 0) + TRUTH_POINTS;
    } else if (entry.authorId in points) {
      points[entry.authorId] = (points[entry.authorId] ?? 0) + VOTE_POINTS;
    }
  }
  return points;
}

// --------------------------------------------------------- Modul-Hooks

export function onPlayerRemoved(room: Room, playerId: string): void {
  const round = bluffRound(room);
  if (!round) return;
  delete round.texts[playerId];
  delete round.votes[playerId];
  const removed = new Set(round.entries.filter((e) => e.authorId === playerId).map((e) => e.id));
  round.entries = round.entries.filter((e) => e.authorId !== playerId);
  for (const [voter, entryId] of Object.entries(round.votes)) if (removed.has(entryId)) delete round.votes[voter];
}
