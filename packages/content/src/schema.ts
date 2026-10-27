import {
  GAME_IDS,
  isTimelineYear,
  isValidLatLng,
  type BluffCategoryInfo,
  type CategoryInfo,
  type GameId,
  type LatLngBounds,
  type MapCategoryInfo,
  type MatchCategoryInfo,
  type PictureCategoryInfo,
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

export interface Prompt {
  /** Aus dem Namen abgeleitet, eindeutig innerhalb der Liste. */
  id: string;
  /** Die Aufgabe, z. B. Filmtitel mit Jahr. */
  name: string;
  /** Die echte Antwort, z. B. die Subline. */
  answer: string;
}

/** Aufgabenliste mit echten Antworten, für Bluff. */
export interface PromptsCategory extends BluffCategoryInfo {
  kind: 'prompts';
  games: GameId[];
  prompts: Prompt[];
}

/** Ein verdecktes Feld im Bild, Lage und Größe in Prozent der Bildmaße. */
export interface PictureField {
  /** `f1`, `f2`, … in Reihenfolge der Liste. */
  id: string;
  answer: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bild mit verdeckten Stellen, für Bilderrätsel. */
export interface PictureCategory extends PictureCategoryInfo {
  kind: 'picture';
  games: GameId[];
  /** Dateiname in der Bildablage oder http(s)-Adresse. */
  image: string;
  /** Optionales Original, wenn `image` bearbeitet ist: Aufdecken zeigt den Originalausschnitt. */
  original?: string;
  fields: PictureField[];
}

export type Category = RankedCategory | PairsCategory | PlacesCategory | EventsCategory | PromptsCategory | PictureCategory;

/** Dateinamen in der Bildablage: klein, ohne Pfad, mit Bildendung. */
export const IMAGE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,119}\.(jpg|jpeg|png|webp|svg)$/;
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
/** Erlaubte Upload-Typen mit ihrer Dateiendung. */
export const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export function isImageRef(value: unknown): value is string {
  return typeof value === 'string' && (IMAGE_NAME_PATTERN.test(value) || /^https?:\/\/\S+$/.test(value));
}

/** Jede Liste braucht mindestens zwei Einträge. Nach oben gibt es keine Grenze, die Daten bestimmen die Rundenlänge. */
export const MIN_ENTRIES = 2;

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
  if ('prompts' in raw) return validatePrompts(raw, file);
  if ('fields' in raw) return validatePicture(raw, file);
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
  if (games.includes('bluff')) throw new CategoryValidationError(file, 'Bluff braucht eine Aufgabenliste mit "prompts"');
  if (games.includes('picture')) throw new CategoryValidationError(file, 'Bilderrätsel braucht ein Bild mit "fields"');
  const forSort = games.includes('sort');
  const forTopX = games.includes('topx');

  const itemsRaw = raw.items;
  if (!Array.isArray(itemsRaw)) throw new CategoryValidationError(file, 'items fehlt');
  if (itemsRaw.length < MIN_ENTRIES) throw new CategoryValidationError(file, `mindestens ${MIN_ENTRIES} Einträge nötig, ${itemsRaw.length} vorhanden`);

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

  // Bei Top X und No Risk ist die Reihenfolge der Platz, also muss sie zu den Werten passen.
  if (forTopX || games.includes('risk')) {
    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1]!.value;
      const cur = items[i]!.value;
      if (order === 'desc' ? cur > prev : cur < prev) {
        throw new CategoryValidationError(file, `items[${i}] "${items[i]!.name}": für Top X und No Risk müssen die Einträge nach Wert sortiert sein, Platz 1 zuerst`);
      }
    }
  }

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
  if (pairsRaw.length < MIN_ENTRIES) throw new CategoryValidationError(file, `mindestens ${MIN_ENTRIES} Paare nötig, ${pairsRaw.length} vorhanden`);

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
  if (placesRaw.length < MIN_ENTRIES) throw new CategoryValidationError(file, `mindestens ${MIN_ENTRIES} Orte nötig, ${placesRaw.length} vorhanden`);

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
  if (eventsRaw.length < MIN_ENTRIES) throw new CategoryValidationError(file, `mindestens ${MIN_ENTRIES} Ereignisse nötig, ${eventsRaw.length} vorhanden`);

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

function validatePrompts(raw: Record<string, unknown>, file: string): PromptsCategory {
  const id = readId(raw, file);
  const games = readGames(raw, file, ['bluff']);
  if (!games.includes('bluff') || games.some((g) => g !== 'bluff')) {
    throw new CategoryValidationError(file, 'Aufgabenlisten taugen nur für "bluff"');
  }

  const promptsRaw = raw.prompts;
  if (!Array.isArray(promptsRaw)) throw new CategoryValidationError(file, 'prompts fehlt');
  if (promptsRaw.length < MIN_ENTRIES) throw new CategoryValidationError(file, `mindestens ${MIN_ENTRIES} Aufgaben nötig, ${promptsRaw.length} vorhanden`);

  const names = new Set<string>();
  const ids = new Set<string>();
  const prompts: Prompt[] = promptsRaw.map((p, idx) => {
    if (!isRecord(p)) throw new CategoryValidationError(file, `prompts[${idx}] ist kein Objekt`);
    const name = requireString(p, 'name', file).trim();
    const answer = requireString(p, 'answer', file).trim();
    const key = name.toLowerCase();
    if (names.has(key)) throw new CategoryValidationError(file, `doppelte Aufgabe "${name}"`);
    names.add(key);
    let promptId = slugify(name) || `aufgabe-${idx + 1}`;
    if (ids.has(promptId)) promptId = `${promptId}-${idx + 1}`;
    ids.add(promptId);
    return { id: promptId, name, answer };
  });

  return {
    kind: 'prompts',
    id,
    title: requireString(raw, 'title', file),
    question: requireString(raw, 'question', file),
    promptLabel: requireString(raw, 'promptLabel', file),
    answerLabel: requireString(raw, 'answerLabel', file),
    instruction: requireString(raw, 'instruction', file),
    source: typeof raw.source === 'string' ? raw.source : undefined,
    games,
    prompts,
  };
}


function readPercent(raw: Record<string, unknown>, key: string, file: string, idx: number): number {
  const v = raw[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new CategoryValidationError(file, `fields[${idx}]: ${key} ist keine Zahl`);
  return v;
}

function validatePicture(raw: Record<string, unknown>, file: string): PictureCategory {
  const id = readId(raw, file);
  const title = requireString(raw, 'title', file);
  const question = requireString(raw, 'question', file);
  const games = readGames(raw, file, ['picture']);
  if (!games.includes('picture')) throw new CategoryValidationError(file, 'Bilder gehören zu "picture"');
  if (games.some((g) => g !== 'picture')) throw new CategoryValidationError(file, 'Bilder taugen nur für "picture"');
  if (!isImageRef(raw.image)) throw new CategoryValidationError(file, 'image fehlt oder ist kein Dateiname bzw. keine http-Adresse');
  if (raw.original !== undefined && !isImageRef(raw.original)) {
    throw new CategoryValidationError(file, 'original ist kein Dateiname bzw. keine http-Adresse');
  }

  const fieldsRaw = raw.fields;
  if (!Array.isArray(fieldsRaw)) throw new CategoryValidationError(file, 'fields fehlt');
  if (fieldsRaw.length < MIN_ENTRIES) throw new CategoryValidationError(file, `mindestens ${MIN_ENTRIES} Felder nötig, ${fieldsRaw.length} vorhanden`);

  const fields: PictureField[] = fieldsRaw.map((f, idx) => {
    if (!isRecord(f)) throw new CategoryValidationError(file, `fields[${idx}] ist kein Objekt`);
    const answer = typeof f.answer === 'string' ? f.answer.trim() : '';
    if (!answer) throw new CategoryValidationError(file, `fields[${idx}]: answer fehlt oder ist leer`);
    const x = readPercent(f, 'x', file, idx);
    const y = readPercent(f, 'y', file, idx);
    const w = readPercent(f, 'w', file, idx);
    const h = readPercent(f, 'h', file, idx);
    if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 100.01 || y + h > 100.01) {
      throw new CategoryValidationError(file, `fields[${idx}]: Rechteck liegt nicht im Bild (Prozentwerte 0 bis 100)`);
    }
    return { id: `f${idx + 1}`, answer, x, y, w, h };
  });

  const source = typeof raw.source === 'string' && raw.source.trim() ? raw.source : undefined;
  return {
    kind: 'picture',
    id,
    title,
    question,
    games,
    image: raw.image,
    ...(typeof raw.original === 'string' ? { original: raw.original } : {}),
    fields,
    ...(source !== undefined ? { source } : {}),
  };
}
