import { describe, expect, test } from 'bun:test';
import { COLUMNS, cellIssues, draftFromRaw, draftToRaw, makeId, newDraft, parseLatLng, parseNumber, parsePasted, parseYear, rowsFromCells, sortRowsByValue, validate } from './editorModel.ts';

describe('Editor: Zahlen lesen', () => {
  test('Zahlen wie aus Excel', () => {
    expect(parseNumber('17.098.246')).toBe(17098246);
    expect(parseNumber('1.450,9')).toBe(1450.9);
    expect(parseNumber('1450.9')).toBe(1450.9);
    expect(parseNumber('1 450')).toBe(1450);
    expect(parseNumber('-3,5')).toBe(-3.5);
    expect(parseNumber('abc')).toBeNaN();
    expect(parseNumber('')).toBeNaN();
  });

  test('Jahre mit v. Chr.', () => {
    expect(parseYear('1789')).toBe(1789);
    expect(parseYear('-44')).toBe(-44);
    expect(parseYear('44 v. Chr.')).toBe(-44);
    expect(parseYear('44 v.Chr')).toBe(-44);
    expect(parseYear('800 n. Chr.')).toBe(800);
    expect(parseYear('um 1800')).toBeNaN();
  });

  test('Koordinaten aus Google Maps', () => {
    expect(parseLatLng('48.8584, 2.2945')).toEqual({ lat: 48.8584, lng: 2.2945 });
    expect(parseLatLng('-33.8568 151.2153')).toEqual({ lat: -33.8568, lng: 151.2153 });
    expect(parseLatLng('100, 2')).toBeNull();
    expect(parseLatLng('Paris')).toBeNull();
  });
});

describe('Editor: Einfügen', () => {
  test('Tabs aus Excel, Semikolon aus CSV, eine Spalte', () => {
    expect(parsePasted('Russland\t17.098.246\nKanada\t9.984.670\n')).toEqual([['Russland', '17.098.246'], ['Kanada', '9.984.670']]);
    expect(parsePasted('"Rom";Italien\r\nParis;Frankreich')).toEqual([['Rom', 'Italien'], ['Paris', 'Frankreich']]);
    expect(parsePasted('Lettland\nChile')).toEqual([['Lettland'], ['Chile']]);
    expect(rowsFromCells([['Rom', 'Italien']], COLUMNS.pairs)).toEqual([{ left: 'Rom', right: 'Italien' }]);
  });
});

describe('Editor: Liste hin und zurück', () => {
  test('Rangliste mit Aliassen und Anzeige, unbekannte Felder bleiben', () => {
    const raw = {
      id: 'x',
      title: 'T',
      question: 'Q',
      topLabel: 'oben',
      bottomLabel: 'unten',
      unit: 'km²',
      order: 'desc',
      games: ['risk'],
      extra: 1,
      items: [{ name: 'USA', value: 9833517, aliases: ['US', 'Amerika'] }, { name: 'B', value: 5, label: 'fünf' }],
    };
    const draft = draftFromRaw(raw);
    expect(draft.rows[0]).toEqual({ name: 'USA', value: '9833517', label: '', aliases: 'US, Amerika' });
    draft.rows.push({ name: '', value: '', label: '', aliases: '' });
    expect(draftToRaw(draft, 'x', raw)).toEqual(raw);
  });

  test('Ereignisse: Jahr, Spanne, v. Chr.', () => {
    const draft = newDraft('timeline');
    draft.meta.title = 'Z';
    draft.rows = [
      { name: 'A', from: '44 v. Chr.', to: '' },
      { name: 'B', from: '1939', to: '1945' },
      { name: 'C', from: '1800', to: '1800' },
    ];
    expect(draftToRaw(draft, 'zeit-z').events).toEqual([
      { name: 'A', year: -44 },
      { name: 'B', from: 1939, to: 1945 },
      { name: 'C', year: 1800 },
    ]);
  });

  test('Prüfung wie auf dem Server, mit Zeilennummern', () => {
    const draft = newDraft('map');
    draft.meta.title = 'Orte';
    draft.rows = Array.from({ length: 10 }, (_, i) => ({ name: `Ort ${i}`, lat: String(i), lng: '1' }));
    expect(validate(draftToRaw(draft, 'map-orte'), 'map-orte')).toBeNull();
    draft.rows[3]!.lat = '95';
    expect(validate(draftToRaw(draft, 'map-orte'), 'map-orte')).toBe('Zeile 4 "Ort 3": Koordinaten ungültig');
    draft.rows = draft.rows.slice(0, 1);
    expect(validate(draftToRaw(draft, 'map-orte'), 'map-orte')).toMatch(/mindestens 2/);
  });

  test('Zellen-Hinweise: fehlt, keine Zahl, doppelt', () => {
    const issues = cellIssues('ranked', [
      { name: 'A', value: 'x', label: '', aliases: '' },
      { name: 'a', value: '', label: '', aliases: '' },
      { name: '', value: '', label: '', aliases: '' },
    ]);
    expect(issues).toEqual([{ value: 'keine Zahl', name: 'doppelt' }, { value: 'fehlt', name: 'doppelt' }, {}]);
  });

  test('nach Wert sortieren und ids', () => {
    const rows = [{ value: '2' }, { value: 'x' }, { value: '10' }];
    expect(sortRowsByValue(rows, 'desc').map((r) => r.value)).toEqual(['10', '2', 'x']);
    expect(makeId('Größte Seen!', 'risk', new Set(['risk-groesste-seen']))).toBe('risk-groesste-seen-2');
    expect(makeId('', 'sort', new Set())).toBe('liste');
  });
});

describe('Editor: Aufgabenliste (Bluff)', () => {
  test('hin und zurück, Prüfung wie auf dem Server', () => {
    const raw = {
      id: 'bluff-test',
      title: 'Sublines',
      question: 'Wie lautet die echte Subline?',
      promptLabel: 'Film',
      answerLabel: 'Subline',
      instruction: 'Schreib eine Subline.',
      games: ['bluff'],
      prompts: Array.from({ length: 8 }, (_, i) => ({ name: `Film ${i + 1}`, answer: `Subline ${i + 1}` })),
    };
    const draft = draftFromRaw(raw);
    expect(draft.kind).toBe('prompts');
    expect(draft.rows[0]).toEqual({ name: 'Film 1', answer: 'Subline 1' });
    expect(draft.meta.instruction).toBe('Schreib eine Subline.');
    const back = draftToRaw(draft, 'bluff-test');
    expect(back.games).toEqual(['bluff']);
    expect(back.prompts).toEqual(raw.prompts);
    expect(validate(back, 'bluff-test')).toBeNull();
    draft.rows[0]!.answer = '';
    expect(validate(draftToRaw(draft, 'bluff-test'), 'bluff-test')).toMatch(/answer/);
    expect(makeId('Film-Sublines', 'bluff', new Set())).toBe('bluff-film-sublines');
  });
});

describe('Bilderrätsel im Editor', () => {
  test('Entwurf aus Rohdaten und zurück, Felder mit einer Nachkommastelle', () => {
    const raw = {
      id: 'bild-zimmer',
      title: 'Wohnzimmer',
      question: 'Was fehlt hier?',
      games: ['picture'],
      image: 'k1-zimmer.jpg',
      original: 'k1-orig.jpg',
      fields: [
        { answer: 'Lampe', x: 10, y: 10.25, w: 20, h: 15 },
        { answer: 'Katze', x: 50, y: 60, w: 12, h: 10 },
      ],
    };
    const draft = draftFromRaw(raw);
    expect(draft.kind).toBe('picture');
    expect(draft.meta.image).toBe('k1-zimmer.jpg');
    expect(draft.meta.original).toBe('k1-orig.jpg');
    expect(draft.rows).toEqual([
      { answer: 'Lampe', x: '10', y: '10.25', w: '20', h: '15' },
      { answer: 'Katze', x: '50', y: '60', w: '12', h: '10' },
    ]);
    const back = draftToRaw(draft, 'bild-zimmer');
    expect(back).toMatchObject({ games: ['picture'], image: 'k1-zimmer.jpg', original: 'k1-orig.jpg' });
    expect(back.fields).toEqual([
      { answer: 'Lampe', x: 10, y: 10.3, w: 20, h: 15 },
      { answer: 'Katze', x: 50, y: 60, w: 12, h: 10 },
    ]);
    expect(validate(back, 'bild-zimmer')).toBeNull();

    draft.meta.original = '';
    draft.rows.push({ answer: '', x: '1', y: '1', w: '5', h: '5' });
    const again = draftToRaw(draft, 'bild-zimmer');
    expect(again.original).toBeUndefined();
    expect(validate(again, 'bild-zimmer')).toMatch(/Feld 3/);
    expect(cellIssues('picture', draft.rows)[2]).toEqual({ answer: 'fehlt' });
    expect(cellIssues('picture', [{ answer: 'Fenster', x: '1', y: '1', w: '5', h: '5' }, { answer: 'Fenster', x: '9', y: '1', w: '5', h: '5' }])).toEqual([{}, {}]);
  });

  test('neuer Entwurf hat kein Bild und keine Leerzeilen, id mit Präfix', () => {
    const draft = newDraft('picture');
    expect(draft.rows).toEqual([]);
    expect(draft.meta.question).toBe('Was fehlt hier?');
    draft.meta.title = 'Garten';
    expect(validate(draftToRaw(draft, 'bild-x'), 'bild-x')).toMatch(/image/);
    expect(makeId('Mein Garten', 'picture', new Set())).toBe('bild-mein-garten');
  });
});
