import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { IMAGE_MAX_BYTES, IMAGE_NAME_PATTERN, IMAGE_TYPES, slugify } from '@quiz/content';

type Params = { params: { name: string } };

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function fail(status: number, message: string): Response {
  return json({ error: message }, status);
}

/**
 * Bildablage für Bilderrätsel: Upload über den Editor nach `<dataDir>/images`, Auslieferung unter `/images/<name>`.
 * Ohne Datenordner gibt es keinen Upload und kein Bild. Namen tragen einen Zeitstempel, deshalb dürfen sie lange gecacht werden.
 */
export function imageRoutes(dataDir: string | null) {
  const dir = dataDir ? resolve(join(dataDir, 'images')) : null;

  return {
    '/api/editor/images': {
      POST: async (req: Request) => {
        if (!dir) return fail(409, 'Kein Datenordner eingerichtet (DATA_DIR)');
        let form: FormData;
        try {
          form = await req.formData();
        } catch {
          return fail(400, 'Erwartet ein Formular mit einer Datei');
        }
        const file = form.get('file');
        if (!(file instanceof File)) return fail(400, 'Keine Datei im Feld "file"');
        const ext = IMAGE_TYPES[file.type];
        if (!ext) return fail(415, 'Nur JPEG, PNG, WebP oder SVG');
        if (file.size === 0) return fail(400, 'Die Datei ist leer');
        if (file.size > IMAGE_MAX_BYTES) return fail(413, `Bild ist zu groß, höchstens ${Math.round(IMAGE_MAX_BYTES / 1024 / 1024)} MB`);
        const base = slugify(file.name.replace(/\.[^.]+$/, '')).slice(0, 60) || 'bild';
        const name = `${Date.now().toString(36)}-${base}.${ext}`;
        mkdirSync(dir, { recursive: true });
        await Bun.write(join(dir, name), file);
        return json({ name, url: `/images/${name}` }, 201);
      },
    },
    '/images/:name': {
      GET: (req: Request & Params) => {
        const name = req.params.name;
        if (!dir || !IMAGE_NAME_PATTERN.test(name)) return new Response('Not Found', { status: 404 });
        const path = join(dir, name);
        if (!path.startsWith(dir + sep) || !existsSync(path)) return new Response('Not Found', { status: 404 });
        return new Response(Bun.file(path), {
          headers: { 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' },
        });
      },
    },
  };
}
