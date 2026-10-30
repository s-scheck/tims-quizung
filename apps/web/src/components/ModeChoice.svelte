<script lang="ts" generics="T extends string">
  /** Auswahl eines Rundenmodus als Karten mit Titel und Erklärung. */
  let { options, value, onChange }: { options: { mode: T; label: string; hint: string }[]; value: T; onChange: (mode: T) => void } = $props();
</script>

<div class="grid gap-2 sm:grid-cols-2">
  {#each options as o (o.mode)}
    <button
      type="button"
      class="rounded-xl border px-3 py-2 text-left transition {value === o.mode ? 'border-indigo-500 bg-indigo-500/15' : 'border-slate-700 hover:border-slate-500'}"
      onclick={() => onChange(o.mode)}
    >
      <span class="block font-semibold">{o.label}</span>
      <span class="block text-xs text-slate-400">{o.hint}</span>
    </button>
  {/each}
</div>
