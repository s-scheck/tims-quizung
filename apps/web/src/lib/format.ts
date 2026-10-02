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

/** Moderiert dieser Spieler nur (Host, der nicht mitspielt)? */
export function isModerator(view: RoomView | null, id: string | null | undefined): boolean {
  return !!view && !!id && view.hostId === id && !view.settings.hostPlays;
}

/** Spieler, die in der Wertung stehen: alle außer einem moderierenden Host. */
export function scoredPlayers(view: RoomView): PlayerView[] {
  return view.players.filter((p) => !isModerator(view, p.id));
}

/** Spieler nach Punkten sortiert, bei Gleichstand nach Beitrittsreihenfolge. */
export function ranking(view: RoomView): { player: PlayerView; score: number; rank: number }[] {
  const rows = scoredPlayers(view)
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

const kmFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const kmFine = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Entfernung in Kilometern, unter 10 km mit einer Nachkommastelle. */
export function formatKm(km: number): string {
  return `${km < 10 ? kmFine.format(km) : kmFormat.format(km)} km`;
}

const PLAYER_COLORS = ['#f59e0b', '#38bdf8', '#a78bfa', '#34d399', '#f472b6', '#fb7185', '#facc15', '#60a5fa', '#4ade80', '#e879f9', '#fdba74', '#2dd4bf'];

/** Feste Farbe je Spielerposition, für Pins und Ranglisten. */
export function playerColor(index: number): string {
  return PLAYER_COLORS[((index % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length]!;
}

export function joinUrl(code: string): string {
  return `${location.origin}/room/${code}`;
}

export function screenUrl(code: string): string {
  return `${location.origin}/screen/${code}`;
}
