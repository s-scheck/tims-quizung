<script lang="ts">
  import { SCORE_MAX, SCORE_MIN, type RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { formatKm, scoredPlayers } from '../lib/format.ts';

  let { view }: { view: RoomView } = $props();

  const round = $derived(view.round!);
  const players = $derived(scoredPlayers(view));
  // Svelte liefert bei type="number" eine Zahl oder null, beim Tippen kann auch ein String ankommen.
  let inputs = $state<Record<string, number | string | null | undefined>>({});

  function parsed(id: string): number | null {
    const raw = inputs[id];
    if (raw === null || raw === undefined || raw === '') return null;
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isInteger(n)) return null;
    return n >= SCORE_MIN && n <= SCORE_MAX ? n : null;
  }

  const allValid = $derived(players.every((p) => parsed(p.id) !== null));

  function statusOf(id: string): string {
    const r = round;
    if (!r.turnOrder.includes(id)) return 'nicht dabei';
    if (r.game === 'map') {
      const entry = r.ranking?.find((x) => x.playerId === id);
      if (!entry || entry.distanceKm === null) return 'kein Pin';
      const rank = (r.ranking ?? []).indexOf(entry) + 1;
      return `${rank}. Platz, ${formatKm(entry.distanceKm)}`;
    }
    if (r.game === 'topx' || r.game === 'match') {
      const hits = r.hits[id] ?? 0;
      const lives = r.lives[id] ?? 0;
      const hitText = `${hits} Treffer`;
      return lives === 0 ? `${hitText}, keine Leben mehr` : `${hitText}, ${lives} Leben übrig`;
    }
    if (r.eliminated.includes(id)) return `raus als ${r.eliminated.indexOf(id) + 1}.`;
    return 'durchgekommen';
  }

  function submit() {
    if (!allValid) return;
    const scores: Record<string, number> = {};
    for (const p of players) scores[p.id] = parsed(p.id)!;
    client.send({ type: 'submit_scores', scores });
  }
</script>

<div class="mx-auto max-w-lg space-y-4">
  <header>
    <p class="text-sm text-slate-400">Runde {view.rounds.length + 1} · {round.category.title}</p>
    <h2 class="text-2xl font-bold">Punkte vergeben</h2>
    <p class="text-sm text-slate-400">Ganze Zahlen, auch 0 oder negativ. Alle sehen danach die Tabelle.</p>
  </header>

  <form class="card space-y-3" onsubmit={(e) => { e.preventDefault(); submit(); }}>
    {#each players as p (p.id)}
      {@const eliminated = round.eliminated.includes(p.id)}
      <label class="flex items-center gap-3">
        <span class="min-w-0 flex-1">
          <span class="block truncate font-semibold">{p.name}</span>
          <span class="block text-xs {eliminated ? 'text-rose-300' : round.turnOrder.includes(p.id) ? 'text-emerald-300' : 'text-slate-500'}">{statusOf(p.id)}</span>
        </span>
        <span class="text-xs text-slate-500">bisher {view.scores[p.id] ?? 0}</span>
        <input
          class="input w-24 text-center font-mono text-lg"
          type="number"
          inputmode="numeric"
          step="1"
          min={SCORE_MIN}
          max={SCORE_MAX}
          placeholder="0"
          bind:value={inputs[p.id]}
        />
      </label>
    {/each}
    <button class="btn-primary w-full text-lg" type="submit" disabled={!allValid}>Punkte speichern</button>
  </form>
</div>
