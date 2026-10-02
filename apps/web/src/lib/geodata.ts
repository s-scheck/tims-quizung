/** Lädt die stummen Kartendaten (Natural Earth, gemeinfrei) einmal pro Sitzung. */
export interface GeoData {
  land: GeoJSON.GeoJsonObject;
  borders: GeoJSON.GeoJsonObject;
}

let cache: Promise<GeoData> | null = null;

export function loadGeo(): Promise<GeoData> {
  cache ??= Promise.all([
    fetch('/geo/land.json').then((r) => r.json() as Promise<GeoJSON.GeoJsonObject>),
    fetch('/geo/borders.json').then((r) => r.json() as Promise<GeoJSON.GeoJsonObject>),
  ])
    .then(([land, borders]) => ({ land, borders }))
    .catch((err: unknown) => {
      cache = null;
      throw err;
    });
  return cache;
}
