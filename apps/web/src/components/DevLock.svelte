<script lang="ts">
  import { DEVLOCK_MAX_DECLINES, type DevLockView } from '@quiz/shared';

  /**
   * Gespielte Entwickler-Sperre, ein Scherz. Bezahlt wird nichts, beide Wege lösen nur auf.
   * Rein darstellend: Raum und Vorschau reichen Zustand und Aktionen herein.
   */
  let {
    lock,
    canAct,
    hostName,
    large = false,
    onAction,
  }: {
    lock: DevLockView;
    canAct: boolean;
    hostName: string;
    large?: boolean;
    onAction: (action: 'decline' | 'pay' | 'close') => void;
  } = $props();

  const DEV = 'Sinan';
  const declined = $derived(lock.declines >= DEVLOCK_MAX_DECLINES);
  const done = $derived(lock.paid || declined);

  const INTRO = `Dieses Quiz hat ${DEV} in unzähligen Nachtschichten gebaut. Um weiterzuspielen, ist eine kleine Spende nötig.`;
  /** Text am Nein-Button, je Ablehnung einer. */
  const PLEAS = [
    'Wirklich? Er hat dafür auf Netflix verzichtet.',
    'Er hat drei Wochen kaum geschlafen. Für euch.',
    'Sein Kaffee ist leer. Seine Augen auch.',
    'Letzte Chance. Er schaut dich gerade an.',
  ];
  const plea = $derived(PLEAS[Math.min(lock.declines - 1, PLEAS.length - 1)] ?? '');

  // Der Nein-Button wird mit jeder Ablehnung größer und roter.
  const SHADES = [
    { bg: '#ffffff', fg: '#3c3c3c', edge: '#d4d4d4' },
    { bg: '#ffe1e1', fg: '#9f1d1d', edge: '#ffb3b3' },
    { bg: '#ffb3b3', fg: '#821c1c', edge: '#ff7a7a' },
    { bg: '#ff6b6b', fg: '#ffffff', edge: '#d33131' },
    { bg: '#e02424', fg: '#ffffff', edge: '#9b1414' },
  ];
  const shade = $derived(SHADES[Math.min(lock.declines, SHADES.length - 1)]!);
  const fontPx = $derived(14 + lock.declines * 4);

  // Stellen rund um die Karte, in zufälliger Reihenfolge, mit etwas Zittern. Mittelpunkt in Prozent des Fensters.
  const SPOTS = [
    { top: 16, left: 22 },
    { top: 82, left: 76 },
    { top: 18, left: 78 },
    { top: 80, left: 24 },
    { top: 50, left: 82 },
    { top: 50, left: 18 },
  ];
  // Zufall aus dem geteilten Seed: Alle Geräte rechnen dieselben Stellen aus.
  function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const order = $derived.by(() => {
    const r = rng(lock.seed);
    return SPOTS.map((s) => ({ s, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.s);
  });
  const spot = $derived.by(() => {
    const base = order[(lock.declines - 1 + order.length) % order.length]!;
    const r = rng(lock.seed + lock.declines * 7919);
    const jitter = () => (r() - 0.5) * 8;
    return { top: Math.min(86, Math.max(14, base.top + jitter())), left: Math.min(80, Math.max(20, base.left + jitter())) };
  });

  // Gemessene Größe des wandernden Buttons samt Text: Er bleibt immer ganz im Bild.
  let winW = $state(0);
  let winH = $state(0);
  let boxW = $state(0);
  let boxH = $state(0);
  const pos = $derived.by(() => {
    const margin = 8;
    const clamp = (v: number, size: number, max: number) => Math.min(max - size / 2 - margin, Math.max(size / 2 + margin, v));
    return { x: clamp((spot.left / 100) * winW, boxW, winW), y: clamp((spot.top / 100) * winH, boxH, winH) };
  });

  // Wenn ein echtes Foto unter /devlock/entwickler.jpg liegt, wird es genommen, sonst der Platzhalter.
  let photo = $state('/devlock/entwickler.jpg');

  // Das Apple-Zeichen (U+F8FF) gibt es nur in den Systemschriften von Apple-Geräten, sonst steht dort das Wort.
  const APPLE = '\uF8FF';
  const appleDevice = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

  const SYSTEM_FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif";
</script>

<svelte:window bind:innerWidth={winW} bind:innerHeight={winH} />

<div class="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/70 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="devlock-title">
  <!-- Feste Farben statt Spielpalette: Die Karte sieht im hellen und im dunklen Modus gleich aus, wie ein fremdes Formular. -->
  <div
    class="relative max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl bg-white text-left text-[#262627] shadow-[0_30px_80px_rgba(0,0,0,0.45)] {large ? 'max-w-2xl' : ''}"
    style="font-family:{SYSTEM_FONT}"
  >
    <!-- Fortschritt wie in einem Typeform -->
    <div class="h-1.5 w-full bg-[#f1f1f1]">
      <div class="h-full bg-[#e02424] transition-all duration-500" style="width:{done ? 100 : 18 + lock.declines * 14}%"></div>
    </div>

    <div class="space-y-5 p-5 sm:space-y-6 sm:p-9 {large ? 'sm:p-12' : ''}">
      <div class="flex items-center justify-between gap-3">
        <span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold {done ? 'bg-[#e8f7e1] text-[#2f7d0a]' : 'bg-[#fdecec] text-[#c81e1e]'}">
          <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" aria-hidden="true"><path fill="currentColor" d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 1 0-3 0v2Z"/></svg>
          {done ? 'Freigeschaltet' : 'Entwickler-Sperre aktiv'}
        </span>
        <span class="text-xs text-[#8a8a8a]">Schritt {done ? 2 : 1} von 2</span>
      </div>

      <div class="flex items-start gap-5">
        <img
          src={photo}
          alt="Ein trauriger Entwickler"
          class="aspect-square w-16 shrink-0 rounded-2xl object-cover sm:w-28 {large ? 'sm:w-40' : ''} {declined ? 'grayscale' : ''}"
          onerror={() => (photo = '/devlock/entwickler.svg')}
        />
        <div class="min-w-0 space-y-2">
          <p class="flex items-center gap-1.5 text-sm font-semibold text-[#e02424]"><span>{done ? 2 : 1}</span><span aria-hidden="true">→</span></p>
          {#if lock.paid}
            <h2 id="devlock-title" class="text-xl font-semibold leading-tight sm:text-3xl">Reingelegt!</h2>
            <p class="text-sm leading-relaxed text-[#5e5e5e] sm:text-[15px]">Natürlich wird nichts abgebucht. Aber danke für den guten Willen, {DEV} freut sich trotzdem.</p>
          {:else if declined}
            <h2 id="devlock-title" class="text-xl font-semibold leading-tight sm:text-3xl">Na gut.</h2>
            <p class="text-sm leading-relaxed text-[#5e5e5e] sm:text-[15px]">{DEV} weint jetzt ein bisschen. Viel Spaß beim Weiterspielen!</p>
          {:else}
            <h2 id="devlock-title" class="text-xl font-semibold leading-tight sm:text-3xl">Weiterspielen kostet 100&nbsp;€</h2>
            <p class="text-sm leading-relaxed text-[#5e5e5e] sm:text-[15px]">{INTRO}</p>
          {/if}
        </div>
      </div>

      {#if done}
        <button type="button" class="flex h-14 w-full items-center justify-center rounded-xl bg-[#262627] text-[17px] font-semibold text-white transition hover:bg-black active:scale-[0.99] disabled:cursor-default" disabled={!canAct} onclick={() => onAction('close')}>
          Weiterspielen
        </button>
      {:else}
        <!-- Bestellübersicht wie in einem Bezahlfenster -->
        <dl class="divide-y divide-[#ececec] rounded-2xl border border-[#e3e3e3] bg-[#fafafa] text-[15px]">
          <div class="flex items-center justify-between gap-3 px-4 py-2.5 sm:py-3">
            <dt class="text-[#6b6b6b]">Spende an</dt>
            <dd class="font-semibold">{DEV} (Developer)</dd>
          </div>
          <div class="flex items-center justify-between gap-3 px-4 py-2.5 sm:py-3">
            <dt class="text-[#6b6b6b]">Grund</dt>
            <dd class="font-medium">Freischaltung Quiz-Suite</dd>
          </div>
          <div class="flex items-center justify-between gap-3 px-4 py-2.5 sm:py-3">
            <dt class="font-semibold">Gesamt</dt>
            <dd class="text-lg font-bold">100,00 €</dd>
          </div>
        </dl>

        <div class="space-y-3">
          <button
            type="button"
            class="flex h-14 w-full items-center justify-center whitespace-nowrap rounded-xl bg-black px-4 text-[18px] text-white shadow-[0_6px_16px_rgba(0,0,0,0.25)] transition hover:bg-[#1a1a1a] active:scale-[0.99] disabled:cursor-default"
            style="letter-spacing:-0.01em"
            disabled={!canAct}
            aria-label="Mit Apple Pay 100 Euro spenden"
            onclick={() => onAction('pay')}
          >
            <span class="font-normal">Spenden mit</span>
            {#if appleDevice}
              <span class="ml-1.5 font-semibold" aria-hidden="true">{APPLE}Pay</span>
            {:else}
              <span class="ml-1.5 font-semibold">Apple Pay</span>
            {/if}
          </button>

          {#if lock.declines === 0}
            <!-- Antwortoption wie bei Typeform, mit Buchstaben-Taste -->
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-xl border border-[#d9d9d9] bg-white px-4 py-3 text-left text-[15px] font-medium text-[#262627] transition hover:border-[#e02424] hover:bg-[#fff5f5] disabled:cursor-default"
              disabled={!canAct}
              onclick={() => onAction('decline')}
            >
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#d9d9d9] text-xs font-semibold text-[#6b6b6b]">B</span>
              Ich spende NICHT!
            </button>
          {/if}
        </div>

      {/if}

      <p class="flex items-center justify-center gap-1.5 border-t border-[#efefef] pt-4 text-xs text-[#9a9a9a]">
        <svg viewBox="0 0 16 16" class="h-3 w-3" aria-hidden="true"><path fill="currentColor" d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 1 0-3 0v2Z"/></svg>
        Sichere Zahlung · Powered by DevLock{#if !canAct}<span class="ml-1">· Freischalten kann nur {hostName}</span>{/if}
      </p>
    </div>
  </div>

  {#if !done && lock.declines > 0}
    <!-- Nein-Button samt Text: springt, wächst und wird roter, damit man den Text immer am Button liest. -->
    <div
      class="fixed z-[101] flex w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 transition-all duration-300"
      style="top:{pos.y}px; left:{pos.x}px"
      bind:clientWidth={boxW}
      bind:clientHeight={boxH}
    >
      <p class="relative max-w-[min(22rem,calc(100vw-1rem))] rounded-2xl border-2 border-rose-300 bg-white px-4 py-2 text-center font-bold text-ink shadow-lg" style="font-size:min({13 + lock.declines * 2}px, 4.6vw)">
        {plea}
        <span class="absolute -bottom-2 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b-2 border-r-2 border-rose-300 bg-white"></span>
      </p>
      <button
        type="button"
        class="whitespace-nowrap rounded-2xl border-2 font-extrabold uppercase tracking-wide transition-all duration-300 {canAct ? 'active:translate-y-1' : 'cursor-default'}"
        style="font-size:min({fontPx}px, 4.4vw); padding:{0.4 + lock.declines * 0.15}em {0.9 + lock.declines * 0.2}em; background:{shade.bg}; color:{shade.fg}; border-color:{shade.edge}; box-shadow:0 4px 0 {shade.edge}"
        disabled={!canAct}
        onclick={() => onAction('decline')}
      >
        {lock.declines === DEVLOCK_MAX_DECLINES - 1 ? 'Ich spende trotzdem NICHT!' : 'Ich spende NICHT!'}
      </button>
    </div>
  {/if}
</div>
