<script lang="ts">
  import { onMount } from 'svelte';
  import type { RoomView, SplashRoundView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerColor, playerName } from '../lib/format.ts';
  import Burst from './Burst.svelte';
  import PlayerHead from './PlayerHead.svelte';
  import ScoringHandoff from './ScoringHandoff.svelte';
  import SplashField from './visual/SplashField.svelte';

  /**
   * Auswertung: das fertige Feld, daneben wachsen die Balken je Farbe von 0 auf ihre sichtbare Fläche.
   * Der Kleinste zuerst, der Größte zuletzt mit Krone. Dazu der freie Rest.
   */
  let { view, round, readonly = false }: { view: RoomView; round: SplashRoundView; readonly?: boolean } = $props();

  const STAGGER_MS = 700;
  const GROW_MS = 1100;
  const colorOf = (id: string) => playerColor(view.players.findIndex((p) => p.id === id));
  const coverage = $derived(round.coverage ?? {});
  // Alle Mitspieler, auch ohne Fleck, aufsteigend: der Größte kommt zuletzt.
  const rows = $derived(
    [...new Set([...round.turnOrder, ...Object.keys(coverage)])]
      .map((id) => ({ id, pct: coverage[id] ?? 0 }))
      .sort((a, b) => a.pct - b.pct || playerName(view, a.id).localeCompare(playerName(view, b.id), 'de')),
  );
  const best = $derived(Math.max(0, ...rows.map((r) => r.pct)));
  const free = $derived(Math.max(0, 100 - rows.reduce((s, r) => s + r.pct, 0)));
  const scale = $derived(Math.max(best, 1));

  // Die Animation läuft einmal ab dem Einblenden; neue Server-Stände dürfen sie nicht neu starten.
  let elapsed = $state(0);
  onMount(() => {
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      elapsed = performance.now() - start;
      if (elapsed < 20 * STAGGER_MS + GROW_MS) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
  const progress = (i: number) => Math.min(1, Math.max(0, (elapsed - i * STAGGER_MS) / GROW_MS));
  const ease = (t: number) => 1 - (1 - t) ** 3;
  const finished = $derived(elapsed >= (rows.length - 1) * STAGGER_MS + GROW_MS);
</script>

<div class="{readonly ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-6' : 'space-y-4'}">
  <div class={readonly ? 'fit-media' : ''}>
    <SplashField
      class="mx-auto w-full {readonly ? '' : 'max-w-md'}"
      style={readonly ? 'height: calc(80dvh * var(--fit-media, 1)); width: auto' : undefined}
      blobs={round.blobs}
      {colorOf}
      startedAt={round.startedAt}
    />
  </div>

  <section class="space-y-3">
    <header>
      <p class="text-sm text-slate-400">Auswertung · {round.category.title}</p>
      <h2 class="font-black {readonly ? 'text-4xl' : 'text-2xl'}">Wer hat die meiste Fläche?</h2>
    </header>

    <ol class="space-y-2">
      {#each rows as row, i (row.id)}
        {@const t = ease(progress(i))}
        {@const winner = finished && best > 0 && row.pct === best}
        <li class="flex items-center gap-3 {readonly ? 'text-2xl' : ''} {row.id === client.myId ? 'text-indigo-200' : ''}">
          <span class="relative inline-flex w-9 justify-center">
            {#if winner}<span class="text-2xl">👑</span><Burst scale={1.5} />{:else}<PlayerHead {view} id={row.id} size={readonly ? 30 : 22} />{/if}
          </span>
          <span class="w-24 shrink-0 truncate font-semibold sm:w-32">{playerName(view, row.id)}</span>
          <span class="relative h-7 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-900">
            <span class="absolute inset-y-0 left-0 rounded-full" style="width:{(row.pct / scale) * t * 100}%; background:{colorOf(row.id)}"></span>
          </span>
          <span class="w-20 text-right font-mono font-black">{(row.pct * t).toFixed(1)} %</span>
        </li>
      {/each}
    </ol>
    <p class="text-sm text-slate-500">Frei geblieben: {free.toFixed(1)} %</p>

    {#if !readonly}
      <ScoringHandoff {view} />
    {/if}
  </section>
</div>
