type IconProps = { className?: string };

export function LeafMark({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M16 28c0-8 2-14 10-18-8 1-14 6-16 14"
        fill="none"
        stroke="#3dbe86"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M16 28c0-7-1.5-12-8-16 6 2 10 7 11 14"
        fill="none"
        stroke="#7ed9a4"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6.5 16.5h11l-1.1-1.7a6 6 0 0 1-.9-3.2V10a3.5 3.5 0 0 0-7 0v1.6c0 1.1-.3 2.2-.9 3.2L6.5 16.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 17.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1h-5.2v-5.2H10.2V21H5a1 1 0 0 1-1-1v-8.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function SproutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21V11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 13c0-4 3.2-6 7-6-1 4-3.4 6-7 6Z" fill="currentColor" />
      <path d="M12 15c0-3.2-2.6-5-6-5 1 3.4 3 5 6 5Z" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

export function TasksIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="3.5" width="14" height="17" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 3.5v3M16 3.5v3M4 9.5h16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="18" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 7.5v9l8-4.5-8-4.5Z" fill="currentColor" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 7h3v10H8zM13 7h3v10h-3z" fill="currentColor" />
    </svg>
  );
}

export function SmileIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="#ffe38a" />
      <circle cx="11.5" cy="14" r="1.4" fill="#2a3548" />
      <circle cx="20.5" cy="14" r="1.4" fill="#2a3548" />
      <path d="M11 18.5c1.2 1.8 2.8 2.6 5 2.6s3.8-.8 5-2.6" fill="none" stroke="#2a3548" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function BoltIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="#efe6ff" />
      <path d="M18 7 11 17h5l-1 8 7-10h-5l1-8Z" fill="#8b74e8" />
    </svg>
  );
}

export function TomatoIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 8c2-3 5-3 6-1" fill="none" stroke="#3dbe86" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14 9c1-2 0-4 2-5 0 2 1 3 3 4" fill="#7ed9a4" />
      <circle cx="16" cy="18" r="8" fill="#ff8d86" />
      <ellipse cx="13" cy="15" rx="2" ry="1.2" fill="#fff" opacity="0.45" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 12.5 10 16l8-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const glyphPaths: Record<string, string> = {
  water: "M12 3s5 6 5 10a5 5 0 0 1-10 0c0-4 5-10 5-10Z",
  move: "M8 16c2-6 6-8 8-8M7 19h10M9 8l2 3 3-2",
  read: "M5 6.5h6.2A2.8 2.8 0 0 1 14 9.3V19a2.2 2.2 0 0 0-2.2-2.2H5V6.5Zm14 0h-6.2A2.8 2.8 0 0 0 10 9.3V19a2.2 2.2 0 0 1 2.2-2.2H19V6.5Z",
  journal: "M7 4h8.5L19 7.5V20H7V4Zm8 0v4h4",
  present: "M12 16a4 4 0 1 0-4-4M12 4v2M12 18v2M4.9 7.5l1.4 1.4M17.7 15.1l1.4 1.4M4.9 16.5l1.4-1.4M17.7 8.9l1.4-1.4",
  leaf: "M12 20V10m0 3c0-4 3-6 7-6-1 4-3.5 6-7 6Zm0 2c0-3-2.4-5-6-5 1 3.2 3 5 6 5Z",
};

export function HabitGlyph({ symbol }: { symbol: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={glyphPaths[symbol] ?? glyphPaths.leaf}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
