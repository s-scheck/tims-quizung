import { isValidGuess, matchSongArtist, matchSongTitle, shuffle, type ClientMsg, type SongsAudio } from '@quiz/shared';
import type { Category } from '@quiz/content';
import type { Room } from '../../rooms/room.ts';
import type { SongPass, SongPick, SongsRound } from '../../rooms/state.ts';
import { fail, OK, type Result } from '../../rooms/result.ts';
import type { StartRoundOptions } from '../registry.ts';
import { baseRound, buildTurnOrder, scheduleRoundTimer, toReveal } from '../common.ts';

export function songsRound(room: Room): SongsRound | null {
  return room.round?.game === 'songs' ? room.round : null;
}

export function currentPass(r: SongsRound): SongPass | null {
  return r.passes[r.passes.length - 1] ?? null;
}

/** Punkte eines Tipps: 1 für den Titel, 1 für den Interpreten. */
export function guessPoints(g: { titleOk: boolean; artistOk: boolean } | undefined): number {
  return g ? (g.titleOk ? 1 : 0) + (g.artistOk ? 1 : 0) : 0;
}

export function startSongsRound(room: Room, category: Category | null, _opts: StartRoundOptions): Result {
  if (!category || category.kind !== 'songs') return fail('unknown_category', 'Diese Kategorie passt nicht zum Spiel');
  const turnOrder = buildTurnOrder(room);
  if (turnOrder.length === 0) return fail('invalid_action', 'Ohne Mitspieler geht es nicht los');
  room.round = {
    ...baseRound(category, turnOrder),
    activePlayerId: null,
    soloMode: false,
    game: 'songs',
    category,
    queue: shuffle(
      category.songs.map((_, i) => i),
      room.random,
    ),
    passes: [],
    // Ist schon ein Bildschirm verbunden, ist er der Lautsprecher.
    audio: room.screenCount > 0 ? 'screen' : 'host',
    playNonce: 0,
  };
  room.phase = 'playing';
  return OK;
}

export function handleSongsMessage(room: Room, playerId: string, msg: ClientMsg): Result {
  switch (msg.type) {
    case 'song_next':
      return nextFromList(room, playerId);
    case 'song_pick':
      return pick(room, playerId, msg.deezer, msg.title, msg.artist);
    case 'song_play':
      return play(room, playerId, msg.offset, msg.seconds);
    case 'song_guess':
      return guess(room, playerId, msg.title, msg.artist);
    case 'song_resolve':
      return resolveByHost(room, playerId);
    case 'song_correct':
      return correct(room, playerId, msg.playerId, msg.part, msg.ok);
    case 'song_audio':
      return setAudio(room, playerId, msg.target);
    case 'end_round':
      return endRound(room, playerId);
    default:
      return fail('invalid_action', 'Unbekannte Spielaktion');
  }
}

function hostRound(room: Room, playerId: string): { r: SongsRound } | { error: Result } {
  if (!room.isHost(playerId)) return { error: fail('not_host', 'Nur der Host steuert die Songs') };
  const r = songsRound(room);
  if (room.phase !== 'playing' || !r) return { error: fail('invalid_action', 'Gerade wird nicht gespielt') };
  return { r };
}

/** Ein neuer Song geht erst, wenn der laufende aufgelöst ist. */
function startPass(room: Room, r: SongsRound, song: SongPick): Result {
  const cur = currentPass(r);
  if (cur && cur.stage === 'guessing') return fail('invalid_action', 'Erst den laufenden Song auflösen');
  room.cancelTimer('turn');
  r.turnDeadline = null;
  r.passes.push({ song, stage: 'guessing', guesses: {}, play: null });
  r.turnNo++;
  return OK;
}

function nextFromList(room: Room, playerId: string): Result {
  const h = hostRound(room, playerId);
  if ('error' in h) return h.error;
  const index = h.r.queue[0];
  if (index === undefined) return fail('invalid_action', 'Alle Songs der Playlist sind gespielt');
  const res = startPass(room, h.r, { ...h.r.category.songs[index]!, fromList: true });
  if (res.ok) h.r.queue.shift();
  return res;
}

/** Song aus der Suche. Steht er in der Playlist, gelten deren Aliasse und er fällt aus der Warteschlange. */
function pick(room: Room, playerId: string, deezer: number, title: string, artist: string): Result {
  const h = hostRound(room, playerId);
  if ('error' in h) return h.error;
  const inList = h.r.category.songs.findIndex((s) => s.deezer === deezer);
  const song: SongPick = inList >= 0 ? { ...h.r.category.songs[inList]!, fromList: true } : { title: title.trim(), artist: artist.trim(), deezer, fromList: false };
  const res = startPass(room, h.r, song);
  if (res.ok && inList >= 0) h.r.queue = h.r.queue.filter((i) => i !== inList);
  return res;
}

/** Abspielen am Ton-Gerät. Der erste Abspielbefehl eines Songs startet das Zeitlimit. */
function play(room: Room, playerId: string, offset: number, seconds: number): Result {
  const h = hostRound(room, playerId);
  if ('error' in h) return h.error;
  const cur = currentPass(h.r);
  if (!cur) return fail('invalid_action', 'Erst einen Song wählen');
  const firstPlay = cur.play === null;
  cur.play = { nonce: ++h.r.playNonce, offset, seconds };
  if (firstPlay && cur.stage === 'guessing') scheduleRoundTimer(room, () => resolve(h.r));
  return OK;
}

function guess(room: Room, playerId: string, title: string, artist: string): Result {
  const r = songsRound(room);
  if (room.phase !== 'playing' || !r) return fail('invalid_action', 'Gerade wird nicht gespielt');
  if (!r.turnOrder.includes(playerId)) return fail('not_allowed', 'Du bist in dieser Runde nicht dabei');
  const cur = currentPass(r);
  if (!cur || cur.stage !== 'guessing') return fail('invalid_action', 'Gerade läuft kein Song');
  if (cur.guesses[playerId]) return fail('invalid_action', 'Du hast schon eingeloggt');
  const t = title.trim();
  const a = artist.trim();
  if (!t && !a) return fail('invalid_action', 'Bitte Titel oder Interpret eintippen');
  if ((t && !isValidGuess(t)) || (a && !isValidGuess(a))) return fail('bad_message', 'Tipp muss 1 bis 60 Zeichen haben');
  cur.guesses[playerId] = {
    title: t,
    artist: a,
    titleOk: t !== '' && matchSongTitle(t, cur.song.title, cur.song.titleAliases),
    artistOk: a !== '' && matchSongArtist(a, cur.song.artist, cur.song.artistAliases),
  };
  if (r.turnOrder.every((id) => cur.guesses[id])) resolve(r);
  return OK;
}

/** Auflösen: Tipps zu, Lösung für alle sichtbar. */
function resolve(r: SongsRound): void {
  const cur = currentPass(r);
  if (!cur || cur.stage !== 'guessing') return;
  cur.stage = 'resolved';
  r.turnDeadline = null;
}

function resolveByHost(room: Room, playerId: string): Result {
  const h = hostRound(room, playerId);
  if ('error' in h) return h.error;
  const cur = currentPass(h.r);
  if (!cur || cur.stage !== 'guessing') return fail('invalid_action', 'Gerade läuft kein Song');
  room.cancelTimer('turn');
  resolve(h.r);
  return OK;
}

function correct(room: Room, playerId: string, targetId: string, part: 'title' | 'artist', ok: boolean): Result {
  const h = hostRound(room, playerId);
  if ('error' in h) return h.error;
  const cur = currentPass(h.r);
  if (!cur || cur.stage !== 'resolved') return fail('invalid_action', 'Korrigieren geht nach dem Auflösen');
  const g = cur.guesses[targetId];
  if (!g) return fail('invalid_action', 'Dieser Spieler hat keinen Tipp abgegeben');
  if (part === 'title') g.titleOk = ok && g.title !== '';
  else g.artistOk = ok && g.artist !== '';
  return OK;
}

function setAudio(room: Room, playerId: string, target: SongsAudio): Result {
  const h = hostRound(room, playerId);
  if ('error' in h) return h.error;
  h.r.audio = target;
  return OK;
}

/** Playlist beenden: Ein laufender Song wird aufgelöst, dann geht es zur Gesamtauflösung. */
function endRound(room: Room, playerId: string): Result {
  const h = hostRound(room, playerId);
  if ('error' in h) return h.error;
  resolve(h.r);
  toReveal(room);
  return OK;
}

// --------------------------------------------------------- Modul-Hooks

export function onPlayerRemoved(room: Room, playerId: string): void {
  const r = songsRound(room);
  const cur = r && currentPass(r);
  if (!r || !cur) return;
  delete cur.guesses[playerId];
  if (cur.stage === 'guessing' && r.turnOrder.length > 0 && r.turnOrder.every((id) => cur.guesses[id])) resolve(r);
}
