<script lang="ts">
  import type { EditorEntry } from '@quiz/shared';

  let { entry }: { entry: Pick<EditorEntry, 'status' | 'draft'> } = $props();

  const STATUS: Record<EditorEntry['status'], { text: string; cls: string }> = {
    builtin: { text: 'Mitgeliefert', cls: 'bg-slate-900 text-slate-400' },
    modified: { text: 'Geändert', cls: 'bg-sky-500/15 text-sky-300' },
    custom: { text: 'Eigene', cls: 'bg-indigo-500/15 text-indigo-300' },
    hidden: { text: 'Ausgeblendet', cls: 'bg-slate-800 text-slate-400' },
  };
</script>

<span class="flex flex-wrap gap-1.5">
  <span class="rounded-full px-2 py-0.5 text-xs font-extrabold {STATUS[entry.status].cls}">{STATUS[entry.status].text}</span>
  {#if entry.draft}<span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-extrabold text-amber-200">Entwurf</span>{/if}
</span>
