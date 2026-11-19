import type { DungeonDoorView } from '@quiz/shared';

/** Format kurz für das Türschild, z. B. „Karte · 300 km“. */
export function doorFormat(door: DungeonDoorView): string {
  switch (door.kind) {
    case 'choice':
      return 'a/b/c/d';
    case 'free':
      return 'Freie Antwort';
    case 'map':
      return `Karte · ${door.tolerance} km`;
    case 'timeline':
      return `Jahr · ±${door.tolerance}`;
    case 'topx':
      return `Top ${door.tolerance}`;
  }
}

/** Ganz kurz fürs Schild über der Tür. */
export function doorShort(door: DungeonDoorView): string {
  switch (door.kind) {
    case 'choice':
      return 'A·B·C·D';
    case 'free':
      return 'Frei';
    case 'map':
      return `${door.tolerance} km`;
    case 'timeline':
      return `±${door.tolerance} J.`;
    case 'topx':
      return `Top ${door.tolerance}`;
  }
}

/** Symbol fürs Format. */
export function doorIcon(door: DungeonDoorView): string {
  return { choice: '☰', free: '✎', map: '⌖', timeline: '⧗', topx: '♛' }[door.kind];
}

/** Ausführlich für die Auswahl unter der Szene. */
export function doorHint(door: DungeonDoorView): string {
  switch (door.kind) {
    case 'choice':
      return 'Multiple Choice mit vier Antworten.';
    case 'free':
      return 'Antwort frei eintippen, Tippfehler sind erlaubt.';
    case 'map':
      return `Einen Ort auf der Karte pinnen. Richtig bis ${door.tolerance} km Abstand.`;
    case 'timeline':
      return `Das Jahr schätzen. Richtig bis ±${door.tolerance} Jahre.`;
    case 'topx':
      return `Einen Eintrag aus den Top ${door.tolerance} nennen.`;
  }
}

/** Farbstimmung je Raum: Farbton für Wand, Boden und Licht. */
export const ROOM_HUES = [32, 205, 275, 150, 4, 48, 185];
