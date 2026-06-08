import { useEffect } from 'react';

export function useDebouncedEffect(value: string, delayMs: number, onDebounced: (value: string) => void) {
  useEffect(() => {
    const timer = setTimeout(() => onDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs, onDebounced]);
}
