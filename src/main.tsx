import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CrashBoundary, CrashScreen, hardReload } from "@/app/crash";
import { router } from "@/app/router";
import { setAuthState } from "@/entities/session";
import { restoreAccount, setRecovering } from "@/features/authenticate";
import { supabase } from "@/shared/api/supabase";
import { stopSync } from "@/shared/api/sync";
import { listenForInstall } from "@/shared/lib/install";

listenForInstall();
import { db } from "@/shared/db";
import { i18n, i18nReady } from "@/shared/i18n";
import "@/app/styles/base.css";
import "@/app/styles/kit.css";
import "@/app/styles/shell.css";
import "@/app/styles/auth.css";
import "@/app/styles/app.css";
import "@/app/styles/couple.css";
import "@/app/styles/learn.css";
import "@/app/styles/welcome.css";

// After a new deploy an open tab may ask for files that no longer exist: fetch the new version once.
window.addEventListener("vite:preloadError", () => {
  if (sessionStorage.getItem("bloom.reloaded")) return;
  sessionStorage.setItem("bloom.reloaded", "1");
  void hardReload();
});

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([work, new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(label)), ms))]);
}

async function boot() {
  const root = document.getElementById("root");
  if (!root) return;
  const app = createRoot(root);
  let stage = "start";
  let rendered = false;
  // Last resort: never leave an empty page; say which startup step is stuck.
  const watchdog = window.setTimeout(() => {
    if (!rendered) app.render(<CrashScreen error={new Error(`Startup is stuck at: ${stage}`)} />);
  }, 20_000);
  try {
    stage = "languages";
    await withTimeout(i18nReady, 8000, "Languages did not load");
    stage = "storage";
    // Another open Bloom tab on an older version can block the storage upgrade.
    await withTimeout(db.open(), 10_000, "Storage is busy: close other Bloom tabs and reload");
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") {
        stopSync();
        setAuthState({ status: "anonymous" });
        if (!window.location.pathname.startsWith("/login")) void router.navigate({ to: "/login" });
      }
    });
    stage = "account";
    const user = await restoreAccount();
    stage = "render";
    rendered = true;
    window.clearTimeout(watchdog);
    setAuthState(user ? { status: "authenticated", user } : { status: "anonymous" });
    app.render(
      <StrictMode>
        <CrashBoundary>
          <RouterProvider router={router} />
        </CrashBoundary>
      </StrictMode>,
    );
    sessionStorage.removeItem("bloom.reloaded");
  } catch (error) {
    console.error(error);
    rendered = true;
    window.clearTimeout(watchdog);
    app.render(<CrashScreen error={error instanceof Error ? error : new Error(i18n.t("app.dbError"))} />);
  }
}

void boot();
