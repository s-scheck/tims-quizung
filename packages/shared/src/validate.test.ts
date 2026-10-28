import { describe, expect, test } from 'bun:test';
import { isClientMsg, isValidName, isValidScore, normalizeName } from './validate.ts';
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from './ids.ts';

describe('isClientMsg', () => {
  test('akzeptiert gültige Nachrichten', () => {
    expect(isClientMsg({ type: 'create', name: 'Tim', version: 1 })).toBe(true);
    expect(isClientMsg({ type: 'join', code: 'ABCD', version: 1 })).toBe(true);
    expect(isClientMsg({ type: 'join', code: 'ABCD', token: 'x', version: 1 })).toBe(true);
    expect(isClientMsg({ type: 'select', turnNo: 3, cardId: 'c1' })).toBe(true);
    expect(isClientMsg({ type: 'select', turnNo: 3 })).toBe(true);
    expect(isClientMsg({ type: 'select', turnNo: 3, cardId: 'k1', targetId: 't2' })).toBe(true);
    expect(isClientMsg({ type: 'choose_category', gameId: 'match', categoryId: 'x', lives: 2 })).toBe(true);
    expect(isClientMsg({ type: 'choose_category', gameId: 'map', categoryId: 'x', targetId: 'taj-mahal', borders: true })).toBe(true);
    expect(isClientMsg({ type: 'place_pin', lat: 27.17, lng: 78.04 })).toBe(true);
    expect(isClientMsg({ type: 'place_year', year: -44 })).toBe(true);
    expect(isClientMsg({ type: 'risk_guess', text: 'Mongolei' })).toBe(true);
    expect(isClientMsg({ type: 'risk_correct', playerId: 'p1', rank: 9 })).toBe(true);
    expect(isClientMsg({ type: 'risk_correct', playerId: 'p1', rank: null })).toBe(true);
    expect(isClientMsg({ type: 'next_pass' })).toBe(true);
    expect(isClientMsg({ type: 'choose_category', gameId: 'risk', categoryId: 'x', duplicates: 'none', missPoints: -10 })).toBe(true);
    expect(isClientMsg({ type: 'confirm_pin' })).toBe(true);
    expect(isClientMsg({ type: 'end_round' })).toBe(true);
    expect(isClientMsg({ type: 'submit_scores', scores: { a: 1, b: -2 } })).toBe(true);
    expect(isClientMsg({ type: 'set_settings', timerSeconds: 30 })).toBe(true);
    expect(isClientMsg({ type: 'set_settings', hostPlays: false })).toBe(true);
    expect(isClientMsg({ type: 'set_settings', timerSeconds: 60, hostPlays: true })).toBe(true);
    expect(isClientMsg({ type: 'ping' })).toBe(true);
    expect(isClientMsg({ type: 'start_game' })).toBe(true);
    expect(isClientMsg({ type: 'choose_category', gameId: 'topx', categoryId: 'x', lives: 3 })).toBe(true);
    expect(isClientMsg({ type: 'choose_category', gameId: 'sort', categoryId: 'x' })).toBe(true);
    expect(isClientMsg({ type: 'choose_category', gameId: 'map', categoryId: 'x', reveal: 'show' })).toBe(true);
    expect(isClientMsg({ type: 'reveal_player', playerId: 'p1' })).toBe(true);
    expect(isClientMsg({ type: 'reveal_solution' })).toBe(true);
    expect(isClientMsg({ type: 'reveal_all' })).toBe(true);
    expect(isClientMsg({ type: 'picture_guess', turnNo: 2, fieldId: 'f3', text: 'Eiffelturm' })).toBe(true);
    expect(isClientMsg({ type: 'picture_judge', turnNo: 2, correct: false })).toBe(true);
    expect(isClientMsg({ type: 'choose_category', gameId: 'picture', categoryId: 'x', mode: 'all' })).toBe(true);
    expect(isClientMsg({ type: 'picture_fill', fieldId: 'f1', text: '' })).toBe(true);
    expect(isClientMsg({ type: 'picture_done' })).toBe(true);
    expect(isClientMsg({ type: 'picture_step', index: 2 })).toBe(true);
    expect(isClientMsg({ type: 'picture_verdict', playerId: 'p1', fieldId: 'f1', correct: true })).toBe(true);
    expect(isClientMsg({ type: 'choose_category', gameId: 'faces', categoryId: 'x', targetId: 'p', effect: 'tiles', cols: 6 })).toBe(true);
    expect(isClientMsg({ type: 'face_guess', text: 'Angela Merkel' })).toBe(true);
    expect(isClientMsg({ type: 'face_judge', playerId: 'p1', index: 0, correct: true })).toBe(true);
    expect(isClientMsg({ type: 'face_effect', level: 40 })).toBe(true);
    expect(isClientMsg({ type: 'face_effect', revealed: [0, 5, 7] })).toBe(true);
    expect(isClientMsg({ type: 'guess', turnNo: 2, text: 'Haaland' })).toBe(true);
    expect(isClientMsg({ type: 'judge', turnNo: 2, correct: true, rank: 3 })).toBe(true);
    expect(isClientMsg({ type: 'judge', turnNo: 2, correct: false })).toBe(true);
  });

  test('lehnt kaputte Nachrichten ab', () => {
    expect(isClientMsg(null)).toBe(false);
    expect(isClientMsg('join')).toBe(false);
    expect(isClientMsg({ type: 'nope' })).toBe(false);
    expect(isClientMsg({ type: 'create', name: 5, version: 1 })).toBe(false);
    expect(isClientMsg({ type: 'select', turnNo: 'x' })).toBe(false);
    expect(isClientMsg({ type: 'select', turnNo: 1, gapIndex: -1 })).toBe(false);
    expect(isClientMsg({ type: 'select', turnNo: 1, targetId: 5 })).toBe(false);
    expect(isClientMsg({ type: 'place_pin', lat: 91, lng: 0 })).toBe(false);
    expect(isClientMsg({ type: 'place_pin', lat: 0, lng: 181 })).toBe(false);
    expect(isClientMsg({ type: 'place_pin', lat: '1', lng: 2 })).toBe(false);
    expect(isClientMsg({ type: 'place_year', year: 0 })).toBe(false);
    expect(isClientMsg({ type: 'risk_guess', text: 'x'.repeat(61) })).toBe(false);
    expect(isClientMsg({ type: 'risk_correct', playerId: 'p1', rank: 0 })).toBe(false);
    expect(isClientMsg({ type: 'choose_category', gameId: 'risk', categoryId: 'x', missPoints: -5 })).toBe(false);
    expect(isClientMsg({ type: 'choose_category', gameId: 'risk', categoryId: 'x', duplicates: 'first' })).toBe(false);
    expect(isClientMsg({ type: 'place_year', year: 1789.5 })).toBe(false);
    expect(isClientMsg({ type: 'place_year', year: 99999 })).toBe(false);
    expect(isClientMsg({ type: 'choose_category', gameId: 'map', categoryId: 'x', borders: 'ja' })).toBe(false);
    expect(isClientMsg({ type: 'choose_category', gameId: 'map', categoryId: 'x', reveal: 'slow' })).toBe(false);
    expect(isClientMsg({ type: 'reveal_player' })).toBe(false);
    expect(isClientMsg({ type: 'picture_guess', turnNo: 2, fieldId: 'f3', text: '' })).toBe(false);
    expect(isClientMsg({ type: 'picture_judge', turnNo: 2 })).toBe(false);
    expect(isClientMsg({ type: 'choose_category', gameId: 'picture', categoryId: 'x', mode: 'race' })).toBe(false);
    expect(isClientMsg({ type: 'picture_fill', fieldId: 'f1', text: 'x'.repeat(61) })).toBe(false);
    expect(isClientMsg({ type: 'picture_step', index: -1 })).toBe(false);
    expect(isClientMsg({ type: 'picture_verdict', playerId: 'p1', fieldId: 'f1' })).toBe(false);
    expect(isClientMsg({ type: 'choose_category', gameId: 'faces', categoryId: 'x', effect: 'swirl' })).toBe(false);
    expect(isClientMsg({ type: 'choose_category', gameId: 'faces', categoryId: 'x', level: 101 })).toBe(false);
    expect(isClientMsg({ type: 'face_guess', text: '  ' })).toBe(false);
    expect(isClientMsg({ type: 'face_effect' })).toBe(false);
    expect(isClientMsg({ type: 'face_effect', cols: 1 })).toBe(false);
    expect(isClientMsg({ type: 'face_effect', revealed: [-1] })).toBe(false);
    expect(isClientMsg({ type: 'submit_scores', scores: { a: 1.5 } })).toBe(false);
    expect(isClientMsg({ type: 'submit_scores', scores: { a: 5000 } })).toBe(false);
    expect(isClientMsg({ type: 'set_settings', timerSeconds: 45 })).toBe(false);
    expect(isClientMsg({ type: 'set_settings' })).toBe(false);
    expect(isClientMsg({ type: 'set_settings', hostPlays: 'ja' })).toBe(false);
    expect(isClientMsg({ type: 'host_decision', continue: 'ja' })).toBe(false);
    expect(isClientMsg({ type: 'choose_category', gameId: 'chess', categoryId: 'x' })).toBe(false);
    expect(isClientMsg({ type: 'choose_category', gameId: 'topx', categoryId: 'x', lives: 9 })).toBe(false);
    expect(isClientMsg({ type: 'guess', turnNo: 1 })).toBe(false);
    expect(isClientMsg({ type: 'judge', turnNo: 1, correct: true, rank: 0 })).toBe(false);
  });
});

describe('Namen und Scores', () => {
  test('normalizeName trimmt und fasst Leerzeichen zusammen', () => {
    expect(normalizeName('  Tim   S. ')).toBe('Tim S.');
  });
  test('isValidName', () => {
    expect(isValidName('Tim')).toBe(true);
    expect(isValidName('   ')).toBe(false);
    expect(isValidName('x'.repeat(21))).toBe(false);
  });
  test('isValidScore', () => {
    expect(isValidScore(0)).toBe(true);
    expect(isValidScore(-3)).toBe(true);
    expect(isValidScore(1.5)).toBe(false);
    expect(isValidScore(1000)).toBe(false);
    expect(isValidScore('1')).toBe(false);
  });
});

describe('Raumcodes', () => {
  test('erzeugt Codes aus dem Alphabet', () => {
    for (let i = 0; i < 50; i++) expect(isValidRoomCode(generateRoomCode())).toBe(true);
  });
  test('normalisiert Eingaben', () => {
    expect(normalizeRoomCode(' ab-cd ')).toBe('ABCD');
    expect(isValidRoomCode('ABC1')).toBe(false);
    expect(isValidRoomCode('ABCDE')).toBe(false);
  });
});

describe('Bluff-Nachrichten', () => {
  test('gültig', () => {
    expect(isClientMsg({ type: 'submit_text', text: 'Im Weltraum hört dich niemand schreien.' })).toBe(true);
    expect(isClientMsg({ type: 'vote', entryId: 'e3' })).toBe(true);
    expect(isClientMsg({ type: 'advance' })).toBe(true);
    expect(isClientMsg({ type: 'choose_category', gameId: 'bluff', categoryId: 'x', targetId: 'alien-1979' })).toBe(true);
  });
  test('ungültig', () => {
    expect(isClientMsg({ type: 'submit_text', text: 5 })).toBe(false);
    expect(isClientMsg({ type: 'submit_text', text: 'x'.repeat(401) })).toBe(false);
    expect(isClientMsg({ type: 'vote', entryId: 'x'.repeat(21) })).toBe(false);
    expect(isClientMsg({ type: 'vote' })).toBe(false);
  });
});

describe('Morse-Nachrichten', () => {
  test('gültig', () => {
    expect(isClientMsg({ type: 'choose_category', gameId: 'morse', categoryId: 'morse', word: 'Hallo Welt' })).toBe(true);
    expect(isClientMsg({ type: 'morse_guess', text: 'hallo' })).toBe(true);
    expect(isClientMsg({ type: 'morse_accept', playerId: 'p1', index: 0 })).toBe(true);
    expect(isClientMsg({ type: 'morse_play', speed: 'slow' })).toBe(true);
    expect(isClientMsg({ type: 'morse_stop' })).toBe(true);
    expect(isClientMsg({ type: 'morse_show_light', shown: true })).toBe(true);
    expect(isClientMsg({ type: 'morse_show_code', shown: true })).toBe(true);
    expect(isClientMsg({ type: 'morse_show_table', shown: false })).toBe(true);
  });
  test('ungültig', () => {
    expect(isClientMsg({ type: 'morse_guess' })).toBe(false);
    expect(isClientMsg({ type: 'morse_accept', playerId: 'p1', index: -1 })).toBe(false);
    expect(isClientMsg({ type: 'morse_show_code', shown: 'ja' })).toBe(false);
    expect(isClientMsg({ type: 'morse_play', speed: 'turbo' })).toBe(false);
    expect(isClientMsg({ type: 'morse_play' })).toBe(false);
    expect(isClientMsg({ type: 'choose_category', gameId: 'morse', categoryId: 'morse', word: 7 })).toBe(false);
  });
});

