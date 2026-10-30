<script lang="ts">
  import { tick } from 'svelte';
  import { emptyRow, type Column, type Row } from '../../lib/editorModel.ts';
  import PasteDialog from './PasteDialog.svelte';

  let {
    columns,
    rows = $bindable(),
    issues = [],
    selected = $bindable(null),
    numbered = true,
    noun = 'Eintrag',
    onCellPaste,
    onImageUpload,
    fixedRows = false,
  }: {
    columns: Column[];
    rows: Row[];
    issues?: Record<string, string>[];
    /** Ausgewählte Zeile, z. B. für den Kartenpicker. */
    selected?: number | null;
    numbered?: boolean;
    noun?: string;
    /** Spezielles Einfügen in eine Zelle. `true` heißt: erledigt, Standard überspringen. */
    onCellPaste?: (rowIndex: number, key: string, text: string) => boolean;
    /** Bildspalten: Datei für eine Zeile hochladen, der Aufrufer trägt den Dateinamen ein. */
    onImageUpload?: (rowIndex: number, file: File) => void;
    /** Feste Zeilenzahl (Filmfotos): kein Hinzufügen, Löschen, Verschieben oder Einfügen aus Tabellen. */
    fixedRows?: boolean;
  } = $props();

  const imageSrc = (name: string) => (/^https?:\/\//.test(name) ? name : `/images/${name}`);

  let table = $state<HTMLTableElement>();
  let pasting = $state(false);

  async function focusCell(rowIndex: number, key: string) {
    await tick();
    table?.querySelector<HTMLInputElement>(`input[data-row="${rowIndex}"][data-col="${key}"]`)?.focus();
  }

  function addRow(at = rows.length) {
    rows.splice(at, 0, emptyRow(columns));
    focusCell(at, columns[0]!.key);
  }

  function removeRow(i: number) {
    rows.splice(i, 1);
    if (selected !== null && selected >= rows.length) selected = rows.length ? rows.length - 1 : null;
  }

  function move(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j]!, rows[i]!];
    if (selected === i) selected = j;
  }

  function onKey(e: KeyboardEvent, i: number, key: string) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (i === rows.length - 1) {
      if (fixedRows) return;
      addRow();
    }
    focusCell(i + 1, key);
  }

  function onPaste(e: ClipboardEvent, i: number, key: string) {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (onCellPaste?.(i, key, text)) {
      e.preventDefault();
      return;
    }
    // Mehrere Zeilen oder Spalten aus einer Tabelle: ab dieser Zelle verteilen.
    if (!text.includes('\t') && !text.includes('\n')) return;
    e.preventDefault();
    const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '');
    const startCol = columns.findIndex((c) => c.key === key);
    lines.forEach((line, n) => {
      const cells = line.split('\t');
      const target = i + n;
      if (target >= rows.length) {
        if (fixedRows) return;
        rows.push(emptyRow(columns));
      }
      cells.forEach((cell, k) => {
        const col = columns[startCol + k];
        if (col) rows[target]![col.key] = cell.trim();
      });
    });
  }

  function applyPasted(newRows: Row[], replace: boolean) {
    const kept = replace ? [] : rows.filter((r) => Object.values(r).some((v) => v.trim()));
    rows.splice(0, rows.length, ...kept, ...newRows);
    pasting = false;
  }
</script>

<div class="space-y-3">
  <div class="overflow-x-auto rounded-2xl border-2 border-slate-800">
    <table bind:this={table} class="w-full border-collapse text-sm">
      <thead class="bg-slate-900 text-left text-xs font-extrabold uppercase tracking-wide text-slate-400">
        <tr>
          {#if numbered}<th class="w-10 px-2 py-2 text-right">#</th>{/if}
          {#each columns as c (c.key)}
            <th class="px-2 py-2 {c.width ?? ''}">{c.label}{#if c.optional}<span class="font-semibold normal-case text-slate-500">{' (optional)'}</span>{/if}</th>
          {/each}
          {#if !fixedRows}<th class="w-28 px-2 py-2"><span class="sr-only">Aktionen</span></th>{/if}
        </tr>
      </thead>
      <tbody>
        {#each rows as row, i (i)}
          {@const rowIssues = issues[i] ?? {}}
          <tr
            class="border-t border-slate-800 {selected === i ? 'bg-indigo-500/10' : ''}"
            onfocusin={() => (selected = i)}
          >
            {#if numbered}<td class="px-2 py-1 text-right font-mono text-xs text-slate-500">{i + 1}</td>{/if}
            {#each columns as c (c.key)}
              <td class="px-1.5 py-1 {c.width ?? ''}">
                {#if c.type === 'image'}
                  <div class="flex items-center gap-2">
                    {#if row[c.key]}
                      <img src={imageSrc(row[c.key] ?? '')} alt="" class="h-10 w-10 shrink-0 rounded-md object-cover" />
                      <span class="min-w-0 flex-1 truncate font-mono text-xs text-slate-400" title={row[c.key]}>{row[c.key]}</span>
                    {:else}
                      <span class="min-w-0 flex-1 text-xs {rowIssues[c.key] ? 'text-rose-400' : 'text-slate-600'}">{rowIssues[c.key] ? 'Bild fehlt' : 'kein Bild'}</span>
                    {/if}
                    <label class="btn-ghost shrink-0 cursor-pointer px-2 py-1 text-xs">
                      {row[c.key] ? 'Ersetzen' : 'Hochladen'}
                      <input type="file" class="hidden" accept="image/jpeg,image/png,image/webp,image/svg+xml" onchange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) onImageUpload?.(i, f); }} />
                    </label>
                  </div>
                {:else}
                <input
                  class="w-full rounded-lg border-2 bg-slate-950 px-2 py-1.5 font-semibold text-slate-100 outline-none transition placeholder:font-medium placeholder:text-slate-600 focus:border-indigo-500
                    {rowIssues[c.key] ? 'border-rose-500' : 'border-transparent hover:border-slate-800'}"
                  type="text"
                  inputmode={c.type === 'text' || c.type === 'list' ? 'text' : 'decimal'}
                  placeholder={c.placeholder ?? ''}
                  title={rowIssues[c.key] ?? ''}
                  aria-label="{c.label}, Zeile {i + 1}"
                  aria-invalid={rowIssues[c.key] ? 'true' : undefined}
                  data-row={i}
                  data-col={c.key}
                  bind:value={row[c.key]}
                  onkeydown={(e) => onKey(e, i, c.key)}
                  onpaste={(e) => onPaste(e, i, c.key)}
                />
                {/if}
              </td>
            {/each}
            {#if !fixedRows}
            <td class="whitespace-nowrap px-1.5 py-1 text-right">
              <button type="button" class="rounded-md px-1.5 py-1 font-bold text-slate-500 hover:bg-slate-900 hover:text-slate-200 disabled:opacity-30" disabled={i === 0} aria-label="Zeile {i + 1} nach oben" onclick={() => move(i, -1)}>↑</button>
              <button type="button" class="rounded-md px-1.5 py-1 font-bold text-slate-500 hover:bg-slate-900 hover:text-slate-200 disabled:opacity-30" disabled={i === rows.length - 1} aria-label="Zeile {i + 1} nach unten" onclick={() => move(i, 1)}>↓</button>
              <button type="button" class="rounded-md px-1.5 py-1 font-bold text-slate-500 hover:bg-rose-500/15 hover:text-rose-300" aria-label="Zeile {i + 1} löschen" onclick={() => removeRow(i)}>×</button>
            </td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if !fixedRows}
    <div class="flex flex-wrap gap-2">
      <button type="button" class="btn-secondary px-4 py-2 text-sm" onclick={() => addRow()}>+ {noun}</button>
      <button type="button" class="btn-secondary px-4 py-2 text-sm" onclick={() => (pasting = true)}>Aus Tabelle einfügen</button>
    </div>
  {/if}
</div>

{#if pasting}
  <PasteDialog {columns} onApply={applyPasted} onClose={() => (pasting = false)} />
{/if}
