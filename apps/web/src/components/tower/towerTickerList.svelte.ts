import { TowerTickerState, type TickerInput, type TickerItem } from './towerTicker.ts';

/** Sichtbare Ticker-Meldungen: neueste oben, höchstens `max`, jede verschwindet nach `ttl` ms. */
export class TickerList {
  items = $state<TickerItem[]>([]);
  private state = new TowerTickerState();

  constructor(
    private ttl = 5000,
    private max = 3,
  ) {}

  /** Wertet einen neuen Stand aus. `keep` entscheidet, was in die Liste kommt; zurück kommen alle neuen Meldungen. */
  feed(input: TickerInput, keep: (item: TickerItem) => boolean = () => true): TickerItem[] {
    const fresh = this.state.observe(input);
    const shown = fresh.filter(keep);
    if (shown.length > 0) this.items = [...shown.reverse(), ...this.items].slice(0, this.max);
    return fresh;
  }

  prune(now: number): void {
    if (this.items.some((i) => now - i.at > this.ttl)) this.items = this.items.filter((i) => now - i.at <= this.ttl);
  }
}
