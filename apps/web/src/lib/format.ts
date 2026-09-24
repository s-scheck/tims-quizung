import type { CardView, CategoryInfo, PlayerView, RoomView } from '@quiz/shared';

const grouped = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

export function formatValue(card: CardView, category: CategoryInfo): string {
  if (card.label) return card.label;
  if (card.value === undefined) return '';
  const n = category.valueFormat === 'plain' ? String(card.value) : grouped.format(card.value);
  return category.unit ? `${n} ${category.unit}` : n;
}

export function playerName(view: RoomView | null, id: string | null | undefined): string {
  if (!view || !id) return '?';
  return view.players.find((p) => p.id === id)?.name ?? 'Unbekannt';
}

export function playerById(view: RoomView | null, id: string | null | undefined): PlayerView | undefined {
  if (!view || !id) return undefined;
  return view.players.find((p) => p.id === id);
}

/** Spieler nach Punkten sortiert, bei Gleichstand nach Beitrittsreihenfolge. */
export function ranking(view: RoomView): { player: PlayerView; score: number; rank: number }[] {
  const rows = view.players
    .map((player) => ({ player, score: view.scores[player.id] ?? 0 }))
    .sort((a, b) => b.score - a.score || a.player.order - b.player.order);
  let rank = 0;
  let prev: number | null = null;
  return rows.map((row, i) => {
    if (prev === null || row.score !== prev) rank = i + 1;
    prev = row.score;
    return { ...row, rank };
  });
}

export function joinUrl(code: string): string {
  return `${location.origin}/room/${code}`;
}

export function screenUrl(code: string): string {
  return `${location.origin}/screen/${code}`;
}
