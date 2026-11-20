import { DUNGEON_DEFAULTS, DUNGEON_KEY_AT_WRONG, DUNGEON_RESULT_MS, judgeChoice, judgeFree, judgeMap, judgeTopX, judgeYear, type ClientMsg } from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import type { DungeonAnswer, DungeonDoor, DungeonRound, PseudoCategory } from '../../rooms/state.ts';
import { fail, OK, type Result } from '../../rooms/result.ts';
import type { StartRoundOptions } from '../registry.ts';
import { baseRound, buildTurnOrder, hostLeavesRound, toReveal } from '../common.ts';
import { buildDungeon } from './build.ts';

export const DUNGEON_CATEGORY: PseudoCategory = { kind: 'none', id: 'dungeon', title: 'Dungeon' };
const LETTERS = ['A', 'B', 'C', 'D'];

export function dungeonRound(room: Room): DungeonRound | null {
  return room.round?.game === 'dungeon' ? room.round : null;
}

function playing(room: Room): DungeonRound | null {
  return room.phase === 'playing' ? dungeonRound(room) : null;
}

export function startDungeonRound(room: Room, _category: unknown, opts: StartRoundOptions): Result {
  const turnOrder = buildTurnOrder(room);
  if (turnOrder.length === 0) return fail('invalid_action', 'Ohne Mitspieler geht es nicht los');
  const options = { ...(opts.dungeon ?? room.dungeonOptions ?? DUNGEON_DEFAULTS) };
  const rooms = buildDungeon(room.categories.list(), options, room.random);
  if (typeof rooms === 'string') return fail('invalid_action', rooms);
  room.dungeonOptions = options;

  const round: DungeonRound = {
    ...baseRound(DUNGEON_CATEGORY, turnOrder),
    activePlayerId: null,
    soloMode: false,
    game: 'dungeon',
    category: DUNGEON_CATEGORY,
    options,
    rooms,
    stage: 'choosing',
    roundNo: 1,
    players: Object.fromEntries(turnOrder.map((id) => [id, { room: 0, locked: [], wrong: 0, status: 'in' as const, exitRound: null, key: false, keyFound: false }])),
    walk: {},
    answers: {},
    skipped: [],
    results: {},
    attempts: [],
    nextAt: null,
  };
  room.round = round;
  room.phase = 'playing';
  return OK;
}

/** Wer in dieser Fragerunde mitmacht: noch im Dungeon und nicht übersprungen. */
export function activeIds(r: DungeonRound): string[] {
  return r.turnOrder.filter((id) => r.players[id]?.status === 'in' && !r.skipped.includes(id));
}

export function doorOf(r: DungeonRound, doorId: string): DungeonDoor | undefined {
  for (const doors of r.rooms) {
    const door = doors.find((d) => d.id === doorId);
    if (door) return door;
  }
  return undefined;
}

export function handleDungeonMessage(room: Room, playerId: string, msg: ClientMsg): Result {
  switch (msg.type) {
    case 'dungeon_walk':
      return walk(room, playerId, msg.doorId);
    case 'dungeon_enter':
      return enter(room, playerId, msg.key === true);
    case 'dungeon_answer':
      return answer(room, playerId, msg);
    case 'dungeon_skip':
      return skip(room, playerId, msg.playerId);
    case 'dungeon_next':
      return next(room, playerId);
    case 'end_round':
      if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host beendet die Runde');
      if (!playing(room)) return fail('invalid_action', 'Gerade wird nicht gespielt');
      toReveal(room);
      return OK;
    default:
      return fail('invalid_action', 'Unbekannte Spielaktion');
  }
}

// --------------------------------------------------------------- Türwahl

function walk(room: Room, playerId: string, doorId: string | null): Result {
  const r = playing(room);
  if (!r || r.stage !== 'choosing') return fail('invalid_action', 'Gerade wird keine Tür gewählt');
  const p = r.players[playerId];
  if (!p || p.status !== 'in') return fail('invalid_action', 'Du bist nicht mehr im Dungeon');
  if (r.skipped.includes(playerId)) return fail('invalid_action', 'Du setzt diese Runde aus');
  if (r.walk[playerId]?.confirmed) return fail('invalid_action', 'Du stehst schon in der Tür');
  if (doorId !== null) {
    const doors = r.rooms[p.room] ?? [];
    if (!doors.some((d) => d.id === doorId)) return fail('invalid_action', 'Diese Tür ist nicht in deinem Raum');
    // Mit Schlüssel darf man auch vor eine verschlossene Tür treten, er schließt jede auf.
    if (p.locked.includes(doorId) && !p.key) return fail('invalid_action', 'Diese Tür ist für dich verschlossen');
  }
  r.walk[playerId] = { doorId, confirmed: false };
  return OK;
}

function enter(room: Room, playerId: string, key: boolean): Result {
  const r = playing(room);
  if (!r || r.stage !== 'choosing') return fail('invalid_action', 'Gerade wird keine Tür gewählt');
  const p = r.players[playerId];
  if (p?.status !== 'in' || r.skipped.includes(playerId)) return fail('invalid_action', 'Du bist gerade nicht dran');
  const w = r.walk[playerId];
  if (!w?.doorId) return fail('invalid_action', 'Erst eine Tür antippen');
  if (w.confirmed) return fail('invalid_action', 'Du stehst schon in der Tür');
  if (key && !p.key) return fail('invalid_action', 'Du hast keinen Schlüssel');
  if (!key && p.locked.includes(w.doorId)) return fail('invalid_action', 'Diese Tür ist für dich verschlossen');
  w.confirmed = true;
  if (key) w.key = true;
  checkChoosing(room, r);
  return OK;
}

/**
 * Alle Aktiven stehen in ihrer Tür: die Fragerunde beginnt. Wer mit Schlüssel kommt, ist sofort durch (der Schlüssel
 * ist weg). Ohne Aktive oder wenn nur Schlüssel im Spiel sind, geht es gleich zum Ergebnis.
 */
function checkChoosing(room: Room, r: DungeonRound): void {
  if (r.stage !== 'choosing') return;
  const active = activeIds(r);
  if (!active.every((id) => r.walk[id]?.confirmed)) return;
  r.stage = 'answering';
  r.answers = {};
  for (const id of active) {
    const w = r.walk[id];
    const p = r.players[id];
    if (!w?.key || !w.doorId || !p) continue;
    p.key = false;
    r.answers[id] = { doorId: w.doorId, text: 'Schlüssel', correct: true, key: true };
  }
  checkAnswering(room, r);
}

// --------------------------------------------------------------- Antworten

function answer(room: Room, playerId: string, msg: Extract<ClientMsg, { type: 'dungeon_answer' }>): Result {
  const r = playing(room);
  if (!r || r.stage !== 'answering') return fail('invalid_action', 'Gerade wird nicht geantwortet');
  if (!activeIds(r).includes(playerId)) return fail('invalid_action', 'Du bist in dieser Runde nicht dabei');
  if (r.answers[playerId]) return fail('invalid_action', 'Du hast schon geantwortet');
  const door = doorOf(r, r.walk[playerId]?.doorId ?? '');
  if (!door) return fail('invalid_action', 'Keine Tür gewählt');
  const judged = judge(door, msg);
  if (!judged) return fail('bad_message', 'Diese Antwort passt nicht zur Tür');
  r.answers[playerId] = judged;
  checkAnswering(room, r);
  return OK;
}

function judge(door: DungeonDoor, msg: Extract<ClientMsg, { type: 'dungeon_answer' }>): DungeonAnswer | null {
  const p = door.payload;
  const base = { doorId: door.id };
  switch (p.kind) {
    case 'choice':
      if (msg.choice === undefined) return null;
      return { ...base, text: `${LETTERS[msg.choice]}: ${p.choices[msg.choice]}`, correct: judgeChoice(msg.choice, p.correctChoice) };
    case 'free':
      if (msg.text === undefined) return null;
      return { ...base, text: msg.text.trim(), correct: judgeFree(msg.text, p.question.answer, p.question.aliases) };
    case 'map': {
      if (!msg.pin) return null;
      const res = judgeMap(msg.pin, p.place, door.tolerance ?? 0);
      return { ...base, text: `${msg.pin.lat.toFixed(2)}°, ${msg.pin.lng.toFixed(2)}°`, correct: res.correct, detail: `${Math.round(res.distanceKm)} km entfernt` };
    }
    case 'timeline': {
      if (msg.year === undefined) return null;
      const res = judgeYear(msg.year, p.event.from, p.event.to, door.tolerance ?? 0);
      return { ...base, text: yearLabel(msg.year), correct: res.correct, detail: res.off === 0 ? 'genau' : res.off === 1 ? '1 Jahr daneben' : `${res.off} Jahre daneben` };
    }
    case 'topx': {
      if (msg.text === undefined) return null;
      const rank = judgeTopX(msg.text, p.items, p.items.length);
      return { ...base, text: msg.text.trim(), correct: rank !== null, ...(rank !== null ? { detail: `Platz ${rank}` } : {}) };
    }
  }
}

export function yearLabel(year: number): string {
  return year < 0 ? `${-year} v. Chr.` : String(year);
}

function checkAnswering(room: Room, r: DungeonRound): void {
  if (r.stage !== 'answering') return;
  if (activeIds(r).every((id) => r.answers[id])) resolve(room, r);
}

/**
 * Alle haben geantwortet: richtig heißt weiter, falsch heißt Tür zu. Beim zweiten Fehlversuch liegt einmal je Dungeon
 * ein Schlüssel bereit. Alle Türen zu und kein Schlüssel heißt ausgeschieden. Danach läuft die Uhr zur nächsten Türwahl.
 */
function resolve(room: Room, r: DungeonRound): void {
  r.results = {};
  for (const id of activeIds(r)) {
    const a = r.answers[id];
    const p = r.players[id];
    if (!a || !p) continue;
    r.attempts.push({ ...a, roundNo: r.roundNo, room: p.room, playerId: id });
    const result: DungeonRound['results'][string] = { doorId: a.doorId, room: p.room, correct: a.correct, ...(a.key ? { key: true } : {}) };
    r.results[id] = result;
    if (a.correct) {
      p.room++;
      p.locked = [];
      if (p.room >= r.rooms.length) {
        p.status = 'out';
        p.exitRound = r.roundNo;
      }
    } else {
      p.wrong++;
      if (!p.locked.includes(a.doorId)) p.locked.push(a.doorId);
      if (!p.keyFound && p.wrong >= DUNGEON_KEY_AT_WRONG) {
        p.key = true;
        p.keyFound = true;
        result.foundKey = true;
      }
      if (p.locked.length >= (r.rooms[p.room]?.length ?? 0) && !p.key) p.status = 'eliminated';
    }
  }
  r.stage = 'result';
  r.nextAt = room.now + DUNGEON_RESULT_MS;
  room.cancelTimer('placement');
  room.timers.placement = room.scheduler.schedule(DUNGEON_RESULT_MS, () => {
    room.timers.placement = null;
    if (room.round !== r || room.phase !== 'playing' || r.stage !== 'result') return;
    advance(room, r);
    room.emit();
  });
}

// --------------------------------------------------------------- Host

function skip(room: Room, hostId: string, playerId: string): Result {
  if (!room.isHost(hostId)) return fail('not_host', 'Nur der Host darf überspringen');
  const r = playing(room);
  if (!r || (r.stage !== 'choosing' && r.stage !== 'answering')) return fail('invalid_action', 'Gerade wartet niemand');
  if (!activeIds(r).includes(playerId)) return fail('invalid_action', 'Dieser Spieler ist nicht dabei');
  if (r.stage === 'choosing' && r.walk[playerId]?.confirmed) return fail('invalid_action', 'Er hat schon gewählt');
  if (r.stage === 'answering' && r.answers[playerId]) return fail('invalid_action', 'Er hat schon geantwortet');
  r.skipped.push(playerId);
  delete r.walk[playerId];
  checkChoosing(room, r);
  checkAnswering(room, r);
  return OK;
}

function next(room: Room, hostId: string): Result {
  if (!room.isHost(hostId)) return fail('not_host', 'Nur der Host startet die nächste Türwahl');
  const r = playing(room);
  if (!r || r.stage !== 'result') return fail('invalid_action', 'Erst alle Antworten abwarten');
  advance(room, r);
  return OK;
}

/** Vom Ergebnis zur nächsten Türwahl, oder zur Auswertung, wenn niemand mehr drin ist. */
function advance(room: Room, r: DungeonRound): void {
  room.cancelTimer('placement');
  r.nextAt = null;
  if (!r.turnOrder.some((id) => r.players[id]?.status === 'in')) {
    toReveal(room);
    return;
  }
  r.roundNo++;
  r.turnNo++;
  r.stage = 'choosing';
  r.walk = {};
  r.answers = {};
  r.skipped = [];
  r.results = {};
}

// --------------------------------------------------------- Modul-Hooks

export function onPlayerRemoved(room: Room, playerId: string): void {
  const r = dungeonRound(room);
  if (!r) return;
  delete r.players[playerId];
  delete r.walk[playerId];
  delete r.answers[playerId];
  delete r.results[playerId];
  r.skipped = r.skipped.filter((id) => id !== playerId);
  if (room.phase !== 'playing') return;
  checkChoosing(room, r);
  checkAnswering(room, r);
}

export function onHostChanged(room: Room): void {
  hostLeavesRound(room);
}
