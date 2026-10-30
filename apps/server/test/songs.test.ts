import { describe, expect, test } from 'bun:test';
import { toView } from '../src/rooms/view.ts';
import type { SongsRound } from '../src/rooms/state.ts';
import { expectOk, makeHarness, startSongs, type Harness } from './fixtures.ts';

function sr(h: Harness): SongsRound {
  const round = h.room.round;
  if (round?.game !== 'songs') throw new Error('keine Songs-Runde');
  return round;
}

function viewRound(h: Harness, viewerId: string | null) {
  const round = toView(h.room, viewerId).round;
  if (round?.game !== 'songs') throw new Error('keine Songs-Runde in der Sicht');
  return round;
}

function moderated(names: string[]): Harness {
  const h = makeHarness(names);
  expectOk(h.act(h.host, { type: 'set_settings', hostPlays: false }));
  return h;
}

/** Spielt einen bestimmten Playlist-Song, unabhängig von der zufälligen Reihenfolge. */
function pickListSong(h: Harness, deezer: number) {
  const song = sr(h).category.songs.find((s) => s.deezer === deezer)!;
  expectOk(h.act(h.host, { type: 'song_pick', deezer, title: song.title, artist: song.artist }));
}

describe('Songs erraten: Ablauf', () => {
  test('Start ohne Song, Ton am Host ohne Bildschirm, Playlist in Zufallsreihenfolge', () => {
    const h = moderated(['Host', 'B', 'C']);
    startSongs(h);
    const r = sr(h);
    expect(h.room.phase).toBe('playing');
    expect(r.audio).toBe('host');
    expect([...r.queue].sort()).toEqual([0, 1, 2]);
    expect(viewRound(h, null)).toMatchObject({ size: 3, remaining: 3, current: null, history: [], screenConnected: false });
  });

  test('Tipps bleiben geheim, Auflösen sobald alle drin sind, Punkte für Titel und Interpret', () => {
    const h = moderated(['Host', 'B', 'C']);
    startSongs(h);
    const [, b, c] = h.ids as [string, string, string];
    pickListSong(h, 102);
    expect(h.act(b, { type: 'song_guess', title: 'x', artist: 'y' })).toMatchObject({ ok: true });
    expect(h.act(b, { type: 'song_guess', title: 'x', artist: 'y' })).toMatchObject({ ok: false });

    const cView = viewRound(h, c);
    expect(cView.current).toMatchObject({ stage: 'guessing', loggedIn: [b] });
    expect(cView.current?.song).toBeUndefined();
    expect(cView.current?.deezer).toBeUndefined();
    expect(viewRound(h, h.host).current).toMatchObject({ deezer: 102, song: { title: 'Uptown Funk' } });
    expect(viewRound(h, null).current?.deezer).toBe(102);
    expect(viewRound(h, null).current?.song).toBeUndefined();

    expectOk(h.act(c, { type: 'song_guess', title: 'uptown funk', artist: 'bruno mars' }));
    const pub = viewRound(h, null);
    expect(pub.current?.stage).toBe('resolved');
    expect(pub.current?.song).toEqual({ deezer: 102, title: 'Uptown Funk', artist: 'Mark Ronson' });
    expect(pub.history[0]!.results.map((x) => [x.playerId, x.titleOk, x.artistOk, x.points])).toEqual([
      [b, false, false, 0],
      [c, true, true, 2],
    ]);
    expect(pub.totals).toEqual({ [b]: 0, [c]: 2 });
    expect(pub.remaining).toBe(2);
  });

  test('nur Titel oder nur Interpret, Host korrigiert, kein neuer Song vor dem Auflösen', () => {
    const h = moderated(['Host', 'B', 'C']);
    startSongs(h);
    const [, b, c] = h.ids as [string, string, string];
    pickListSong(h, 101);
    expect(h.act(h.host, { type: 'song_next' })).toMatchObject({ ok: false });
    expect(h.act(b, { type: 'song_guess', title: '', artist: '' })).toMatchObject({ ok: false });
    expectOk(h.act(b, { type: 'song_guess', title: 'Take on mee', artist: '' }));
    expect(h.act(h.host, { type: 'song_correct', playerId: b, part: 'artist', ok: true })).toMatchObject({ ok: false });
    expectOk(h.act(h.host, { type: 'song_resolve' }));
    expect(viewRound(h, null).totals).toEqual({ [b]: 1, [c]: 0 });
    expect(h.act(b, { type: 'song_correct', playerId: b, part: 'title', ok: false })).toMatchObject({ ok: false, code: 'not_host' });
    expectOk(h.act(h.host, { type: 'song_correct', playerId: b, part: 'title', ok: false }));
    // Ohne eingegebenen Interpreten lässt er sich nicht gutschreiben.
    expectOk(h.act(h.host, { type: 'song_correct', playerId: b, part: 'artist', ok: true }));
    expect(viewRound(h, null).totals).toEqual({ [b]: 0, [c]: 0 });

    expectOk(h.act(h.host, { type: 'song_next' }));
    expect(viewRound(h, null).current).toMatchObject({ passNo: 2, stage: 'guessing' });
    expect(viewRound(h, null).history.length).toBe(1);
  });

  test('gesuchter Song außerhalb der Playlist, Playlist läuft leer', () => {
    const h = moderated(['Host', 'B']);
    startSongs(h);
    const b = h.ids[1]!;
    expectOk(h.act(h.host, { type: 'song_pick', deezer: 999, title: 'Mr. Brightside', artist: 'The Killers' }));
    expectOk(h.act(b, { type: 'song_guess', title: 'Mr Brightside', artist: 'Killers' }));
    expect(viewRound(h, null).totals[b]).toBe(2);
    expect(sr(h).queue.length).toBe(3);
    for (let i = 0; i < 3; i++) {
      expectOk(h.act(h.host, { type: 'song_next' }));
      expectOk(h.act(h.host, { type: 'song_resolve' }));
    }
    expect(h.act(h.host, { type: 'song_next' })).toMatchObject({ ok: false, message: 'Alle Songs der Playlist sind gespielt' });
  });

  test('Abspielen: neuer Nonce je Befehl, Zeitlimit ab dem ersten Abspielen', () => {
    const h = makeHarness(['A', 'B'], { timer: 30 });
    startSongs(h);
    expect(h.act(h.host, { type: 'song_play', offset: 0, seconds: 10 })).toMatchObject({ ok: false });
    expectOk(h.act(h.host, { type: 'song_next' }));
    expect(sr(h).turnDeadline).toBeNull();
    expectOk(h.act(h.host, { type: 'song_play', offset: 5, seconds: 10 }));
    const first = viewRound(h, null).current!.play!;
    expect(first).toMatchObject({ offset: 5, seconds: 10 });
    expect(sr(h).turnDeadline).toBe(h.scheduler.now() + 30_000);
    expectOk(h.act(h.host, { type: 'song_play', offset: 5, seconds: 30 }));
    expect(viewRound(h, null).current!.play!.nonce).toBeGreaterThan(first.nonce);
    h.scheduler.advance(30_000);
    expect(viewRound(h, null).current?.stage).toBe('resolved');
    expect(h.room.phase).toBe('playing');
  });

  test('Ton auf den Bildschirm, Playlist beenden führt zur Auflösung', () => {
    const h = moderated(['Host', 'B']);
    startSongs(h);
    expect(h.act(h.ids[1]!, { type: 'song_audio', target: 'screen' })).toMatchObject({ ok: false, code: 'not_host' });
    expectOk(h.act(h.host, { type: 'song_audio', target: 'screen' }));
    expect(sr(h).audio).toBe('screen');
    expectOk(h.act(h.host, { type: 'song_next' }));
    expectOk(h.act(h.host, { type: 'end_round' }));
    expect(h.room.phase).toBe('reveal');
    expect(viewRound(h, h.ids[1]!).current?.stage).toBe('resolved');
    expectOk(h.act(h.host, { type: 'to_scoring' }));
  });

  test('wer geht, fehlt; sind die Übrigen drin, wird aufgelöst', () => {
    const h = moderated(['Host', 'B', 'C']);
    startSongs(h);
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(h.host, { type: 'song_next' }));
    expectOk(h.act(b, { type: 'song_guess', title: 'a', artist: 'b' }));
    expectOk(h.room.leave(c));
    expect(viewRound(h, null).current?.stage).toBe('resolved');
  });
});
