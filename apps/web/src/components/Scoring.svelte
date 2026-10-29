<script lang="ts">
  import { SCORE_MAX, SCORE_MIN, type RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { formatKm, formatYearDistance, scoredPlayers } from '../lib/format.ts';

  let { view }: { view: RoomView } = $props();

  const round = $derived(view.round!);
  // Bilderrätsel „Alle gleichzeitig“: Reihenfolge nach Treffern, dann Fertig-Zeit, damit der Host die Plätze vor sich hat.
  const players = $derived.by(() => {
    const base = scoredPlayers(view);
    const r = view.round;
    if (r?.game !== 'picture' || r.mode !== 'all' || !r.results) return base;
    const rank = new Map(r.results.map((x, i) => [x.playerId, i]));
    return [...base].sort((a, b) => (rank.get(a.id) ?? base.length) - (rank.get(b.id) ?? base.length));
  });
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
    if (r.game === 'risk') return `${r.totals[id] ?? 0} Kategorie-Punkte`;
    if (r.game === 'bluff') return `${r.points?.[id] ?? 0} Spielpunkte`;
    if (r.game === 'faces') {
      const s = r.solved.find((x) => x.playerId === id);
      if (!s) return 'nicht erkannt';
      return `${s.rank}. Platz nach ${((s.at - r.startedAt) / 1000).toFixed(1)} s, ${r.points?.[id] ?? 0} Spielpunkte`;
    }
    if (r.game === 'kids') {
      const hits = r.hits[id] ?? 0;
      const misses = r.misses[id] ?? 0;
      const base = `${r.points[id] ?? 0} Spielpunkte · ${hits} Treffer`;
      return r.mode === 'buzz' ? `${base} · ${misses} Fehlbuzzer` : base;
    }
    if (r.game === 'morse') {
      const s = r.solved.find((x) => x.playerId === id);
      if (!s) return 'nicht gelöst';
      return `${s.rank}. Platz nach ${((s.at - r.startedAt) / 1000).toFixed(1)} s, ${r.points?.[id] ?? 0} Spielpunkte`;
    }
    if (r.game === 'timeline') {
      const entry = r.ranking?.find((x) => x.playerId === id);
      if (!entry || entry.distanceYears === null) return 'kein Tipp';
      const rank = (r.ranking ?? []).indexOf(entry) + 1;
      return `${rank}. Platz, ${entry.distanceYears === 0 ? 'Treffer' : `${formatYearDistance(entry.distanceYears)} daneben`}`;
    }
    if (r.game === 'picture' && r.mode === 'all') {
      const res = r.results?.find((x) => x.playerId === id);
      if (!res) return 'nicht dabei';
      const rank = (r.results ?? []).indexOf(res) + 1;
      const time = res.doneAt === null ? 'nicht fertig gemeldet' : `fertig nach ${((res.doneAt - (r.startedAt ?? 0)) / 1000).toFixed(1)} s`;
      return `${rank}. Platz · ${res.hits} von ${r.fields.length} richtig · ${time}`;
    }
    if (r.game === 'topx' || r.game === 'match' || r.game === 'picture') {
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
          <span class="block break-words font-semibold">{p.name}</span>
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
