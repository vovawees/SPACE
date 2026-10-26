/* Всплывающие уведомления внизу экрана. */
export interface Toast {
  id: number;
  text: string;
  kind: "info" | "error" | "ok";
  action?: { label: string; run: () => void };
  progress?: number;
}

let seq = 0;

class Toasts {
  items = $state<Toast[]>([]);

  show(text: string, opts: Partial<Omit<Toast, "id" | "text">> & { ms?: number } = {}): number {
    const id = ++seq;
    this.items.push({ id, text, kind: opts.kind ?? "info", action: opts.action, progress: opts.progress });
    if (this.items.length > 4) this.items.shift();
    const ms = opts.ms ?? (opts.kind === "error" ? 6000 : 3200);
    if (ms > 0) setTimeout(() => this.close(id), ms);
    return id;
  }

  update(id: number, patch: Partial<Toast>) {
    const t = this.items.find((x) => x.id === id);
    if (t) Object.assign(t, patch);
  }

  close(id: number) {
    this.items = this.items.filter((t) => t.id !== id);
  }

  error(e: unknown) {
    return this.show(e instanceof Error ? e.message : String(e), { kind: "error" });
  }
}

export const toasts = new Toasts();
