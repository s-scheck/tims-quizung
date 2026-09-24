<script lang="ts">
  import type { PlacementStatus } from '@quiz/shared';

  let {
    name,
    sub = '',
    selected = false,
    status = null,
    isStart = false,
    disabled = false,
    large = false,
    onclick,
  }: {
    name: string;
    sub?: string;
    selected?: boolean;
    status?: PlacementStatus | null;
    isStart?: boolean;
    disabled?: boolean;
    large?: boolean;
    onclick?: () => void;
  } = $props();

  const statusClass = $derived.by(() => {
    switch (status) {
      case 'pending':
        return 'border-amber-400 bg-amber-400/15 text-amber-100 animate-pulse';
      case 'correct':
        return 'border-emerald-400 bg-emerald-500/25 text-emerald-50 animate-flash';
      case 'wrong':
        return 'border-rose-500 bg-rose-500/25 text-rose-50 animate-shake';
      default:
        return selected
          ? 'border-indigo-400 bg-indigo-500/25 text-white ring-2 ring-indigo-400/60'
          : 'border-slate-700 bg-slate-800/80 text-slate-100';
    }
  });
</script>

<button
  type="button"
  class="relative w-full rounded-xl border px-3 py-2 text-left font-semibold leading-tight shadow-sm transition
    {statusClass}
    {large ? 'text-xl px-4 py-3' : 'text-sm sm:text-base'}
    {disabled ? 'cursor-default' : 'hover:border-slate-400 active:scale-[0.98]'}"
  {disabled}
  {onclick}
>
  <span class="block truncate">{name}</span>
  {#if sub}<span class="block text-xs font-normal text-slate-300/80">{sub}</span>{/if}
  {#if isStart}
    <span class="absolute -top-2 right-2 rounded-full bg-slate-700 px-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">Start</span>
  {/if}
</button>
