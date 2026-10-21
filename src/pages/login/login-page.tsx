import { useState } from "react";
import { AuthScreen } from "@/features/authenticate";
import { WelcomeScreen } from "@/features/authenticate/ui/welcome";
import { pendingInvite } from "@/pages/together/parts";
import { isApp } from "@/shared/lib/native";

type View = "welcome" | "login" | "register";

/** Welcome first on the web; the apps (and invite links) open the sign-up form straight away. */
export function LoginPage() {
  const [view, setView] = useState<View>(() => (pendingInvite() || isApp ? "register" : "welcome"));
  if (view === "welcome") return <WelcomeScreen onStart={setView} />;
  return <AuthScreen key={view} initialMode={view} onBack={isApp ? undefined : () => setView("welcome")} />;
}
