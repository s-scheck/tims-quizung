import type { EditorDocument, EditorEntry } from '@quiz/shared';

const BASE = '/api/editor/categories';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Fehler ${res.status}`);
  return data as T;
}

export const editorApi = {
  list: () => call<{ editable: boolean; entries: EditorEntry[] }>(BASE),
  get: (id: string) => call<EditorDocument>(`${BASE}/${id}`),
  save: (id: string, raw: Record<string, unknown>) =>
    call<EditorDocument>(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(raw), headers: { 'Content-Type': 'application/json' } }),
  remove: (id: string) => call<{ entry: EditorEntry | null }>(`${BASE}/${id}`, { method: 'DELETE' }),
  reset: (id: string) => call<{ entry: EditorEntry | null }>(`${BASE}/${id}/reset`, { method: 'POST' }),
};
