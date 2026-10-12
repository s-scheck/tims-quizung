import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CategoryStore } from '@quiz/content';
import { createServer, type QuizServer } from '../src/server.ts';

const events = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Ereignis ${i + 1}`, year: 1900 + i }));
const timeline = (id: string, n: number) => ({ id, title: 'Meine Zeitreise', question: 'Wann?', games: ['timeline'], events: events(n) });

let root: string;
let app: QuizServer;
let base: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'quiz-editor-'));
  const builtin = join(root, 'builtin');
  mkdirSync(builtin);
  writeFileSync(join(builtin, 'zeit-a.json'), JSON.stringify(timeline('zeit-a', 10)));
  const store = new CategoryStore(builtin, join(root, 'data'));
  app = createServer({ port: 0, hostname: '127.0.0.1', distDir: '/nonexistent', store });
  base = `http://127.0.0.1:${app.server.port}/api/editor/categories`;
});

afterAll(() => {
  app.stop();
  rmSync(root, { recursive: true, force: true });
});

const put = (id: string, body: unknown) => fetch(`${base}/${id}`, { method: 'PUT', body: JSON.stringify(body) });

describe('Editor-Schnittstelle', () => {
  test('Liste und Einzelansicht', async () => {
    const list = await (await fetch(base)).json();
    expect(list.editable).toBe(true);
    expect(list.entries.map((e: { id: string; status: string }) => [e.id, e.status])).toEqual([['zeit-a', 'builtin']]);
    const doc = await (await fetch(`${base}/zeit-a`)).json();
    expect(doc.raw.title).toBe('Meine Zeitreise');
    expect(doc.original.title).toBe('Meine Zeitreise');
    expect((await fetch(`${base}/gibts-nicht`)).status).toBe(404);
  });

  test('speichern: Entwurf, dann spielbar und sofort in neuen Räumen wählbar', async () => {
    const draft = await (await put('zeit-neu', timeline('zeit-neu', 4))).json();
    expect(draft.entry).toMatchObject({ status: 'custom', draft: true });
    expect(app.registry.create()!.categories.list().map((c) => c.id)).not.toContain('zeit-neu');

    const done = await (await put('zeit-neu', timeline('zeit-neu', 10))).json();
    expect(done.entry).toMatchObject({ status: 'custom', draft: false, count: 10 });
    expect(app.registry.create()!.categories.list().map((c) => c.id)).toContain('zeit-neu');
  });

  test('ausblenden und zurücksetzen einer mitgelieferten Liste', async () => {
    const hidden = await (await fetch(`${base}/zeit-a`, { method: 'DELETE' })).json();
    expect(hidden.entry.status).toBe('hidden');
    expect(app.registry.create()!.categories.get('zeit-a')).toBeUndefined();
    const reset = await (await fetch(`${base}/zeit-a/reset`, { method: 'POST' })).json();
    expect(reset.entry.status).toBe('builtin');
  });

  test('ungültige Anfragen', async () => {
    expect((await put('Böse..id', timeline('x', 10))).status).toBe(400);
    expect((await fetch(`${base}/zeit-x`, { method: 'PUT', body: '{kaputt' })).status).toBe(400);
    expect((await fetch(`${base}/zeit-x`, { method: 'PUT', body: '[1,2]' })).status).toBe(400);
    expect((await fetch(`${base}/zeit-x`, { method: 'PUT', body: 'x'.repeat(300 * 1024) })).status).toBe(413);
    expect((await fetch(`${base}/zeit-x`, { method: 'DELETE' })).status).toBe(404);
  });
});
