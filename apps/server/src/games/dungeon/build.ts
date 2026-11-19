import { dungeonListsByFormat, shuffle, toleranceFor, type DungeonFormat, type DungeonOptions } from '@quiz/shared';
import type { Category } from '@quiz/content';
import type { DungeonDoor, DungeonPayload } from '../../rooms/state.ts';

/** Eine Quelle für Türen: Liste plus die noch nicht vergebenen Einträge (bei Top X die Liste selbst). */
interface Source {
  format: DungeonFormat;
  category: Category;
  left: number[];
  used: number;
}

function entriesOf(c: Category): number {
  switch (c.kind) {
    case 'questions':
      return c.questions.length;
    case 'places':
      return c.places.length;
    case 'events':
      return c.events.length;
    case 'ranked':
      return 1;
    default:
      return 0;
  }
}

function fits(format: DungeonFormat, c: Category): boolean {
  return (
    (format === 'questions' && c.kind === 'questions') ||
    (format === 'map' && c.kind === 'places') ||
    (format === 'timeline' && c.kind === 'events') ||
    (format === 'topx' && c.kind === 'ranked' && c.items.length >= 3)
  );
}

/** Wie viele verschiedene Listen für die gewählten Formate da sind; im selben Raum darf keine doppelt sein. */
export function availableLists(categories: readonly Category[], formats: readonly DungeonFormat[]): number {
  const byFormat = dungeonListsByFormat(categories, formats);
  const ids = new Set<string>();
  for (const f of formats) for (const c of byFormat[f]) if (fits(f, c) && entriesOf(c) > 0) ids.add(c.id);
  return ids.size;
}

function payloadFor(src: Source, room: number, rooms: number, random: () => number): { payload: DungeonPayload; tolerance: number | null } {
  const c = src.category;
  // Einträge ohne Wiederholung, erst wenn alle dran waren, geht es von vorn los.
  if (src.left.length === 0) src.left = shuffle(Array.from({ length: entriesOf(c) }, (_, i) => i), random);
  const index = src.left.shift()!;
  if (c.kind === 'questions') {
    const question = c.questions[index]!;
    if (question.wrong) {
      const choices = shuffle([question.answer, ...question.wrong], random);
      return { payload: { kind: 'choice', question, choices, correctChoice: choices.indexOf(question.answer) }, tolerance: null };
    }
    return { payload: { kind: 'free', question }, tolerance: null };
  }
  if (c.kind === 'places') {
    return {
      payload: { kind: 'map', prompt: c.question, place: c.places[index]!, ...(c.bounds ? { bounds: c.bounds } : {}) },
      tolerance: toleranceFor('map', room, rooms),
    };
  }
  if (c.kind === 'events') {
    return { payload: { kind: 'timeline', prompt: c.question, event: c.events[index]! }, tolerance: toleranceFor('timeline', room, rooms) };
  }
  if (c.kind === 'ranked') {
    const n = Math.min(c.items.length, toleranceFor('topx', room, rooms));
    // Der Fragetext der Liste passt oft nicht (No Risk No Fun nennt andere Zahlen und Punkte), daher ein eigener.
    return { payload: { kind: 'topx', prompt: `Nenne einen Eintrag aus den Top ${n}: ${c.title}`, items: c.items.slice(0, n) }, tolerance: n };
  }
  throw new Error(`Liste ${c.id} passt zu keinem Format`);
}

/**
 * Baut den Dungeon: je Raum `doors` Türen, Formate reihum gemischt, im selben Raum keine Liste doppelt.
 * Weniger benutzte Listen haben Vorrang; erst wenn die Listen knapp werden, kommt eine in einem späteren Raum wieder.
 */
export function buildDungeon(categories: readonly Category[], options: DungeonOptions, random: () => number): DungeonDoor[][] | string {
  const byFormat = dungeonListsByFormat(categories, options.formats);
  const sources: Source[] = [];
  for (const format of options.formats) {
    for (const category of byFormat[format]) {
      if (fits(format, category) && entriesOf(category) > 0) sources.push({ format, category, left: [], used: 0 });
    }
  }
  if (availableLists(categories, options.formats) < options.doors) {
    return `Zu wenige Listen für ${options.doors} Türen: Es gibt nur ${availableLists(categories, options.formats)}. Weniger Türen wählen oder mehr Formate zulassen.`;
  }

  const rooms: DungeonDoor[][] = [];
  for (let r = 0; r < options.rooms; r++) {
    const doors: DungeonDoor[] = [];
    const taken = new Set<string>();
    const formats = shuffle(options.formats, random);
    for (let d = 0; d < options.doors; d++) {
      // Wunschformat reihum, sonst irgendein Format mit freier Liste.
      const wanted = formats[d % formats.length]!;
      const free = sources.filter((s) => !taken.has(s.category.id));
      const pool = free.some((s) => s.format === wanted) ? free.filter((s) => s.format === wanted) : free;
      const least = Math.min(...pool.map((s) => s.used));
      const pick = shuffle(
        pool.filter((s) => s.used === least),
        random,
      )[0]!;
      pick.used++;
      taken.add(pick.category.id);
      const { payload, tolerance } = payloadFor(pick, r, options.rooms, random);
      doors.push({ id: `r${r + 1}d${d + 1}`, categoryId: pick.category.id, title: pick.category.title, kind: payload.kind, tolerance, payload });
    }
    rooms.push(shuffle(doors, random).map((door, i) => ({ ...door, id: `r${r + 1}d${i + 1}` })));
  }
  return rooms;
}
