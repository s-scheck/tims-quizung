/** Internationales Morsealphabet für Buchstaben und Ziffern. */
export const MORSE_TABLE: Readonly<Record<string, string>> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
  K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
  U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
};

/** Großschreibung, Umlaute ausgeschrieben, Akzente weg, nur A–Z, 0–9 und einzelne Leerzeichen. */
export function normalizeMorseText(text: string): string {
  return text
    .toUpperCase()
    .replace(/Ä/g, 'AE')
    .replace(/Ö/g, 'OE')
    .replace(/Ü/g, 'UE')
    .replace(/ẞ|ß/g, 'SS')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Wie `normalizeMorseText`, aber ohne Leerzeichen, für den Vergleich von Tipps. */
export function compactMorseText(text: string): string {
  return normalizeMorseText(text).replace(/ /g, '');
}

/** Punkte und Striche: Zeichen durch Leerzeichen, Wörter durch ` / ` getrennt. */
export function toMorse(text: string): string {
  return normalizeMorseText(text)
    .split(' ')
    .filter(Boolean)
    .map((word) =>
      [...word]
        .map((ch) => MORSE_TABLE[ch])
        .filter((c): c is string => c !== undefined)
        .join(' '),
    )
    .join(' / ');
}

export interface MorseBeep {
  /** Start in Millisekunden ab Beginn. */
  at: number;
  duration: number;
}

/**
 * Ein-Phasen für Ton und Licht. Punkt 1 Einheit, Strich 3, Pause im Zeichen 1,
 * zwischen Zeichen 3, zwischen Wörtern 7.
 */
export function morseSchedule(code: string, unitMs: number): MorseBeep[] {
  const out: MorseBeep[] = [];
  let t = 0;
  const words = code.split(' / ');
  words.forEach((word, wi) => {
    if (wi > 0) t += 7 * unitMs;
    const chars = word.split(' ').filter(Boolean);
    chars.forEach((ch, ci) => {
      if (ci > 0) t += 3 * unitMs;
      [...ch].forEach((sym, si) => {
        if (si > 0) t += unitMs;
        const duration = sym === '-' ? 3 * unitMs : unitMs;
        out.push({ at: t, duration });
        t += duration;
      });
    });
  });
  return out;
}

/** Gesamtdauer einer Wiedergabe in Millisekunden. */
export function morseDurationMs(code: string, unitMs: number): number {
  const beeps = morseSchedule(code, unitMs);
  const last = beeps[beeps.length - 1];
  return last ? last.at + last.duration : 0;
}

/** Vorschläge für den Host, von leicht bis schwer. */
export const MORSE_SUGGESTIONS: readonly string[] = [
  'SOS', 'HALLO', 'QUIZ', 'PIZZA', 'KAFFEE', 'BERLIN', 'SOMMER', 'WINTER', 'KATZE', 'HUND',
  'APFEL', 'BANANE', 'SCHULE', 'GARTEN', 'FUSSBALL', 'MUSIK', 'KINO', 'STRAND', 'REGEN', 'SONNE',
  'MOND', 'STERN', 'WASSER', 'FEUER', 'ERDE', 'LUFT', 'TITANIC', 'STAR WARS', 'HARRY POTTER', 'GUTEN MORGEN',
  'GUTE NACHT', 'OKTOBERFEST', 'BRANDENBURGER TOR', 'EIFFELTURM', 'SCHOKOLADE', 'FAHRRAD', 'FLUGZEUG', 'RAKETE', 'ROBOTER', 'COMPUTER',
  'TELEFON', 'FERNSEHER', 'GEBURTSTAG', 'WEIHNACHTEN', 'OSTERN', 'URLAUB', 'MONTAG', 'FREITAG', 'WOCHENENDE', 'KARTOFFEL',
  'BRATWURST', 'LIMONADE', 'ZITRONE', 'ERDBEERE', 'ELEFANT', 'GIRAFFE', 'PINGUIN', 'DELFIN', 'SCHMETTERLING', 'REGENBOGEN',
  'ABENTEUER', 'GEHEIMNIS', 'FREUNDSCHAFT', 'MORSEN MACHT SPASS', 'TIMS QUIZUNG',
];
