<script lang="ts">
  import { parsePasted, rowsFromCells, type Column, type Row } from '../../lib/editorModel.ts';

  let { columns, onApply, onClose }: { columns: Column[]; onApply: (rows: Row[], replace: boolean) => void; onClose: () => void } = $props();

  let text = $state('');
  let replace = $state(false);
  let skipHeader = $state(false);

  const cells = $derived(parsePasted(text));
  const rows = $derived(rowsFromCells(skipHeader ? cells.slice(1) : cells, columns));

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="presentation" onclick={(e) => e.target === e.currentTarget && onClose()}>
  <div class="card w-full max-w-2xl space-y-4 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="paste-title">
    <div>
      <h2 id="paste-title" class="text-xl font-black">Aus Tabelle einfügen</h2>
      <p class="text-sm text-slate-400">
        Zeilen aus Excel, Numbers oder Google Sheets kopieren und hier einfügen. Spalten in dieser Reihenfolge:
        <span class="font-bold text-slate-200">{columns.map((c) => c.label).join(' · ')}</span>. Auch mit Semikolon getrennt geht.
      </p>
    </div>
    <!-- svelte-ignore a11y_autofocus -->
    <textarea class="input h-48 font-mono text-sm" placeholder={columns.map((c) => c.placeholder ?? c.label).join('\t')} bind:value={text} autofocus></textarea>
    <div class="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
      <label class="flex items-center gap-2"><input type="checkbox" class="h-4 w-4 accent-[var(--color-indigo-500)]" bind:checked={skipHeader} /> Erste Zeile ist Überschrift</label>
      <label class="flex items-center gap-2"><input type="checkbox" class="h-4 w-4 accent-[var(--color-indigo-500)]" bind:checked={replace} /> Bestehende Einträge ersetzen</label>
    </div>
    {#if rows.length > 0}
      <div class="max-h-40 overflow-auto rounded-xl border-2 border-slate-800 text-sm">
        <table class="w-full">
          <tbody>
            {#each rows.slice(0, 5) as r, i (i)}
              <tr class="border-b border-slate-800 last:border-0">
                {#each columns as c (c.key)}<td class="truncate px-2 py-1">{r[c.key] || '–'}</td>{/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
    <div class="flex flex-wrap justify-end gap-2">
      <button type="button" class="btn-ghost" onclick={onClose}>Abbrechen</button>
      <button type="button" class="btn-primary" disabled={rows.length === 0} onclick={() => onApply(rows, replace)}>
        {rows.length === 1 ? '1 Zeile übernehmen' : `${rows.length} Zeilen übernehmen`}
      </button>
    </div>
  </div>
</div>
