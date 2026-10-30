import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createServer, type QuizServer } from '../src/server.ts';
import { provider } from './fixtures.ts';

const calls: string[] = [];
let app: QuizServer;
let base: string;

/** Antwortet wie Deezer, ohne ins Netz zu gehen. */
async function fakeDeezer(url: string): Promise<Response> {
  calls.push(url);
  if (url.includes('/search')) {
    return Response.json({
      data: [
        { id: 1, title: 'Mr. Brightside', preview: 'https://cdn/x.mp3', duration: 223, artist: { name: 'The Killers' }, album: { cover_medium: 'https://cdn/c.jpg' } },
        { id: 2, title: 'Ohne Ausschnitt', preview: '', artist: { name: 'X' } },
      ],
    });
  }
  if (url.endsWith('/track/1')) return Response.json({ id: 1, title: 'Mr. Brightside', preview: 'https://cdn/x.mp3', artist: { name: 'The Killers' }, album: {} });
  if (url.endsWith('/track/7')) throw new Error('offline');
  return Response.json({ error: { type: 'DataException' } });
}

beforeAll(() => {
  app = createServer({ port: 0, hostname: '127.0.0.1', distDir: '/nonexistent', categories: provider, songsFetcher: fakeDeezer });
  base = `http://127.0.0.1:${app.server.port}/api/songs`;
});

afterAll(() => app.stop());

describe('Songs: Deezer-Anbindung', () => {
  test('Suche liefert nur Songs mit Ausschnitt, zu kurze Anfragen gehen gar nicht raus', async () => {
    const res = await (await fetch(`${base}/search?q=brightside`)).json();
    expect(res.hits).toEqual([{ deezer: 1, title: 'Mr. Brightside', artist: 'The Killers', cover: 'https://cdn/c.jpg', duration: 223 }]);
    const before = calls.length;
    expect((await (await fetch(`${base}/search?q=a`)).json()).hits).toEqual([]);
    expect(calls.length).toBe(before);
  });

  test('Track mit Ausschnitt, kurz zwischengespeichert; Fehler werden zu 4xx/5xx', async () => {
    const first = await (await fetch(`${base}/track/1`)).json();
    expect(first).toMatchObject({ deezer: 1, preview: 'https://cdn/x.mp3', cover: null });
    const before = calls.length;
    await fetch(`${base}/track/1`);
    expect(calls.length).toBe(before);
    expect((await fetch(`${base}/track/abc`)).status).toBe(400);
    expect((await fetch(`${base}/track/5`)).status).toBe(502);
    expect((await fetch(`${base}/track/7`)).status).toBe(502);
  });
});
