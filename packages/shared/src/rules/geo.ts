export interface LatLng {
  lat: number;
  lng: number;
}

/** Mittlerer Erdradius in Kilometern. */
export const EARTH_RADIUS_KM = 6371.0088;

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Längengrad in den Bereich -180 bis 180 bringen (Weltkopien von Leaflet). */
export function normalizeLng(lng: number): number {
  let x = ((((lng + 180) % 360) + 360) % 360) - 180;
  if (x === -180 && lng > 0) x = 180;
  return x;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Luftlinie nach Haversine in Kilometern. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
