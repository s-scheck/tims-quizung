import type { CategoryInfo, SortOrder } from '@quiz/shared';

export interface CategoryItem {
  name: string;
  value: number;
  /** Überschreibt die Standardformatierung des Werts in der Auflösung. */
  label?: string;
}

export interface Category extends CategoryInfo {
  items: CategoryItem[];
}

export const MIN_ITEMS = 10;
export const MAX_ITEMS = 20;

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

export function validateCategory(raw: unknown, file: string): Category {
  if (!isRecord(raw)) throw new CategoryValidationError(file, 'kein Objekt');

  const id = requireString(raw, 'id', file);
  if (!/^[a-z0-9-]+$/.test(id)) throw new CategoryValidationError(file, `id "${id}" darf nur a-z, 0-9 und - enthalten`);

  const order = raw.order;
  if (order !== 'asc' && order !== 'desc') throw new CategoryValidationError(file, 'order muss "asc" oder "desc" sein');

  const valueFormat = raw.valueFormat;
  if (valueFormat !== undefined && valueFormat !== 'grouped' && valueFormat !== 'plain') {
    throw new CategoryValidationError(file, 'valueFormat muss "grouped" oder "plain" sein');
  }

  const itemsRaw = raw.items;
  if (!Array.isArray(itemsRaw)) throw new CategoryValidationError(file, 'items fehlt');
  if (itemsRaw.length < MIN_ITEMS) throw new CategoryValidationError(file, `mindestens ${MIN_ITEMS} Einträge nötig, ${itemsRaw.length} vorhanden`);
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
    if (values.has(value)) throw new CategoryValidationError(file, `doppelter Wert ${value} bei "${name}"`);
    values.add(value);
    if (it.label !== undefined && typeof it.label !== 'string') {
      throw new CategoryValidationError(file, `items[${idx}] "${name}": label muss ein String sein`);
    }
    return it.label === undefined ? { name, value } : { name, value, label: it.label };
  });

  return {
    id,
    title: requireString(raw, 'title', file),
    question: requireString(raw, 'question', file),
    topLabel: requireString(raw, 'topLabel', file),
    bottomLabel: requireString(raw, 'bottomLabel', file),
    unit: typeof raw.unit === 'string' ? raw.unit : '',
    order: order as SortOrder,
    source: typeof raw.source === 'string' ? raw.source : undefined,
    ...(valueFormat !== undefined ? { valueFormat } : {}),
    items,
  };
}
