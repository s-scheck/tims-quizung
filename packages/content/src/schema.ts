import { GAME_IDS, type CategoryInfo, type GameId, type MatchCategoryInfo, type SortOrder } from '@quiz/shared';

export interface CategoryItem {
  name: string;
  value: number;
  /** Überschreibt die Standardformatierung des Werts in der Auflösung. */
  label?: string;
  /** Weitere Schreibweisen für den Namensabgleich bei Top X. */
  aliases?: string[];
}

/** Rangliste mit Werten, für Sortieren und Top X. */
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

export type Category = RankedCategory | PairsCategory;

/** Sortieren braucht 10 Karten und eindeutige Werte, eine Top-Liste darf kürzer sein und Gleichstände haben. */
export const MIN_ITEMS = 10;
export const MIN_ITEMS_TOPX = 5;
export const MAX_ITEMS = 20;
export const MIN_PAIRS = 4;
export const MAX_PAIRS = 12;
export const MAX_DECOYS = 5;

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
  return 'pairs' in raw ? validatePairs(raw, file) : validateRanked(raw, file);
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
  const forSort = games.includes('sort');
  const minItems = forSort ? MIN_ITEMS : MIN_ITEMS_TOPX;

  const itemsRaw = raw.items;
  if (!Array.isArray(itemsRaw)) throw new CategoryValidationError(file, 'items fehlt');
  if (itemsRaw.length < minItems) throw new CategoryValidationError(file, `mindestens ${minItems} Einträge nötig, ${itemsRaw.length} vorhanden`);
  if (itemsRaw.length > MAX_ITEMS) throw new CategoryValidationError(file, `höchstens ${MAX_ITEMS} Einträge erlaubt`);

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
