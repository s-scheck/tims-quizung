import type { RoundView, SongInfo, SongPassView, SongResultView, SongsRoundView } from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import type { SongPass } from '../../rooms/state.ts';
import { currentPass, guessPoints, songsRound } from './reducer.ts';

const info = (p: SongPass): SongInfo => ({ deezer: p.song.deezer, title: p.song.title, artist: p.song.artist });

function results(p: SongPass, turnOrder: readonly string[]): SongResultView[] {
  return turnOrder.map((id) => {
    const g = p.guesses[id];
    return {
      playerId: id,
      title: g ? g.title : null,
      artist: g ? g.artist : null,
      titleOk: g?.titleOk ?? false,
      artistOk: g?.artistOk ?? false,
      points: guessPoints(g),
    };
  });
}

/**
 * Sicht auf die Runde. Tipps zum laufenden Song bleiben geheim, sichtbar ist nur, wer eingeloggt hat.
 * Die Deezer-ID bekommen nur Host und Bildschirm, denn eines der beiden spielt den Ton. Die Lösung sieht
 * der moderierende Host sofort, alle anderen nach dem Auflösen.
 */
export function songsRoundView(room: Room, revealed: boolean, viewerId: string | null): RoundView | null {
  const r = songsRound(room);
  if (!r) return null;
  const isHost = viewerId !== null && viewerId === room.hostId;
  const privileged = viewerId !== null && room.isModerator(viewerId);
  const { songs, games: _games, kind: _kind, ...category } = r.category;
  const cur = currentPass(r);

  const resolvedPasses = r.passes.filter((p) => p.stage === 'resolved');
  const history: SongPassView[] = resolvedPasses.map((p) => ({ passNo: r.passes.indexOf(p) + 1, song: info(p), results: results(p, r.turnOrder) }));
  const totals: Record<string, number> = Object.fromEntries(r.turnOrder.map((id) => [id, 0]));
  for (const p of resolvedPasses) for (const id of r.turnOrder) totals[id] = (totals[id] ?? 0) + guessPoints(p.guesses[id]);

  const view: SongsRoundView = {
    game: 'songs',
    category,
    turnOrder: [...r.turnOrder],
    turnNo: r.turnNo,
    activePlayerId: null,
    eliminated: [],
    turnDeadline: r.turnDeadline,
    soloMode: false,
    size: songs.length,
    remaining: r.queue.length,
    audio: r.audio,
    screenConnected: room.screenCount > 0,
    current: null,
    history,
    totals,
  };
  if (privileged) view.privileged = true;

  if (cur) {
    const resolved = cur.stage === 'resolved' || revealed;
    view.current = {
      passNo: r.passes.length,
      stage: cur.stage,
      play: cur.play ? { ...cur.play } : null,
      loggedIn: cur.stage === 'guessing' ? Object.keys(cur.guesses) : [],
    };
    if (isHost || viewerId === null) view.current.deezer = cur.song.deezer;
    if (resolved || privileged) view.current.song = info(cur);
    const mine = viewerId !== null ? cur.guesses[viewerId] : undefined;
    if (mine) view.current.myGuess = { title: mine.title, artist: mine.artist };
    if (resolved) view.current.results = results(cur, r.turnOrder);
  }
  return view;
}
