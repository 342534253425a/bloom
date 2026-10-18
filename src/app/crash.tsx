import { Component, type ErrorInfo, type ReactNode } from "react";

/** Shown instead of a blank page when something breaks while rendering. */
export function CrashScreen({ error }: { error: unknown }) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return (
    <div className="crash">
      <img src="/img/c-frown.webp" alt="" width={120} height={120} />
      <h1>Oops, Bloom stumbled</h1>
      <p>Упс, Bloom споткнулся · Bloom 出了点问题</p>
      <button type="button" className="btn" onClick={() => hardReload()}>
        Reload · Перезагрузить
      </button>
      <details>
        <summary>Details</summary>
        <code>{message}</code>
      </details>
    </div>
  );
}

/** Drops cached app files so a reload always gets the newest version. */
export async function hardReload() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((reg) => reg.update().catch(() => undefined)));
    const keys = (await caches?.keys?.()) ?? [];
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch {
    /* best effort */
  }
  window.location.reload();
}

export class CrashBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Bloom crashed", error, info.componentStack);
  }

  render() {
    return this.state.error ? <CrashScreen error={this.state.error} /> : this.props.children;
  }
}
