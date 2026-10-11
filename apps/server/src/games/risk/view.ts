import { scoreRiskPass, type RiskPassView, type RiskRoundView, type RiskSlotView, type RoundView } from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import { riskRound } from './reducer.ts';

/**
 * Sicht auf die Runde. Tipps des laufenden Durchgangs bleiben geheim, nur wer eingeloggt hat ist sichtbar.
 * Die ganze Liste sieht der Moderator immer, alle anderen erst nach Ende der Kategorie.
 */
export function riskRoundView(room: Room, revealed: boolean, viewerId: string | null): RoundView | null {
  const r = riskRound(room);
  if (!r) return null;
  const privileged = viewerId !== null && room.isModerator(viewerId);
  const { items, games: _games, kind: _kind, ...category } = r.category;
  const playing = room.phase === 'playing';
  const finished = playing ? r.passes.slice(0, -1) : r.passes;
  const current = r.passes[r.passes.length - 1]!;

  const slot = (rank: number): RiskSlotView => {
    const item = items[rank - 1]!;
    return { rank, name: item.name, value: item.value, ...(item.label !== undefined ? { label: item.label } : {}) };
  };

  const totals: Record<string, number> = Object.fromEntries(r.turnOrder.map((id) => [id, 0]));
  const hits = new Map<number, RiskSlotView>();
  const passes: RiskPassView[] = finished.map((pass, i) => {
    const passNo = i + 1;
    const ranks = Object.fromEntries(r.turnOrder.map((id) => [id, pass.guesses[id]?.rank ?? null]));
    const points = scoreRiskPass(r.turnOrder, ranks, r.rules);
    for (const id of r.turnOrder) {
      totals[id] = (totals[id] ?? 0) + points[id]!;
      const rank = ranks[id];
      if (rank == null) continue;
      const hit = hits.get(rank) ?? { ...slot(rank), passNo, by: [] };
      hit.by!.push(id);
      hits.set(rank, hit);
    }
    return {
      passNo,
      results: r.turnOrder.map((id) => ({ playerId: id, text: pass.guesses[id]?.text ?? null, rank: ranks[id] ?? null, points: points[id]! })),
    };
  });

  const view: RiskRoundView = {
    game: 'risk',
    category,
    turnOrder: [...r.turnOrder],
    turnNo: r.turnNo,
    activePlayerId: null,
    eliminated: [],
    turnDeadline: r.turnDeadline,
    soloMode: false,
    size: items.length,
    rules: { ...r.rules },
    passNo: r.passes.length,
    loggedIn: playing ? Object.keys(current.guesses) : [],
    hitSlots: [...hits.values()].sort((a, b) => a.rank - b.rank),
    passes,
    totals,
  };

  const mine = viewerId !== null && playing ? current.guesses[viewerId] : undefined;
  if (mine) view.myGuess = mine.text;
  if (privileged) view.privileged = true;
  if (privileged || (revealed && room.phase !== 'reveal')) {
    view.solution = items.map((_, i) => hits.get(i + 1) ?? slot(i + 1));
  }
  return view;
}
