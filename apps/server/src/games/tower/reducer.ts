import {
  offerFor,
  specialTargetsOthers,
  towerPool,
  TOWER_EFFECT_SHOW_MS,
  TOWER_GOAL_HEIGHT,
  TOWER_MAX_HEIGHT,
  TOWER_SPECIALS,
  towerMarks,
  towerPiece,
  towerRanking,
  type ClientMsg,
  type TowerFrame,
  type TowerRanked,
  type TowerSide,
  type TowerSpecial,
} from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import type { PseudoCategory, TowerEffect, TowerPlayerState, TowerRound } from '../../rooms/state.ts';
import { fail, OK, type Result } from '../../rooms/result.ts';
import type { StartRoundOptions } from '../registry.ts';
import { baseRound, buildTurnOrder, toReveal } from '../common.ts';

export const TOWER_CATEGORY: PseudoCategory = { kind: 'none', id: 'tower', title: 'Hochstapler' };
/** Schneller ist ein Turm bis zur niedrigsten Linie nicht zu schaffen (ab „Los!“); frühere Meldungen sind unplausibel. */
export const TOWER_MIN_FINISH_MS = 10_000;
/** Start-Countdown: kurz „Bereit?“, dann 3-2-1. So lange fällt auf keinem Handy ein Stein. */
export const TOWER_COUNTDOWN_MS = 4000;

export function towerRound(room: Room): TowerRound | null {
  return room.round?.game === 'tower' ? room.round : null;
}

export function startTowerRound(room: Room, _category: unknown, opts: StartRoundOptions): Result {
  const turnOrder = buildTurnOrder(room);
  if (turnOrder.length === 0) return fail('invalid_action', 'Ohne Mitspieler geht es nicht los');
  const options = { ...(opts.tower ?? room.towerOptions) };
  room.towerOptions = options;
  const players: Record<string, TowerPlayerState> = {};
  for (const id of turnOrder) {
    players[id] = { seed: Math.floor(room.random() * 0xffffffff), stock: null, offer: null, height: 0, marks: [], claimed: [], finishedAt: null };
  }
  room.round = {
    ...baseRound(TOWER_CATEGORY, turnOrder),
    activePlayerId: null,
    soloMode: false,
    game: 'tower',
    category: TOWER_CATEGORY,
    options,
    startedAt: room.now,
    goAt: room.now + TOWER_COUNTDOWN_MS,
    goalHeight: TOWER_GOAL_HEIGHT[options.goal],
    players,
    effects: [],
    nextEffectId: 1,
    pool: towerPool(room.random),
    winners: [],
    frames: {},
  };
  room.phase = 'playing';
  return OK;
}

export function handleTowerMessage(room: Room, playerId: string, msg: ClientMsg): Result {
  switch (msg.type) {
    case 'tower_special_use':
      return useSpecial(room, playerId, msg.special, msg.targetId);
    case 'tower_mark':
      return mark(room, playerId, msg.height, msg.piece);
    case 'tower_finish':
      return finish(room, playerId, msg.height);
    case 'tower_choose':
      return choose(room, playerId, msg.side);
    case 'end_round':
      return endRound(room, playerId);
    case 'tower_frame':
      return fail('invalid_action', 'Schnappschüsse gehen direkt über die Verbindung');
    default:
      return fail('invalid_action', 'Unbekannte Spielaktion');
  }
}

function playing(room: Room): TowerRound | null {
  const r = towerRound(room);
  return room.phase === 'playing' && r ? r : null;
}

/** Spielerzustand in der laufenden Runde oder ein Fehler. */
function builder(room: Room, playerId: string): { r: TowerRound; p: TowerPlayerState } | { error: Result } {
  const r = playing(room);
  if (!r) return { error: fail('invalid_action', 'Gerade wird nicht gebaut') };
  const p = r.players[playerId];
  if (!p) return { error: fail('not_allowed', 'Du baust in dieser Runde nicht mit') };
  return { r, p };
}

/** Rangliste nach aktuellem Stand: Sieger nach Zeit, dann nach Höhe. */
export function currentRanking(r: TowerRound): TowerRanked[] {
  return towerRanking(
    r.turnOrder
      .filter((id) => r.players[id])
      .map((id) => ({ playerId: id, height: r.players[id]!.height, finishedAt: r.players[id]!.finishedAt })),
  );
}

/** Neues Angebot (ein heller, ein dunkler Zauber) nach Rang; ein noch offenes Angebot wird ersetzt. */
function grant(room: Room, r: TowerRound, playerId: string): void {
  const ranking = currentRanking(r);
  const rank = ranking.find((x) => x.playerId === playerId)?.rank ?? 1;
  r.players[playerId]!.offer = offerFor(rank, ranking.length, r.pool, room.random);
}

/** Nimmt hell oder dunkel aus dem Angebot; ein Zauber im Vorrat wird dabei ersetzt. */
function choose(room: Room, playerId: string, side: TowerSide): Result {
  const b = builder(room, playerId);
  if ('error' in b) return b.error;
  const { p } = b;
  if (!p.offer) return fail('invalid_action', 'Gerade gibt es keine Zauber zur Wahl');
  p.stock = p.offer[side];
  p.offer = null;
  return OK;
}

/** Aktiver Schutzschild des Spielers. */
export function activeShield(r: TowerRound, playerId: string, now: number): TowerEffect | undefined {
  return r.effects.find((e) => e.special === 'shield' && e.target === playerId && e.until > now);
}

/** Höhenmarke zum ersten Mal überbaut oder Spezialstein verbaut (`piece` = Index im Steinstrom). */
function mark(room: Room, playerId: string, height: number, piece: number | undefined): Result {
  const b = builder(room, playerId);
  if ('error' in b) return b.error;
  const { r, p } = b;
  p.height = Math.min(height, TOWER_MAX_HEIGHT);
  if (piece !== undefined) {
    if (p.claimed.includes(piece)) return fail('invalid_action', 'Diesen Spezialstein gab es schon');
    if (!towerPiece(p.seed, piece).special) return fail('invalid_action', 'Das ist kein Spezialstein');
    p.claimed.push(piece);
    grant(room, r, playerId);
    return OK;
  }
  const fresh = towerMarks(r.goalHeight).filter((m) => m <= height && !p.marks.includes(m));
  if (fresh.length === 0) return fail('invalid_action', 'Keine neue Höhenmarke');
  p.marks.push(...fresh);
  grant(room, r, playerId);
  return OK;
}

function useSpecial(room: Room, playerId: string, special: TowerSpecial, targetId: string | undefined): Result {
  const b = builder(room, playerId);
  if ('error' in b) return b.error;
  const { r, p } = b;
  if (room.now < r.goAt) return fail('invalid_action', 'Es geht gleich los');
  if (p.stock !== special) return fail('invalid_action', 'Dieses Spezial hast du nicht');
  let target = playerId;
  if (specialTargetsOthers(special)) {
    if (!targetId || targetId === playerId) return fail('invalid_action', 'Bitte einen Mitspieler als Ziel wählen');
    if (!r.players[targetId]) return fail('invalid_action', 'Dieses Ziel baut nicht mit');
    target = targetId;
  } else if (targetId !== undefined && targetId !== playerId) {
    return fail('invalid_action', 'Helfer wirken nur auf den eigenen Turm');
  }
  const duration = TOWER_SPECIALS[special].durationMs;
  r.effects = r.effects.filter((e) => e.until > room.now);
  p.stock = null;
  const shield = target !== playerId ? activeShield(r, target, room.now) : undefined;
  if (shield) {
    // Der Schild fängt den dunklen Zauber ab und ist danach verbraucht; der abgefangene Zauber bleibt kurz als Hinweis.
    r.effects = r.effects.filter((e) => e !== shield);
    r.effects.push({ id: r.nextEffectId++, special, by: playerId, target, at: room.now, until: room.now + TOWER_EFFECT_SHOW_MS, blocked: true });
    return OK;
  }
  r.effects.push({ id: r.nextEffectId++, special, by: playerId, target, at: room.now, until: room.now + (duration > 0 ? duration : TOWER_EFFECT_SHOW_MS) });
  return OK;
}

/** Der Turm stand drei Sekunden ruhig über der Linie (geprüft am Handy). Der Erste beendet das Rennen. */
function finish(room: Room, playerId: string, height: number): Result {
  const b = builder(room, playerId);
  if ('error' in b) return b.error;
  const { r, p } = b;
  if (p.finishedAt !== null) return fail('invalid_action', 'Du bist schon im Ziel');
  if (height < r.goalHeight) return fail('invalid_action', 'Der Turm steht noch nicht über der Ziellinie');
  if (room.now - r.goAt < TOWER_MIN_FINISH_MS) return fail('invalid_action', 'So schnell baut niemand einen Turm');
  p.height = Math.min(height, TOWER_MAX_HEIGHT);
  p.finishedAt = room.now;
  r.winners.push(playerId);
  toReveal(room);
  return OK;
}

function endRound(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host beendet die Runde');
  if (!playing(room)) return fail('invalid_action', 'Gerade wird nicht gebaut');
  toReveal(room);
  return OK;
}

/**
 * Schnappschuss eines Turms: Der Raum merkt sich den letzten je Spieler und die Höhe, ohne Broadcast.
 * Nur während des Bauens und nur von Mitspielern. Gibt zurück, ob der Frame weitergereicht werden darf.
 */
export function acceptTowerFrame(room: Room, playerId: string, frame: TowerFrame): boolean {
  const r = playing(room);
  const p = r?.players[playerId];
  if (!r || !p) return false;
  r.frames[playerId] = frame;
  p.height = Math.min(frame.h, TOWER_MAX_HEIGHT);
  return true;
}

/** Letzte Frames der laufenden oder gerade ausgewerteten Runde, für ein neu verbundenes Gerät. */
export function towerFrames(room: Room): [string, TowerFrame][] {
  const r = towerRound(room);
  return r ? Object.entries(r.frames) : [];
}

// --------------------------------------------------------- Modul-Hooks

export function onPlayerRemoved(room: Room, playerId: string): void {
  const r = towerRound(room);
  if (!r) return;
  delete r.players[playerId];
  delete r.frames[playerId];
  r.effects = r.effects.filter((e) => e.by !== playerId && e.target !== playerId);
}
