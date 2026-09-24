import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { CLOSE_CODES, PROTOCOL_VERSION, type ClientMsg, type ServerMsg } from '@quiz/shared';
import { createServer, type QuizServer } from '../src/server.ts';
import { provider } from './fixtures.ts';

class Client {
  private ws: WebSocket;
  private queue: ServerMsg[] = [];
  private waiters: ((m: ServerMsg) => void)[] = [];
  private log: string[] = [];
  closed: Promise<{ code: number; reason: string }>;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.closed = new Promise((resolve) => {
      this.ws.addEventListener('close', (ev) => resolve({ code: ev.code, reason: ev.reason }));
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data)) as ServerMsg;
      this.log.push(msg.type === 'state' ? `state#${msg.seq}/${msg.room.phase}` : msg.type === 'error' ? `error:${msg.code}` : msg.type);
      const w = this.waiters.shift();
      if (w) w(msg);
      else this.queue.push(msg);
    });
  }

  open(): Promise<void> {
    return new Promise((resolve) => this.ws.addEventListener('open', () => resolve()));
  }

  send(msg: ClientMsg): void {
    this.ws.send(JSON.stringify(msg));
  }

  sendRaw(raw: string): void {
    this.ws.send(raw);
  }

  next(timeoutMs = 2000): Promise<ServerMsg> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error(`Timeout beim Warten auf Nachricht. Bisher: ${this.log.join(', ')}`)),
        timeoutMs,
      );
      this.waiters.push((m) => {
        clearTimeout(t);
        resolve(m);
      });
    });
  }

  async nextOfType<T extends ServerMsg['type']>(type: T, timeoutMs = 2000): Promise<Extract<ServerMsg, { type: T }>> {
    for (let i = 0; i < 10; i++) {
      const m = await this.next(timeoutMs);
      if (m.type === type) return m as Extract<ServerMsg, { type: T }>;
    }
    throw new Error(`Keine Nachricht vom Typ ${type}`);
  }

  close(): void {
    this.ws.close();
  }
}

let app: QuizServer;
let wsUrl: string;

beforeAll(() => {
  app = createServer({ port: 0, hostname: '127.0.0.1', distDir: '/nonexistent', categories: provider });
  wsUrl = app.url.replace('http', 'ws') + '/ws';
});

afterAll(() => {
  app.stop();
});

describe('WebSocket-Ablauf', () => {
  test('health antwortet', async () => {
    const res = await fetch(app.url + '/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  test('ohne Frontend-Build liefert der Server 503', async () => {
    const res = await fetch(app.url + '/');
    expect(res.status).toBe(503);
  });

  test('erstellen, beitreten, Reconnect mit Tab-Übernahme, verlassen', async () => {
    const tim = new Client(wsUrl);
    await tim.open();
    tim.send({ type: 'create', name: 'Tim', version: PROTOCOL_VERSION });
    const welcome = await tim.nextOfType('welcome');
    expect(welcome.playerId).toBeTruthy();
    expect(welcome.token).toBeTruthy();
    const code = welcome.code;
    const state1 = await tim.nextOfType('state');
    expect(state1.room.players.map((p) => p.name)).toEqual(['Tim']);
    expect(state1.room.hostId).toBe(welcome.playerId);

    const anna = new Client(wsUrl);
    await anna.open();
    anna.send({ type: 'join', code: code.toLowerCase(), name: 'Anna', version: PROTOCOL_VERSION });
    const annaWelcome = await anna.nextOfType('welcome');
    expect(annaWelcome.code).toBe(code);
    const annaState = await anna.nextOfType('state');
    expect(annaState.room.players.map((p) => p.name)).toEqual(['Tim', 'Anna']);
    const timState2 = await tim.nextOfType('state');
    expect(timState2.seq).toBe(annaState.seq);

    const dup = new Client(wsUrl);
    await dup.open();
    dup.send({ type: 'join', code, name: 'tim', version: PROTOCOL_VERSION });
    expect(await dup.nextOfType('error')).toMatchObject({ code: 'name_taken' });
    dup.send({ type: 'join', code: 'ZZZZ', name: 'X', version: PROTOCOL_VERSION });
    expect(await dup.nextOfType('error')).toMatchObject({ code: 'room_not_found' });
    dup.send({ type: 'join', code, name: 'X', version: 99 });
    expect(await dup.nextOfType('error')).toMatchObject({ code: 'version' });
    dup.sendRaw('{kein json');
    expect(await dup.nextOfType('error')).toMatchObject({ code: 'bad_message' });
    dup.close();

    const screen = new Client(wsUrl);
    await screen.open();
    screen.send({ type: 'watch', code, version: PROTOCOL_VERSION });
    expect(await screen.nextOfType('welcome')).toMatchObject({ role: 'screen', playerId: null });
    expect((await screen.nextOfType('state')).room.players.length).toBe(2);
    screen.send({ type: 'start_game', gameId: 'sort' });
    expect(await screen.nextOfType('error')).toMatchObject({ code: 'not_allowed' });

    // Tab-Übernahme: zweiter Socket mit Tims Token verdrängt den ersten.
    const tim2 = new Client(wsUrl);
    await tim2.open();
    tim2.send({ type: 'join', code, token: welcome.token, version: PROTOCOL_VERSION });
    const w2 = await tim2.nextOfType('welcome');
    expect(w2.playerId).toBe(welcome.playerId);
    const closedInfo = await tim.closed;
    expect(closedInfo.code).toBe(CLOSE_CODES.REPLACED);
    const s = await tim2.nextOfType('state');
    expect(s.room.players.find((p) => p.name === 'Tim')?.connected).toBe(true);

    // Host startet das Spiel, Anna darf nicht.
    anna.send({ type: 'start_game', gameId: 'sort' });
    expect(await anna.nextOfType('error')).toMatchObject({ code: 'not_host' });
    tim2.send({ type: 'start_game', gameId: 'sort' });
    const started = await tim2.nextOfType('state');
    expect(started.room.phase).toBe('choosing_category');
    expect(started.room.categories?.length).toBe(2);

    // Kick schließt Annas Socket mit 4001.
    tim2.send({ type: 'kick', playerId: annaWelcome.playerId! });
    expect((await anna.closed).code).toBe(CLOSE_CODES.KICKED);
    const afterKick = await tim2.nextOfType('state');
    expect(afterKick.room.players.length).toBe(1);

    // Letzter verlässt: Raum verschwindet, Screen wird geschlossen.
    tim2.send({ type: 'leave' });
    expect((await screen.closed).code).toBe(CLOSE_CODES.ROOM_CLOSED);
    expect(app.registry.get(code)).toBeUndefined();
    tim2.close();
  });

  test('Verbindungsabbruch markiert den Spieler als getrennt', async () => {
    const a = new Client(wsUrl);
    await a.open();
    a.send({ type: 'create', name: 'A', version: PROTOCOL_VERSION });
    const w = await a.nextOfType('welcome');
    await a.nextOfType('state');
    const b = new Client(wsUrl);
    await b.open();
    b.send({ type: 'join', code: w.code, name: 'B', version: PROTOCOL_VERSION });
    await b.nextOfType('welcome');
    await b.nextOfType('state');
    a.close();
    const s = await b.nextOfType('state');
    expect(s.room.players.find((p) => p.name === 'A')?.connected).toBe(false);
    expect(s.room.hostId).toBe(w.playerId);
    b.close();
  });

  test('eine Platzierung läuft mit echten Timern durch alle Zustände', async () => {
    const a = new Client(wsUrl);
    await a.open();
    a.send({ type: 'create', name: 'A', version: PROTOCOL_VERSION });
    const w = await a.nextOfType('welcome');
    await a.nextOfType('state');
    const b = new Client(wsUrl);
    await b.open();
    b.send({ type: 'join', code: w.code, name: 'B', version: PROTOCOL_VERSION });
    const wb = await b.nextOfType('welcome');
    await b.nextOfType('state');
    await a.nextOfType('state');

    a.send({ type: 'start_game', gameId: 'sort' });
    await a.nextOfType('state');
    await b.nextOfType('state');
    a.send({ type: 'choose_category', categoryId: 'cities' });
    const playing = await a.nextOfType('state');
    await b.nextOfType('state');
    expect(playing.room.phase).toBe('playing');
    expect(playing.room.round?.activePlayerId).toBe(w.playerId);
    expect(JSON.stringify(playing.room.round)).not.toContain('"value"');

    // Richtige Lücke serverseitig bestimmen, der Client kennt keine Werte.
    const room = app.registry.get(w.code)!;
    const round = room.round!;
    const cardId = round.pool[0]!;
    const value = round.cards.find((c) => c.id === cardId)!.value;
    const chainValues = round.chain.map((id) => round.cards.find((c) => c.id === id)!.value);
    let gapIndex = chainValues.findIndex((v) => v < value);
    if (gapIndex === -1) gapIndex = chainValues.length;

    a.send({ type: 'select', turnNo: 1, cardId, gapIndex });
    const selected = await b.nextOfType('state');
    expect(selected.room.round?.selection).toEqual({ cardId, gapIndex });
    await a.nextOfType('state');

    const t0 = Date.now();
    a.send({ type: 'confirm', turnNo: 1 });
    const pending = await b.nextOfType('state');
    expect(pending.room.round?.placement).toMatchObject({ cardId, gapIndex, status: 'pending' });
    expect(pending.room.round?.chain[gapIndex]).toBe(cardId);
    await a.nextOfType('state');

    const resolved = await b.nextOfType('state', 3000);
    expect(resolved.room.round?.placement?.status).toBe('correct');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1900);
    await a.nextOfType('state', 3000);

    const applied = await b.nextOfType('state', 3000);
    expect(applied.room.round?.placement).toBeNull();
    expect(applied.room.round?.activePlayerId).toBe(wb.playerId);
    expect(applied.room.round?.turnNo).toBe(2);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(3400);

    a.close();
    b.close();
  }, 15_000);
});
