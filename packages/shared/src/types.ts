import type { RiskRules } from './rules/risk.ts';
import type { MorseBeep } from './rules/morse.ts';

/** Phasen eines Raums. Ein flaches Modell, kein verschachteltes Spiel-Phasenfeld. */
export type Phase =
  | 'lobby'
  | 'choosing_category'
  | 'playing'
  | 'host_decision'
  | 'reveal'
  | 'scoring'
  | 'scoreboard'
  | 'finished';

export type GameId = 'sort' | 'topx' | 'match' | 'map' | 'timeline' | 'risk' | 'bluff' | 'morse' | 'picture' | 'faces' | 'kids';
export const GAME_IDS: readonly GameId[] = ['sort', 'topx', 'match', 'map', 'timeline', 'risk', 'bluff', 'morse', 'picture', 'faces', 'kids'];
/** Auflösung: alles auf einmal („auto“) oder vom Moderator Stück für Stück aufgedeckt („show“). */
export type RevealMode = 'auto' | 'show';
export const REVEAL_MODES: readonly RevealMode[] = ['auto', 'show'];
/** Spiele, deren Auflösung der Moderator als Show aufdecken kann. */
export const SHOW_GAMES: readonly GameId[] = ['map', 'timeline', 'risk', 'bluff'];
/** Längstes Morse-Wort nach Normalisierung, Leerzeichen eingerechnet. */
export const MORSE_WORD_MAX = 30;
/** Dauer einer Morse-Einheit (Punkt) in Millisekunden je Tempostufe. */
export const MORSE_SPEEDS = { slow: 150, medium: 100, fast: 70 } as const;
export type MorseSpeed = keyof typeof MORSE_SPEEDS;
/** Spielpunkte für die ersten Löser. */
export const MORSE_POINTS: readonly number[] = [3, 2, 1];
/** Vorlauf zwischen Play-Klick und Start, damit alle Geräte den Start noch vor Beginn kennen. */
export const MORSE_PLAY_LEAD_MS = 600;
/** Längste erlaubte Antwort bei Bluff, nach Trimmen. */
export const BLUFF_TEXT_MAX = 140;

export type SortOrder = 'asc' | 'desc';
export type TimerSeconds = 0 | 30 | 60;
export const TIMER_OPTIONS: readonly TimerSeconds[] = [0, 30, 60];
export type PlacementStatus = 'pending' | 'correct' | 'wrong';
export type GuessStatus = 'judging' | 'pending' | 'correct' | 'wrong';
export type Role = 'player' | 'screen';

export const LIVES_MIN = 1;
export const LIVES_MAX = 5;
export const LIVES_DEFAULT = 3;
export const GUESS_MAX_LENGTH = 60;

export interface RoomSettings {
  timerSeconds: TimerSeconds;
  /** false: der Host moderiert nur, spielt nicht mit und taucht nicht in der Wertung auf. */
  hostPlays: boolean;
}

export interface PlayerView {
  id: string;
  name: string;
  order: number;
  connected: boolean;
}

/** Karte aus Sicht der Clients. `value` und `label` gibt es erst ab der Auflösung. */
export interface CardView {
  id: string;
  name: string;
  value?: number;
  label?: string;
}

export interface CategoryInfo {
  id: string;
  title: string;
  question: string;
  topLabel: string;
  bottomLabel: string;
  unit: string;
  order: SortOrder;
  source?: string;
  /** `plain` unterdrückt Tausendertrennzeichen, z. B. bei Jahreszahlen. */
  valueFormat?: 'grouped' | 'plain';
}

export interface MapTargetSummary {
  id: string;
  name: string;
  played: boolean;
}

export interface CategorySummary {
  id: string;
  title: string;
  question: string;
  count: number;
  played: boolean;
  games: GameId[];
  /** Nur bei Orts-, Ereignis- und Aufgabenlisten und nur in der Sicht des Hosts: wählbare Ziele. */
  targets?: MapTargetSummary[];
  /** Nur bei Entwürfen aus dem Editor und nur in der Sicht des Hosts: warum die Liste noch nicht spielbar ist. */
  draft?: string;
}

/** Eigene Liste aus dem Editor, die noch gegen eine Regel verstößt. */
export interface CategoryDraft {
  id: string;
  title: string;
  question: string;
  count: number;
  games: GameId[];
  error: string;
}

export interface GameInfo {
  id: GameId;
  name: string;
  description: string;
}

export interface Selection {
  cardId?: string;
  gapIndex?: number;
}

export interface PlacementView {
  cardId: string;
  gapIndex: number;
  status: PlacementStatus;
  by: string;
  resolveAt: number;
  applyAt: number;
}

/** Kategorie eines Zuordnen-Spiels: Paare und Köder, ohne Werte. */
export interface MatchCategoryInfo {
  id: string;
  title: string;
  question: string;
  leftLabel: string;
  rightLabel: string;
  source?: string;
}

/** Felder, die jede Runde unabhängig vom Spiel hat. */
/** Stand der Show-Auflösung, nur wenn die Runde mit „show“ gestartet wurde. */
export interface ShowRevealView {
  /** Aufgedeckte Spieler mit Schritt: 1 bei Karte, Zeitstrahl und Bluff; bei No Risk No Fun 1 (Tipp) oder 2 (Platz und Punkte). */
  players: Record<string, number>;
  /** Wie viele Schritte ein Spieler hat. */
  steps: number;
  solution: boolean;
  /** Alles aufgedeckt, der Host darf zu den Punkten. */
  complete: boolean;
}

export interface BaseRoundView {
  turnOrder: string[];
  turnNo: number;
  activePlayerId: string | null;
  eliminated: string[];
  turnDeadline: number | null;
  soloMode: boolean;
  reveal?: ShowRevealView;
}

export interface SortRoundView extends BaseRoundView {
  game: 'sort';
  category: CategoryInfo;
  cards: CardView[];
  chain: string[];
  pool: string[];
  startCardId: string;
  selection: Selection;
  placement: PlacementView | null;
  /** Karten-IDs in der richtigen Reihenfolge, nur ab der Auflösung. */
  solution?: string[];
}

export interface TopXSlotView {
  rank: number;
  revealed: boolean;
  name?: string;
  value?: number;
  label?: string;
  revealedBy?: string;
}

export interface GuessView {
  by: string;
  text: string;
  status: GuessStatus;
  /** Vorschlag bzw. Treffer des Servers, null wenn kein Treffer. */
  matchRank: number | null;
  resolveAt: number | null;
  applyAt: number | null;
}

export interface TopXRoundView extends BaseRoundView {
  game: 'topx';
  category: CategoryInfo;
  slots: TopXSlotView[];
  lives: Record<string, number>;
  maxLives: number;
  hits: Record<string, number>;
  wrongGuesses: { by: string; text: string }[];
  guess: GuessView | null;
  /** true: der moderierende Host prüft Tipps von Hand. */
  hostJudges: boolean;
  /** Nur in der Sicht des moderierenden Hosts: alle Slots sind gefüllt. */
  privileged?: boolean;
}

export interface MatchCardView {
  id: string;
  text: string;
}

export interface MatchTargetView {
  id: string;
  text: string;
  matchedCardId: string | null;
  matchedBy?: string;
  /** Nur in der Host-Sicht oder ab der Auflösung. */
  solutionCardId?: string | null;
  /** Nur in der Host-Sicht oder ab der Auflösung: Ziel ohne passende Karte. */
  decoy?: boolean;
}

export interface MatchSelection {
  cardId?: string;
  targetId?: string;
}

export interface MatchAttemptView {
  cardId: string;
  targetId: string;
  status: PlacementStatus;
  by: string;
  resolveAt: number;
  applyAt: number;
}

export interface MatchRoundView extends BaseRoundView {
  game: 'match';
  category: MatchCategoryInfo;
  cards: MatchCardView[];
  pool: string[];
  targets: MatchTargetView[];
  selection: MatchSelection;
  attempt: MatchAttemptView | null;
  lives: Record<string, number>;
  maxLives: number;
  hits: Record<string, number>;
  /** Nur in der Sicht des moderierenden Hosts: Lösung und Köder sind sichtbar. */
  privileged?: boolean;
}

/** Süd-West- und Nord-Ost-Ecke: [[south, west], [north, east]]. */
export type LatLngBounds = [[number, number], [number, number]];

export interface MapCategoryInfo {
  id: string;
  title: string;
  question: string;
  source?: string;
  /** Startausschnitt der Karte, Standard ist die Welt. */
  bounds?: LatLngBounds;
}

export interface MapPinView {
  playerId: string;
  lat: number;
  lng: number;
  distanceKm: number;
}

export interface MapRoundView extends BaseRoundView {
  game: 'map';
  category: MapCategoryInfo;
  targetName: string;
  /** Zielkoordinaten, nur für den Moderator oder ab der Auflösung. */
  target?: { lat: number; lng: number };
  borders: boolean;
  /** Spieler, die ihren Pin bestätigt haben. */
  confirmed: string[];
  /** Nur der eigene Pin des Betrachters. */
  myPin?: { lat: number; lng: number; confirmed: boolean };
  /** Ab der Auflösung: alle bestätigten Pins mit Entfernung. */
  pins?: MapPinView[];
  /** Ab der Auflösung: Teilnehmer nach Entfernung, ohne Pin hinten mit null. */
  ranking?: { playerId: string; distanceKm: number | null }[];
  privileged?: boolean;
}

/** Kategorie eines Zeitstrahl-Spiels. */
export interface TimelineCategoryInfo {
  id: string;
  title: string;
  question: string;
  source?: string;
}

/** Ein Jahr (`from === to`) oder eine Spanne. Negativ heißt v. Chr. */
export interface YearSpan {
  from: number;
  to: number;
}

export interface TimelineGuessView {
  playerId: string;
  year: number;
  distanceYears: number;
}

export interface TimelineRoundView extends BaseRoundView {
  game: 'timeline';
  category: TimelineCategoryInfo;
  eventName: string;
  /** Lösung, nur für den Moderator oder ab der Auflösung. */
  target?: YearSpan;
  /** Spieler, die ihren Tipp bestätigt haben. */
  confirmed: string[];
  /** Nur der eigene Tipp des Betrachters. */
  myGuess?: { year: number; confirmed: boolean };
  /** Ab der Auflösung: alle bestätigten Tipps mit Abstand. */
  guesses?: TimelineGuessView[];
  /** Ab der Auflösung: Teilnehmer nach Abstand, ohne Tipp hinten mit null. */
  ranking?: { playerId: string; distanceYears: number | null }[];
  privileged?: boolean;
}

/** Ein aufgedeckter Listenplatz bei No Risk No Fun. */
export interface RiskSlotView {
  rank: number;
  name: string;
  value: number;
  label?: string;
  /** Durchgang, in dem der Platz getroffen wurde. Fehlt in der vollen Liste für nicht getroffene Plätze. */
  passNo?: number;
  by?: string[];
}

export interface RiskResultView {
  playerId: string;
  /** Eingeloggter Text, null ohne Tipp. */
  text: string | null;
  rank: number | null;
  points: number;
}

export interface RiskPassView {
  passNo: number;
  results: RiskResultView[];
}

export interface RiskRoundView extends BaseRoundView {
  game: 'risk';
  category: CategoryInfo;
  /** Länge der Liste, also auch die höchste Punktzahl. */
  size: number;
  rules: RiskRules;
  passNo: number;
  /** Wer im laufenden Durchgang schon eingeloggt hat. */
  loggedIn: string[];
  /** Eigener Tipp im laufenden Durchgang. */
  myGuess?: string;
  /** In abgeschlossenen Durchgängen getroffene Plätze, nach Platz sortiert. */
  hitSlots: RiskSlotView[];
  /** Abgeschlossene Durchgänge, der neueste zuletzt. */
  passes: RiskPassView[];
  /** Punkte innerhalb der Kategorie über alle abgeschlossenen Durchgänge. */
  totals: Record<string, number>;
  /** Die ganze Liste: für den Moderator immer, für alle nach Ende der Kategorie. */
  solution?: RiskSlotView[];
  privileged?: boolean;
}

/** Kategorie eines Bluff-Spiels: Aufgaben mit echter Antwort. */
export interface BluffCategoryInfo {
  id: string;
  title: string;
  question: string;
  /** Bezeichnung der Aufgabe, z. B. „Film“. */
  promptLabel: string;
  /** Bezeichnung der Antwort, z. B. „Subline“. */
  answerLabel: string;
  /** Schreibanweisung für die Spieler. */
  instruction: string;
  source?: string;
}

export type BluffStage = 'writing' | 'voting' | 'votes_shown';

export interface BluffEntryView {
  id: string;
  text: string;
  /** Eigener Text des Betrachters. */
  mine?: boolean;
  /** Spieler, die auf diesen Eintrag gestimmt haben (ab Stimmenanzeige). */
  votes?: string[];
  /** Autor, null für die Wahrheit (nur Moderator oder Auflösung). */
  authorId?: string | null;
  isTruth?: boolean;
  /** Punkte, die dieser Eintrag seinem Autor bringt (Moderator oder Auflösung). */
  points?: number;
}

export interface BluffRoundView extends BaseRoundView {
  game: 'bluff';
  category: BluffCategoryInfo;
  prompt: string;
  stage: BluffStage;
  submitted: string[];
  voted: string[];
  myText?: string;
  myVote?: string | null;
  entries?: BluffEntryView[];
  /** Echte Antwort, nur Moderator oder Auflösung. */
  truth?: string;
  /** Rundenpunkte je Teilnehmer, nur Moderator oder Auflösung. */
  points?: Record<string, number>;
  privileged?: boolean;
}

export interface MorseAttemptView {
  text: string;
  at: number;
  correct: boolean;
}

export interface MorseSolvedView {
  playerId: string;
  at: number;
  rank: number;
}

/** Eine laufende oder letzte Wiedergabe: alle Geräte blinken danach, nur der Host spielt den Ton. */
export interface MorsePlaybackView {
  id: number;
  /** Serverzeit des Starts. */
  startAt: number;
  unitMs: number;
  beeps: MorseBeep[];
}

export interface MorseRoundView extends BaseRoundView {
  game: 'morse';
  /** Ersatz-Kategorie, damit Auflösung und Punkteeingabe einheitlich bleiben. */
  category: { id: string; title: string; question: string };
  startedAt: number;
  /** Blinkt das Licht bei allen mit? Der Host schaltet es zu. */
  lightShown: boolean;
  playback: MorsePlaybackView | null;
  /** Buchstaben je Wort, damit Spieler die Struktur sehen. */
  lengths: number[];
  /** Das Wort, nur Host oder Auflösung. */
  word?: string;
  /** Punkte und Striche, bei freigegebenem Code, für den Host oder ab Auflösung. */
  code?: string;
  codeShown: boolean;
  tableShown: boolean;
  plays: number;
  solved: MorseSolvedView[];
  /** Eigene Versuche des Betrachters. */
  myAttempts?: MorseAttemptView[];
  /** Alle Versuche, nur Host oder Auflösung. */
  attempts?: Record<string, MorseAttemptView[]>;
  /** Spielpunkte 3/2/1, nur Host oder Auflösung. */
  points?: Record<string, number>;
  privileged?: boolean;
}

// ------------------------------------------------------------ Bilderrätsel

/** Reihum mit Zugreihenfolge und Leben, oder alle gleichzeitig mit Prüfung am Ende. */
export type PictureMode = 'turns' | 'all';
export const PICTURE_MODES: readonly PictureMode[] = ['turns', 'all'];

/** Stand eines Spielers im Modus „Alle gleichzeitig“. */
export interface PictureProgressView {
  /** Ausgefüllte Felder. */
  filled: number;
  /** Zeitpunkt von „Fertig“, null solange nicht gemeldet. */
  doneAt: number | null;
}

/** Stand der Prüfung im Modus „Alle gleichzeitig“, nur ab der Auflösung. */
export interface PictureJudgeView {
  /** Feld, das der Host gerade prüft (Index in `fields`). */
  index: number;
  /** So viele Felder von vorn sind aufgerufen und für alle sichtbar. */
  shown: number;
  /** Alle Felder aufgerufen, Punkte dürfen eingetragen werden. */
  complete: boolean;
}

export interface PictureResultView {
  playerId: string;
  /** Richtige Antworten unter den aufgerufenen Feldern. */
  hits: number;
  doneAt: number | null;
}

/** Kategorie eines Bilderrätsels: ein Bild mit verdeckten Stellen. */
export interface PictureCategoryInfo {
  id: string;
  title: string;
  question: string;
  source?: string;
}

/** Ein verdecktes Feld im Bild. Lage und Größe in Prozent der Bildmaße. */
export interface PictureFieldView {
  id: string;
  /** Laufende Nummer ab 1, in Reihenfolge der Liste. */
  number: number;
  x: number;
  y: number;
  w: number;
  h: number;
  solved: boolean;
  solvedBy?: string;
  /** Nur gelöst, in der Sicht des Moderators oder ab der Auflösung. */
  answer?: string;
}

export interface PictureGuessView {
  by: string;
  fieldId: string;
  text: string;
  status: GuessStatus;
  resolveAt: number | null;
  applyAt: number | null;
}

export interface PictureRoundView extends BaseRoundView {
  game: 'picture';
  category: PictureCategoryInfo;
  /** Adresse des angezeigten Bilds. */
  image: string;
  /** Adresse des Originals, wenn das angezeigte Bild bearbeitet wurde: Aufdecken zeigt dann den Originalausschnitt. */
  original?: string;
  fields: PictureFieldView[];
  lives: Record<string, number>;
  maxLives: number;
  hits: Record<string, number>;
  wrongGuesses: { by: string; fieldId: string; text: string }[];
  guess: PictureGuessView | null;
  /** Nur in der Sicht des moderierenden Hosts: alle Antworten sind sichtbar. */
  privileged?: boolean;
  mode: PictureMode;
  /** Modus „Alle gleichzeitig“: Rundenstart und Fortschritt je Teilnehmer. */
  startedAt?: number;
  progress?: Record<string, PictureProgressView>;
  /** Eigene Antworten des Betrachters je Feld. */
  myAnswers?: Record<string, string>;
  /** Antworten und Urteile aller Teilnehmer, nur aufgerufene Felder, ab der Auflösung. */
  answers?: Record<string, Record<string, string>>;
  verdicts?: Record<string, Record<string, boolean>>;
  judge?: PictureJudgeView;
  /** Nach Treffern, dann Fertig-Zeit; nicht Fertige zuletzt. */
  results?: PictureResultView[];
}

// ------------------------------------------------------------ Wer ist das?

export type FaceEffect = 'blur' | 'tiles' | 'pixel';
export const FACE_EFFECTS: readonly FaceEffect[] = ['blur', 'tiles', 'pixel'];
export const FACE_LEVEL_MAX = 100;
export const FACE_COLS_MIN = 2;
export const FACE_COLS_MAX = 12;
/** Spielpunkte für die ersten drei Richtigen. */
export const FACE_POINTS: readonly number[] = [3, 2, 1];

/**
 * Vom Host übernommener Effektzustand. Bei Kacheln: Index = Zeile × Spalten + Spalte,
 * die Zeilenzahl ergibt sich auf jedem Gerät gleich aus dem Seitenverhältnis des Bilds.
 */
export interface FaceEffectState {
  effect: FaceEffect;
  /** Stärke 0 bis 100 für Verschwommen und Pixel, 0 ist klar. */
  level: number;
  /** Spalten des Kachelrasters. */
  cols: number;
  /** Aufgedeckte Kacheln. */
  revealed: number[];
}

export interface FacesCategoryInfo {
  id: string;
  title: string;
  question: string;
  source?: string;
}

export interface FaceAttemptView {
  text: string;
  at: number;
  status: 'judging' | 'correct' | 'wrong';
  /** Nur Host: Abgleich mit Name und Aliassen passt. */
  suggested?: boolean;
}

export interface FaceSolvedView {
  playerId: string;
  at: number;
  rank: number;
}

export interface FacesRoundView extends BaseRoundView {
  game: 'faces';
  category: FacesCategoryInfo;
  image: string;
  /** Name der Person, nur Host oder ab der Auflösung. */
  name?: string;
  startedAt: number;
  effect: FaceEffectState;
  /** Richtige in Reihenfolge ihrer Versuchszeit. */
  solved: FaceSolvedView[];
  /** Geprüfte Fehltipps aller Spieler, für alle sichtbar. */
  wrongGuesses: { by: string; text: string }[];
  /** Eigene Versuche des Betrachters. */
  myAttempts?: FaceAttemptView[];
  /** Alle Versuche, nur Host oder ab der Auflösung. */
  attempts?: Record<string, FaceAttemptView[]>;
  /** Spielpunkte 3/2/1, nur Host oder ab der Auflösung. */
  points?: Record<string, number>;
  privileged?: boolean;
}

// ------------------------------------------------------------ Kinderpromis

/** Tippen: alle gleichzeitig per Text. Buzzern: einer buzzert, sagt den Namen laut, der Host wertet. */
export type KidsMode = 'type' | 'buzz';
export const KIDS_MODES: readonly KidsMode[] = ['type', 'buzz'];
/** Bedenkzeit nach dem Buzzern in Sekunden. */
export const KIDS_THINK_OPTIONS = [5, 10, 15, 20] as const;
export type KidsThinkSeconds = (typeof KIDS_THINK_OPTIONS)[number];
export const KIDS_THINK_DEFAULT: KidsThinkSeconds = 10;
/** Fehlbuzzer oder abgelaufene Bedenkzeit: ohne Abzug oder minus 1 Spielpunkt. */
export type KidsPenalty = 'none' | 'minus';
export const KIDS_PENALTIES: readonly KidsPenalty[] = ['none', 'minus'];
/** Promis je Runde, wenn der Host nichts wählt; die Sammlung begrenzt nach oben. */
export const KIDS_COUNT_DEFAULT = 5;
export const KIDS_COUNT_MAX = 500;
/** Spielpunkte je Promi im Tippen-Modus für die drei Schnellsten. Beim Buzzern gibt es 1 je Treffer. */
export const KIDS_POINTS: readonly number[] = [3, 2, 1];

export type KidsStage = 'hidden' | 'open' | 'solved';

/** Abgeschlossener Promi der Runde: wer ihn in welcher Reihenfolge erkannt hat. */
export interface KidsItemView {
  id: string;
  name: string;
  image: string;
  shownAt: number | null;
  winners: FaceSolvedView[];
}

export interface KidsBuzzerView {
  /** Wer gerade den Buzzer hält. */
  holder: string | null;
  /** Ende der Bedenkzeit. */
  deadline: number | null;
  /** Wer bei diesem Promi schon seinen Versuch verbraucht hat. */
  used: string[];
}

export interface KidsRoundView extends BaseRoundView {
  game: 'kids';
  category: FacesCategoryInfo;
  mode: KidsMode;
  thinkSeconds: KidsThinkSeconds;
  penalty: KidsPenalty;
  /** Promis der Runde und Index des aktuellen (ab 0). */
  total: number;
  index: number;
  stage: KidsStage;
  /** Foto des aktuellen Promis, Host immer, andere ab „Zeigen“. */
  image?: string;
  /** Name des aktuellen Promis, Host immer, andere ab der Auflösung des Promis. */
  name?: string;
  shownAt: number | null;
  /** Richtige beim aktuellen Promi in Reihenfolge ihrer Zeit. */
  solved: FaceSolvedView[];
  /** Eigene Versuche des Betrachters, nur Tippen. */
  myAttempts?: FaceAttemptView[];
  /** Alle Versuche beim aktuellen Promi, nur Host. */
  attempts?: Record<string, FaceAttemptView[]>;
  /** Nur Buzzern. */
  buzzer?: KidsBuzzerView;
  /** Spielpunkte über alle Promis der Runde, für alle sichtbar. */
  points: Record<string, number>;
  /** Treffer und Fehlbuzzer je Spieler über die Runde. */
  hits: Record<string, number>;
  misses: Record<string, number>;
  /** Abgeschlossene Promis, in der Auflösung alle gezeigten. */
  history: KidsItemView[];
  privileged?: boolean;
}

export type RoundView =
  | SortRoundView
  | TopXRoundView
  | MatchRoundView
  | MapRoundView
  | TimelineRoundView
  | RiskRoundView
  | BluffRoundView
  | MorseRoundView
  | PictureRoundView
  | FacesRoundView
  | KidsRoundView;

export interface RoundResult {
  gameId: GameId;
  categoryId: string;
  categoryTitle: string;
  survivors: string[];
  eliminatedOrder: string[];
  scores: Record<string, number>;
}

export interface RoomView {
  code: string;
  hostId: string | null;
  players: PlayerView[];
  settings: RoomSettings;
  scores: Record<string, number>;
  phase: Phase;
  gameId: GameId | null;
  round: RoundView | null;
  rounds: RoundResult[];
  /** Zuletzt gewählte Leben, Vorgabe für Top X und Zuordnen. */
  defaultLives: number;
  /** Zuletzt gewählte Grenzen-Einstellung für Karte. */
  mapBorders: boolean;
  /** Zuletzt gewählte Regeln für No Risk No Fun. */
  riskRules: RiskRules;
  /** Zuletzt gewählte Art der Auflösung. */
  revealMode: RevealMode;
  /** Nur in `choosing_category` enthalten. */
  categories?: CategorySummary[];
  /** Nur in `choosing_category` enthalten. */
  games?: GameInfo[];
}

// ----------------------------------------------------------------- Editor

/** Herkunft einer Kategorie aus Sicht des Editors. */
export type EditorStatus = 'builtin' | 'modified' | 'custom' | 'hidden';

export interface EditorEntry {
  id: string;
  title: string;
  kind: 'ranked' | 'pairs' | 'places' | 'events' | 'prompts' | 'picture' | 'faces';
  games: GameId[];
  count: number;
  status: EditorStatus;
  /** Gespeichert, aber noch nicht spielbar. `error` sagt, was fehlt. */
  draft: boolean;
  error?: string;
}

export interface EditorDocument {
  entry: EditorEntry;
  /** Rohdaten wie in der JSON-Datei. Bei ausgeblendeten Listen das Original. */
  raw: Record<string, unknown>;
  /** Nur bei mitgelieferten Listen: das unveränderte Original. */
  original?: Record<string, unknown>;
}

