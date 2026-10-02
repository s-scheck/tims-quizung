<script lang="ts" module>
  export interface MapMarker {
    id: string;
    lat: number;
    lng: number;
    label: string;
    color: string;
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import { normalizeLng, type LatLngBounds } from '@quiz/shared';
  import { loadGeo } from '../lib/geodata.ts';

  let {
    borders = false,
    bounds,
    interactive = false,
    pin = null,
    onPick,
    markers = [],
    target = null,
    showLines = false,
    fitAll = false,
    class: className = '',
  }: {
    borders?: boolean;
    bounds?: LatLngBounds;
    interactive?: boolean;
    pin?: { lat: number; lng: number } | null;
    onPick?: (p: { lat: number; lng: number }) => void;
    markers?: MapMarker[];
    target?: { lat: number; lng: number } | null;
    showLines?: boolean;
    fitAll?: boolean;
    class?: string;
  } = $props();

  let el: HTMLDivElement;
  let map: L.Map | null = null;
  let borderLayer: L.GeoJSON | null = null;
  let pinMarker: L.Marker | null = null;
  const overlay = L.layerGroup();
  let ready = $state(false);
  let failed = $state(false);

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
  }

  function pinIcon(color: string, label: string): L.DivIcon {
    return L.divIcon({
      className: 'quiz-pin',
      html: `<div class="pin" style="--c:${color}"><span>${escapeHtml(label)}</span></div>`,
      iconSize: [28, 36],
      iconAnchor: [14, 36],
    });
  }

  const targetIcon = L.divIcon({ className: 'quiz-target', html: '<div class="target"></div>', iconSize: [24, 24], iconAnchor: [12, 12] });

  function emitPick(latlng: L.LatLng) {
    onPick?.({ lat: Math.max(-85, Math.min(85, latlng.lat)), lng: normalizeLng(latlng.lng) });
  }

  onMount(() => {
    map = L.map(el, {
      attributionControl: false,
      minZoom: 1,
      maxZoom: 10,
      zoomSnap: 0.5,
      worldCopyJump: true,
      maxBounds: [
        [-85, -540],
        [85, 540],
      ],
      maxBoundsViscosity: 0.8,
    });
    if (bounds) map.fitBounds(bounds, { padding: [8, 8] });
    else map.setView([22, 10], 1.5);
    overlay.addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (interactive) emitPick(e.latlng);
    });

    loadGeo()
      .then(({ land, borders: borderData }) => {
        if (!map) return;
        L.geoJSON(land, { style: { fillColor: '#334155', fillOpacity: 1, color: '#475569', weight: 0.6 }, interactive: false })
          .addTo(map)
          .bringToBack();
        borderLayer = L.geoJSON(borderData, { style: { color: '#94a3b8', weight: 0.8, opacity: 0.7, dashArray: '3 4' }, interactive: false });
        ready = true;
      })
      .catch(() => {
        failed = true;
      });

    const observer = new ResizeObserver(() => map?.invalidateSize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      map?.remove();
      map = null;
    };
  });

  // Grenzen ein- oder ausblenden, auch wenn sie erst nach dem Laden verfügbar sind.
  $effect(() => {
    const show = borders;
    const isReady = ready;
    if (!map || !isReady || !borderLayer) return;
    if (show) borderLayer.addTo(map);
    else borderLayer.remove();
  });

  // Eigener Pin: anlegen, verschieben, entfernen.
  $effect(() => {
    const p = pin;
    const draggable = interactive;
    if (!map) return;
    if (!p) {
      pinMarker?.remove();
      pinMarker = null;
      return;
    }
    if (!pinMarker) {
      pinMarker = L.marker([p.lat, p.lng], { icon: pinIcon('#f59e0b', '●'), draggable, zIndexOffset: 1000 }).addTo(map);
      pinMarker.on('dragend', () => {
        if (pinMarker) emitPick(pinMarker.getLatLng());
      });
    } else {
      pinMarker.setLatLng([p.lat, p.lng]);
    }
    if (draggable) pinMarker.dragging?.enable();
    else pinMarker.dragging?.disable();
  });

  // Auflösung: Ziel, fremde Pins, Linien.
  $effect(() => {
    const ms = markers;
    const t = target;
    const lines = showLines;
    const fit = fitAll;
    if (!map) return;
    overlay.clearLayers();
    if (t) L.marker([t.lat, t.lng], { icon: targetIcon, zIndexOffset: 2000, interactive: false }).addTo(overlay);
    for (const m of ms) {
      L.marker([m.lat, m.lng], { icon: pinIcon(m.color, m.label), interactive: false }).addTo(overlay);
      if (lines && t) {
        L.polyline(
          [
            [m.lat, m.lng],
            [t.lat, t.lng],
          ],
          { color: m.color, weight: 1.5, opacity: 0.85, dashArray: '4 4', interactive: false },
        ).addTo(overlay);
      }
    }
    if (fit && (ms.length > 0 || t)) {
      const points: [number, number][] = ms.map((m) => [m.lat, m.lng]);
      if (t) points.push([t.lat, t.lng]);
      map.fitBounds(L.latLngBounds(points).pad(0.35), { maxZoom: 7 });
    }
  });
</script>

<div class="relative {className}">
  <div bind:this={el} class="h-full w-full rounded-2xl" style="background:#0f172a"></div>
  {#if !ready && !failed}
    <div class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">Karte wird geladen…</div>
  {:else if failed}
    <div class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-rose-300">Kartendaten konnten nicht geladen werden.</div>
  {/if}
</div>
