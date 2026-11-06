<script lang="ts">
  import { DEVLOCK_MAX_DECLINES, type DevLockView } from '@quiz/shared';
  import DevLock from '../components/DevLock.svelte';

  /** Vorschau der Entwickler-Sperre ohne Server und ohne Spielbedingungen: `bun run devlock`. */
  const freshLock = (): DevLockView => ({ declines: 0, paid: false, seed: Math.floor(Math.random() * 2 ** 31) });
  let lock = $state<DevLockView | null>(freshLock());
  let asHost = $state(true);
  let large = $state(false);

  function act(action: 'decline' | 'pay' | 'close') {
    if (!lock) return;
    if (action === 'decline' && lock.declines < DEVLOCK_MAX_DECLINES) lock.declines++;
    if (action === 'pay') lock.paid = true;
    if (action === 'close') lock = null;
  }
</script>

<main class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
  <h1 class="text-2xl font-black">Vorschau Entwickler-Sperre</h1>
  <p class="text-slate-400">Im Spiel erscheint sie am 7.11. nach dem Punkte-Eintragen, sobald alle Bedingungen erfüllt sind.</p>
  <div class="card space-y-2 text-left text-sm">
    <p class="font-bold">Im Netzwerk als Spieler ansehen</p>
    <ol class="list-decimal space-y-1 pl-5 text-slate-400">
      <li>Mit <code class="font-mono text-slate-200">bun run devlock</code> gestartet, gelten kleinere Bedingungen: ab 2 Spielern und nach der ersten Runde.</li>
      <li>Hier am Rechner einen Raum erstellen, mit dem Handy über die Netzwerk-Adresse aus dem Terminal beitreten (Port 5173).</li>
      <li>Eine Runde spielen, beenden und Punkte eintragen. Dann erscheint die Sperre auf allen Geräten.</li>
    </ol>
  </div>
  <div class="flex flex-wrap justify-center gap-2">
    <button class="btn-primary" onclick={() => (lock = freshLock())}>Sperre zeigen</button>
    <button class="btn-secondary" onclick={() => (asHost = !asHost)}>{asHost ? 'Als Mitspieler ansehen' : 'Als Host ansehen'}</button>
    <button class="btn-secondary" onclick={() => (large = !large)}>{large ? 'Handy/Laptop' : 'TV-Größe'}</button>
  </div>
</main>

{#if lock}
  <DevLock {lock} canAct={asHost} hostName="Host" {large} onAction={act} />
  <div class="fixed right-3 top-3 z-[102] flex gap-2">
    <button class="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-ink shadow" onclick={() => (lock = freshLock())}>Von vorn</button>
    <button class="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-ink shadow" onclick={() => (asHost = !asHost)}>{asHost ? 'Mitspieler-Sicht' : 'Host-Sicht'}</button>
  </div>
{/if}
