import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { savePrefs, usePrefs } from "@/entities/prefs";
import { useProgress, plantStages } from "@/entities/progress";
import { useUser } from "@/entities/session";
import { hasPasscode } from "@/entities/space";
import { spaces } from "@/shared/config/spaces";
import { requestIntent, type Intent } from "@/shared/lib/intent";
import { haptic } from "@/shared/lib/motion/fx";
import { Glyph, type GlyphName } from "@/shared/ui/glyph";
import { Art, Tile, at, type Tone } from "@/shared/ui/kit";
import { Sheet } from "@/shared/ui/sheet";
import { LockScreen } from "./lock-screen";
import { Onboarding } from "./onboarding";
import { NotifyHost } from "@/features/notify/notify-host";
import { useInbox } from "@/entities/notify";
import { RecoverySheet } from "./recovery-sheet";
import { CoupleBridge } from "./couple-bridge";
import { useUnread } from "@/entities/couple";
import { SyncBadge } from "@/widgets/sync-card/sync-card";
import { InstallButton } from "@/widgets/install/install";

type NavItem = { to: string; label: string; art: string; tone: Tone };

const dockTabs: Array<{ to: "/" | "/habits" | "/tasks" | "/spaces"; key: string; glyph: GlyphName }> = [
  { to: "/", key: "today", glyph: "home" },
  { to: "/habits", key: "habits", glyph: "sprout" },
  { to: "/tasks", key: "tasks", glyph: "list" },
  { to: "/spaces", key: "spaces", glyph: "grid" },
];

const creates: Array<{ intent: Intent; to: string; key: string; art: string; tone: Tone }> = [
  { intent: "task", to: "/tasks", key: "task", art: "i-list", tone: "sky" },
  { intent: "habit", to: "/habits", key: "habit", art: "i-sprout", tone: "mint" },
  { intent: "mood", to: "/body", key: "mood", art: "i-smile", tone: "sun" },
  { intent: "goal", to: "/goals", key: "goal", art: "o-target-heart", tone: "pink" },
  { intent: "journal", to: "/reflect", key: "journal", art: "i-pencil", tone: "peach" },
  { intent: "good", to: "/body", key: "good", art: "i-heart", tone: "pink" },
  { intent: "countdown", to: "/goals", key: "countdown", art: "i-plane", tone: "sky" },
  { intent: "task", to: "/focus", key: "focus", art: "i-flame", tone: "lav" },
];

function isActive(path: string, to: string) {
  if (to === "/") return path === "/";
  return path === to || path.startsWith(`${to}/`);
}

export function AppShell() {
  const { t } = useTranslation();
  const user = useUser();
  const prefs = usePrefs(user.id);
  const navigate = useNavigate();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const scroller = useRef<HTMLElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [locked, setLocked] = useState(() => hasPasscode(user.id) && sessionStorage.getItem("bloom.unlocked") !== user.id);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    setCreateOpen(false);
  }, [path]);

  useEffect(() => {
    if (!prefs) return;
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.dataset.accent = prefs.accent;
  }, [prefs]);

  const groups: Array<{ title: string; items: NavItem[] }> = [
    {
      title: t("nav.daily"),
      items: [
        { to: "/habits", label: t("nav.habits"), art: "i-sprout", tone: "mint" },
        { to: "/tasks", label: t("nav.tasks"), art: "i-list", tone: "sky" },
        { to: "/focus", label: t("nav.focus"), art: "i-flame", tone: "pink" },
        { to: "/body", label: t("nav.body"), art: "i-lotus", tone: "peach" },
        { to: "/reflect", label: t("nav.reflect"), art: "o-journal", tone: "sun" },
      ],
    },
    {
      title: t("nav.grow"),
      items: [
        { to: "/goals", label: t("nav.goals"), art: "o-target-heart", tone: "pink" },
        { to: "/stats", label: t("nav.stats"), art: "i-bars", tone: "lav" },
        { to: "/garden", label: t("nav.garden"), art: "o-pot-flower", tone: "mint" },
      ],
    },
    {
      title: t("nav.care"),
      items: [
        { to: "/together", label: t("couple.title"), art: "c-pair-hearts", tone: "pink" },
        { to: "/learn", label: t("learn.title"), art: "c-read", tone: "sun" },
        { to: "/notifications", label: t("notify.title"), art: "i-bell", tone: "peach" },
        { to: "/privacy", label: t("nav.privacy"), art: "i-shield", tone: "sky" },
        { to: "/settings", label: t("nav.settings"), art: "o-gear", tone: "lav" },
      ],
    },
  ];

  if (locked) return <LockScreen onUnlock={() => setLocked(false)} />;

  return (
    <div className={`shell ${path.startsWith("/watch") ? "is-cinema" : ""} ${path.startsWith("/together/chat") ? "is-chat" : ""}`}>
      <CoupleBridge />
      <aside className="side" aria-label={t("nav.menu")}>
        <Link to="/" className="side-brand">
          <Glyph name="sprout" size={26} stroke={2.4} className="wordmark-leaf" />
          <span>bloom</span>
        </Link>
        <SideProfile />
        <button type="button" data-tour="create" className="btn is-block side-add" onClick={() => setCreateOpen(true)}>
          <Glyph name="plus" size={20} stroke={2.6} />
          {t("nav.create")}
        </button>
        <nav className="side-nav" data-tour="nav">
          <Link to="/" className={`side-link ${path === "/" ? "is-on" : ""}`}>
            <Tile name="o-sun" tone="sun" size={32} />
            <span>{t("nav.today")}</span>
          </Link>
          <Link to="/spaces" className={`side-link ${isActive(path, "/spaces") ? "is-on" : ""}`}>
            <Tile name="o-house" tone="mint" size={32} />
            <span>{t("spaces.homeTitle")}</span>
          </Link>
          {groups.map((group) => (
            <div key={group.title} className="side-group">
              <p className="side-title">{group.title}</p>
              {group.items.map((item) => (
                <Link key={item.to} to={item.to as "/"} className={`side-link ${isActive(path, item.to) ? "is-on" : ""}`}>
                  <Tile name={item.art} tone={item.tone} size={32} />
                  <span>{item.label}</span>
                  {item.to === "/together" ? <UnreadDot /> : null}
                  {item.to === "/notifications" ? <InboxDot /> : null}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <InstallButton className="side-install" />
      </aside>

      <main className="viewport" ref={scroller}>
        <NotifyHost />
        <div className="page-enter" key={path}>
          <Outlet />
        </div>
      </main>

      <nav className="dock" aria-label="Bloom" data-tour="nav">
        {dockTabs.slice(0, 2).map((tab) => (
          <DockLink key={tab.to} to={tab.to} glyph={tab.glyph} label={t(`nav.${tab.key}`)} active={isActive(path, tab.to)} />
        ))}
        <button
          data-tour="create"
          className={`dock-plus ${createOpen ? "is-open" : ""}`}
          type="button"
          aria-label={t("nav.create")}
          aria-expanded={createOpen}
          onClick={() => {
            haptic(8);
            setCreateOpen((open) => !open);
          }}
        >
          <Glyph name="plus" size={28} stroke={2.6} />
        </button>
        {dockTabs.slice(2).map((tab) => (
          <DockLink
            key={tab.to}
            to={tab.to}
            glyph={tab.glyph}
            label={t(`nav.${tab.key}`)}
            active={isActive(path, tab.to) || (tab.to === "/spaces" && spaces.some((space) => space.to !== "/habits" && space.to !== "/tasks" && isActive(path, space.to)))}
          />
        ))}
      </nav>

      <Sheet open={createOpen} title={t("create.title")} closeLabel={t("common.close")} onClose={() => setCreateOpen(false)}>
        <Art name="c-arms-up" className="sheet-hero float" eager />
        <h2>{t("create.title")}</h2>
        <p className="sub">{t("create.sub")}</p>
        <div className="create-grid">
          {creates.map((item, index) => (
            <button
              key={item.key}
              type="button"
              className={`create-item card tone-${item.tone} pressable rise`}
              style={at(index)}
              onClick={() => {
                setCreateOpen(false);
                if (item.key !== "focus") requestIntent(item.intent);
                void navigate({ to: item.to as "/" });
              }}
            >
              <Tile name={item.art} size={44} />
              <strong>{t(`create.${item.key}`)}</strong>
              <small>{t(`create.${item.key}Hint`)}</small>
            </button>
          ))}
        </div>
      </Sheet>

      <RecoverySheet />
      {prefs && !prefs.onboarded ? <Onboarding onDone={() => void savePrefs(user.id, { onboarded: true })} /> : null}
    </div>
  );
}

function SideProfile() {
  const { t } = useTranslation();
  const user = useUser();
  const progress = useProgress(user.id);
  return (
    <Link to="/garden" className="side-profile">
      <span className="side-plant">
        <Art name={plantStages[progress?.stage ?? 0]} />
      </span>
      <span className="side-profile-copy">
        <strong>{user.displayName}</strong>
        <small>
          {t("garden.level", { level: progress?.level.level ?? 1 })} · {progress?.balance ?? 0} {t("common.pts")}
        </small>
        <SyncBadge />
      </span>
    </Link>
  );
}

function DockLink({ to, glyph, label, active }: { to: "/" | "/habits" | "/tasks" | "/spaces"; glyph: GlyphName; label: string; active: boolean }) {
  return (
    <Link to={to} className={`dock-link ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => haptic(5)}>
      <span className="dock-icon">
        <Glyph name={glyph} size={24} stroke={active ? 2.3 : 1.9} />
      </span>
      <span className="dock-label">{label}</span>
    </Link>
  );
}

function InboxDot() {
  const user = useUser();
  const unread = useInbox(user.id).filter((item) => !item.read).length;
  return unread ? <span className="unread-badge is-small">{unread}</span> : null;
}

function UnreadDot() {
  const unread = useUnread();
  return unread ? <span className="unread-badge is-small">{unread}</span> : null;
}
