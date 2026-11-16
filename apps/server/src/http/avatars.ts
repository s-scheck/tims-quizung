import { AVATAR_PART_MAX_BYTES, AVATAR_PARTS, isAvatarPart, isHeadShape, type AvatarPart } from '@quiz/shared';
import type { RoomRegistry } from '../rooms/registry.ts';

type Params<K extends string> = { params: Record<K, string> };

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function fail(status: number, message: string): Response {
  return json({ error: message }, status);
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length > PNG_MAGIC.length && PNG_MAGIC.every((b, i) => bytes[i] === b);
}

/**
 * Figuren: Upload über HTTP, weil eine WebSocket-Nachricht höchstens 16 KB groß sein darf.
 * Die Bilder liegen nur im Arbeitsspeicher des Raums. Fremde Figuren gibt es erst ab Spielstart.
 */
export function avatarRoutes(registry: RoomRegistry) {
  return {
    '/api/rooms/:code/avatar': {
      POST: async (req: Request & Params<'code'>) => {
        const room = registry.get(req.params.code.toUpperCase());
        if (!room) return fail(404, 'Raum nicht gefunden');
        let form: FormData;
        try {
          form = await req.formData();
        } catch {
          return fail(400, 'Erwartet ein Formular');
        }
        const token = form.get('token');
        const player = typeof token === 'string' ? room.players.find((p) => p.token === token) : undefined;
        if (!player) return fail(403, 'Sitzung unbekannt');
        const shape = form.get('shape');
        if (!isHeadShape(shape)) return fail(400, 'Unbekannte Kopfform');

        const parts: Partial<Record<AvatarPart, Uint8Array<ArrayBuffer>>> = {};
        for (const key of new Set(form.keys())) {
          if (key === 'token' || key === 'shape') continue;
          const value = form.get(key);
          if (!isAvatarPart(key)) return fail(400, `Unbekanntes Teil „${key}“`);
          if (!(value instanceof File)) return fail(400, `Teil „${key}“ ist keine Datei`);
          if (value.size > AVATAR_PART_MAX_BYTES) return fail(413, `Teil „${key}“ ist zu groß`);
          const bytes = new Uint8Array(await value.arrayBuffer());
          if (!isPng(bytes)) return fail(415, `Teil „${key}“ ist kein PNG`);
          parts[key] = bytes;
        }

        const res = room.setAvatar(player.id, shape, parts);
        if (!res.ok) return fail(409, res.message);
        room.emit();
        return json({ ok: true, parts: AVATAR_PARTS.filter((p) => parts[p]) }, 201);
      },
    },
    '/api/rooms/:code/avatar/:playerId/:part': {
      GET: (req: Request & Params<'code' | 'playerId' | 'part'>) => {
        const room = registry.get(req.params.code.toUpperCase());
        const part = req.params.part;
        // Vor dem Spielstart bleiben Figuren geheim, auch für den Fernseher.
        if (!room || room.phase === 'lobby' || !isAvatarPart(part)) return new Response('Not Found', { status: 404 });
        const bytes = room.avatars.get(req.params.playerId)?.parts[part];
        if (!bytes) return new Response('Not Found', { status: 404 });
        return new Response(bytes, {
          headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=86400, immutable', 'X-Content-Type-Options': 'nosniff' },
        });
      },
    },
  };
}
