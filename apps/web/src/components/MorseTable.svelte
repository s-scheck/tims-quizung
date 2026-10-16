<script lang="ts">
  import { MORSE_TABLE } from '@quiz/shared';

  let { large = false }: { large?: boolean } = $props();
  const entries = Object.entries(MORSE_TABLE);
  const pretty = (code: string) => code.replace(/\./g, '·').replace(/-/g, '−');
</script>

<div class="grid grid-cols-4 gap-1.5 sm:grid-cols-6 {large ? 'grid-cols-6 lg:grid-cols-9' : ''}">
  {#each entries as [ch, code] (ch)}
    <div class="flex items-center justify-between rounded-lg bg-slate-900/70 px-2 py-1 {large ? 'text-xl' : 'text-sm'}">
      <span class="font-bold">{ch}</span>
      <span class="font-mono tracking-widest text-amber-200">{pretty(code)}</span>
    </div>
  {/each}
</div>
