/** Spieler, die in dieser Runde noch nicht ausgeschieden sind, in Zugreihenfolge. */
export function remainingPlayers(turnOrder: readonly string[], eliminated: Iterable<string>): string[] {
  const out = new Set(eliminated);
  return turnOrder.filter((id) => !out.has(id));
}

/**
 * Nächster nicht ausgeschiedener Spieler nach `activePlayerId` (zyklisch).
 * Ist der aktive Spieler nicht mehr in der Reihenfolge, beginnt die Suche vorn.
 * Gibt `null` zurück, wenn niemand übrig ist.
 */
export function nextActivePlayer(
  turnOrder: readonly string[],
  activePlayerId: string | null,
  eliminated: Iterable<string>,
): string | null {
  if (turnOrder.length === 0) return null;
  const out = new Set(eliminated);
  const start = activePlayerId === null ? -1 : turnOrder.indexOf(activePlayerId);
  for (let step = 1; step <= turnOrder.length; step++) {
    const candidate = turnOrder[(start + step + turnOrder.length) % turnOrder.length]!;
    if (!out.has(candidate)) return candidate;
  }
  return null;
}

/** Der Spieler nach `previousStart` in `order` (zyklisch); ohne Vorgänger der erste. */
export function rotateStartPlayer(order: readonly string[], previousStart: string | null): string | null {
  if (order.length === 0) return null;
  if (previousStart === null) return order[0]!;
  const idx = order.indexOf(previousStart);
  if (idx === -1) return order[0]!;
  return order[(idx + 1) % order.length]!;
}

/** `order` so drehen, dass `startId` vorne steht. Fehlt `startId`, bleibt die Reihenfolge. */
export function rotateTo(order: readonly string[], startId: string | null): string[] {
  if (startId === null) return [...order];
  const idx = order.indexOf(startId);
  if (idx <= 0) return [...order];
  return [...order.slice(idx), ...order.slice(0, idx)];
}
