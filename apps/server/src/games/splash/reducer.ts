import {
  blobFor,
  emptyGrid,
  isValidGuess,
  paintGrid,
  shuffle,
  simulateShot,
  SPLASH_AFTER_LAND_MS,
  SPLASH_COUNTDOWN_MS,
  windFor,
  type ClientMsg,
} from '@quiz/shared';
import type { Category } from '@quiz/content';
import type { Room } from '../../rooms/room.ts';
import type { SplashRound, SplashStep } from '../../rooms/state.ts';
import { fail, OK, type Result } from '../../rooms/result.ts';
import type { StartRoundOptions } from '../registry.ts';
import { baseRound, buildTurnOrder, rememberTarget, suggestionFor, toReveal } from '../common.ts';

/** Kleiner Puffer beim Zielbeginn, falls die Uhr des Geräts minimal vorgeht. */
const AIM_TOLERANCE_MS = 400;
/** So weit darf die gemeldete Stoppzeit zurückliegen (Übertragungsweg). */
const MAX_CLOCK_SKEW_MS = 1500;

export function splashRound(room: Room): SplashRound | null {
  return room.round?.game === 'splash' ? room.round : null;
}

function randomSeed(room: Room): number {
  return Math.floor(room.random() * 0xffffffff);
}

/** Besitzer-Nummer fürs Raster: stabil, auch wenn später jemand den Raum verlässt. */
function ownerSlot(r: SplashRound, playerId: string): number {
  let i = r.owners.indexOf(playerId);
  if (i < 0) i = r.owners.push(playerId) - 1;
  return i + 1;
}

export function startSplashRound(room: Room, category: Category | null, opts: StartRoundOptions): Result {
  if (!category || category.kind !== 'questions') return fail('unknown_category', 'Diese Kategorie passt nicht zum Spiel');
  const turnOrder = buildTurnOrder(room);
  if (turnOrder.length === 0) return fail('invalid_action', 'Ohne Mitspieler geht es nicht los');
  const options = { ...(opts.splash ?? room.splashOptions) };

  const size = category.questions.length;
  const totalSteps = options.mode === 'together' ? Math.min(options.count, size) : Math.min(options.count, Math.floor(size / turnOrder.length)) * turnOrder.length;
  if (totalSteps === 0) return fail('invalid_action', 'Zu wenige Fragen für so viele Spieler');
  room.splashOptions = options;

  // Ungespielte Fragen zuerst, beide Gruppen gemischt.
  const played = new Set(room.playedTargets[category.id] ?? []);
  const all = category.questions.map((_, i) => i);
  const queue = [...shuffle(all.filter((i) => !played.has(String(i))), room.random), ...shuffle(all.filter((i) => played.has(String(i))), room.random)];

  const round: SplashRound = {
    ...baseRound(category, turnOrder),
    activePlayerId: null,
    soloMode: false,
    game: 'splash',
    category,
    options,
    startedAt: room.now,
    queue,
    totalSteps,
    step: null,
    blobs: [],
    grid: emptyGrid(),
    owners: [],
  };
  room.round = round;
  room.phase = 'playing';
  startStep(room, round);
  return OK;
}

/** Wer die aktuelle Frage beantworten darf. */
export function answerers(r: SplashRound): string[] {
  const step = r.step;
  if (!step) return [];
  return step.askedTo === null ? r.turnOrder : r.turnOrder.filter((id) => id === step.askedTo);
}

function startStep(room: Room, r: SplashRound): void {
  const index = r.queue.shift();
  if (index === undefined) {
    toReveal(room);
    return;
  }
  rememberTarget(room, r.category.id, String(index));
  const question = r.category.questions[index]!;
  const no = (r.step?.no ?? 0) + 1;
  let choices: string[] | null = null;
  let correctChoice: number | null = null;
  if (question.wrong) {
    choices = shuffle([question.answer, ...question.wrong], room.random);
    correctChoice = choices.indexOf(question.answer);
  }
  const askedTo = r.options.mode === 'turns' ? (r.turnOrder[(no - 1) % r.turnOrder.length] ?? null) : null;
  r.step = { no, question, choices, correctChoice, askedTo, stage: 'answering', startedAt: room.now, answers: {}, shooters: [], shotIndex: 0, shot: null, skipped: [] };
  r.turnNo++;
  r.activePlayerId = askedTo;
  scheduleAnswerTimer(room, r);
}

function scheduleAnswerTimer(room: Room, r: SplashRound): void {
  room.cancelTimer('turn');
  const seconds = r.options.answerSeconds;
  if (seconds <= 0) {
    r.turnDeadline = null;
    return;
  }
  r.turnDeadline = room.now + seconds * 1000;
  const step = r.step;
  room.timers.turn = room.scheduler.schedule(seconds * 1000, () => {
    room.timers.turn = null;
    if (room.round !== r || r.step !== step || step?.stage !== 'answering') return;
    closeAnswers(room, r);
    room.emit();
  });
}

export function handleSplashMessage(room: Room, playerId: string, msg: ClientMsg): Result {
  switch (msg.type) {
    case 'splash_answer':
      return answer(room, playerId, msg.text, msg.choice);
    case 'splash_close':
      return hostStep(room, playerId, 'answering', (r) => closeAnswers(room, r));
    case 'splash_judge':
      return judge(room, playerId, msg.playerId, msg.correct);
    case 'splash_release':
      return hostStep(room, playerId, 'judging', (r) => beginShooting(room, r));
    case 'splash_power':
      return lockPower(room, playerId, msg.power, msg.at);
    case 'splash_shoot':
      return shoot(room, playerId, msg.power, msg.aim);
    case 'splash_skip':
      return skip(room, playerId);
    case 'splash_next':
      return hostStep(room, playerId, 'done', (r) => (r.step!.no < r.totalSteps && r.queue.length > 0 ? startStep(room, r) : toReveal(room)));
    case 'end_round':
      return endRound(room, playerId);
    default:
      return fail('invalid_action', 'Unbekannte Spielaktion');
  }
}

function playing(room: Room): SplashRound | null {
  const r = splashRound(room);
  return room.phase === 'playing' && r?.step ? r : null;
}

function hostStep(room: Room, playerId: string, stage: SplashStep['stage'], run: (r: SplashRound) => void): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host steuert Splash!');
  const r = playing(room);
  if (!r || r.step!.stage !== stage) return fail('invalid_action', 'Das geht gerade nicht');
  run(r);
  return OK;
}

function answer(room: Room, playerId: string, text: string | undefined, choice: number | undefined): Result {
  const r = playing(room);
  const step = r?.step;
  if (!r || !step || step.stage !== 'answering') return fail('invalid_action', 'Gerade gibt es keine Frage');
  if (!answerers(r).includes(playerId)) return fail('not_allowed', 'Diese Frage ist nicht für dich');
  if (step.answers[playerId]) return fail('invalid_action', 'Du hast schon geantwortet');
  const ms = room.now - step.startedAt;
  if (step.choices) {
    if (choice === undefined || choice < 0 || choice >= step.choices.length) return fail('bad_message', 'Bitte eine Antwort wählen');
    step.answers[playerId] = { choice, ms, correct: choice === step.correctChoice };
  } else {
    const t = text?.trim() ?? '';
    if (!isValidGuess(t)) return fail('bad_message', 'Antwort muss 1 bis 60 Zeichen haben');
    step.answers[playerId] = { text: t, ms, correct: suggestionFor(t, step.question.answer, step.question.aliases ?? []) };
  }
  if (answerers(r).every((id) => step.answers[id])) closeAnswers(room, r);
  return OK;
}

/** Frage zu: Bei freien Antworten prüft ein moderierender Host, sonst geht es gleich ans Schießen. */
function closeAnswers(room: Room, r: SplashRound): void {
  const step = r.step!;
  room.cancelTimer('turn');
  r.turnDeadline = null;
  const hostJudges = !step.choices && room.hostId !== null && room.isModerator(room.hostId) && Object.keys(step.answers).length > 0;
  if (hostJudges) step.stage = 'judging';
  else beginShooting(room, r);
}

function judge(room: Room, playerId: string, targetId: string, correct: boolean): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host prüft');
  const r = playing(room);
  const step = r?.step;
  if (!step || step.stage !== 'judging') return fail('invalid_action', 'Gerade wird nicht geprüft');
  const a = step.answers[targetId];
  if (!a) return fail('invalid_action', 'Keine Antwort von diesem Spieler');
  a.correct = correct;
  return OK;
}

/** Die Richtigen schießen nacheinander, der Schnellste zuletzt und liegt damit oben. */
function beginShooting(room: Room, r: SplashRound): void {
  const step = r.step!;
  step.shooters = answerers(r)
    .filter((id) => step.answers[id]?.correct)
    .sort((a, b) => step.answers[b]!.ms - step.answers[a]!.ms);
  if (step.shooters.length === 0) {
    finishStep(r);
    return;
  }
  step.stage = 'shooting';
  startShot(room, r, 0);
}

function startShot(room: Room, r: SplashRound, index: number): void {
  const step = r.step!;
  const shooter = step.shooters[index];
  if (shooter === undefined) {
    finishStep(r);
    return;
  }
  step.shotIndex = index;
  step.shot = {
    shooter,
    aimFrom: room.now + (r.options.countdown ? SPLASH_COUNTDOWN_MS : 0),
    wind: r.options.wind ? windFor(randomSeed(room)) : null,
    power: null,
    powerAt: null,
    fired: false,
  };
  r.activePlayerId = shooter;
}

function finishStep(r: SplashRound): void {
  const step = r.step!;
  step.stage = 'done';
  step.shot = null;
  r.activePlayerId = null;
}

function nextShot(room: Room, r: SplashRound): void {
  room.cancelTimer('placement');
  startShot(room, r, r.step!.shotIndex + 1);
}

/** Kraft ist gestoppt: ab jetzt läuft für alle sichtbar der Richtungsbalken. */
function lockPower(room: Room, playerId: string, power: number, at: number): Result {
  const r = playing(room);
  const shot = r?.step?.shot;
  if (!r || r.step?.stage !== 'shooting' || !shot) return fail('invalid_action', 'Gerade wird nicht geschossen');
  if (shot.shooter !== playerId) return fail('not_your_turn', 'Du bist nicht dran');
  if (shot.fired || shot.power !== null) return fail('invalid_action', 'Die Kraft steht schon');
  if (room.now < shot.aimFrom - AIM_TOLERANCE_MS) return fail('invalid_action', 'Der Countdown läuft noch');
  shot.power = power;
  // Gerätezeit nur in einem engen Fenster übernehmen.
  shot.powerAt = Math.min(room.now, Math.max(at, shot.aimFrom, room.now - MAX_CLOCK_SKEW_MS));
  return OK;
}

function shoot(room: Room, playerId: string, power: number, aim: number): Result {
  const r = playing(room);
  const step = r?.step;
  const shot = step?.shot;
  if (!r || !step || step.stage !== 'shooting' || !shot) return fail('invalid_action', 'Gerade wird nicht geschossen');
  if (shot.shooter !== playerId) return fail('not_your_turn', 'Du bist nicht dran');
  if (shot.fired) return fail('invalid_action', 'Du hast schon geschossen');
  if (room.now < shot.aimFrom - AIM_TOLERANCE_MS) return fail('invalid_action', 'Der Countdown läuft noch');

  const result = simulateShot({ power: shot.power ?? power, aim, wind: shot.wind, obstacles: r.options.obstacles, firedAt: room.now - r.startedAt });
  const seed = randomSeed(room);
  r.blobs.push({
    id: r.blobs.length + 1,
    owner: playerId,
    seed,
    landing: result.landing,
    path: result.path,
    aim,
    firedAt: room.now,
    landAt: room.now + result.durationMs,
    bounceAt: result.bounceAt,
    onField: result.onField,
  });
  paintGrid(r.grid, blobFor(seed, result.landing), ownerSlot(r, playerId));
  shot.fired = true;

  room.cancelTimer('placement');
  room.timers.placement = room.scheduler.schedule(result.durationMs + SPLASH_AFTER_LAND_MS, () => {
    room.timers.placement = null;
    if (room.round !== r || r.step !== step || step.stage !== 'shooting') return;
    nextShot(room, r);
    room.emit();
  });
  return OK;
}

/** Der Host lässt einen Schuss verfallen, der noch nicht abgefeuert ist. Nie automatisch. */
function skip(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host darf überspringen');
  const r = playing(room);
  const step = r?.step;
  if (!r || !step || step.stage !== 'shooting' || !step.shot) return fail('invalid_action', 'Gerade wird nicht geschossen');
  if (step.shot.fired) return fail('invalid_action', 'Die Kugel fliegt schon');
  step.skipped.push(step.shot.shooter);
  nextShot(room, r);
  return OK;
}

function endRound(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host beendet die Runde');
  if (!playing(room)) return fail('invalid_action', 'Gerade wird nicht gespielt');
  toReveal(room);
  return OK;
}

// --------------------------------------------------------- Modul-Hooks

export function onPlayerRemoved(room: Room, playerId: string): void {
  const r = splashRound(room);
  const step = r?.step;
  if (!r || !step || room.phase !== 'playing') return;
  if (step.stage === 'answering') {
    delete step.answers[playerId];
    if (step.askedTo === playerId) {
      room.cancelTimer('turn');
      r.turnDeadline = null;
      finishStep(r);
    } else if (r.turnOrder.length > 0 && answerers(r).every((id) => step.answers[id])) closeAnswers(room, r);
    return;
  }
  if (step.stage === 'judging') {
    delete step.answers[playerId];
    return;
  }
  if (step.stage === 'shooting') {
    const current = step.shot?.shooter === playerId && !step.shot.fired;
    // Spätere Schützen fallen weg, ein abgefeuerter Schuss landet trotzdem.
    step.shooters = step.shooters.filter((id, i) => id !== playerId || i <= step.shotIndex);
    if (current) {
      step.skipped.push(playerId);
      nextShot(room, r);
    }
  }
}

/** Ein neuer Host spielt mit: Ein offenes Prüfen übernimmt die Vorschläge. */
export function onHostChanged(room: Room): void {
  const r = playing(room);
  if (r?.step?.stage === 'judging') beginShooting(room, r);
}
