import { useEffect, type RefObject } from "react";

export function useEnter(scope: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = scope.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let revert: (() => void) | undefined;
    let cancelled = false;

    void import("gsap").then(({ default: gsap }) => {
      if (cancelled || !scope.current) return;
      const context = gsap.context(() => {
        gsap.from("[data-enter]", {
          y: 12,
          opacity: 0,
          duration: 0.42,
          stagger: 0.05,
          ease: "power2.out",
          clearProps: "transform,opacity",
        });
      }, scope);
      revert = () => context.revert();
    });

    return () => {
      cancelled = true;
      revert?.();
    };
  }, [scope]);
}

export function useFloat(scope: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = scope.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let revert: (() => void) | undefined;
    let cancelled = false;

    void import("gsap").then(({ default: gsap }) => {
      if (cancelled || !scope.current) return;
      const context = gsap.context(() => {
        gsap.fromTo(
          "[data-float]",
          { y: 8 },
          { y: -6, duration: 1.4, ease: "sine.inOut", yoyo: true, repeat: 1 },
        );
      }, scope);
      revert = () => context.revert();
    });

    return () => {
      cancelled = true;
      revert?.();
    };
  }, [scope]);
}
