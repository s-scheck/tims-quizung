import {
  GAME_IDS,
  isTimelineYear,
  isValidLatLng,
  type CategoryInfo,
  type GameId,
  type LatLngBounds,
  type MapCategoryInfo,
  type MatchCategoryInfo,
  type SortOrder,
  type TimelineCategoryInfo,
} from '@quiz/shared';

export interface CategoryItem {
  name: string;
  value: number;
  /** Überschreibt die Standardformatierung des Werts in der Auflösung. */
  label?: string;
  /** Weitere Schreibweisen für den Namensabgleich bei Top X. */
  aliases?: string[];
}

/** Rangliste mit Werten, für Sortieren, Top X und No Risk No Fun. */
export interface RankedCategory extends CategoryInfo {
  kind: 'ranked';
  /** Für welche Spiele die Liste taugt. Standard: nur Sortieren. */
  games: GameId[];
  items: CategoryItem[];
}

export interface MatchPair {
  left: string;
  right: string;
}

/** Paarliste mit Ködern, für Zuordnen. */
export interface PairsCategory extends MatchCategoryInfo {
  kind: 'pairs';
  games: GameId[];
  pairs: MatchPair[];
  /** Ziele ohne passende Karte. */
  decoys: string[];
}

export interface Place {
  /** Aus dem Namen abgeleitet, eindeutig innerhalb der Liste. */
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/** Ortsliste mit Koordinaten, für Karte. */
export interface PlacesCategory extends MapCategoryInfo {
  kind: 'places';
  games: GameId[];
  places: Place[];
}

export interface TimelineEvent {
  /** Aus dem Namen abgeleitet, eindeutig innerhalb der Liste. */
  id: string;
  name: string;
  /** Erstes und letztes Jahr, bei einem einzelnen Jahr gleich. Negativ heißt v. Chr. */
  from: number;
  to: number;
}

/** Ereignisliste mit Jahren oder Spannen, für Zeitstrahl. */
export interface EventsCategory extends TimelineCategoryInfo {
  kind: 'events';
  games: GameId[];
  events: TimelineEvent[];
}

export type Category = RankedCategory | PairsCategory | PlacesCategory | EventsCategory;

/** Sortieren braucht 10 Karten und eindeutige Werte, eine Top-Liste darf kürzer sein und Gleichstände haben. */
export const MIN_ITEMS = 10;
export const MIN_ITEMS_TOPX = 5;
export const MAX_ITEMS = 20;
/** No Risk No Fun braucht lange Listen, damit tiefe Plätze viele Punkte wert sind. */
export const MIN_ITEMS_RISK = 10;
export const MAX_ITEMS_RISK = 50;
export const MIN_PAIRS = 4;
export const MAX_PAIRS = 12;
export const MAX_DECOYS = 5;
export const MIN_PLACES = 10;
export const MAX_PLACES = 30;
export const MIN_EVENTS = 10;
export const MAX_EVENTS = 30;

export class CategoryValidationError extends Error {
  constructor(
    public readonly file: string,
    message: string,
  ) {
    super(`${file}: ${message}`);
    this.name = 'CategoryValidationError';
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function requireString(raw: Record<string, unknown>, key: string, file: string): string {
  const v = raw[key];
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new CategoryValidationError(file, `Feld "${key}" fehlt oder ist leer`);
  }
  return v;
}

function readId(raw: Record<string, unknown>, file: string): string {
  const id = requireString(raw, 'id', file);
  if (!/^[a-z0-9-]+$/.test(id)) throw new CategoryValidationError(file, `id "${id}" darf nur a-z, 0-9 und - enthalten`);
  return id;
}

function readGames(raw: Record<string, unknown>, file: string, fallback: GameId[]): GameId[] {
  if (raw.games === undefined) return fallback;
  if (!Array.isArray(raw.games) || raw.games.length === 0 || !raw.games.every((g) => (GAME_IDS as readonly unknown[]).includes(g))) {
    throw new CategoryValidationError(file, `games muss eine nicht leere Liste aus ${GAME_IDS.join(', ')} sein`);
  }
  return [...new Set(raw.games as GameId[])];
}

export function validateCategory(raw: unknown, file: string): Category {
  if (!isRecord(raw)) throw new CategoryValidationError(file, 'kein Objekt');
  if ('pairs' in raw) return validatePairs(raw, file);
  if ('places' in raw) return validatePlaces(raw, file);
  if ('events' in raw) return validateEvents(raw, file);
  return validateRanked(raw, file);
}

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/** Dateiname-tauglicher Schlüssel aus einem Ortsnamen. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTS[c] ?? c)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function validateRanked(raw: Record<string, unknown>, file: string): RankedCategory {
  const id = readId(raw, file);

  const order = raw.order;
  if (order !== 'asc' && order !== 'desc') throw new CategoryValidationError(file, 'order muss "asc" oder "desc" sein');

  const valueFormat = raw.valueFormat;
  if (valueFormat !== undefined && valueFormat !== 'grouped' && valueFormat !== 'plain') {
    throw new CategoryValidationError(file, 'valueFormat muss "grouped" oder "plain" sein');
  }

  const games = readGames(raw, file, ['sort']);
  if (games.includes('match')) throw new CategoryValidationError(file, 'Zuordnen braucht eine Paarliste mit "pairs"');
  if (games.includes('map')) throw new CategoryValidationError(file, 'Karte braucht eine Ortsliste mit "places"');
  if (games.includes('timeline')) throw new CategoryValidationError(file, 'Zeitstrahl braucht eine Ereignisliste mit "events"');
  const forSort = games.includes('sort');
  const forTopX = games.includes('topx');
  const minItems = forSort ? MIN_ITEMS : forTopX ? MIN_ITEMS_TOPX : MIN_ITEMS_RISK;
  const maxItems = forSort || forTopX ? MAX_ITEMS : MAX_ITEMS_RISK;

  const itemsRaw = raw.items;
  if (!Array.isArray(itemsRaw)) throw new CategoryValidationError(file, 'items fehlt');
  if (itemsRaw.length < minItems) throw new CategoryValidationError(file, `mindestens ${minItems} Einträge nötig, ${itemsRaw.length} vorhanden`);
  if (itemsRaw.length > maxItems) throw new CategoryValidationError(file, `höchstens ${maxItems} Einträge erlaubt`);

  const names = new Set<string>();
  const values = new Set<number>();
  const items: CategoryItem[] = itemsRaw.map((it, idx) => {
    if (!isRecord(it)) throw new CategoryValidationError(file, `items[${idx}] ist kein Objekt`);
    const name = requireString(it, 'name', file);
    const key = name.trim().toLowerCase();
    if (names.has(key)) throw new CategoryValidationError(file, `doppelter Name "${name}"`);
    names.add(key);
    const value = it.value;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new CategoryValidationError(file, `items[${idx}] "${name}": value ist keine Zahl`);
    }
    if (forSort && values.has(value)) throw new CategoryValidationError(file, `doppelter Wert ${value} bei "${name}"`);
    values.add(value);
    if (it.label !== undefined && typeof it.label !== 'string') {
      throw new CategoryValidationError(file, `items[${idx}] "${name}": label muss ein String sein`);
    }
    if (it.aliases !== undefined && (!Array.isArray(it.aliases) || !it.aliases.every((a) => typeof a === 'string' && a.trim().length > 0))) {
      throw new CategoryValidationError(file, `items[${idx}] "${name}": aliases muss eine Liste von Strings sein`);
    }
    const item: CategoryItem = { name, value };
    if (it.label !== undefined) item.label = it.label;
    if (it.aliases !== undefined) item.aliases = it.aliases as string[];
    return item;
  });

  return {
    kind: 'ranked',
    id,
    title: requireString(raw, 'title', file),
    question: requireString(raw, 'question', file),
    topLabel: requireString(raw, 'topLabel', file),
    bottomLabel: requireString(raw, 'bottomLabel', file),
    unit: typeof raw.unit === 'string' ? raw.unit : '',
    order: order as SortOrder,
    source: typeof raw.source === 'string' ? raw.source : undefined,
    ...(valueFormat !== undefined ? { valueFormat } : {}),
    games,
    items,
  };
}

function validatePairs(raw: Record<string, unknown>, file: string): PairsCategory {
  const id = readId(raw, file);
  const games = readGames(raw, file, ['match']);
  if (!games.includes('match')) throw new CategoryValidationError(file, 'Paarlisten gehören zu "match"');
  if (games.some((g) => g !== 'match')) throw new CategoryValidationError(file, 'Paarlisten taugen nur für "match"');

  const pairsRaw = raw.pairs;
  if (!Array.isArray(pairsRaw)) throw new CategoryValidationError(file, 'pairs fehlt');
  if (pairsRaw.length < MIN_PAIRS) throw new CategoryValidationError(file, `mindestens ${MIN_PAIRS} Paare nötig, ${pairsRaw.length} vorhanden`);
  if (pairsRaw.length > MAX_PAIRS) throw new CategoryValidationError(file, `höchstens ${MAX_PAIRS} Paare erlaubt`);

  const lefts = new Set<string>();
  const rights = new Set<string>();
  const pairs: MatchPair[] = pairsRaw.map((p, idx) => {
    if (!isRecord(p)) throw new CategoryValidationError(file, `pairs[${idx}] ist kein Objekt`);
    const left = requireString(p, 'left', file).trim();
    const right = requireString(p, 'right', file).trim();
    const lk = left.toLowerCase();
    const rk = right.toLowerCase();
    if (lefts.has(lk)) throw new CategoryValidationError(file, `doppelte Karte "${left}"`);
    if (rights.has(rk)) throw new CategoryValidationError(file, `doppeltes Ziel "${right}"`);
    lefts.add(lk);
    rights.add(rk);
    return { left, right };
  });

  const decoysRaw = raw.decoys ?? [];
  if (!Array.isArray(decoysRaw) || !decoysRaw.every((d) => typeof d === 'string' && d.trim().length > 0)) {
    throw new CategoryValidationError(file, 'decoys muss eine Liste von Strings sein');
  }
  if (decoysRaw.length > MAX_DECOYS) throw new CategoryValidationError(file, `höchstens ${MAX_DECOYS} Köder erlaubt`);
  const decoys: string[] = [];
  const seenDecoys = new Set<string>();
  for (const d of decoysRaw as string[]) {
    const text = d.trim();
    const key = text.toLowerCase();
    if (rights.has(key)) throw new CategoryValidationError(file, `Köder "${text}" ist zugleich ein Ziel`);
    if (seenDecoys.has(key)) throw new CategoryValidationError(file, `doppelter Köder "${text}"`);
    seenDecoys.add(key);
    decoys.push(text);
  }

  return {
    kind: 'pairs',
    id,
    title: requireString(raw, 'title', file),
    question: requireString(raw, 'question', file),
    leftLabel: requireString(raw, 'leftLabel', file),
    rightLabel: requireString(raw, 'rightLabel', file),
    source: typeof raw.source === 'string' ? raw.source : undefined,
    games,
    pairs,
    decoys,
  };
}

function validatePlaces(raw: Record<string, unknown>, file: string): PlacesCategory {
  const id = readId(raw, file);
  const games = readGames(raw, file, ['map']);
  if (!games.includes('map') || games.some((g) => g !== 'map')) {
    throw new CategoryValidationError(file, 'Ortslisten taugen nur für "map"');
  }

  let bounds: LatLngBounds | undefined;
  if (raw.bounds !== undefined) {
    const b = raw.bounds;
    const ok =
      Array.isArray(b) &&
      b.length === 2 &&
      b.every((corner) => Array.isArray(corner) && corner.length === 2 && isValidLatLng(corner[0], corner[1]));
    if (!ok) throw new CategoryValidationError(file, 'bounds muss [[süd, west], [nord, ost]] sein');
    const [[south, west], [north, east]] = b as LatLngBounds;
    if (south >= north) throw new CategoryValidationError(file, 'bounds: Süd muss kleiner als Nord sein');
    bounds = [
      [south, west],
      [north, east],
    ];
  }

  const placesRaw = raw.places;
  if (!Array.isArray(placesRaw)) throw new CategoryValidationError(file, 'places fehlt');
  if (placesRaw.length < MIN_PLACES) throw new CategoryValidationError(file, `mindestens ${MIN_PLACES} Orte nötig, ${placesRaw.length} vorhanden`);
  if (placesRaw.length > MAX_PLACES) throw new CategoryValidationError(file, `höchstens ${MAX_PLACES} Orte erlaubt`);

  const names = new Set<string>();
  const ids = new Set<string>();
  const places: Place[] = placesRaw.map((p, idx) => {
    if (!isRecord(p)) throw new CategoryValidationError(file, `places[${idx}] ist kein Objekt`);
    const name = requireString(p, 'name', file).trim();
    const key = name.toLowerCase();
    if (names.has(key)) throw new CategoryValidationError(file, `doppelter Ort "${name}"`);
    names.add(key);
    if (!isValidLatLng(p.lat, p.lng)) throw new CategoryValidationError(file, `places[${idx}] "${name}": lat/lng ungültig`);
    let placeId = slugify(name) || `ort-${idx + 1}`;
    if (ids.has(placeId)) placeId = `${placeId}-${idx + 1}`;
    ids.add(placeId);
    return { id: placeId, name, lat: p.lat as number, lng: p.lng as number };
  });

  return {
    kind: 'places',
    id,
    title: requireString(raw, 'title', file),
    question: requireString(raw, 'question', file),
    source: typeof raw.source === 'string' ? raw.source : undefined,
    ...(bounds ? { bounds } : {}),
    games,
    places,
  };
}

function validateEvents(raw: Record<string, unknown>, file: string): EventsCategory {
  const id = readId(raw, file);
  const games = readGames(raw, file, ['timeline']);
  if (!games.includes('timeline') || games.some((g) => g !== 'timeline')) {
    throw new CategoryValidationError(file, 'Ereignislisten taugen nur für "timeline"');
  }

  const eventsRaw = raw.events;
  if (!Array.isArray(eventsRaw)) throw new CategoryValidationError(file, 'events fehlt');
  if (eventsRaw.length < MIN_EVENTS) throw new CategoryValidationError(file, `mindestens ${MIN_EVENTS} Ereignisse nötig, ${eventsRaw.length} vorhanden`);
  if (eventsRaw.length > MAX_EVENTS) throw new CategoryValidationError(file, `höchstens ${MAX_EVENTS} Ereignisse erlaubt`);

  const names = new Set<string>();
  const ids = new Set<string>();
  const events: TimelineEvent[] = eventsRaw.map((e, idx) => {
    if (!isRecord(e)) throw new CategoryValidationError(file, `events[${idx}] ist kein Objekt`);
    const name = requireString(e, 'name', file).trim();
    const key = name.toLowerCase();
    if (names.has(key)) throw new CategoryValidationError(file, `doppeltes Ereignis "${name}"`);
    names.add(key);
    const hasYear = e.year !== undefined;
    const hasSpan = e.from !== undefined || e.to !== undefined;
    if (hasYear === hasSpan) throw new CategoryValidationError(file, `events[${idx}] "${name}": entweder year oder from und to angeben`);
    const from = hasYear ? e.year : e.from;
    const to = hasYear ? e.year : e.to;
    if (!isTimelineYear(from) || !isTimelineYear(to)) {
      throw new CategoryValidationError(file, `events[${idx}] "${name}": Jahre müssen ganzzahlig, nicht 0 und auf dem Zeitstrahl sein`);
    }
    if (from > to) throw new CategoryValidationError(file, `events[${idx}] "${name}": from muss vor to liegen`);
    if (hasSpan && from === to) throw new CategoryValidationError(file, `events[${idx}] "${name}": gleiche Jahre bitte als year angeben`);
    let eventId = slugify(name) || `ereignis-${idx + 1}`;
    if (ids.has(eventId)) eventId = `${eventId}-${idx + 1}`;
    ids.add(eventId);
    return { id: eventId, name, from, to };
  });

  return {
    kind: 'events',
    id,
    title: requireString(raw, 'title', file),
    question: requireString(raw, 'question', file),
    source: typeof raw.source === 'string' ? raw.source : undefined,
    games,
    events,
  };
}
