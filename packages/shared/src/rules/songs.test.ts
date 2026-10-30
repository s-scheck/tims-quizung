import { describe, expect, test } from 'bun:test';
import { matchSongArtist, matchSongTitle, songKey } from './songs.ts';

describe('Songs erraten: Abgleich', () => {
  test('Schlüssel ohne Zusätze, Satzzeichen und führendes The', () => {
    expect(songKey('Hey Jude (Remastered 2015)')).toBe('heyjude');
    expect(songKey('Hotel California - 2013 Remaster')).toBe('hotelcalifornia');
    expect(songKey('Get Lucky feat. Pharrell Williams')).toBe('getlucky');
    expect(songKey('The Beatles')).toBe('beatles');
    expect(songKey('Simon & Garfunkel')).toBe(songKey('Simon und Garfunkel'));
    expect(songKey('Y.M.C.A.')).toBe('ymca');
  });

  test('Titel: Aliasse, Klammerinhalt, kleine Tippfehler', () => {
    expect(matchSongTitle('satisfaction', "(I Can't Get No) Satisfaction", ['Satisfaction'])).toBe(true);
    expect(matchSongTitle('Da Ba Dee', 'Blue (Da Ba Dee)')).toBe(true);
    expect(matchSongTitle('blue', 'Blue (Da Ba Dee)')).toBe(true);
    expect(matchSongTitle('Wonder Wall', 'Wonderwall')).toBe(true);
    expect(matchSongTitle('Bohemian Rapsody', 'Bohemian Rhapsody')).toBe(true);
    expect(matchSongTitle('Hapy', 'Happy')).toBe(true);
    expect(matchSongTitle('Hapi', 'Happy')).toBe(false);
    expect(matchSongTitle('Crazy in Love', 'Crazy')).toBe(false);
    expect(matchSongTitle('', 'Crazy')).toBe(false);
  });

  test('Interpret: Aliasse, einzelne Namen bei feat., The egal', () => {
    expect(matchSongArtist('Beatles', 'The Beatles')).toBe(true);
    expect(matchSongArtist('Bruno Mars', 'Mark Ronson', ['Bruno Mars'])).toBe(true);
    expect(matchSongArtist('pharrell', 'Daft Punk feat. Pharrell')).toBe(true);
    expect(matchSongArtist('Guns and Roses', "Guns N' Roses", ['Guns and Roses'])).toBe(true);
    expect(matchSongArtist('Simon and Garfunkel', 'Simon & Garfunkel')).toBe(true);
    expect(matchSongArtist('Micheal Jackson', 'Michael Jackson')).toBe(true);
    expect(matchSongArtist('Queen', 'Queens of the Stone Age')).toBe(false);
    expect(matchSongArtist('ACDC', 'AC/DC')).toBe(true);
  });
});
