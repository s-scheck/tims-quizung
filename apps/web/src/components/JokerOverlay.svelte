<script lang="ts">
  import { onDestroy } from 'svelte';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import Burst from './Burst.svelte';

  /**
   * Große Joker-Karte für alle Geräte, sobald jemand seinen Joker setzt. Liegt über allem, nimmt aber keine Klicks,
   * damit niemand beim Raten gestört wird. Wen der Joker kopiert, verrät sie nicht.
   */
  const SHOW_MS = 2600;

  let shown = $state<{ key: string; text: string; name: string } | null>(null);
  let lastKey = '';
  let timer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const view = client.view;
    const joker = view?.round?.joker;
    if (!view) return;
    const key = joker ? `${view.code}:${joker.by}:${joker.at}` : '';
    if (key === lastKey) return;
    lastKey = key;
    // Nur frische Joker: nach Neuladen oder Wiederverbinden spielt die Karte nicht noch einmal.
    if (!joker || client.serverNow() - joker.at > SHOW_MS) return;
    const mine = joker.by === client.myId;
    shown = {
      key,
      name: mine ? 'Du' : playerName(view, joker.by),
      text: mine ? 'Du setzt deinen Joker ein!' : `${playerName(view, joker.by)} setzt den Joker ein!`,
    };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => (shown = null), SHOW_MS);
  });

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
</script>

{#if shown}
  {#key shown.key}
    <div class="pointer-events-none fixed inset-0 z-[2000] flex items-center justify-center p-4" role="status" aria-live="polite">
      <div class="joker-pop flex flex-col items-center gap-[2.5vmin]" style="animation: quiz-joker {SHOW_MS}ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards">
        <div
          class="relative flex aspect-[5/7] w-[44vmin] flex-col items-center justify-center gap-[1.5vmin] rounded-[3vmin] border-[0.8vmin] border-amber-300 p-[3vmin] text-white shadow-2xl shadow-black/60"
          style="background: linear-gradient(135deg, #c026d3, #7c3aed 50%, #0ea5e9)"
        >
          <Burst scale={4} ms={900} />
          <span class="absolute left-[2.5vmin] top-[2vmin] text-[4vmin] font-black leading-none">J</span>
          <span class="absolute bottom-[2vmin] right-[2.5vmin] rotate-180 text-[4vmin] font-black leading-none">J</span>
          <span class="text-[16vmin] leading-none" aria-hidden="true">🃏</span>
          <span class="text-[6vmin] font-black uppercase tracking-widest">Joker</span>
          <span class="max-w-full break-words text-center text-[4vmin] font-extrabold">{shown.name}</span>
        </div>
        <p class="rounded-full bg-slate-950/90 px-[3vmin] py-[1.2vmin] text-center text-[3.6vmin] font-extrabold text-amber-200 shadow-lg">
          {shown.text}
        </p>
      </div>
    </div>
  {/key}
{/if}
