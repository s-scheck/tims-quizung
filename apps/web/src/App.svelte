<script lang="ts">
  import { router } from './lib/router.svelte.ts';
  import Home from './routes/Home.svelte';
  import Room from './routes/Room.svelte';
  import Screen from './routes/Screen.svelte';
</script>

{#if router.route.name === 'home'}
  <Home />
{:else if router.route.name === 'room'}
  <Room code={router.route.code} />
{:else if router.route.name === 'screen'}
  <Screen code={router.route.code} />
{:else}
  <main class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
    <h1 class="text-3xl font-bold">Seite nicht gefunden</h1>
    <button class="rounded-xl bg-indigo-600 px-5 py-3 font-semibold hover:bg-indigo-500" onclick={() => router.navigate('/')}>
      Zur Startseite
    </button>
  </main>
{/if}
