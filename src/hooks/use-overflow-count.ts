'use client';

import React from 'react';

/**
 * Number of fixed-width items that fit in a container, measured rather than
 * guessed at a breakpoint.
 *
 * A toolbar that hardcodes "show 6 tools on mobile" is wrong on every device
 * that is not the one it was tuned on. This observes the real width and returns
 * the largest count that fits, reserving room for the overflow trigger whenever
 * anything has to be hidden.
 *
 * @param total       how many items want to be shown
 * @param itemWidth   per-item footprint in px, including its gap
 * @param reserved    px consumed by non-item chrome (trigger, separators, padding)
 */
export function useOverflowCount(
  total: number,
  itemWidth: number,
  reserved: number,
): { ref: React.RefObject<HTMLDivElement | null>; visible: number } {
  const ref = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const visible = React.useMemo(() => {
    if (!width) return Math.min(total, 6);
    const fitsAll = Math.floor((width - reserved) / itemWidth);
    if (fitsAll >= total) return total;
    // Something must be hidden, so the trigger itself needs a slot.
    return Math.max(1, Math.floor((width - reserved - itemWidth) / itemWidth));
  }, [width, total, itemWidth, reserved]);

  return { ref, visible };
}
