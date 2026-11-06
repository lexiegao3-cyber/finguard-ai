import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/** Animates a number from 0 to `value` once, when a new result is shown. */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = format(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.8,
      ease: [0.2, 0.7, 0.2, 1],
      onUpdate: (n) => {
        el.textContent = format(n);
      },
    });
    return () => controls.stop();
  }, [value, format, reduce]);

  return <span ref={ref}>{format(reduce ? value : 0)}</span>;
}
