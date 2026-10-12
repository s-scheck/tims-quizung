import { CATEGORY_ID_PATTERN, MAX_CATEGORY_BYTES, type CategoryStore } from '@quiz/content';

type Params = { params: { id: string } };

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function fail(status: number, message: string): Response {
  return json({ error: message }, status);
}

/**
 * Schnittstelle für den Kategorien-Editor. Ohne Zugangsschutz, auf Wunsch:
 * wer die Adresse kennt, darf bearbeiten. Ohne Datenordner ist nur Lesen möglich.
 */
export function editorRoutes(store: CategoryStore) {
  const withId = (req: Request & Params): string | Response =>
    CATEGORY_ID_PATTERN.test(req.params.id) ? req.params.id : fail(400, 'Ungültige id');

  const writable = (): Response | null => (store.editable ? null : fail(409, 'Kein Datenordner eingerichtet (DATA_DIR)'));

  return {
    '/api/editor/categories': {
      GET: () => json({ editable: store.editable, entries: store.entries() }),
    },
    '/api/editor/categories/:id': {
      GET: (req: Request & Params) => {
        const id = withId(req);
        if (id instanceof Response) return id;
        const doc = store.document(id);
        return doc ? json(doc) : fail(404, 'Kategorie nicht gefunden');
      },
      PUT: async (req: Request & Params) => {
        const id = withId(req);
        if (id instanceof Response) return id;
        const locked = writable();
        if (locked) return locked;
        const text = await req.text();
        if (text.length > MAX_CATEGORY_BYTES) return fail(413, 'Liste ist zu groß');
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          return fail(400, 'Kein gültiges JSON');
        }
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail(400, 'Kein Objekt');
        store.save(id, raw as Record<string, unknown>);
        return json(store.document(id));
      },
      DELETE: (req: Request & Params) => {
        const id = withId(req);
        if (id instanceof Response) return id;
        const locked = writable();
        if (locked) return locked;
        if (!store.has(id)) return fail(404, 'Kategorie nicht gefunden');
        return json({ entry: store.remove(id) ?? null });
      },
    },
    '/api/editor/categories/:id/reset': {
      POST: (req: Request & Params) => {
        const id = withId(req);
        if (id instanceof Response) return id;
        const locked = writable();
        if (locked) return locked;
        return json({ entry: store.reset(id) ?? null });
      },
    },
  };
}
