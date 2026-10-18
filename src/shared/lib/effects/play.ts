import { art, type ArtName } from "@/shared/lib/art";
import type { EffectPreset } from "@/shared/config/effects";

/** Plays a full-screen effect on top of everything. Pure DOM, so it works from any screen. */

const confettiColors = ["#36c89c", "#ffc23d", "#ff8ba0", "#9f88ef", "#5aaff0", "#ff9a62"];

function host(): HTMLElement {
  return document.getElementById("bloom-layer") ?? document.body;
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

function particle(root: HTMLElement, content: string, size: number): HTMLSpanElement {
  const node = document.createElement("span");
  node.className = "fx-p";
  node.textContent = content;
  node.style.fontSize = `${size}px`;
  root.appendChild(node);
  return node;
}

function done(node: Element, animation: Animation) {
  animation.onfinish = () => node.remove();
  animation.oncancel = () => node.remove();
}

function rain(root: HTMLElement, emoji: string[], w: number, h: number, count = 46, slow = false) {
  for (let i = 0; i < count; i += 1) {
    const node = particle(root, pick(emoji), rand(20, 42));
    const x = rand(0, w);
    const drift = rand(-60, 60);
    const duration = slow ? rand(4200, 7000) : rand(2200, 3800);
    done(
      node,
      node.animate(
        [
          { transform: `translate(${x}px, -60px) rotate(${rand(-30, 30)}deg)`, opacity: 0 },
          { opacity: 1, offset: 0.08 },
          { transform: `translate(${x + drift}px, ${h + 60}px) rotate(${rand(-200, 200)}deg)`, opacity: 0.9 },
        ],
        { duration, delay: rand(0, slow ? 2600 : 1600), easing: slow ? "linear" : "cubic-bezier(.4,.1,.6,1)", fill: "both" },
      ),
    );
  }
}

function rise(root: HTMLElement, emoji: string[], w: number, h: number, count = 34) {
  for (let i = 0; i < count; i += 1) {
    const node = particle(root, pick(emoji), rand(22, 46));
    const x = rand(0, w);
    const sway = rand(-40, 40);
    done(
      node,
      node.animate(
        [
          { transform: `translate(${x}px, ${h + 40}px) scale(.6)`, opacity: 0 },
          { transform: `translate(${x + sway}px, ${h * 0.55}px) scale(1)`, opacity: 1, offset: 0.4 },
          { transform: `translate(${x - sway}px, -80px) scale(1.1)`, opacity: 0 },
        ],
        { duration: rand(2600, 4200), delay: rand(0, 1800), easing: "ease-out", fill: "both" },
      ),
    );
  }
}

function burst(root: HTMLElement, emoji: string[], w: number, h: number, rounds = 3) {
  for (let r = 0; r < rounds; r += 1) {
    const cx = rand(w * 0.2, w * 0.8);
    const cy = rand(h * 0.2, h * 0.6);
    for (let i = 0; i < 18; i += 1) {
      const node = particle(root, pick(emoji), rand(18, 36));
      const angle = (Math.PI * 2 * i) / 18 + rand(-0.2, 0.2);
      const dist = rand(90, 220);
      done(
        node,
        node.animate(
          [
            { transform: `translate(${cx}px, ${cy}px) scale(.2)`, opacity: 0 },
            { transform: `translate(${cx + Math.cos(angle) * dist}px, ${cy + Math.sin(angle) * dist}px) scale(1.1)`, opacity: 1, offset: 0.55 },
            { transform: `translate(${cx + Math.cos(angle) * dist * 1.2}px, ${cy + Math.sin(angle) * dist * 1.2 + 80}px) scale(.8)`, opacity: 0 },
          ],
          { duration: rand(1300, 1900), delay: r * 650, easing: "cubic-bezier(.2,.9,.3,1)", fill: "both" },
        ),
      );
    }
  }
}

function pulse(root: HTMLElement, emoji: string[], w: number, h: number) {
  const node = particle(root, emoji[0] ?? "❤️", Math.min(w, h) * 0.42);
  node.classList.add("fx-big");
  done(
    node,
    node.animate(
      [
        { transform: `translate(${w / 2}px, ${h / 2}px) translate(-50%, -50%) scale(.2)`, opacity: 0 },
        { transform: `translate(${w / 2}px, ${h / 2}px) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.15 },
        { transform: `translate(${w / 2}px, ${h / 2}px) translate(-50%, -50%) scale(.85)`, offset: 0.3 },
        { transform: `translate(${w / 2}px, ${h / 2}px) translate(-50%, -50%) scale(1.05)`, offset: 0.45 },
        { transform: `translate(${w / 2}px, ${h / 2}px) translate(-50%, -50%) scale(.9)`, offset: 0.6 },
        { transform: `translate(${w / 2}px, ${h / 2}px) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.8 },
        { transform: `translate(${w / 2}px, ${h / 2}px) translate(-50%, -50%) scale(1.4)`, opacity: 0 },
      ],
      { duration: 2600, easing: "ease-in-out", fill: "both" },
    ),
  );
  rise(root, emoji, w, h, 14);
}

function confetti(root: HTMLElement, w: number, h: number) {
  for (let i = 0; i < 120; i += 1) {
    const node = document.createElement("span");
    node.className = "fx-c";
    node.style.background = pick(confettiColors);
    node.style.width = `${rand(6, 11)}px`;
    node.style.height = `${rand(10, 18)}px`;
    root.appendChild(node);
    const x = rand(w * 0.1, w * 0.9);
    const fromLeft = Math.random() > 0.5;
    const sx = fromLeft ? -20 : w + 20;
    done(
      node,
      node.animate(
        [
          { transform: `translate(${sx}px, ${h * 0.7}px) rotate(0deg)`, opacity: 1 },
          { transform: `translate(${x}px, ${rand(h * 0.05, h * 0.35)}px) rotate(${rand(200, 500)}deg)`, opacity: 1, offset: 0.35 },
          { transform: `translate(${x + rand(-80, 80)}px, ${h + 40}px) rotate(${rand(600, 1100)}deg)`, opacity: 0.9 },
        ],
        { duration: rand(2600, 3800), delay: rand(0, 500), easing: "cubic-bezier(.15,.8,.4,1)", fill: "both" },
      ),
    );
  }
}

function swirl(root: HTMLElement, emoji: string[], w: number, h: number) {
  for (let i = 0; i < 22; i += 1) {
    const node = particle(root, pick(emoji), rand(24, 40));
    const cx = w / 2;
    const cy = h / 2;
    const radius = rand(60, Math.min(w, h) * 0.45);
    const start = rand(0, Math.PI * 2);
    const frames: Keyframe[] = [];
    for (let s = 0; s <= 12; s += 1) {
      const a = start + (s / 12) * Math.PI * 2.4;
      const r = radius * (0.6 + s / 30);
      frames.push({ transform: `translate(${cx + Math.cos(a) * r}px, ${cy + Math.sin(a) * r}px)`, opacity: s === 0 || s === 12 ? 0 : 1 });
    }
    done(node, node.animate(frames, { duration: rand(3200, 4400), delay: rand(0, 700), easing: "ease-in-out", fill: "both" }));
  }
}

function card(root: HTMLElement, text: string, from: string | null, artName: string | undefined, glow: string | undefined) {
  const box = document.createElement("div");
  box.className = "fx-card";
  if (glow) box.style.setProperty("--glow", glow);
  if (artName) {
    const img = document.createElement("img");
    img.src = art(artName as ArtName);
    img.alt = "";
    box.appendChild(img);
  }
  const strong = document.createElement("strong");
  strong.textContent = text;
  box.appendChild(strong);
  if (from) {
    const small = document.createElement("small");
    small.textContent = from;
    box.appendChild(small);
  }
  root.appendChild(box);
  done(
    box,
    box.animate(
      [
        { transform: "translate(-50%, -50%) scale(.6)", opacity: 0 },
        { transform: "translate(-50%, -50%) scale(1.04)", opacity: 1, offset: 0.1 },
        { transform: "translate(-50%, -50%) scale(1)", opacity: 1, offset: 0.16 },
        { transform: "translate(-50%, -50%) scale(1)", opacity: 1, offset: 0.86 },
        { transform: "translate(-50%, -54%) scale(.96)", opacity: 0 },
      ],
      { duration: 4200, easing: "cubic-bezier(.34,1.56,.64,1)", fill: "both" },
    ),
  );
}

export function playEffect(preset: EffectPreset, options: { text?: string | null; from?: string | null; emoji?: string | null } = {}) {
  const layer = host();
  const rect = layer.getBoundingClientRect();
  const root = document.createElement("div");
  root.className = "fx-root";
  layer.appendChild(root);
  const w = rect.width;
  const h = rect.height;
  const emoji = options.emoji ? [options.emoji, options.emoji, "✨"] : preset.emoji;
  switch (preset.engine) {
    case "rain":
      rain(root, emoji, w, h);
      break;
    case "snow":
      rain(root, emoji, w, h, 40, true);
      break;
    case "rise":
      rise(root, emoji, w, h);
      break;
    case "burst":
      burst(root, emoji, w, h);
      break;
    case "pulse":
      pulse(root, emoji, w, h);
      break;
    case "confetti":
      confetti(root, w, h);
      break;
    case "swirl":
      swirl(root, emoji, w, h);
      break;
    default:
      break;
  }
  if (options.text) card(root, options.text, options.from ?? null, preset.art, preset.glow);
  try {
    if (preset.vibrate && "vibrate" in navigator) navigator.vibrate(preset.vibrate);
  } catch {
    /* not supported */
  }
  window.setTimeout(() => root.remove(), 9000);
}
