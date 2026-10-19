import { useState } from "react";
import { AuthScreen } from "@/features/authenticate";
import { WelcomeScreen } from "@/features/authenticate/ui/welcome";
import { pendingInvite } from "@/pages/together/parts";

type View = "welcome" | "login" | "register";

/** Welcome first; the sign-in / sign-up form opens from it (or directly after an invite link). */
export function LoginPage() {
  const [view, setView] = useState<View>(() => (pendingInvite() ? "register" : "welcome"));
  if (view === "welcome") return <WelcomeScreen onStart={setView} />;
  return <AuthScreen key={view} initialMode={view} onBack={() => setView("welcome")} />;
}
