export type ToastKind = 'info' | 'error' | 'success';

export interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
}

class Toasts {
  items = $state<Toast[]>([]);
  private nextId = 1;

  show(text: string, kind: ToastKind = 'info', ms = 3500): void {
    const id = this.nextId++;
    this.items = [...this.items, { id, text, kind }];
    setTimeout(() => this.dismiss(id), ms);
  }

  error(text: string): void {
    this.show(text, 'error', 4500);
  }

  dismiss(id: number): void {
    this.items = this.items.filter((t) => t.id !== id);
  }
}

export const toasts = new Toasts();
