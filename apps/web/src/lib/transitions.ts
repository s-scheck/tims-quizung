import type { TransitionConfig } from 'svelte/transition';

type CrossfadeFn = (node: Element, params: { key: unknown }) => () => TransitionConfig;

const PIN_STYLES = ['position', 'top', 'left', 'width', 'margin', 'z-index', 'pointer-events'] as const;

/**
 * Lässt eine Karte beim Wegfliegen über dem Layout schweben: Der Knoten wird an seiner
 * aktuellen Stelle absolut festgesteckt, bevor der Crossfade rechnet. So ist sein Platz
 * sofort frei (kein Doppelbild mit dem leeren Feld, kein Höhensprung), und die Karte
 * fliegt trotzdem sichtbar zu ihrem Gegenstück. Der Elterncontainer braucht `relative`.
 * Der Knoten trägt danach `data-floating`, damit Geschwister (z. B. die Lücke) sich ausblenden können.
 *
 * Das zweite Ergebnis ersetzt `receive` am selben Element: Kehrt die Karte noch während
 * des Flugs zurück, nimmt Svelte denselben Knoten wieder, und der muss gelöst werden.
 */
export function floating(send: CrossfadeFn, receive: CrossfadeFn): [CrossfadeFn, CrossfadeFn] {
  const floatOut: CrossfadeFn = (node, params) => {
    const run = send(node, params);
    return () => {
      if (node instanceof HTMLElement) {
        const { offsetTop, offsetLeft, offsetWidth } = node;
        node.dataset.floating = '';
        Object.assign(node.style, {
          position: 'absolute',
          top: `${offsetTop}px`,
          left: `${offsetLeft}px`,
          width: `${offsetWidth}px`,
          margin: '0',
          zIndex: '20',
          pointerEvents: 'none',
        });
      }
      return run();
    };
  };
  const landIn: CrossfadeFn = (node, params) => {
    const run = receive(node, params);
    return () => {
      if (node instanceof HTMLElement && 'floating' in node.dataset) {
        delete node.dataset.floating;
        for (const prop of PIN_STYLES) node.style.removeProperty(prop);
      }
      return run();
    };
  };
  return [floatOut, landIn];
}
