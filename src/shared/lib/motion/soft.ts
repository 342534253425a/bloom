import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { RefObject } from "react";

gsap.registerPlugin(useGSAP);

function motionOk() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useSoftPresence(scope: RefObject<HTMLElement | null>) {
  useGSAP(
    () => {
      const query = gsap.matchMedia();
      query.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-enter]", {
          y: 20,
          scale: 0.96,
          opacity: 0,
          filter: "blur(8px)",
          duration: 0.85,
          stagger: 0.08,
          ease: "power3.out",
          clearProps: "filter,opacity,transform",
        });
        gsap.to("[data-float]", {
          y: -8,
          duration: 3.4,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
          stagger: { each: 0.35 },
        });
      });
      return () => query.revert();
    },
    { scope },
  );
}

export function useSoftPulse(scope: RefObject<HTMLElement | null>, active: boolean) {
  useGSAP(
    () => {
      if (!active) return;
      const query = gsap.matchMedia();
      query.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.to("[data-pulse]", {
          scale: 1.06,
          duration: 1.7,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
          transformOrigin: "50% 50%",
        });
      });
      return () => query.revert();
    },
    { scope, dependencies: [active], revertOnUpdate: true },
  );
}

export function breatheSoft(target: HTMLElement) {
  if (!motionOk()) return;
  gsap
    .timeline()
    .to(target, { scale: 1.035, duration: 3.2, ease: "sine.inOut" })
    .to(target, { scale: 1, duration: 3.4, ease: "sine.inOut" });
}

export function popSoft(target: HTMLElement) {
  if (!motionOk()) return;
  gsap.fromTo(target, { scale: 0.9 }, { scale: 1, duration: 0.55, ease: "back.out(1.7)", transformOrigin: "50% 50%" });
}
