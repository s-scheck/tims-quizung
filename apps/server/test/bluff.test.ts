import { describe, expect, test } from 'bun:test';
import { toView } from '../src/rooms/view.ts';
import type { BluffRound } from '../src/rooms/state.ts';
import { bluffPoints } from '../src/games/bluff/reducer.ts';
import { expectOk, makeHarness, startBluff, type Harness } from './fixtures.ts';

function br(h: Harness): BluffRound {
  const round = h.room.round;
  if (round?.game !== 'bluff') throw new Error('keine Bluff-Runde');
  return round;
}

function viewRound(h: Harness, viewerId: string | null) {
  const round = toView(h.room, viewerId).round;
  if (round?.game !== 'bluff') throw new Error('keine Bluff-Runde in der Sicht');
  return round;
}

function moderated(names: string[]): Harness {
  const h = makeHarness(names);
  expectOk(h.act(h.host, { type: 'set_settings', hostPlays: false }));
  return h;
}

/** Eintrag eines Autors (oder der Wahrheit bei null) aus Serversicht. */
function entryOf(h: Harness, authorId: string | null): string {
  return br(h).entries.find((e) => e.authorId === authorId)!.id;
}

describe('Bluff: Rundenstart', () => {
  test('Moderator wählt die Aufgabe, keine Zugreihenfolge, Stufe Schreiben', () => {
    const h = moderated(['Host', 'B', 'C']);
    startBluff(h, { targetId: 'titanic' });
    const r = br(h);
    expect(h.room.phase).toBe('playing');
    expect(r.prompt).toEqual({ id: 'titanic', name: 'Titanic (1997)', answer: 'Nichts auf Erden kann sie trennen.' });
    expect(r.stage).toBe('writing');
    expect(r.turnOrder).toEqual([h.ids[1]!, h.ids[2]!]);
    expect(r.activePlayerId).toBeNull();
    expect(h.room.playedTargets['taglines']).toEqual(['titanic']);
  });

  test('Moderator ohne oder mit unbekannter Aufgabe startet nicht', () => {
    const h = moderated(['Host', 'B']);
    expectOk(h.act(h.host, { type: 'start_game' }));
    expect(h.act(h.host, { type: 'choose_category', gameId: 'bluff', categoryId: 'taglines' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(h.host, { type: 'choose_category', gameId: 'bluff', categoryId: 'taglines', targetId: 'nope' })).toMatchObject({ ok: false, code: 'unknown_category' });
  });

  test('mitspielender Host bekommt Zufall ohne Wiederholung', () => {
    const h = makeHarness(['A', 'B']);
    const seen = new Set<string>();
    startBluff(h, { targetId: 'alien' });
    seen.add(br(h).prompt.id);
    expect(br(h).turnOrder).toEqual(h.ids);
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k < 3; k++) expectOk(h.act(h.host, { type: 'advance' }));
      expectOk(h.act(h.host, { type: 'to_scoring' }));
      expectOk(h.act(h.host, { type: 'submit_scores', scores: {} }));
      expectOk(h.act(h.host, { type: 'next_round' }));
      expectOk(h.act(h.host, { type: 'choose_category', gameId: 'bluff', categoryId: 'taglines' }));
      seen.add(br(h).prompt.id);
    }
    expect(seen.size).toBe(4);
  });
});

describe('Bluff: Schreiben und Abstimmen', () => {
  test('Texte schreiben, überschreiben, prüfen; nur in der Schreibphase', () => {
    const h = moderated(['Host', 'B', 'C']);
    startBluff(h, { targetId: 'alien' });
    const r = br(h);
    const [, b, c] = h.ids as [string, string, string];
    expect(h.act(h.host, { type: 'submit_text', text: 'x' })).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(h.act(b, { type: 'submit_text', text: '   ' })).toMatchObject({ ok: false, code: 'bad_message' });
    expect(h.act(b, { type: 'submit_text', text: 'x'.repeat(141) })).toMatchObject({ ok: false, code: 'bad_message' });
    expect(h.act(b, { type: 'vote', entryId: 'e1' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(h.act(b, { type: 'submit_text', text: '  Niemand   kommt lebend raus. ' }));
    expect(r.texts[b]).toBe('Niemand kommt lebend raus.');
    expectOk(h.act(b, { type: 'submit_text', text: 'Im All ist es still.' }));
    expect(r.texts[b]).toBe('Im All ist es still.');
    expect(viewRound(h, null).submitted).toEqual([b]);
    expect(viewRound(h, b).myText).toBe('Im All ist es still.');
    expect(viewRound(h, c).myText).toBeUndefined();
    expectOk(h.act(h.host, { type: 'advance' }));
    expect(r.stage).toBe('voting');
    expect(h.act(b, { type: 'submit_text', text: 'zu spät' })).toMatchObject({ ok: false, code: 'invalid_action' });
  });

  test('Einträge sind opak und gemischt, Wahrheit dabei, nur Autoren mit Text', () => {
    const h = moderated(['Host', 'B', 'C', 'D']);
    startBluff(h, { targetId: 'alien' });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'submit_text', text: 'Text von B' }));
    expectOk(h.act(c, { type: 'submit_text', text: 'Text von C' }));
    expectOk(h.act(h.host, { type: 'advance' }));
    const r = br(h);
    expect(r.entries.length).toBe(3);
    expect(r.entries.map((e) => e.id).sort()).toEqual(['e1', 'e2', 'e3']);
    expect(r.entries.map((e) => e.authorId).sort()).toEqual([b, c, null].sort());
    const pub = viewRound(h, null);
    expect(pub.entries?.map((e) => e.text).sort()).toEqual(['Im Weltraum hört dich niemand schreien.', 'Text von B', 'Text von C']);
    expect(JSON.stringify(pub.entries)).not.toContain('authorId');
    expect(JSON.stringify(pub)).not.toContain('"votes"');
    expect(pub.truth).toBeUndefined();
  });

  test('Stimmen: nicht auf den eigenen Text, änderbar, nur in der Abstimmphase', () => {
    const h = moderated(['Host', 'B', 'C']);
    startBluff(h, { targetId: 'alien' });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'submit_text', text: 'B-Text' }));
    expectOk(h.act(c, { type: 'submit_text', text: 'C-Text' }));
    expectOk(h.act(h.host, { type: 'advance' }));
    const r = br(h);
    expect(h.act(b, { type: 'vote', entryId: entryOf(h, b) })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(b, { type: 'vote', entryId: 'e99' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(h.host, { type: 'vote', entryId: entryOf(h, null) })).toMatchObject({ ok: false, code: 'not_allowed' });
    expectOk(h.act(b, { type: 'vote', entryId: entryOf(h, c) }));
    expectOk(h.act(b, { type: 'vote', entryId: entryOf(h, null) }));
    expect(r.votes[b]).toBe(entryOf(h, null));
    expect(viewRound(h, b).myVote).toBe(entryOf(h, null));
    expect(viewRound(h, c).myVote).toBeUndefined();
    expect(viewRound(h, c).voted).toEqual([b]);
    expect(viewRound(h, c).entries?.find((e) => e.mine)?.text).toBe('C-Text');
    expectOk(h.act(h.host, { type: 'advance' }));
    expect(r.stage).toBe('votes_shown');
    expect(h.act(c, { type: 'vote', entryId: entryOf(h, b) })).toMatchObject({ ok: false, code: 'invalid_action' });
  });

  test('Phasenfolge nur durch den Host, am Ende Auflösung mit Punkten', () => {
    const h = moderated(['Host', 'A', 'B', 'C']);
    startBluff(h, { targetId: 'alien' });
    const [, a, b, c] = h.ids as [string, string, string, string];
    expect(h.act(a, { type: 'advance' })).toMatchObject({ ok: false, code: 'not_host' });
    expectOk(h.act(a, { type: 'submit_text', text: 'A-Text' }));
    expectOk(h.act(b, { type: 'submit_text', text: 'B-Text' }));
    expectOk(h.act(h.host, { type: 'advance' }));
    // A trifft die Wahrheit (+2), B und C fallen auf A herein (+1, +1 für A).
    expectOk(h.act(a, { type: 'vote', entryId: entryOf(h, null) }));
    expectOk(h.act(b, { type: 'vote', entryId: entryOf(h, a) }));
    expectOk(h.act(c, { type: 'vote', entryId: entryOf(h, a) }));
    expectOk(h.act(h.host, { type: 'advance' }));
    const shown = viewRound(h, c);
    expect(shown.stage).toBe('votes_shown');
    expect(shown.entries?.find((e) => e.text === 'A-Text')?.votes?.sort()).toEqual([b, c].sort());
    expect(JSON.stringify(shown)).not.toContain('authorId');
    expect(shown.truth).toBeUndefined();
    expect(shown.points).toBeUndefined();

    expectOk(h.act(h.host, { type: 'advance' }));
    expect(h.room.phase).toBe('reveal');
    expect(bluffPoints(br(h))).toEqual({ [a]: 4, [b]: 0, [c]: 0 });
    const revealed = viewRound(h, null);
    expect(revealed.truth).toBe('Im Weltraum hört dich niemand schreien.');
    expect(revealed.points).toEqual({ [a]: 4, [b]: 0, [c]: 0 });
    const truthEntry = revealed.entries?.find((e) => e.isTruth);
    expect(truthEntry?.authorId).toBeNull();
    expect(truthEntry?.votes).toEqual([a]);
    expect(revealed.entries?.find((e) => e.text === 'A-Text')).toMatchObject({ authorId: a, points: 2, isTruth: false });
    expect(h.act(h.host, { type: 'advance' })).toMatchObject({ ok: false });

    expectOk(h.act(h.host, { type: 'to_scoring' }));
    expectOk(h.act(h.host, { type: 'submit_scores', scores: { [a]: 4 } }));
    expect(h.room.rounds[0]).toMatchObject({ gameId: 'bluff', categoryId: 'taglines' });
  });

  test('Moderator sieht alles live, Mitspieler und Bildschirm nicht', () => {
    const h = moderated(['Host', 'B', 'C']);
    startBluff(h, { targetId: 'alien' });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'submit_text', text: 'B-Text' }));
    const hostWriting = viewRound(h, h.host);
    expect(hostWriting.privileged).toBe(true);
    expect(hostWriting.truth).toBe('Im Weltraum hört dich niemand schreien.');
    expect(hostWriting.entries).toEqual([{ id: b, text: 'B-Text', authorId: b }]);
    expect(viewRound(h, c).entries).toBeUndefined();
    expect(JSON.stringify(viewRound(h, c))).not.toContain('B-Text');
    expect(JSON.stringify(viewRound(h, null))).not.toContain('B-Text');

    expectOk(h.act(c, { type: 'submit_text', text: 'C-Text' }));
    expectOk(h.act(h.host, { type: 'advance' }));
    expectOk(h.act(b, { type: 'vote', entryId: entryOf(h, c) }));
    const hostVoting = viewRound(h, h.host);
    expect(hostVoting.entries?.find((e) => e.authorId === c)?.votes).toEqual([b]);
    expect(hostVoting.points).toEqual({ [b]: 0, [c]: 1 });
    const playerVoting = viewRound(h, c);
    expect(JSON.stringify(playerVoting)).not.toContain('"votes"');
    expect(playerVoting.truth).toBeUndefined();
  });
});

describe('Bluff: Spieler kommen und gehen', () => {
  test('Verlassen entfernt Text, Eintrag und Stimmen darauf', () => {
    const h = moderated(['Host', 'B', 'C', 'D']);
    startBluff(h, { targetId: 'alien' });
    const [, b, c, d] = h.ids as [string, string, string, string];
    expectOk(h.act(b, { type: 'submit_text', text: 'B-Text' }));
    expectOk(h.act(c, { type: 'submit_text', text: 'C-Text' }));
    expectOk(h.act(h.host, { type: 'advance' }));
    expectOk(h.act(d, { type: 'vote', entryId: entryOf(h, b) }));
    expectOk(h.act(c, { type: 'vote', entryId: entryOf(h, null) }));
    expectOk(h.room.leave(b));
    const r = br(h);
    expect(r.turnOrder).toEqual([c, d]);
    expect(r.texts[b]).toBeUndefined();
    expect(r.entries.map((e) => e.authorId).sort()).toEqual([c, null].sort());
    expect(r.votes[d]).toBeUndefined();
    expect(r.votes[c]).toBe(entryOf(h, null));
    expect(h.room.phase).toBe('playing');
    expect(bluffPoints(r)).toEqual({ [c]: 2, [d]: 0 });
  });

  test('später Beitritt schaut zu, Runde ohne Teilnehmer endet', () => {
    const h = moderated(['Host', 'B']);
    startBluff(h, { targetId: 'alien' });
    const late = h.room.join('Spät', undefined);
    if (!late.ok) throw new Error();
    expect(br(h).turnOrder).not.toContain(late.player.id);
    expect(h.act(late.player.id, { type: 'submit_text', text: 'x' })).toMatchObject({ ok: false, code: 'not_allowed' });
    expectOk(h.room.leave(h.ids[1]!));
    expect(h.room.phase).toBe('reveal');
  });
});
