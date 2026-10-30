import type { Category } from '@quiz/content';
import type { ClientMsg, TimerSeconds, RevealMode } from '@quiz/shared';
import { Room, type CategoryProvider } from '../src/rooms/room.ts';
import { FakeScheduler } from '../src/rooms/scheduler.ts';
import '../src/games/index.ts';

export const CITIES: Category = {
  kind: 'ranked',
  id: 'cities',
  title: 'Städte',
  question: 'Welche Stadt hat mehr Einwohner?',
  topLabel: 'meiste Einwohner',
  bottomLabel: 'wenigste Einwohner',
  unit: 'Einwohner',
  order: 'desc',
  games: ['sort'],
  items: Array.from({ length: 10 }, (_, i) => ({ name: `Stadt ${i + 1}`, value: (10 - i) * 100 })),
};

export const TIMES: Category = {
  kind: 'ranked',
  id: 'times',
  title: 'Zeiten',
  question: 'Wer war schneller?',
  topLabel: 'schnellste Zeit',
  bottomLabel: 'langsamste Zeit',
  unit: 's',
  order: 'asc',
  games: ['sort'],
  items: Array.from({ length: 12 }, (_, i) => ({ name: `Läufer ${i + 1}`, value: 100 + i * 7 })),
};

export const TOPX: Category = {
  kind: 'ranked',
  id: 'players',
  title: 'Top 5 Spieler',
  question: 'Wer ist am wertvollsten?',
  topLabel: 'wertvollster',
  bottomLabel: 'günstigster',
  unit: 'Mio. €',
  order: 'desc',
  games: ['topx'],
  source: 'Test',
  items: [
    { name: 'Erling Haaland', value: 100, aliases: ['Haaland'] },
    { name: 'Kylian Mbappé', value: 90, aliases: ['Mbappe'] },
    { name: 'Gerd Müller', value: 80 },
    { name: 'Thomas Müller', value: 70 },
    { name: 'Pedri', value: 60 },
  ],
};

export const PAIRS: Category = {
  kind: 'pairs',
  id: 'capitals',
  title: 'Hauptstädte',
  question: 'Welche Hauptstadt gehört zu welchem Land?',
  leftLabel: 'Hauptstadt',
  rightLabel: 'Land',
  games: ['match'],
  source: 'Test',
  pairs: [
    { left: 'Paris', right: 'Frankreich' },
    { left: 'Lima', right: 'Peru' },
    { left: 'Oslo', right: 'Norwegen' },
    { left: 'Ankara', right: 'Türkei' },
  ],
  decoys: ['Lettland', 'Chile'],
};

export const PLACES: Category = {
  kind: 'places',
  id: 'landmarks',
  title: 'Wahrzeichen',
  question: 'Wo steht das?',
  games: ['map'],
  source: 'Test',
  bounds: [
    [30, -20],
    [70, 40],
  ],
  places: [
    { id: 'berlin', name: 'Berlin', lat: 52.52, lng: 13.405 },
    { id: 'paris', name: 'Paris', lat: 48.8566, lng: 2.3522 },
    { id: 'rom', name: 'Rom', lat: 41.9028, lng: 12.4964 },
    { id: 'madrid', name: 'Madrid', lat: 40.4168, lng: -3.7038 },
  ],
};

export const EVENTS: Category = {
  kind: 'events',
  id: 'history',
  title: 'Geschichte',
  question: 'Wann war das?',
  games: ['timeline'],
  source: 'Test',
  events: [
    { id: 'caesar', name: 'Ermordung Caesars', from: -44, to: -44 },
    { id: 'revolution', name: 'Französische Revolution', from: 1789, to: 1799 },
    { id: 'ww2', name: 'Zweiter Weltkrieg', from: 1939, to: 1945 },
    { id: 'mond', name: 'Mondlandung', from: 1969, to: 1969 },
  ],
};

const COUNTRY_NAMES = ['Russland', 'Kanada', 'USA', 'China', 'Brasilien', 'Australien', 'Indien', 'Argentinien', 'Kasachstan', 'Algerien',
  'DR Kongo', 'Saudi-Arabien', 'Mexiko', 'Indonesien', 'Sudan', 'Libyen', 'Iran', 'Mongolei', 'Peru', 'Tschad'];

export const COUNTRIES: Category = {
  kind: 'ranked',
  id: 'countries',
  title: 'Länder nach Fläche',
  question: 'Nenne ein Land',
  topLabel: 'größte Fläche',
  bottomLabel: 'Platz 20',
  unit: 'km²',
  order: 'desc',
  games: ['risk'],
  source: 'Test',
  items: COUNTRY_NAMES.map((name, i) => ({
    name,
    value: 2000 - i * 10,
    ...(name === 'USA' ? { aliases: ['Vereinigte Staaten'] } : {}),
  })),
};

export const PROMPTS: Category = {
  kind: 'prompts',
  id: 'taglines',
  title: 'Sublines',
  question: 'Wie lautet die echte Subline?',
  promptLabel: 'Film',
  answerLabel: 'Subline',
  instruction: 'Schreib eine Subline.',
  games: ['bluff'],
  source: 'Test',
  prompts: [
    { id: 'alien', name: 'Alien (1979)', answer: 'Im Weltraum hört dich niemand schreien.' },
    { id: 'titanic', name: 'Titanic (1997)', answer: 'Nichts auf Erden kann sie trennen.' },
    { id: 'matrix', name: 'Matrix (1999)', answer: 'Was ist die Matrix?' },
    { id: 'inception', name: 'Inception (2010)', answer: 'Dein Verstand ist der Tatort.' },
  ],
};

export const PICTURE: Category = {
  kind: 'picture',
  id: 'bild-zimmer',
  title: 'Wohnzimmer',
  question: 'Was fehlt hier?',
  games: ['picture'],
  source: 'Test',
  image: 'k1-zimmer.jpg',
  fields: [
    { id: 'f1', answer: 'Lampe', x: 10, y: 10, w: 20, h: 15 },
    { id: 'f2', answer: 'Katze', x: 50, y: 60, w: 12, h: 10 },
    { id: 'f3', answer: 'Uhr', x: 80, y: 5, w: 20, h: 20 },
  ],
};

export const FACES: Category = {
  kind: 'faces',
  id: 'promi-politik',
  title: 'Politik',
  question: 'Wer ist das?',
  games: ['faces'],
  source: 'Test',
  faces: [
    { id: 'angela-merkel', name: 'Angela Merkel', aliases: ['Merkel', 'Mutti'], image: 'p1-merkel.jpg' },
    { id: 'barack-obama', name: 'Barack Obama', aliases: ['Obama'], image: 'p2-obama.jpg' },
    { id: 'olaf-scholz', name: 'Olaf Scholz', image: 'https://example.org/scholz.png' },
  ],
};

export const KIDS: Category = {
  kind: 'faces',
  id: 'kind-stars',
  title: 'Stars als Kinder',
  question: 'Wer war das als Kind?',
  games: ['kids'],
  faces: [
    { id: 'taylor-swift', name: 'Taylor Swift', aliases: ['Swift'], image: 'k1-swift.jpg' },
    { id: 'leonardo-dicaprio', name: 'Leonardo DiCaprio', aliases: ['DiCaprio', 'Leo'], image: 'k2-leo.jpg' },
    { id: 'helene-fischer', name: 'Helene Fischer', image: 'https://example.org/helene.png' },
  ],
};

export const STILLS: Category = {
  kind: 'stills',
  id: 'film-pate',
  title: 'Film 7',
  question: 'Aus welchem Film?',
  games: ['stills'],
  answer: 'Der Pate',
  aliases: ['The Godfather'],
  stills: [
    { image: 's1-hand.jpg', points: 5 },
    { image: 's2-katze.jpg', points: 4 },
    { image: 's3-orange.jpg', points: 3 },
    { image: 's4-hochzeit.jpg', points: 2 },
    { image: 'https://example.org/s5.png', points: 10 },
  ],
};

const ALL = [CITIES, TIMES, TOPX, PAIRS, PLACES, EVENTS, COUNTRIES, PROMPTS, PICTURE, FACES, KIDS, STILLS];

export const provider: CategoryProvider = {
  list: () => ALL,
  get: (id) => ALL.find((c) => c.id === id),
  drafts: () => [],
};

/** Deterministischer Zufall (mulberry32). */
export function seeded(seed = 42): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Harness {
  room: Room;
  scheduler: FakeScheduler;
  emits: number[];
  ids: string[];
  host: string;
  /** Aktion eines Spielers wie über die WS-Schicht: bei Erfolg wird emittiert. */
  act(playerId: string, msg: ClientMsg): ReturnType<Room['handle']>;
  valueOf(cardId: string): number;
  chainValues(): number[];
}

export function makeHarness(names: string[], opts: { timer?: TimerSeconds; seed?: number } = {}): Harness {
  const scheduler = new FakeScheduler();
  const emits: number[] = [];
  const room = new Room('ABCD', {
    scheduler,
    categories: provider,
    random: seeded(opts.seed ?? 42),
    onChange: (r) => emits.push(r.seq),
  });
  const ids: string[] = [];
  for (const name of names) {
    const res = room.join(name, undefined);
    if (!res.ok) throw new Error(res.message);
    ids.push(res.player.id);
  }
  const host = ids[0]!;
  if (opts.timer !== undefined) room.setSettings(host, { timerSeconds: opts.timer });
  return {
    room,
    scheduler,
    emits,
    ids,
    host,
    act(playerId, msg) {
      const res = room.handle(playerId, msg);
      if (res.ok) room.emit();
      return res;
    },
    valueOf(cardId) {
      const round = room.round;
      if (round?.game !== 'sort') throw new Error('keine Sortieren-Runde');
      return round.cards.find((c) => c.id === cardId)!.value;
    },
    chainValues() {
      const round = room.round;
      if (round?.game !== 'sort') throw new Error('keine Sortieren-Runde');
      return round.chain.map((id) => this.valueOf(id));
    },
  };
}

/** Startet Spiel und Sortieren-Runde, damit Tests direkt in `playing` beginnen. */
export function startRound(h: Harness, categoryId = 'cities'): void {
  expectOk(h.act(h.host, { type: 'start_game' }));
  expectOk(h.act(h.host, { type: 'choose_category', gameId: 'sort', categoryId }));
}

/** Startet Spiel und Zuordnen-Runde. */
export function startMatch(h: Harness, lives?: number): void {
  expectOk(h.act(h.host, { type: 'start_game' }));
  expectOk(h.act(h.host, { type: 'choose_category', gameId: 'match', categoryId: 'capitals', ...(lives !== undefined ? { lives } : {}) }));
}

/** Startet Spiel und Karten-Runde. */
export function startMap(h: Harness, opts: { targetId?: string; borders?: boolean; reveal?: RevealMode } = {}): void {
  expectOk(h.act(h.host, { type: 'start_game' }));
  expectOk(h.act(h.host, { type: 'choose_category', gameId: 'map', categoryId: 'landmarks', ...opts }));
}

/** Startet Spiel und Zeitstrahl-Runde. */
export function startTimeline(h: Harness, opts: { targetId?: string; reveal?: RevealMode } = {}): void {
  expectOk(h.act(h.host, { type: 'start_game' }));
  expectOk(h.act(h.host, { type: 'choose_category', gameId: 'timeline', categoryId: 'history', ...opts }));
}

/** Startet Spiel und No-Risk-Runde. */
export function startRisk(h: Harness, opts: { duplicates?: 'both' | 'none'; missPoints?: 0 | -10; reveal?: RevealMode } = {}): void {
  expectOk(h.act(h.host, { type: 'start_game' }));
  expectOk(h.act(h.host, { type: 'choose_category', gameId: 'risk', categoryId: 'countries', ...opts }));
}

/** Startet Spiel und Bluff-Runde. */
export function startBluff(h: Harness, opts: { targetId?: string; reveal?: RevealMode } = {}): void {
  expectOk(h.act(h.host, { type: 'start_game' }));
  expectOk(h.act(h.host, { type: 'choose_category', gameId: 'bluff', categoryId: 'taglines', ...opts }));
}

/** Startet Spiel und Bilderrätsel-Runde. */
export function startPicture(h: Harness, opts: { lives?: number; mode?: 'turns' | 'all' } = {}): void {
  expectOk(h.act(h.host, { type: 'start_game' }));
  expectOk(h.act(h.host, { type: 'choose_category', gameId: 'picture', categoryId: 'bild-zimmer', ...opts }));
}

/** Startet Spiel und Wer-ist-das-Runde. */
export function startFaces(h: Harness, opts: { targetId?: string; effect?: 'blur' | 'tiles' | 'pixel'; level?: number; cols?: number } = {}): void {
  expectOk(h.act(h.host, { type: 'start_game' }));
  expectOk(h.act(h.host, { type: 'choose_category', gameId: 'faces', categoryId: 'promi-politik', ...opts }));
}

/** Startet Spiel und Kinderpromis-Runde. */
export function startKids(h: Harness, opts: { mode?: 'type' | 'buzz'; count?: number; thinkSeconds?: 5 | 10 | 15 | 20; penalty?: 'none' | 'minus' } = {}): void {
  expectOk(h.act(h.host, { type: 'start_game' }));
  expectOk(h.act(h.host, { type: 'choose_category', gameId: 'kids', categoryId: 'kind-stars', ...opts }));
}

/** Startet Spiel und Filmfotos-Runde. */
export function startStills(h: Harness, opts: { mode?: 'type' | 'buzz'; thinkSeconds?: number } = {}): void {
  expectOk(h.act(h.host, { type: 'start_game' }));
  expectOk(h.act(h.host, { type: 'choose_category', gameId: 'stills', categoryId: 'film-pate', ...opts }));
}

/** Startet Spiel und Morse-Runde mit dem gegebenen Wort. */
export function startMorse(h: Harness, word = 'Hallo Welt'): void {
  expectOk(h.act(h.host, { type: 'start_game' }));
  expectOk(h.act(h.host, { type: 'choose_category', gameId: 'morse', categoryId: 'morse', word }));
}

/** Startet Spiel und Top-X-Runde. */
export function startTopX(h: Harness, lives?: number): void {
  expectOk(h.act(h.host, { type: 'start_game' }));
  expectOk(h.act(h.host, { type: 'choose_category', gameId: 'topx', categoryId: 'players', ...(lives !== undefined ? { lives } : {}) }));
}

export function expectOk(res: { ok: boolean; message?: string }): void {
  if (!res.ok) throw new Error(`Aktion fehlgeschlagen: ${res.message}`);
}

/** Wählt für den aktiven Spieler eine Poolkarte und legt sie richtig oder falsch. */
export function place(h: Harness, correct: boolean): { cardId: string; gapIndex: number } {
  const round = h.room.round;
  if (round?.game !== 'sort') throw new Error('keine Sortieren-Runde');
  const active = round.activePlayerId!;
  const cardId = round.pool[0]!;
  const value = h.valueOf(cardId);
  const chain = h.chainValues();
  const order = round.category.order;
  const fits = (gap: number) => {
    const above = chain[gap - 1];
    const below = chain[gap];
    const okAbove = above === undefined || (order === 'desc' ? above >= value : above <= value);
    const okBelow = below === undefined || (order === 'desc' ? value >= below : value <= below);
    return okAbove && okBelow;
  };
  const gaps = Array.from({ length: chain.length + 1 }, (_, i) => i);
  const gapIndex = correct ? gaps.find(fits) : gaps.find((g) => !fits(g));
  if (gapIndex === undefined) throw new Error(`Keine ${correct ? 'richtige' : 'falsche'} Lücke gefunden`);
  expectOk(h.act(active, { type: 'select', turnNo: round.turnNo, cardId, gapIndex }));
  expectOk(h.act(active, { type: 'confirm', turnNo: round.turnNo }));
  return { cardId, gapIndex };
}

/** Lässt eine Platzierung komplett durchlaufen (2 s + 1,5 s). */
export function resolve(h: Harness): void {
  h.scheduler.advance(2000);
  h.scheduler.advance(1500);
}
