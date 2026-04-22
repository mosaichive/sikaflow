import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  formatter?: (n: number) => string;
}

export function AnimatedNumber({ value, duration = 800, formatter }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  const raf = useRef<number>();

  useEffect(() => {
    const start = prev.current;
    const diff = value - start;
    if (diff === 0) return;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = start + diff * eased;
      setDisplay(current);
      if (progress < 1) {
        raf.current = requestAnimationFrame(step);
      } else {
        prev.current = value;
      }
    };

    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, duration]);

  return <>{formatter ? formatter(display) : Math.round(display)}</>;
}
