import type { SongSearchHit } from '@quiz/shared';

export interface TrackInfo extends SongSearchHit {
  preview: string | null;
}

const tracks = new Map<number, Promise<TrackInfo | null>>();

/** Cover und frischer Ausschnitt zu einer Deezer-ID, je Seite einmal geladen. */
export function loadTrack(deezer: number): Promise<TrackInfo | null> {
  let p = tracks.get(deezer);
  if (!p) {
    p = fetch(`/api/songs/track/${deezer}`)
      .then((r) => (r.ok ? (r.json() as Promise<TrackInfo>) : null))
      .catch(() => null);
    // Fehlschläge nicht merken, beim nächsten Mal neu versuchen.
    p.then((t) => t ?? tracks.delete(deezer));
    tracks.set(deezer, p);
  }
  return p;
}

export async function searchSongs(q: string): Promise<SongSearchHit[]> {
  const res = await fetch(`/api/songs/search?q=${encodeURIComponent(q)}`);
  const data = (await res.json().catch(() => ({}))) as { hits?: SongSearchHit[]; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Suche fehlgeschlagen');
  return data.hits ?? [];
}

/**
 * Ein Audio-Element für Ausschnitte: vorladen, ab einer Stelle für einige Sekunden spielen, stoppen.
 * `play` muss beim ersten Mal aus einer Nutzergeste kommen, sonst blockt der Browser.
 */
export class SnippetPlayer {
  private audio: HTMLAudioElement | null = typeof Audio !== 'undefined' ? new Audio() : null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private loadedFor: number | null = null;
  onState: (playing: boolean) => void = () => {};

  constructor() {
    if (!this.audio) return;
    this.audio.preload = 'auto';
    this.audio.addEventListener('pause', () => this.onState(false));
    this.audio.addEventListener('playing', () => this.onState(true));
  }

  /** Ausschnitt-Adresse holen und vorladen. Liefert false, wenn Deezer keinen Ausschnitt hat. */
  async load(deezer: number): Promise<boolean> {
    if (!this.audio) return false;
    if (this.loadedFor === deezer && this.audio.src) return true;
    const t = await loadTrack(deezer);
    if (!t?.preview) return false;
    this.stop();
    this.audio.src = t.preview;
    this.audio.load();
    this.loadedFor = deezer;
    return true;
  }

  async play(offset: number, seconds: number): Promise<boolean> {
    if (!this.audio || !this.audio.src) return false;
    this.clearTimer();
    try {
      this.audio.currentTime = offset;
      await this.audio.play();
    } catch {
      return false;
    }
    this.stopTimer = setTimeout(() => this.audio?.pause(), seconds * 1000);
    return true;
  }

  /**
   * Schaltet den Ton frei. Desktop-Browser merken sich jede Nutzergeste auf der Seite; ist schon ein
   * Ausschnitt geladen, wird er zusätzlich einmal stumm angespielt, das braucht Safari auf dem iPhone.
   */
  async unlock(): Promise<void> {
    if (!this.audio?.src) return;
    try {
      this.audio.muted = true;
      await this.audio.play();
      this.audio.pause();
    } catch {
      // Kein Ausschnitt spielbar, die Geste zählt trotzdem.
    } finally {
      this.audio.muted = false;
    }
  }

  stop(): void {
    this.clearTimer();
    this.audio?.pause();
  }

  private clearTimer(): void {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = null;
  }

  dispose(): void {
    this.stop();
    this.audio?.removeAttribute('src');
    this.audio = null;
  }
}
