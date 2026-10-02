import { haversineKm, type MapPinView, type MapRoundView, type RoundView } from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import { mapRound } from './reducer.ts';

/**
 * Sicht auf die Runde. Zielkoordinaten nur für den Moderator oder ab der Auflösung,
 * fremde Pins nur ab der Auflösung, der eigene Pin immer.
 */
export function mapRoundView(room: Room, revealed: boolean, viewerId: string | null): RoundView | null {
  const r = mapRound(room);
  if (!r) return null;
  const privileged = viewerId !== null && room.isModerator(viewerId);
  const { places: _places, games: _games, kind: _kind, ...category } = r.category;

  const view: MapRoundView = {
    game: 'map',
    category,
    turnOrder: [...r.turnOrder],
    turnNo: r.turnNo,
    activePlayerId: null,
    eliminated: [],
    turnDeadline: null,
    soloMode: false,
    targetName: r.target.name,
    borders: r.borders,
    confirmed: Object.entries(r.pins)
      .filter(([, pin]) => pin.confirmed)
      .map(([id]) => id),
  };

  if (revealed || privileged) view.target = { lat: r.target.lat, lng: r.target.lng };
  if (privileged) view.privileged = true;

  const mine = viewerId !== null ? r.pins[viewerId] : undefined;
  if (mine) view.myPin = { ...mine };

  if (revealed) {
    const pins: MapPinView[] = r.turnOrder
      .filter((id) => r.pins[id]?.confirmed)
      .map((id) => {
        const pin = r.pins[id]!;
        return { playerId: id, lat: pin.lat, lng: pin.lng, distanceKm: haversineKm(pin, r.target) };
      });
    const ranked = [...pins].sort((a, b) => a.distanceKm - b.distanceKm).map((p) => ({ playerId: p.playerId, distanceKm: p.distanceKm }));
    const missing = r.turnOrder.filter((id) => !r.pins[id]?.confirmed).map((id) => ({ playerId: id, distanceKm: null }));
    view.pins = pins;
    view.ranking = [...ranked, ...missing];
  }

  return view;
}
