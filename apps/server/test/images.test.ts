import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CategoryStore } from '@quiz/content';
import { createServer, type QuizServer } from '../src/server.ts';

let root: string;
let app: QuizServer;
let noData: QuizServer;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'quiz-images-'));
  const builtin = join(root, 'builtin');
  mkdirSync(builtin);
  const dataDir = join(root, 'data');
  const store = new CategoryStore(builtin, dataDir);
  app = createServer({ port: 0, hostname: '127.0.0.1', distDir: '/nonexistent', store, dataDir });
  noData = createServer({ port: 0, hostname: '127.0.0.1', distDir: '/nonexistent', store: new CategoryStore(builtin, null) });
});

afterAll(() => {
  app.stop();
  noData.stop();
  rmSync(root, { recursive: true, force: true });
});

function upload(base: string, file: File): Promise<Response> {
  const form = new FormData();
  form.set('file', file);
  return fetch(`${base}/api/editor/images`, { method: 'POST', body: form });
}

describe('Bildablage', () => {
  test('hochladen, abrufen, Name aus dem Dateinamen', async () => {
    const res = await upload(app.url, new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'Mein Wohnzimmer.svg', { type: 'image/svg+xml' }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { name: string; url: string };
    expect(body.name).toMatch(/^[a-z0-9]+-mein-wohnzimmer\.svg$/);
    expect(body.url).toBe(`/images/${body.name}`);
    const img = await fetch(`${app.url}${body.url}`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toContain('svg');
    expect(img.headers.get('cache-control')).toContain('immutable');
    expect(await img.text()).toContain('<svg');
  });

  test('lehnt falsche Typen, leere Dateien, fremde Namen ab', async () => {
    expect((await upload(app.url, new File(['x'], 'a.gif', { type: 'image/gif' }))).status).toBe(415);
    expect((await upload(app.url, new File([], 'a.png', { type: 'image/png' }))).status).toBe(400);
    expect((await fetch(`${app.url}/api/editor/images`, { method: 'POST', body: 'nope' })).status).toBe(400);
    expect((await fetch(`${app.url}/images/gibts-nicht.png`)).status).toBe(404);
    expect((await fetch(`${app.url}/images/..%2Fcategories%2Fx.json`)).status).toBe(404);
  });

  test('ohne Datenordner kein Upload und kein Bild', async () => {
    expect((await upload(noData.url, new File(['x'], 'a.png', { type: 'image/png' }))).status).toBe(409);
    expect((await fetch(`${noData.url}/images/a.png`)).status).toBe(404);
  });
});
