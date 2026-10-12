<script lang="ts">
  /** Farbpunkte, die einmal aus der Mitte des Elternelements springen. Das Elternelement braucht `relative`. */
  const COLORS = ['#58cc02', '#1cb0f6', '#ff9600', '#ff4b4b', '#ce82ff', '#ffc800'];
  const dots = Array.from({ length: 12 }, (_, i) => ({
    angle: (360 / 12) * i + (i % 2 ? 8 : -8),
    distance: 34 + (i % 3) * 12,
    size: 6 + (i % 3) * 2,
    color: COLORS[i % COLORS.length],
  }));
</script>

<span class="pointer-events-none absolute left-1/2 top-1/2 z-10" aria-hidden="true">
  {#each dots as d, i (i)}
    <span
      class="absolute left-0 top-0 rounded-full"
      style="width:{d.size}px; height:{d.size}px; background:{d.color}; --a:{d.angle}deg; --d:-{d.distance}px; animation: quiz-burst 600ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards"
    ></span>
  {/each}
</span>
