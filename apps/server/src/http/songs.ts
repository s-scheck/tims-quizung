import type { SongSearchHit } from '@quiz/shared';

type Fetcher = (url: string) => Promise<Response>;

const DEEZER = 'https://api.deezer.com';
/** Ausschnitt-Links von Deezer sind signiert und laufen ab, deshalb nur kurz zwischenspeichern. */
const TRACK_TTL_MS = 10 * 60_000;
const TIMEOUT_MS = 6000;

interface DeezerTrack {
  id: number;
  title: string;
  preview?: string;
  duration?: number;
  artist?: { name?: string };
  album?: { cover_medium?: string };
  error?: unknown;
}

function json(data: unknown, status = 200, maxAge = 0): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': maxAge ? `private, max-age=${maxAge}` : 'no-store' } });
}

function hit(t: DeezerTrack): SongSearchHit {
  return { deezer: t.id, title: t.title, artist: t.artist?.name ?? '', cover: t.album?.cover_medium ?? null, duration: t.duration ?? 0 };
}

/**
 * Schnittstelle zu Deezer für Songs erraten: Suche für den Host und Ausschnitt plus Cover zu einer ID.
 * Der Server fragt Deezer, damit Browser keine fremden Dienste direkt ansprechen müssen.
 */
export function songsRoutes(fetcher: Fetcher = (url) => fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })) {
  const cache = new Map<number, { at: number; data: SongSearchHit & { preview: string | null } }>();

  async function deezer<T>(path: string): Promise<T | null> {
    try {
      const res = await fetcher(`${DEEZER}${path}`);
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  return {
    '/api/songs/search': {
      GET: async (req: Request) => {
        const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
        if (q.length < 2 || q.length > 100) return json({ hits: [] });
        const data = await deezer<{ data?: DeezerTrack[] }>(`/search?q=${encodeURIComponent(q)}&limit=12`);
        if (!data) return json({ error: 'Deezer ist gerade nicht erreichbar' }, 502);
        // Ohne Ausschnitt lässt sich der Song nicht spielen.
        return json({ hits: (data.data ?? []).filter((t) => t.preview).map(hit) });
      },
    },
    '/api/songs/track/:id': {
      GET: async (req: Request & { params: { id: string } }) => {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return json({ error: 'Ungültige ID' }, 400);
        const cached = cache.get(id);
        if (cached && Date.now() - cached.at < TRACK_TTL_MS) return json(cached.data);
        const t = await deezer<DeezerTrack>(`/track/${id}`);
        if (!t || t.error || !t.id) return json({ error: 'Song bei Deezer nicht gefunden' }, 502);
        const data = { ...hit(t), preview: t.preview || null };
        cache.set(id, { at: Date.now(), data });
        if (cache.size > 500) cache.delete(cache.keys().next().value!);
        return json(data);
      },
    },
  };
}
