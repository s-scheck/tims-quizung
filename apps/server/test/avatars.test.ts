import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CategoryStore } from '@quiz/content';
import { AVATAR_PART_MAX_BYTES, podiumHeights } from '@quiz/shared';
import { createServer, type QuizServer } from '../src/server.ts';
import { toView } from '../src/rooms/view.ts';
import type { Room } from '../src/rooms/room.ts';

let root: string;
let app: QuizServer;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'quiz-avatars-'));
  const builtin = join(root, 'builtin');
  mkdirSync(builtin);
  app = createServer({ port: 0, hostname: '127.0.0.1', distDir: '/nonexistent', store: new CategoryStore(builtin, null) });
});

afterAll(() => {
  app.stop();
  rmSync(root, { recursive: true, force: true });
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function png(name: string, bytes: Uint8Array = PNG): File {
  return new File([bytes], name, { type: 'image/png' });
}

function upload(room: Room, fields: Record<string, string | File>): Promise<Response> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return fetch(`${app.url}/api/rooms/${room.code}/avatar`, { method: 'POST', body: form });
}

function makeRoom(): { room: Room; host: { id: string; token: string }; guest: { id: string; token: string } } {
  const room = app.registry.create()!;
  const a = room.join('Anna', undefined);
  const b = room.join('Ben', undefined);
  if (!a.ok || !b.ok) throw new Error('join');
  return { room, host: { id: a.player.id, token: a.player.token }, guest: { id: b.player.id, token: b.player.token } };
}

describe('Figuren', () => {
  test('hochladen nur mit gültiger Sitzung, einmal, in der Lobby, und geheim bis zum Spielstart', async () => {
    const { room, host, guest } = makeRoom();
    expect((await upload(room, { token: 'falsch', shape: 'circle', head: png('h.png') })).status).toBe(403);
    expect((await upload(room, { token: host.token, shape: 'dreieck', head: png('h.png') })).status).toBe(400);

    const res = await upload(room, { token: host.token, shape: 'square', head: png('h.png'), armL: png('a.png') });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, parts: ['head', 'armL'] });
    // Nach „Fertig“ ist die Figur fest.
    expect((await upload(room, { token: host.token, shape: 'circle', head: png('h.png') })).status).toBe(409);

    // In der Lobby sieht man nur den Status, das Bild gibt es noch nicht.
    let view = toView(room, guest.id);
    expect(view.players.find((p) => p.id === host.id)).toMatchObject({ avatarReady: true });
    expect(view.players.find((p) => p.id === host.id)?.avatar).toBeUndefined();
    expect(view.players.find((p) => p.id === guest.id)).toMatchObject({ avatarReady: false });
    expect((await fetch(`${app.url}/api/rooms/${room.code}/avatar/${host.id}/head`)).status).toBe(404);

    expect(room.handle(host.id, { type: 'start_game' }).ok).toBe(true);
    view = toView(room, null);
    expect(view.phase).toBe('intro');
    const avatar = view.players.find((p) => p.id === host.id)?.avatar;
    expect(avatar).toMatchObject({ shape: 'square', parts: ['head', 'armL'] });
    expect(view.players.find((p) => p.id === guest.id)?.avatar).toBeUndefined();

    const img = await fetch(`${app.url}/api/rooms/${room.code.toLowerCase()}/avatar/${host.id}/head?v=${avatar!.v}`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(PNG);
    // Leer gelassene Teile und unbekannte Teile gibt es nicht.
    expect((await fetch(`${app.url}/api/rooms/${room.code}/avatar/${host.id}/legR`)).status).toBe(404);
    expect((await fetch(`${app.url}/api/rooms/${room.code}/avatar/${host.id}/bauch`)).status).toBe(404);

    // Nachzügler und wer nicht fertig wurde: nach dem Start kein Upload mehr.
    expect((await upload(room, { token: guest.token, shape: 'circle', head: png('h.png') })).status).toBe(409);
  });

  test('lehnt fremde Typen, zu große Teile und unbekannte Teile ab', async () => {
    const { room, host } = makeRoom();
    expect((await upload(room, { token: host.token, shape: 'circle', head: new File(['<svg/>'], 'h.svg', { type: 'image/svg+xml' }) })).status).toBe(415);
    const big = new Uint8Array(AVATAR_PART_MAX_BYTES + 1);
    big.set(PNG);
    expect((await upload(room, { token: host.token, shape: 'circle', head: png('h.png', big) })).status).toBe(413);
    expect((await upload(room, { token: host.token, shape: 'circle', bauch: png('b.png') })).status).toBe(400);
    expect((await upload(room, { token: host.token, shape: 'circle', head: 'kein bild' })).status).toBe(400);
    expect(room.avatars.size).toBe(0);
    expect((await fetch(`${app.url}/api/rooms/ZZZZ/avatar`, { method: 'POST', body: new FormData() })).status).toBe(404);
  });

  test('zurück in die Lobby und Verlassen löschen die Figur', async () => {
    const { room, host, guest } = makeRoom();
    expect((await upload(room, { token: guest.token, shape: 'circle', head: png('h.png') })).status).toBe(201);
    expect(room.avatars.has(guest.id)).toBe(true);
    room.leave(guest.id);
    expect(room.avatars.has(guest.id)).toBe(false);

    expect((await upload(room, { token: host.token, shape: 'circle', head: png('h.png') })).status).toBe(201);
    expect(room.handle(host.id, { type: 'start_game' }).ok).toBe(true);
    expect(room.handle(host.id, { type: 'intro_done' }).ok).toBe(true);
    expect(room.handle(host.id, { type: 'end_game' }).ok).toBe(true);
    expect(room.handle(host.id, { type: 'finale_step' }).ok).toBe(true);
    expect(room.handle(host.id, { type: 'back_to_lobby' }).ok).toBe(true);
    expect(room.avatars.size).toBe(0);
    expect(toView(room, null).players[0]?.avatarReady).toBe(false);
  });

  test('Plattformhöhen nach Gesamtpunkten, 0 oder weniger ist der Boden', () => {
    expect(podiumHeights({ a: 10, b: 5, c: 0, d: -3 })).toEqual({ a: 1, b: 0.5, c: 0, d: 0 });
    expect(podiumHeights({ a: 0, b: -1 })).toEqual({ a: 0, b: 0 });
    expect(podiumHeights({})).toEqual({});
  });
});
