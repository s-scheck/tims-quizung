import { slugify, validateCategory, CategoryValidationError } from '@quiz/content/schema';
import type { GameId } from '@quiz/shared';

export type Kind = 'ranked' | 'pairs' | 'places' | 'events' | 'prompts';
export type Raw = Record<string, unknown>;

/** Spiele in der Reihenfolge der Spielauswahl, mit der Art Liste, die sie brauchen. */
export const EDITOR_GAMES: { id: GameId; name: string; kind: Kind; hint: string }[] = [
  { id: 'sort', name: 'Sortieren', kind: 'ranked', hint: '10 bis 20 Einträge mit eindeutigen Werten.' },
  { id: 'topx', name: 'Top X', kind: 'ranked', hint: '5 bis 20 Einträge, Platz 1 zuerst, mit Quelle. Aliasse helfen beim Erkennen der Tipps.' },
  { id: 'match', name: 'Zuordnen', kind: 'pairs', hint: '4 bis 12 Paare und bis zu 5 Köder, die zu keiner Karte passen.' },
  { id: 'map', name: 'Karte', kind: 'places', hint: '10 bis 30 Orte mit Koordinaten.' },
  { id: 'timeline', name: 'Zeitstrahl', kind: 'events', hint: '10 bis 30 Ereignisse mit Jahr oder Spanne, negativ heißt v. Chr.' },
  { id: 'risk', name: 'No Risk No Fun', kind: 'ranked', hint: '10 bis 50 Einträge, Platz 1 zuerst. Platz 1 sollte bekannt, die hinteren Plätze Nischenwissen sein.' },
  { id: 'bluff', name: 'Bluff', kind: 'prompts', hint: '8 bis 30 Aufgaben mit der echten Antwort, etwa Film und Subline. Die Antwort muss stimmen, sie ist die Wahrheit im Spiel.' },
];

export const GAME_NAMES: Record<string, string> = Object.fromEntries(EDITOR_GAMES.map((g) => [g.id, g.name]));

// ---------------------------------------------------------------- Spalten

export type ColumnType = 'text' | 'number' | 'list' | 'year' | 'coord';

export interface Column {
  key: string;
  label: string;
  type: ColumnType;
  optional?: boolean;
  placeholder?: string;
  /** Tailwind-Breitenklasse der Spalte. */
  width?: string;
}

export const COLUMNS: Record<Kind, Column[]> = {
  ranked: [
    { key: 'name', label: 'Name', type: 'text', placeholder: 'z. B. Russland', width: 'min-w-44' },
    { key: 'value', label: 'Wert', type: 'number', placeholder: '17.098.246', width: 'w-32' },
    { key: 'label', label: 'Anzeige statt Wert', type: 'text', optional: true, placeholder: 'optional', width: 'w-36' },
    { key: 'aliases', label: 'Aliasse', type: 'list', optional: true, placeholder: 'mit Komma getrennt', width: 'min-w-44' },
  ],
  pairs: [
    { key: 'left', label: 'Karte', type: 'text', placeholder: 'z. B. Paris', width: 'min-w-44' },
    { key: 'right', label: 'Ziel', type: 'text', placeholder: 'z. B. Frankreich', width: 'min-w-44' },
  ],
  places: [
    { key: 'name', label: 'Ort', type: 'text', placeholder: 'z. B. Eiffelturm', width: 'min-w-44' },
    { key: 'lat', label: 'Breite', type: 'coord', placeholder: '48.8584', width: 'w-28' },
    { key: 'lng', label: 'Länge', type: 'coord', placeholder: '2.2945', width: 'w-28' },
  ],
  events: [
    { key: 'name', label: 'Ereignis', type: 'text', placeholder: 'z. B. Französische Revolution', width: 'min-w-52' },
    { key: 'from', label: 'Jahr bzw. von', type: 'year', placeholder: '1789', width: 'w-32' },
    { key: 'to', label: 'bis', type: 'year', optional: true, placeholder: 'optional', width: 'w-32' },
  ],
  prompts: [
    { key: 'name', label: 'Aufgabe', type: 'text', placeholder: 'z. B. Alien (1979)', width: 'min-w-52' },
    { key: 'answer', label: 'Echte Antwort', type: 'text', placeholder: 'z. B. Im Weltraum hört dich niemand schreien.', width: 'min-w-72' },
  ],
};

export const DECOY_COLUMNS: Column[] = [{ key: 'text', label: 'Köder', type: 'text', placeholder: 'z. B. Lettland', width: 'min-w-44' }];

// ------------------------------------------------------------------ Felder

export interface Field {
  key: string;
  label: string;
  type: 'text' | 'order' | 'plain';
  optional?: boolean;
  placeholder?: string;
}

export const FIELDS: Record<Kind, Field[]> = {
  ranked: [
    { key: 'title', label: 'Titel', type: 'text', placeholder: 'Länder nach Fläche' },
    { key: 'question', label: 'Frage', type: 'text', placeholder: 'Welches Land ist größer?' },
    { key: 'topLabel', label: 'Beschriftung oben', type: 'text', placeholder: 'größte Fläche' },
    { key: 'bottomLabel', label: 'Beschriftung unten', type: 'text', placeholder: 'kleinste Fläche' },
    { key: 'unit', label: 'Einheit', type: 'text', optional: true, placeholder: 'km²' },
    { key: 'source', label: 'Quelle', type: 'text', optional: true, placeholder: 'z. B. CIA World Factbook' },
    { key: 'order', label: 'Reihenfolge', type: 'order' },
    { key: 'valueFormat', label: 'Werte ohne Tausenderpunkt (z. B. Jahreszahlen)', type: 'plain' },
  ],
  pairs: [
    { key: 'title', label: 'Titel', type: 'text', placeholder: 'Hauptstädte' },
    { key: 'question', label: 'Frage', type: 'text', placeholder: 'Welche Hauptstadt gehört zu welchem Land?' },
    { key: 'leftLabel', label: 'Beschriftung Karten', type: 'text', placeholder: 'Hauptstadt' },
    { key: 'rightLabel', label: 'Beschriftung Ziele', type: 'text', placeholder: 'Land' },
    { key: 'source', label: 'Quelle', type: 'text', optional: true },
  ],
  places: [
    { key: 'title', label: 'Titel', type: 'text', placeholder: 'Wahrzeichen' },
    { key: 'question', label: 'Frage', type: 'text', placeholder: 'Wo steht das?' },
    { key: 'source', label: 'Quelle', type: 'text', optional: true, placeholder: 'gängige Koordinaten' },
  ],
  events: [
    { key: 'title', label: 'Titel', type: 'text', placeholder: 'Weltgeschichte' },
    { key: 'question', label: 'Frage', type: 'text', placeholder: 'Wann war das?' },
    { key: 'source', label: 'Quelle', type: 'text', optional: true, placeholder: 'gängige Datierung' },
  ],
  prompts: [
    { key: 'title', label: 'Titel', type: 'text', placeholder: 'Film-Sublines' },
    { key: 'question', label: 'Frage', type: 'text', placeholder: 'Wie lautet die echte Subline?' },
    { key: 'promptLabel', label: 'Bezeichnung der Aufgabe', type: 'text', placeholder: 'Film' },
    { key: 'answerLabel', label: 'Bezeichnung der Antwort', type: 'text', placeholder: 'Subline' },
    { key: 'instruction', label: 'Anweisung an die Spieler', type: 'text', placeholder: 'Schreib eine Subline, wie sie auf dem Plakat stehen könnte.' },
    { key: 'source', label: 'Quelle', type: 'text', optional: true, placeholder: 'nach Kinoplakat' },
  ],
};

// ----------------------------------------------------------------- Zahlen

/** Liest Zahlen wie aus Excel: „17.098.246“, „1.450,9“, „1450.9“, „1 450“. */
export function parseNumber(text: string): number {
  let s = text.trim().replace(/[\s  ']/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return Number(s);
}

/** Jahr wie „1789“, „-44“, „44 v. Chr.“ oder „800 n. Chr.“. */
export function parseYear(text: string): number {
  const m = text.trim().match(/^(-?\d{1,4})\s*(v\.?\s*chr\.?|n\.?\s*chr\.?)?$/i);
  if (!m) return NaN;
  const n = Number(m[1]);
  return m[2] && /^v/i.test(m[2]) ? -Math.abs(n) : n;
}

export function parseCoord(text: string): number {
  const s = text.trim().replace(/°/g, '');
  if (!s) return NaN;
  return Number(s.includes('.') ? s : s.replace(',', '.'));
}

/** „48.8584, 2.2945“ wie aus Google Maps kopiert. */
export function parseLatLng(text: string): { lat: number; lng: number } | null {
  const m = text.trim().match(/^\(?\s*(-?\d+(?:\.\d+)?)°?\s*[,;\s]\s*(-?\d+(?:\.\d+)?)°?\s*\)?$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

function formatNumber(n: unknown): string {
  return typeof n === 'number' ? String(n) : typeof n === 'string' ? n : '';
}

// ----------------------------------------------------------------- Modell

export type Row = Record<string, string>;

export interface Draft {
  kind: Kind;
  meta: Record<string, string>;
  games: GameId[];
  rows: Row[];
  decoys: Row[];
}

export function kindOfRaw(raw: Raw): Kind {
  if ('pairs' in raw) return 'pairs';
  if ('places' in raw) return 'places';
  if ('events' in raw) return 'events';
  if ('prompts' in raw) return 'prompts';
  return 'ranked';
}

const str = (x: unknown) => (typeof x === 'string' ? x : '');
const arr = (x: unknown): Raw[] => (Array.isArray(x) ? x.filter((r): r is Raw => typeof r === 'object' && r !== null) : []);

export function emptyRow(columns: Column[]): Row {
  return Object.fromEntries(columns.map((c) => [c.key, '']));
}

export function draftFromRaw(raw: Raw): Draft {
  const kind = kindOfRaw(raw);
  const meta: Record<string, string> = {};
  for (const f of FIELDS[kind]) meta[f.key] = str(raw[f.key]);
  if (kind === 'ranked') meta.order = raw.order === 'asc' ? 'asc' : 'desc';
  const games = (Array.isArray(raw.games) ? raw.games : kind === 'ranked' ? ['sort'] : []) as GameId[];
  let rows: Row[];
  switch (kind) {
    case 'ranked':
      rows = arr(raw.items).map((it) => ({
        name: str(it.name),
        value: formatNumber(it.value),
        label: str(it.label),
        aliases: Array.isArray(it.aliases) ? it.aliases.join(', ') : '',
      }));
      break;
    case 'pairs':
      rows = arr(raw.pairs).map((p) => ({ left: str(p.left), right: str(p.right) }));
      break;
    case 'places':
      rows = arr(raw.places).map((p) => ({ name: str(p.name), lat: formatNumber(p.lat), lng: formatNumber(p.lng) }));
      break;
    case 'events':
      rows = arr(raw.events).map((e) =>
        e.year !== undefined
          ? { name: str(e.name), from: formatNumber(e.year), to: '' }
          : { name: str(e.name), from: formatNumber(e.from), to: formatNumber(e.to) },
      );
      break;
    case 'prompts':
      rows = arr(raw.prompts).map((p) => ({ name: str(p.name), answer: str(p.answer) }));
      break;
  }
  const decoys = kind === 'pairs' && Array.isArray(raw.decoys) ? raw.decoys.map((d) => ({ text: str(d) })) : [];
  return { kind, meta, games, rows, decoys };
}

export function newDraft(game: GameId): Draft {
  const kind = EDITOR_GAMES.find((g) => g.id === game)?.kind ?? 'ranked';
  const meta: Record<string, string> = Object.fromEntries(FIELDS[kind].map((f) => [f.key, '']));
  if (kind === 'ranked') {
    meta.order = 'desc';
    if (game === 'risk') meta.bottomLabel = 'letzter Platz';
  }
  if (kind === 'events') meta.question = 'Wann war das?';
  if (kind === 'places') meta.question = 'Wo liegt das?';
  if (kind === 'prompts') meta.question = 'Wie lautet die echte Antwort?';
  const rows = Array.from({ length: 3 }, () => emptyRow(COLUMNS[kind]));
  return { kind, meta, games: kind === 'ranked' ? [game] : [], rows, decoys: kind === 'pairs' ? [emptyRow(DECOY_COLUMNS)] : [] };
}

const filled = (row: Row) => Object.values(row).some((v) => v.trim() !== '');

/** Wandelt den Entwurf in die JSON-Liste. Felder der Vorlage, die der Editor nicht kennt (z. B. bounds), bleiben erhalten. */
export function draftToRaw(draft: Draft, id: string, base: Raw = {}): Raw {
  const raw: Raw = { ...base, id };
  delete raw.deleted;
  for (const f of FIELDS[draft.kind]) {
    const v = (draft.meta[f.key] ?? '').trim();
    if (f.type === 'plain') {
      if (v === 'plain') raw.valueFormat = 'plain';
      else delete raw.valueFormat;
    } else if (f.optional && !v && f.key !== 'unit') delete raw[f.key];
    else raw[f.key] = v;
  }
  const rows = draft.rows.filter(filled);
  switch (draft.kind) {
    case 'ranked': {
      raw.games = draft.games;
      raw.items = rows.map((r) => {
        const value = parseNumber(r.value ?? '');
        const item: Raw = { name: (r.name ?? '').trim(), value: Number.isFinite(value) ? value : (r.value ?? '').trim() };
        if ((r.label ?? '').trim()) item.label = r.label!.trim();
        const aliases = (r.aliases ?? '').split(/[,;]/).map((a) => a.trim()).filter(Boolean);
        if (aliases.length) item.aliases = aliases;
        return item;
      });
      break;
    }
    case 'pairs':
      raw.games = ['match'];
      raw.pairs = rows.map((r) => ({ left: (r.left ?? '').trim(), right: (r.right ?? '').trim() }));
      raw.decoys = draft.decoys.map((d) => (d.text ?? '').trim()).filter(Boolean);
      break;
    case 'places':
      raw.games = ['map'];
      raw.places = rows.map((r) => {
        const lat = parseCoord(r.lat ?? '');
        const lng = parseCoord(r.lng ?? '');
        return { name: (r.name ?? '').trim(), lat: Number.isFinite(lat) ? lat : (r.lat ?? '').trim(), lng: Number.isFinite(lng) ? lng : (r.lng ?? '').trim() };
      });
      break;
    case 'events':
      raw.games = ['timeline'];
      raw.events = rows.map((r) => {
        const name = (r.name ?? '').trim();
        const from = parseYear(r.from ?? '');
        const toText = (r.to ?? '').trim();
        const fromValue = Number.isFinite(from) ? from : (r.from ?? '').trim();
        if (!toText) return { name, year: fromValue };
        const to = parseYear(toText);
        const toValue = Number.isFinite(to) ? to : toText;
        return fromValue === toValue ? { name, year: fromValue } : { name, from: fromValue, to: toValue };
      });
      break;
    case 'prompts':
      raw.games = ['bluff'];
      raw.prompts = rows.map((r) => ({ name: (r.name ?? '').trim(), answer: (r.answer ?? '').trim() }));
      break;
  }
  return raw;
}

// ----------------------------------------------------------------- Prüfen

/** Erste Regelverletzung wie auf dem Server, mit „Zeile n“ statt Feldindex. */
export function validate(raw: Raw, id: string): string | null {
  try {
    validateCategory(raw, id);
    return null;
  } catch (err) {
    const msg = err instanceof CategoryValidationError ? err.message.replace(/^[^:]*:\s*/, '') : String(err);
    return humanize(msg);
  }
}

export function humanize(msg: string): string {
  return msg
    .replace(/\b(?:items|pairs|places|events|prompts)\[(\d+)\]/g, (_, n) => `Zeile ${Number(n) + 1}`)
    .replace(/\bvalue ist keine Zahl/, 'Wert ist keine Zahl')
    .replace(/\blat\/lng ungültig/, 'Koordinaten ungültig');
}

/** Probleme je Zelle, für rote Rahmen direkt in der Tabelle. */
export function cellIssues(kind: Kind, rows: Row[]): Record<string, string>[] {
  const columns = COLUMNS[kind];
  const first = columns[0]!.key;
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = (r[first] ?? '').trim().toLowerCase();
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return rows.map((r) => {
    const out: Record<string, string> = {};
    if (!filled(r)) return out;
    for (const c of columns) {
      const v = (r[c.key] ?? '').trim();
      if (!v) {
        if (!c.optional) out[c.key] = 'fehlt';
        continue;
      }
      if (c.type === 'number' && !Number.isFinite(parseNumber(v))) out[c.key] = 'keine Zahl';
      if (c.type === 'coord' && !Number.isFinite(parseCoord(v))) out[c.key] = 'keine Zahl';
      if (c.type === 'coord' && c.key === 'lat' && Math.abs(parseCoord(v)) > 90) out[c.key] = 'zwischen −90 und 90';
      if (c.type === 'coord' && c.key === 'lng' && Math.abs(parseCoord(v)) > 180) out[c.key] = 'zwischen −180 und 180';
      if (c.type === 'year') {
        const y = parseYear(v);
        if (!Number.isInteger(y)) out[c.key] = 'kein Jahr';
        else if (y === 0) out[c.key] = 'ein Jahr 0 gibt es nicht';
      }
    }
    const k = (r[first] ?? '').trim().toLowerCase();
    if (k && (counts.get(k) ?? 0) > 1) out[first] = 'doppelt';
    return out;
  });
}

/** Nach Wert sortieren, wie Top X und No Risk es brauchen: Platz 1 zuerst. */
export function sortRowsByValue(rows: Row[], order: string): Row[] {
  const dir = order === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = parseNumber(a.value ?? '');
    const vb = parseNumber(b.value ?? '');
    if (!Number.isFinite(va)) return 1;
    if (!Number.isFinite(vb)) return -1;
    return (va - vb) * dir;
  });
}

// ---------------------------------------------------------------- Einfügen

/** Zerlegt eingefügten Text aus Excel, Google Sheets oder CSV in Zeilen und Zellen. */
export function parsePasted(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const sep = lines.some((l) => l.includes('\t')) ? '\t' : lines.some((l) => l.includes(';')) ? ';' : null;
  return lines.map((l) => (sep ? l.split(sep) : [l]).map((c) => c.trim().replace(/^"(.*)"$/, '$1')));
}

export function rowsFromCells(cells: string[][], columns: Column[]): Row[] {
  return cells.map((line) => Object.fromEntries(columns.map((c, i) => [c.key, line[i] ?? ''])));
}

// -------------------------------------------------------------------- ids

const PREFIX: Partial<Record<GameId, string>> = { topx: 'topx-', risk: 'risk-', match: 'match-', map: 'map-', timeline: 'zeit-', bluff: 'bluff-' };

/** Neue id aus dem Titel, mit dem üblichen Präfix des Spiels, eindeutig gegenüber `taken`. */
export function makeId(title: string, game: GameId, taken: Set<string>): string {
  const base = `${PREFIX[game] ?? ''}${slugify(title) || 'liste'}`.slice(0, 70).replace(/-+$/, '');
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

