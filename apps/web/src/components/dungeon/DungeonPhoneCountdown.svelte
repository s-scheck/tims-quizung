<script lang="ts">
  import { DUNGEON_RESULT_MS } from '@quiz/shared';
  import { client } from '../../lib/client.svelte.ts';
  import TowerRing from '../tower/TowerRing.svelte';

  /**
   * Ring mit Restsekunden bis `nextAt` (Serverzeit), daneben „Nächste Türwahl in 6 s“. Der Host bekommt rechts
   * daneben „Weiter“, um früher zu starten.
   */
  let { nextAt, label, onNext = null }: { nextAt: number | null; label: string; onNext?: (() => void) | null } = $props();

  let now = $state(client.serverNow());
  $effect(() => {
    if (nextAt === null) return;
    const t = setInterval(() => (now = client.serverNow()), 200);
    return () => clearInterval(t);
  });
  const left = $derived(nextAt === null ? 0 : Math.max(0, nextAt - now));
  const secs = $derived(Math.ceil(left / 1000));
</script>

<div class="flex items-center gap-2.5">
  {#if nextAt !== null}
    <TowerRing value={left / DUNGEON_RESULT_MS} size={30} stroke={2.5} color="#f6c453" track="rgba(255,236,200,0.14)">
      <span class="text-[0.7rem] font-black tabular-nums text-amber-100">{secs}</span>
    </TowerRing>
    <span class="min-w-0 flex-1 text-[0.8rem] font-semibold text-amber-50/70">{secs > 0 ? `${label} in ${secs} s` : `${label} …`}</span>
  {:else}
    <span class="min-w-0 flex-1"></span>
  {/if}
  {#if onNext}
    <button class="next shrink-0 rounded-xl px-3.5 py-2 text-[0.8rem] font-extrabold" onclick={onNext}>Weiter</button>
  {/if}
</div>

<style>
  .next {
    background: rgba(246, 196, 83, 0.14);
    color: #ffd36b;
    box-shadow: inset 0 0 0 1px rgba(246, 196, 83, 0.45);
    -webkit-tap-highlight-color: transparent;
  }
  .next:active {
    background: rgba(246, 196, 83, 0.24);
  }
</style>
