"use client";

import * as React from "react";
import { animate, motion, useInView, useReducedMotion } from "framer-motion";

/** Fade/slide in once when scrolled into view; static for reduced-motion users. */
export function Reveal({ children, delay = 0, className, as = "div" }: { children: React.ReactNode; delay?: number; className?: string; as?: "div" | "li" | "section" }) {
  const reduce = useReducedMotion();
  const Comp = motion[as];
  if (reduce) return React.createElement(as, { className }, children);
  return (
    <Comp className={className} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </Comp>
  );
}

/** Counts up to a value when visible (KG counters, earnings). */
export function CountUp({ value, decimals = 0, prefix = "", suffix = "", className }: { value: number; decimals?: number; prefix?: string; suffix?: string; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const fmt = React.useCallback((v: number) => `${prefix}${v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`, [prefix, suffix, decimals]);
  React.useEffect(() => {
    if (!ref.current) return;
    if (reduce || !inView) {
      ref.current.textContent = fmt(reduce ? value : 0);
      if (!reduce) return;
      return;
    }
    const ctrl = animate(0, value, { duration: 1.4, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => ref.current && (ref.current.textContent = fmt(v)) });
    return () => ctrl.stop();
  }, [inView, value, reduce, fmt]);
  return <span ref={ref} className={className}>{fmt(reduce ? value : 0)}</span>;
}

/** Smoothly tweens a number whenever it changes (live calculators). */
export function Tween({ value, format, className }: { value: number; format: (v: number) => string; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const prev = React.useRef(value);
  const reduce = useReducedMotion();
  React.useEffect(() => {
    if (!ref.current) return;
    if (reduce) {
      ref.current.textContent = format(value);
      return;
    }
    const ctrl = animate(prev.current, value, { duration: 0.45, ease: "easeOut", onUpdate: (v) => ref.current && (ref.current.textContent = format(v)) });
    prev.current = value;
    return () => ctrl.stop();
  }, [value, format, reduce]);
  return <span ref={ref} className={className}>{format(value)}</span>;
}
