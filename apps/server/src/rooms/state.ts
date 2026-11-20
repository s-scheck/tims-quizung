import type { DungeonDoorKind, DungeonOptions, DungeonStatus, LatLngBounds, Point, SongStage, SongsAudio, SplashOptions, SplashStage, TowerFrame, TowerOffer, TowerOptions, TowerSpecial } from '@quiz/shared';
import type { BluffStage, FaceEffectState, GuessMode, GuessStatus, JudgeStatus, KidsPenalty, KidsStage, KidsThinkSeconds, MatchSelection, PictureMode, PlacementStatus, RiskRules, Selection, StillsResultView, StillsStage } from '@quiz/shared';
import type { Category, CategoryItem, Place, EventsCategory, Face, FacesCategory, PairsCategory, PictureCategory, PlacesCategory, PromptsCategory, Question, QuestionsCategory, RankedCategory, Song, SongsCategory, StillsCategory, TimelineEvent } from '@quiz/content';

export interface Player {
  id: string;
  name: string;
  token: string;
  order: number;
  connected: boolean;
}

/** Ersatz für Spiele ohne Kategorie aus der Liste, damit Auflösung und Punkte einheitlich bleiben. */
export interface PseudoCategory {
  kind: 'none';
  id: string;
  title: string;
}

/** Felder, die jede Runde unabhängig vom Spiel hat. `games/common.ts` arbeitet nur damit. */
/** Show-Auflösung: was der Moderator schon aufgedeckt hat. */
export interface ShowRevealState {
  /** Spieler-ID → Schritt (1 oder bei No Risk No Fun bis 2). */
  players: Record<string, number>;
  solution: boolean;
}

/** Joker: `by` kopiert ab Abschnitt `from` (No-Risk-Durchgang, Kinderpromi, sonst 0) das Ergebnis von `target`. */
export interface RoundJoker {
  by: string;
  target: string;
  from: number;
  at: number;
}

export interface BaseRound {
  category: Category | PseudoCategory;
  turnOrder: string[];
  turnNo: number;
  activePlayerId: string | null;
  eliminated: string[];
  turnDeadline: number | null;
  soloMode: boolean;
  /** null: Auflösung alles auf einmal. */
  reveal: ShowRevealState | null;
  /** Höchstens ein Joker je Runde. */
  joker: RoundJoker | null;
}

// ---------------------------------------------------------------- Sortieren

export interface SortCard {
  id: string;
  name: string;
  value: number;
  label?: string;
}

export interface Placement {
  cardId: string;
  gapIndex: number;
  /** Position im Pool vor dem Zug, dorthin kehrt die Karte bei Fehler zurück. */
  poolIndex: number;
  status: PlacementStatus;
  by: string;
  resolveAt: number;
  applyAt: number;
}

export interface SortRound extends BaseRound {
  game: 'sort';
  category: RankedCategory;
  cards: SortCard[];
  startCardId: string;
  chain: string[];
  pool: string[];
  selection: Selection;
  placement: Placement | null;
  lives: Record<string, number>;
  maxLives: number;
  hits: Record<string, number>;
}

// -------------------------------------------------------------------- Top X

export interface TopXCard {
  rank: number;
  name: string;
  value: number;
  label?: string;
  aliases: string[];
}

export interface Guess {
  by: string;
  text: string;
  status: GuessStatus;
  /** Treffer des Abgleichs auf eine noch verdeckte Karte, sonst null. */
  matchRank: number | null;
  resolveAt: number | null;
  applyAt: number | null;
}

export interface TopXRound extends BaseRound {
  game: 'topx';
  category: RankedCategory;
  cards: TopXCard[];
  /** Rang → Spieler, der die Karte aufgedeckt hat. */
  revealed: Record<number, string>;
  lives: Record<string, number>;
  maxLives: number;
  hits: Record<string, number>;
  wrongGuesses: { by: string; text: string }[];
  guess: Guess | null;
}

// ----------------------------------------------------------------- Zuordnen

export interface MatchCard {
  id: string;
  text: string;
}

export interface MatchTarget {
  id: string;
  text: string;
  /** null = Köder ohne passende Karte. */
  solutionCardId: string | null;
}

export interface MatchAttempt {
  cardId: string;
  targetId: string;
  /** Position im Pool vor dem Zug, dorthin kehrt die Karte bei Fehler zurück. */
  poolIndex: number;
  status: PlacementStatus;
  by: string;
  resolveAt: number;
  applyAt: number;
}

export interface MatchRound extends BaseRound {
  game: 'match';
  category: PairsCategory;
  cards: MatchCard[];
  pool: string[];
  targets: MatchTarget[];
  /** Ziel-ID → zugeordnete Karte und wer sie gelegt hat. */
  matched: Record<string, { cardId: string; by: string }>;
  selection: MatchSelection;
  attempt: MatchAttempt | null;
  lives: Record<string, number>;
  maxLives: number;
  hits: Record<string, number>;
}

// -------------------------------------------------------------------- Karte

export interface MapPin {
  lat: number;
  lng: number;
  confirmed: boolean;
}

export interface MapRound extends BaseRound {
  game: 'map';
  category: PlacesCategory;
  target: { id: string; name: string; lat: number; lng: number };
  borders: boolean;
  /** Spieler-ID → Pin. Nur bestätigte zählen in der Auflösung. */
  pins: Record<string, MapPin>;
}

// ---------------------------------------------------------------- Zeitstrahl

export interface TimelineGuess {
  year: number;
  confirmed: boolean;
}

export interface TimelineRound extends BaseRound {
  game: 'timeline';
  category: EventsCategory;
  target: TimelineEvent;
  /** Spieler-ID → Tipp. Nur bestätigte zählen in der Auflösung. */
  guesses: Record<string, TimelineGuess>;
}

// ---------------------------------------------------------- No Risk No Fun

export interface RiskGuess {
  text: string;
  /** Getroffener Platz oder null. Vom Server vorgeschlagen, vom Host korrigierbar. */
  rank: number | null;
}

export interface RiskPass {
  /** Spieler-ID → eingeloggter Tipp. Wer fehlt, hat keinen Tipp abgegeben. */
  guesses: Record<string, RiskGuess>;
}

export interface RiskRound extends BaseRound {
  game: 'risk';
  category: RankedCategory;
  rules: RiskRules;
  /** Alle Durchgänge, der laufende zuletzt. */
  passes: RiskPass[];
}

// -------------------------------------------------------------------- Bluff

export interface BluffEntry {
  /** Opake ID, verrät nichts über den Autor. */
  id: string;
  /** null = die echte Antwort. */
  authorId: string | null;
}

export interface BluffRound extends BaseRound {
  game: 'bluff';
  category: PromptsCategory;
  prompt: { id: string; name: string; answer: string };
  stage: BluffStage;
  texts: Record<string, string>;
  /** Spieler-ID → Eintrags-ID. */
  votes: Record<string, string>;
  /** Gemischte Einträge, entstehen beim Wechsel zur Abstimmung. */
  entries: BluffEntry[];
}

// -------------------------------------------------------------------- Morse

export interface MorseAttempt {
  text: string;
  at: number;
  correct: boolean;
}

export interface MorseRound extends BaseRound {
  game: 'morse';
  category: PseudoCategory;
  /** Normalisiertes Wort, z. B. „HALLO WELT“. */
  word: string;
  code: string;
  startedAt: number;
  attempts: Record<string, MorseAttempt[]>;
  /** Spieler-ID → Zeitpunkt der Lösung. */
  solved: Record<string, number>;
  plays: number;
  /** Laufende bzw. letzte Wiedergabe, nach der alle Geräte blinken. */
  playback: { id: number; startAt: number; unitMs: number } | null;
  lightShown: boolean;
  codeShown: boolean;
  tableShown: boolean;
}

// ------------------------------------------------------------ Bilderrätsel

export interface PictureGuess {
  by: string;
  fieldId: string;
  text: string;
  status: 'judging' | 'correct' | 'wrong';
  /** Urteil des Hosts vor der Freigabe, nur er sieht es. */
  draft: boolean | null;
  resolveAt: number | null;
  applyAt: number | null;
}

export interface PictureRound extends BaseRound {
  game: 'picture';
  category: PictureCategory;
  /** Feld-ID → Spieler, der es gelöst hat. */
  solved: Record<string, string>;
  /** Felder, die der Host nach einem Fehltipp aufgedeckt hat: erledigt, ohne Löser. */
  uncovered: string[];
  lives: Record<string, number>;
  maxLives: number;
  hits: Record<string, number>;
  wrongGuesses: { by: string; fieldId: string; text: string }[];
  guess: PictureGuess | null;
  /** Reihum oder alle gleichzeitig. Die folgenden Felder zählen nur bei „Alle gleichzeitig“. */
  mode: PictureMode;
  startedAt: number;
  /** Spieler → Feld → Text. */
  answers: Record<string, Record<string, string>>;
  /** Spieler → Zeitpunkt von „Fertig“. */
  doneAt: Record<string, number>;
  /** Spieler → Feld → Urteil, ab der Auflösung. */
  verdicts: Record<string, Record<string, boolean>>;
  /** Gerade geprüftes Feld, Zahl der aufgerufenen und der freigegebenen Felder, ab der Auflösung. */
  judgeIndex: number;
  judgeShown: number;
  judgeReleased: number;
}

// ------------------------------------------------------------ Wer ist das?

export interface FaceAttempt {
  text: string;
  at: number;
  status: JudgeStatus;
}

export interface FacesRound extends BaseRound {
  game: 'faces';
  category: FacesCategory;
  target: Face;
  startedAt: number;
  /** Vom Host übernommener Effektzustand, den alle sehen. */
  effect: FaceEffectState;
  attempts: Record<string, FaceAttempt[]>;
  /** Spieler-ID → Zeit des richtigen Versuchs. */
  solved: Record<string, number>;
}

// ------------------------------------------------------------ Kinderpromis

/** Ein Promi der Runde. Tippen füllt `attempts` und `solved`, Buzzern `holder`, `used` und `solved`. */
export interface KidsItem {
  face: Face;
  stage: KidsStage;
  shownAt: number | null;
  attempts: Record<string, FaceAttempt[]>;
  /** Spieler-ID → Zeit des Treffers. */
  solved: Record<string, number>;
  /** Buzzern: wer seinen Versuch schon verbraucht hat. */
  used: string[];
  holder: string | null;
  /** Zählt jedes Buzzern, damit ein alter Bedenkzeit-Timer nichts mehr anrichtet. */
  buzzNo: number;
}

export interface KidsRound extends BaseRound {
  game: 'kids';
  category: FacesCategory;
  mode: GuessMode;
  thinkSeconds: KidsThinkSeconds;
  penalty: KidsPenalty;
  items: KidsItem[];
  index: number;
}

// --------------------------------------------------------------- Filmfotos

export interface StillAttempt {
  /** Index des Fotos, bei dem getippt wurde. */
  index: number;
  text: string;
  status: JudgeStatus;
}

export interface StillsRound extends BaseRound {
  game: 'stills';
  category: StillsCategory;
  mode: GuessMode;
  /** Bedenkzeit beim Buzzern, nur als Anzeige über `turnDeadline`. */
  thinkSeconds: number;
  /** Alle raten bis zum Schluss: ein Versuch pro Film, ein Treffer beendet das Raten nur für den Treffer. */
  allGuess: boolean;
  /** Index des aktuellen Fotos, freigegeben sind `index + 1`. */
  index: number;
  /** Tippen: Eingabe offen oder Host prüft das aktuelle Foto. */
  stage: StillsStage;
  /** Tippen: höchstens ein Tipp je Spieler und Foto, mit `allGuess` höchstens einer je Film. */
  attempts: Record<string, StillAttempt[]>;
  /** Tippen mit `allGuess`: wer beim aktuellen Foto gepasst hat. */
  passed: string[];
  /** Buzzern: wer gerade antwortet. */
  holder: string | null;
  /** Buzzern: wer beim aktuellen Foto schon verbraucht ist, mit `allGuess` für den ganzen Film. */
  used: string[];
  /** Buzzern: alle Urteile in Reihenfolge, mit Foto. Ohne `allGuess` beendet das erste richtige das Raten. */
  buzzVerdicts: StillsResultView[];
}

// ------------------------------------------------------------ Songs erraten

/** Der gespielte Song: aus der Playlist mit Aliassen oder vom Host gesucht. */
export interface SongPick extends Song {
  fromList: boolean;
}

export interface SongGuess {
  title: string;
  artist: string;
  /** Vom Server vorgeschlagen, vom Host korrigierbar. */
  titleOk: boolean;
  artistOk: boolean;
}

export interface SongPass {
  song: SongPick;
  stage: SongStage;
  guesses: Record<string, SongGuess>;
  play: { nonce: number; offset: number; seconds: number } | null;
}

export interface SongsRound extends BaseRound {
  game: 'songs';
  category: SongsCategory;
  /** Noch nicht gespielte Playlist-Songs in zufälliger Reihenfolge, als Index in `category.songs`. */
  queue: number[];
  passes: SongPass[];
  audio: SongsAudio;
  playNonce: number;
}

// ------------------------------------------------------------------ Splash!

export interface SplashAnswer {
  text?: string;
  choice?: number;
  /** Eingang in ms ab Fragebeginn. */
  ms: number;
  /** Vorschlag bzw. Urteil. */
  correct: boolean;
}

export interface SplashShot {
  shooter: string;
  aimFrom: number;
  wind: Point | null;
  power: number | null;
  powerAt: number | null;
  fired: boolean;
}

export interface SplashStep {
  no: number;
  question: Question;
  /** a/b/c/d: gemischte Optionen und Index der richtigen. */
  choices: string[] | null;
  correctChoice: number | null;
  askedTo: string | null;
  stage: SplashStage;
  startedAt: number;
  answers: Record<string, SplashAnswer>;
  shooters: string[];
  shotIndex: number;
  shot: SplashShot | null;
  skipped: string[];
}

export interface SplashBlob {
  id: number;
  owner: string;
  seed: number;
  landing: Point;
  path: Point[];
  aim: number;
  firedAt: number;
  landAt: number;
  bounceAt: number | null;
  onField: boolean;
}

export interface SplashRound extends BaseRound {
  game: 'splash';
  category: QuestionsCategory;
  options: SplashOptions;
  startedAt: number;
  /** Fragen in Spielreihenfolge, als Index in `category.questions`. */
  queue: number[];
  totalSteps: number;
  step: SplashStep | null;
  blobs: SplashBlob[];
  /** Sichtbare Farbe je Rasterzelle: Index in `owners` plus 1, 0 ist frei. */
  grid: Uint8Array;
  /** Besitzer der Rasterfarben in der Reihenfolge ihres ersten Schusses. */
  owners: string[];
}

// ------------------------------------------------------------------ Dungeon

/** Was hinter einer Tür steht; einmal beim Start gewürfelt, für alle gleich. */
export type DungeonPayload =
  | { kind: 'choice'; question: Question; choices: string[]; correctChoice: number }
  | { kind: 'free'; question: Question }
  | { kind: 'map'; prompt: string; place: Place; bounds?: LatLngBounds }
  | { kind: 'timeline'; prompt: string; event: TimelineEvent }
  | { kind: 'topx'; prompt: string; items: CategoryItem[] };

export interface DungeonDoor {
  id: string;
  categoryId: string;
  title: string;
  kind: DungeonDoorKind;
  /** km, ±Jahre oder Top N; bei Fragen null. */
  tolerance: number | null;
  payload: DungeonPayload;
}

export interface DungeonPlayer {
  room: number;
  locked: string[];
  wrong: number;
  status: DungeonStatus;
  exitRound: number | null;
}

export interface DungeonAnswer {
  doorId: string;
  /** Anzeige der Antwort, z. B. „B: Venus“ oder „1792“. */
  text: string;
  correct: boolean;
  detail?: string;
}

export interface DungeonAttempt extends DungeonAnswer {
  roundNo: number;
  room: number;
  playerId: string;
}

export interface DungeonRound extends BaseRound {
  game: 'dungeon';
  category: PseudoCategory;
  options: DungeonOptions;
  rooms: DungeonDoor[][];
  stage: 'choosing' | 'answering' | 'result';
  roundNo: number;
  players: Record<string, DungeonPlayer>;
  walk: Record<string, { doorId: string | null; confirmed: boolean }>;
  answers: Record<string, DungeonAnswer>;
  skipped: string[];
  results: Record<string, { doorId: string; room: number; correct: boolean }>;
  attempts: DungeonAttempt[];
}

// -------------------------------------------------------------- Hochstapler

export interface TowerPlayerState {
  /** Steinstrom des Spielers. */
  seed: number;
  /** Vorrat aus Höhenmarken, der Reihe nach (höchstens `TOWER_STOCK_MAX`, der älteste zuerst). */
  stock: TowerSpecial[];
  /** Glücks-Slot: ein zufälliger Zauber, nicht stapelbar. */
  luck: TowerSpecial | null;
  /** Serverzeit des nächsten Glücks-Zaubers. */
  luckAt: number;
  /** Offenes Angebot (hell oder dunkel), bis der Spieler wählt; ein neues ersetzt es. */
  offer: TowerOffer | null;
  /** Zuletzt gemeldete Höhe (Frames und Meldungen). */
  height: number;
  /** Schon überbaute Höhenmarken, jede bringt nur einmal ein Spezial. */
  marks: number[];
  finishedAt: number | null;
}

export interface TowerEffect {
  id: number;
  special: TowerSpecial;
  by: string;
  target: string;
  at: number;
  until: number;
}

export interface TowerRound extends BaseRound {
  game: 'tower';
  category: PseudoCategory;
  options: TowerOptions;
  startedAt: number;
  /** Serverzeit für „Los!“ nach dem Start-Countdown; vorher fällt kein Stein. */
  goAt: number;
  goalHeight: number;
  players: Record<string, TowerPlayerState>;
  effects: TowerEffect[];
  nextEffectId: number;
  /** Die Zauber dieser Partie. */
  pool: TowerSpecial[];
  winners: string[];
  /** Letzter Schnappschuss je Spieler, für neu verbundene Geräte und die Auflösung. Nicht Teil der Sicht. */
  frames: Record<string, TowerFrame>;
}

export type Round = SortRound | TopXRound | MatchRound | MapRound | TimelineRound | RiskRound | BluffRound | MorseRound | PictureRound | FacesRound | KidsRound | StillsRound | SongsRound | SplashRound | DungeonRound | TowerRound;
