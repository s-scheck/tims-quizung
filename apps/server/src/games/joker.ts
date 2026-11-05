import type { JokerView } from '@quiz/shared';
import type { Room } from '../rooms/room.ts';
import type { BaseRound, RoundJoker } from '../rooms/state.ts';
import { fail, OK, type Result } from '../rooms/result.ts';

/**
 * Joker: Einmal pro Spiel kopiert ein Spieler blind das Ergebnis eines anderen, ab dem laufenden Abschnitt bis zum Ende
 * der Kategorie. Pro Runde gibt es höchstens einen, der Erste gewinnt. Während des Ratens hat der Joker-Spieler keine
 * eigenen Daten und gilt als fertig; sobald ein Abschnitt abgeschlossen ist, spiegelt `syncJoker` die Daten der
 * kopierten Person auf ihn. So arbeiten Auflösung, Ranglisten und Punktevorschläge unverändert.
 */
export interface JokerHooks {
  /** Spielregel, warum der Spieler gerade keinen Joker setzen darf, sonst null. Phase, Teilnahme und Vorrat prüft `joker.ts`. */
  blocked(room: Room, playerId: string): string | null;
  /** Abschnitt, ab dem der Joker gilt (No-Risk-Durchgang, Kinderpromi). Ohne den Hook 0. */
  from?(room: Room): number;
  /** Eigene Spuren des Joker-Spielers verwerfen und prüfen, ob die Runde jetzt ohne ihn weiterläuft. */
  apply(room: Room, playerId: string): void;
  /** Abgeschlossene Abschnitte der kopierten Person auf den Joker-Spieler spiegeln, fehlende Daten dort löschen. */
  sync(room: Room, joker: RoundJoker): void;
}

/** Kopiert der Spieler im Abschnitt `section` per Joker? Dann sind seine Eingaben gesperrt und er gilt als fertig. */
export function copiesWithJoker(round: BaseRound, playerId: string, section = 0): boolean {
  return round.joker !== null && round.joker.by === playerId && section >= round.joker.from;
}

export const JOKER_LOCKED = 'Du kopierst mit deinem Joker';

/** Warum der Spieler gerade keinen Joker setzen darf, sonst null. */
function jokerBlocker(room: Room, playerId: string): string | null {
  const round = room.round;
  const hooks = room.game?.joker;
  if (!round || !hooks || room.phase !== 'playing') return 'Gerade gibt es keinen Joker';
  if (!round.turnOrder.includes(playerId)) return 'Du bist in dieser Runde nicht dabei';
  if (room.jokersUsed.includes(playerId)) return 'Du hast deinen Joker schon gesetzt';
  if (round.joker) return 'Der Joker ist in dieser Runde schon vergeben';
  if (round.turnOrder.length < 2) return 'Es gibt niemanden zum Kopieren';
  return hooks.blocked(room, playerId);
}

export function useJoker(room: Room, playerId: string, targetId: string): Result {
  const reason = jokerBlocker(room, playerId);
  if (reason) return fail('invalid_action', reason);
  const round = room.round!;
  const hooks = room.game!.joker!;
  if (targetId === playerId) return fail('invalid_action', 'Du kannst dich nicht selbst kopieren');
  if (!round.turnOrder.includes(targetId)) return fail('invalid_action', 'Diese Person spielt in dieser Runde nicht mit');
  round.joker = { by: playerId, target: targetId, from: hooks.from?.(room) ?? 0, at: room.now };
  room.jokersUsed.push(playerId);
  hooks.apply(room, playerId);
  return OK;
}

/** Nach jeder Änderung: abgeschlossene Abschnitte spiegeln. Ist der Joker-Spieler nicht mehr dabei, bleibt alles, wie es ist. */
export function syncJoker(room: Room): void {
  const round = room.round;
  const hooks = room.game?.joker;
  if (!round?.joker || !hooks || !round.turnOrder.includes(round.joker.by)) return;
  hooks.sync(room, round.joker);
}

/** Wen der Joker-Spieler kopiert, sehen nur der Host, er selbst und alle ab der Auflösung. */
export function jokerView(room: Room, revealed: boolean, viewerId: string | null): { joker?: JokerView; jokerAvailable?: boolean } {
  const round = room.round;
  if (!round || !room.game?.joker) return {};
  const out: { joker?: JokerView; jokerAvailable?: boolean } = {};
  const j = round.joker;
  if (j) {
    const seesTarget = revealed || (viewerId !== null && (viewerId === room.hostId || viewerId === j.by));
    out.joker = { by: j.by, from: j.from, at: j.at, ...(seesTarget ? { target: j.target } : {}) };
  }
  if (viewerId !== null && jokerBlocker(room, viewerId) === null) out.jokerAvailable = true;
  return out;
}

/** Ist die Runde vorbei (Auflösung und danach)? Erst dann spiegeln Spiele ohne Abschnitte. */
export function roundClosed(room: Room): boolean {
  return room.phase !== 'playing' && room.phase !== 'host_decision';
}

/** Spiegelt einen Eintrag einer Map: Kopie der kopierten Person oder nichts. */
export function mirrorEntry<T>(map: Record<string, T>, joker: RoundJoker, copy: (value: T) => T = (v) => structuredClone(v)): void {
  const value = map[joker.target];
  if (value === undefined) delete map[joker.by];
  else map[joker.by] = copy(value);
}

/**
 * Plätze 1, 2, 3 … in der gegebenen Reihenfolge. Der Joker-Spieler teilt den Platz der kopierten Person, steht direkt
 * hinter ihr und schiebt niemanden nach hinten. Fehlt die kopierte Person in der Liste, bleibt er, wo er steht.
 * `applies` sagt, ob der Joker für diese Liste gilt.
 */
export function rankWithJoker<T>(sorted: readonly T[], idOf: (row: T) => string, joker: RoundJoker | null, applies = true): (T & { rank: number })[] {
  const j = applies && joker && sorted.some((row) => idOf(row) === joker.target) ? joker : null;
  const jokerRow = j ? sorted.find((row) => idOf(row) === j.by) : undefined;
  const out: (T & { rank: number })[] = [];
  let rank = 0;
  for (const row of sorted) {
    if (row === jokerRow) continue;
    rank++;
    out.push({ ...row, rank });
    if (jokerRow && idOf(row) === j!.target) out.push({ ...jokerRow, rank });
  }
  return out;
}
