<script lang="ts">
  import type { BaseRoundView, RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';

  /**
   * Joker im Brett: Knopf → Person wählen → bestätigen. Wer zuerst bestätigt, bekommt ihn, das entscheidet der Server.
   * Hat der Betrachter seinen Joker in dieser Runde gesetzt, steht hier, wen er kopiert.
   */
  let { view, round }: { view: RoomView; round: BaseRoundView } = $props();

  const copying = $derived(!!client.myId && round.joker?.by === client.myId);
  const others = $derived(round.turnOrder.filter((id) => id !== client.myId));

  let open = $state(false);
  let picked = $state<string | null>(null);

  // Hat jemand anderes schneller gesetzt oder ist die Eingabe vorbei, klappt die Auswahl zu.
  $effect(() => {
    if (!round.jokerAvailable) {
      open = false;
      picked = null;
    }
  });

  function use() {
    if (!picked) return;
    client.send({ type: 'joker', playerId: picked });
    open = false;
    picked = null;
  }

  function cancel() {
    open = false;
    picked = null;
  }
</script>

{#if copying}
  <div class="card flex items-center gap-3 border-amber-400/50 bg-amber-400/10 py-3">
    <span class="text-3xl leading-none" aria-hidden="true">🃏</span>
    <div class="min-w-0 flex-1">
      <p class="break-words font-extrabold text-amber-100">Du kopierst {playerName(view, round.joker?.target)}</p>
      <p class="text-xs text-amber-200/70">Du bekommst genau das Ergebnis dieser Person, selbst raten musst du nicht mehr.</p>
    </div>
  </div>
{:else if round.jokerAvailable}
  {#if !open}
    <button class="btn-secondary flex items-center gap-2 self-start px-4 py-2 text-sm" onclick={() => (open = true)}>
      <span class="text-lg leading-none" aria-hidden="true">🃏</span> Joker
    </button>
  {:else}
    <div class="card space-y-3 border-amber-400/50 py-3">
      {#if picked === null}
        <p class="text-sm font-bold text-amber-100">Wen kopierst du? Du bekommst am Ende genau ihr Ergebnis.</p>
        <div class="flex flex-wrap gap-2">
          {#each others as id (id)}
            <button class="rounded-full border-2 border-slate-700 px-3 py-1.5 text-sm font-bold text-slate-200 hover:border-amber-400" onclick={() => (picked = id)}>
              {playerName(view, id)}
            </button>
          {/each}
        </div>
        <button class="btn-ghost px-0 py-0 text-sm" onclick={cancel}>Abbrechen</button>
      {:else}
        <p class="break-words text-sm font-bold text-amber-100">
          {playerName(view, picked)} kopieren? Du hast nur einen Joker im ganzen Spiel, deine eigene Antwort verfällt.
        </p>
        <div class="flex flex-wrap gap-2">
          <button class="btn-secondary px-4 py-2 text-sm" onclick={cancel}>Abbrechen</button>
          <button class="btn-primary px-4 py-2 text-sm" onclick={use}>🃏 Einsetzen</button>
        </div>
      {/if}
    </div>
  {/if}
{/if}
