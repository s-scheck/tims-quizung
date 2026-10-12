import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_IDS, type EditorDocument, type EditorEntry, type EditorStatus, type GameId } from '@quiz/shared';
import { CategoryValidationError, validateCategory, type Category } from './schema.ts';

export type { EditorDocument, EditorEntry, EditorStatus } from '@quiz/shared';
export type CategoryKind = Category['kind'];

export const CATEGORY_ID_PATTERN = /^[a-z0-9-]{1,80}$/;
/** Großzügig für 50 Einträge mit Aliassen, aber klein genug gegen Missbrauch. */
export const MAX_CATEGORY_BYTES = 256 * 1024;

interface Builtin {
  raw: Record<string, unknown>;
  category: Category;
}

type Overlay =
  | { deleted: true }
  | { deleted: false; raw: Record<string, unknown>; category: Category | null; error?: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function message(err: unknown): string {
  if (err instanceof CategoryValidationError) return err.message.replace(/^[^:]*:\s*/, '');
  return err instanceof Error ? err.message : String(err);
}

/** Art der Liste an ihren Feldern erkennen, auch wenn sie (noch) ungültig ist. */
export function kindOf(raw: Record<string, unknown>): CategoryKind {
  if ('pairs' in raw) return 'pairs';
  if ('places' in raw) return 'places';
  if ('events' in raw) return 'events';
  return 'ranked';
}

function countOf(raw: Record<string, unknown>): number {
  const list = raw.pairs ?? raw.places ?? raw.events ?? raw.items;
  return Array.isArray(list) ? list.length : 0;
}

function gamesOf(raw: Record<string, unknown>, kind: CategoryKind): GameId[] {
  if (Array.isArray(raw.games)) return raw.games.filter((g): g is GameId => (GAME_IDS as readonly unknown[]).includes(g));
  return kind === 'pairs' ? ['match'] : kind === 'places' ? ['map'] : kind === 'events' ? ['timeline'] : ['sort'];
}

/** Prüft Rohdaten wie beim Laden. Wirft nicht, sondern liefert die Kategorie oder die erste Regelverletzung. */
export function checkCategory(raw: Record<string, unknown>, id: string): { category: Category } | { error: string } {
  try {
    const category = validateCategory(raw, `${id}.json`);
    if (category.id !== id) return { error: `id "${category.id}" muss "${id}" sein` };
    return { category };
  } catch (err) {
    return { error: message(err) };
  }
}

/**
 * Mitgelieferte Kategorien plus ein Datenordner, der sie überlagert.
 * Im Datenordner liegt je Kategorie eine JSON-Datei: eine eigene Liste, eine geänderte Fassung
 * einer mitgelieferten oder `{ "id": …, "deleted": true }` zum Ausblenden.
 * Ungültige Dateien sind Entwürfe: der Editor sieht sie, das Spiel nicht.
 */
export class CategoryStore {
  private builtin = new Map<string, Builtin>();
  private overlay = new Map<string, Overlay>();
  private playable: Category[] = [];
  private readonly overlayDir: string | null;

  constructor(
    private readonly builtinDir: string,
    dataDir: string | null,
  ) {
    this.overlayDir = dataDir ? join(dataDir, 'categories') : null;
    this.load();
  }

  /** Liest alles neu ein. Mitgelieferte Listen müssen gültig sein, sonst wirft es. */
  load(): void {
    this.builtin.clear();
    for (const file of readdirSync(this.builtinDir).filter((f) => f.endsWith('.json')).sort()) {
      const raw: unknown = JSON.parse(readFileSync(join(this.builtinDir, file), 'utf8'));
      if (!isRecord(raw)) throw new CategoryValidationError(file, 'kein Objekt');
      const id = file.replace(/\.json$/, '');
      const checked = checkCategory(raw, id);
      if ('error' in checked) throw new CategoryValidationError(file, checked.error);
      this.builtin.set(id, { raw, category: checked.category });
    }

    this.overlay.clear();
    if (this.overlayDir && existsSync(this.overlayDir)) {
      for (const file of readdirSync(this.overlayDir).filter((f) => f.endsWith('.json')).sort()) {
        const id = file.replace(/\.json$/, '');
        if (!CATEGORY_ID_PATTERN.test(id)) continue;
        try {
          const raw: unknown = JSON.parse(readFileSync(join(this.overlayDir, file), 'utf8'));
          if (!isRecord(raw)) continue;
          this.overlay.set(id, this.toOverlay(id, raw));
        } catch (err) {
          console.warn(`[content] ${file} im Datenordner übersprungen: ${message(err)}`);
        }
      }
    }
    this.rebuild();
  }

  private toOverlay(id: string, raw: Record<string, unknown>): Overlay {
    if (raw.deleted === true) return { deleted: true };
    const checked = checkCategory(raw, id);
    return 'error' in checked
      ? { deleted: false, raw, category: null, error: checked.error }
      : { deleted: false, raw, category: checked.category };
  }

  private rebuild(): void {
    const ids = [...new Set([...this.builtin.keys(), ...this.overlay.keys()])].sort();
    this.playable = [];
    for (const id of ids) {
      const over = this.overlay.get(id);
      if (over?.deleted) continue;
      // Ein Entwurf einer mitgelieferten Liste ersetzt das Original erst, wenn er gültig ist.
      const category = over?.category ?? this.builtin.get(id)?.category;
      if (category) this.playable.push(category);
    }
  }

  // ------------------------------------------------------------------ Spiel

  list(): Category[] {
    return this.playable;
  }

  get(id: string): Category | undefined {
    return this.playable.find((c) => c.id === id);
  }

  // ----------------------------------------------------------------- Editor

  get editable(): boolean {
    return this.overlayDir !== null;
  }

  has(id: string): boolean {
    return this.builtin.has(id) || this.overlay.has(id);
  }

  entries(): EditorEntry[] {
    const ids = [...new Set([...this.builtin.keys(), ...this.overlay.keys()])].sort();
    return ids.map((id) => this.entry(id)!);
  }

  private entry(id: string): EditorEntry | undefined {
    const base = this.builtin.get(id);
    const over = this.overlay.get(id);
    if (!base && !over) return undefined;
    if (over?.deleted && !base) return undefined;
    const raw = over && !over.deleted ? over.raw : base!.raw;
    const kind = kindOf(raw);
    const status: EditorStatus = over?.deleted ? 'hidden' : !base ? 'custom' : over ? 'modified' : 'builtin';
    const error = over && !over.deleted ? over.error : undefined;
    return {
      id,
      title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : id,
      kind,
      games: gamesOf(raw, kind),
      count: countOf(raw),
      status,
      draft: error !== undefined,
      ...(error !== undefined ? { error } : {}),
    };
  }

  document(id: string): EditorDocument | undefined {
    const entry = this.entry(id);
    if (!entry) return undefined;
    const base = this.builtin.get(id);
    const over = this.overlay.get(id);
    const raw = over && !over.deleted ? over.raw : base!.raw;
    return { entry, raw, ...(base ? { original: base.raw } : {}) };
  }

  private write(id: string, data: Record<string, unknown>): void {
    if (!this.overlayDir) throw new Error('Kein Datenordner eingerichtet');
    mkdirSync(this.overlayDir, { recursive: true });
    const target = join(this.overlayDir, `${id}.json`);
    const tmp = `${target}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
    renameSync(tmp, target);
  }

  private unlink(id: string): void {
    if (!this.overlayDir) return;
    const target = join(this.overlayDir, `${id}.json`);
    if (existsSync(target)) unlinkSync(target);
  }

  /** Speichert eine Liste. Ungültige Listen landen als Entwurf. */
  save(id: string, raw: Record<string, unknown>): EditorEntry {
    if (!CATEGORY_ID_PATTERN.test(id)) throw new Error('Ungültige id');
    const data: Record<string, unknown> = { ...raw, id };
    delete data.deleted;
    this.write(id, data);
    this.overlay.set(id, this.toOverlay(id, data));
    this.rebuild();
    return this.entry(id)!;
  }

  /** Mitgelieferte Listen werden ausgeblendet, eigene gelöscht. */
  remove(id: string): EditorEntry | undefined {
    if (this.builtin.has(id)) {
      this.write(id, { id, deleted: true });
      this.overlay.set(id, { deleted: true });
    } else {
      this.unlink(id);
      this.overlay.delete(id);
    }
    this.rebuild();
    return this.entry(id);
  }

  /** Verwirft Änderungen an einer mitgelieferten Liste, auch das Ausblenden. */
  reset(id: string): EditorEntry | undefined {
    if (!this.builtin.has(id)) return this.entry(id);
    this.unlink(id);
    this.overlay.delete(id);
    this.rebuild();
    return this.entry(id);
  }
}
