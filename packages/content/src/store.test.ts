import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CategoryStore } from './store.ts';

const places = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Ort ${i + 1}`, lat: i, lng: i }));
const mapList = (id: string, n = 10) => ({ id, title: `Liste ${id}`, question: 'Wo?', games: ['map'], places: places(n) });

let root: string;
let builtinDir: string;
let dataDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'quiz-store-'));
  builtinDir = join(root, 'builtin');
  dataDir = join(root, 'data');
  mkdirSync(builtinDir);
  writeFileSync(join(builtinDir, 'map-a.json'), JSON.stringify(mapList('map-a')));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('CategoryStore', () => {
  test('ohne Datenordner: nur mitgelieferte Listen, nicht bearbeitbar', () => {
    const store = new CategoryStore(builtinDir, null);
    expect(store.editable).toBe(false);
    expect(store.list().map((c) => c.id)).toEqual(['map-a']);
    expect(store.entries()).toEqual([{ id: 'map-a', title: 'Liste map-a', kind: 'places', games: ['map'], count: 10, status: 'builtin', draft: false }]);
  });

  test('eigene Liste: unfertig ist Entwurf, fertig spielbar, Löschen entfernt die Datei', () => {
    const store = new CategoryStore(builtinDir, dataDir);
    const draft = store.save('map-b', mapList('map-b', 1));
    expect(draft).toMatchObject({ status: 'custom', draft: true, count: 1 });
    expect(draft.error).toMatch(/mindestens 2/);
    expect(store.get('map-b')).toBeUndefined();

    expect(store.save('map-b', mapList('map-b', 12))).toMatchObject({ status: 'custom', draft: false });
    expect(store.get('map-b')?.kind).toBe('places');
    expect(existsSync(join(dataDir, 'categories', 'map-b.json'))).toBe(true);

    expect(store.remove('map-b')).toBeUndefined();
    expect(store.get('map-b')).toBeUndefined();
    expect(existsSync(join(dataDir, 'categories', 'map-b.json'))).toBe(false);
  });

  test('mitgelieferte Liste: ändern, Entwurf behält Original im Spiel, ausblenden, zurücksetzen', () => {
    const store = new CategoryStore(builtinDir, dataDir);
    expect(store.save('map-a', { ...mapList('map-a', 11), title: 'Neu' }).status).toBe('modified');
    expect(store.get('map-a')?.title).toBe('Neu');

    store.save('map-a', { ...mapList('map-a', 1), title: 'Kaputt' });
    expect(store.get('map-a')?.title).toBe('Liste map-a');
    expect(store.document('map-a')?.raw.title).toBe('Kaputt');
    expect(store.document('map-a')?.original?.title).toBe('Liste map-a');

    expect(store.remove('map-a')?.status).toBe('hidden');
    expect(store.list()).toEqual([]);
    expect(JSON.parse(readFileSync(join(dataDir, 'categories', 'map-a.json'), 'utf8'))).toEqual({ id: 'map-a', deleted: true });

    expect(store.reset('map-a')?.status).toBe('builtin');
    expect(store.get('map-a')?.title).toBe('Liste map-a');
  });

  test('übersteht einen Neustart, die id aus dem Dateinamen gewinnt, fremde Dateien werden ignoriert', () => {
    const first = new CategoryStore(builtinDir, dataDir);
    first.save('map-b', { ...mapList('map-x', 10) });
    writeFileSync(join(dataDir, 'categories', 'kaputt.json'), '{ nicht json');
    writeFileSync(join(dataDir, 'categories', 'BÖSE NAME.json'), JSON.stringify(mapList('x')));
    const second = new CategoryStore(builtinDir, dataDir);
    expect(second.list().map((c) => c.id)).toEqual(['map-a', 'map-b']);
    expect(second.entries().map((e) => e.id)).toEqual(['map-a', 'map-b']);
  });

  test('ungültige ids werden abgelehnt', () => {
    const store = new CategoryStore(builtinDir, dataDir);
    expect(() => store.save('../etc/passwd', mapList('x'))).toThrow();
    expect(() => store.save('Groß', mapList('x'))).toThrow();
  });
});
