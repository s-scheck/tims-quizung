import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CategoryValidationError, validateCategory, type Category } from './schema.ts';

export * from './schema.ts';

export const CATEGORIES_DIR = join(import.meta.dir, '..', 'categories');

/** Lädt und prüft alle Kategorien eines Ordners. Wirft beim ersten Fehler. */
export function loadCategories(dir: string = CATEGORIES_DIR): Category[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const seen = new Set<string>();
  const out: Category[] = [];
  for (const file of files) {
    const raw: unknown = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const category = validateCategory(raw, file);
    if (category.id !== file.replace(/\.json$/, '')) {
      throw new CategoryValidationError(file, `id "${category.id}" muss dem Dateinamen entsprechen`);
    }
    if (seen.has(category.id)) throw new CategoryValidationError(file, `doppelte id "${category.id}"`);
    seen.add(category.id);
    out.push(category);
  }
  return out;
}

let cache: Category[] | null = null;

export function getCategories(): Category[] {
  cache ??= loadCategories();
  return cache;
}

export function getCategory(id: string): Category | undefined {
  return getCategories().find((c) => c.id === id);
}
