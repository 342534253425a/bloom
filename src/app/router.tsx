import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";
import type { JSX } from "react";
import { CrashScreen } from "@/app/crash";
import { getAuthState } from "@/entities/session";
import { BodyPage } from "@/pages/body/body-page";
import { FocusPage } from "@/pages/focus/focus-page";
import { GardenPage } from "@/pages/garden/garden-page";
import { GoalDetailPage } from "@/pages/goals/goal-detail-page";
import { GoalsPage } from "@/pages/goals/goals-page";
import { HabitDetailPage } from "@/pages/habits/habit-detail-page";
import { HabitsPage } from "@/pages/habits/habits-page";
import { HomePage } from "@/pages/home/home-page";
import { LoginPage } from "@/pages/login/login-page";
import { PrivacyPage } from "@/pages/privacy/privacy-page";
import { ReflectPage } from "@/pages/reflect/reflect-page";
import { SettingsPage } from "@/pages/settings/settings-page";
import { SpacesPage } from "@/pages/spaces/spaces-page";
import { StatsPage } from "@/pages/stats/stats-page";
import { TasksPage } from "@/pages/tasks/tasks-page";
import { TogetherPage } from "@/pages/together/together-page";
import { ChatPage } from "@/pages/together/chat-page";
import { WatchPage } from "@/pages/together/watch-page";
import { LearnPage } from "@/pages/learn/learn-page";
import { NotificationsPage } from "@/pages/notifications/notifications-page";
import { rememberInvite } from "@/pages/together/parts";
import { ToastHost } from "@/shared/ui/kit";
import { AppShell } from "@/widgets/app-shell";

const rootRoute = createRootRoute({
  component: () => (
    <div className="device">
      <Outlet />
      <div className="layer" id="bloom-layer" />
      <ToastHost />
    </div>
  ),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: () => {
    if (getAuthState().status === "authenticated") throw redirect({ to: "/" });
  },
  component: LoginPage,
});

/** Invite links: remember the code, then continue (signing in first if needed). */
const joinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/join",
  beforeLoad: ({ location }) => {
    const code = new URLSearchParams(location.searchStr).get("code");
    if (code) rememberInvite(code);
    throw redirect({ to: getAuthState().status === "authenticated" ? "/together" : "/login" });
  },
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: () => {
    if (getAuthState().status !== "authenticated") throw redirect({ to: "/login" });
  },
  component: AppShell,
});

function page<const TPath extends string>(path: TPath, component: () => JSX.Element) {
  return createRoute({ getParentRoute: () => appRoute, path, component });
}

/** Paths from the first version keep working. */
function moved<const TPath extends string>(path: TPath, to: string) {
  return createRoute({
    getParentRoute: () => appRoute,
    path,
    beforeLoad: () => {
      throw redirect({ to: to as "/" });
    },
  });
}

const routeTree = rootRoute.addChildren([
  loginRoute,
  joinRoute,
  appRoute.addChildren([
    page("/", HomePage),
    page("/spaces", SpacesPage),
    page("/goals", GoalsPage),
    page("/goals/$goalId", GoalDetailPage),
    page("/habits", HabitsPage),
    page("/habits/$habitId", HabitDetailPage),
    page("/tasks", TasksPage),
    page("/focus", FocusPage),
    page("/body", BodyPage),
    page("/reflect", ReflectPage),
    page("/stats", StatsPage),
    page("/together", TogetherPage),
    page("/together/chat", ChatPage),
    page("/watch", WatchPage),
    page("/learn", LearnPage),
    page("/notifications", NotificationsPage),
    page("/garden", GardenPage),
    page("/privacy", PrivacyPage),
    page("/settings", SettingsPage),
    moved("/more", "/spaces"),
    moved("/check-in", "/body"),
    moved("/wellness", "/body"),
    moved("/journal", "/reflect"),
    moved("/countdowns", "/goals"),
    moved("/rewards", "/garden"),
    moved("/achievements", "/garden"),
    moved("/trends", "/stats"),
    moved("/reminders", "/together"),
    moved("/partner", "/together"),
    moved("/preferences", "/settings"),
  ]),
]);

export const router = createRouter({ routeTree, defaultPreload: "intent", defaultErrorComponent: ({ error }) => <CrashScreen error={error} /> });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
