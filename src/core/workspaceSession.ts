/** Lightweight access/lifetime gate. Deliberately imports no molecular runtime. */
export interface WorkspaceScope {
  userId: string | null;
  active: boolean;
  identity: number;
  generation: number;
  signal: AbortSignal;
}

class WorkspaceSession {
  private controller = new AbortController();
  private scope: WorkspaceScope = {
    userId: null, active: false, identity: 0, generation: 0,
    signal: this.controller.signal,
  };
  private listeners = new Set<(next: WorkspaceScope, previous: WorkspaceScope) => void>();

  getSnapshot = () => this.scope;

  subscribe = (listener: (next: WorkspaceScope, previous: WorkspaceScope) => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  setContext(userId: string | null, active: boolean) {
    active = Boolean(userId) && active;
    const previous = this.scope;
    if (previous.userId === userId && previous.active === active) return;
    // Abort first: already-started work must not commit into a different route/session.
    this.controller.abort("workspace-lifetime-ended");
    this.controller = new AbortController();
    this.scope = {
      userId, active,
      identity: previous.identity + Number(userId !== previous.userId),
      generation: previous.generation + 1,
      signal: this.controller.signal,
    };
    for (const listener of this.listeners) listener(this.scope, previous);
  }
}

export const workspaceSession = new WorkspaceSession();

export function combineSignals(...signals: Array<AbortSignal | undefined>) {
  const controller = new AbortController();
  const abort = () => controller.abort("command-cancelled");
  for (const signal of signals) {
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    dispose: () => signals.forEach((signal) => signal?.removeEventListener("abort", abort)),
  };
}
