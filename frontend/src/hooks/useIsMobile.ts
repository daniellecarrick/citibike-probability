import { useEffect, useState } from 'react';

export function useIsMobile(breakpoint = 768): boolean {
  const [is, setIs] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpoint,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    setIs(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIs(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return is;
}
