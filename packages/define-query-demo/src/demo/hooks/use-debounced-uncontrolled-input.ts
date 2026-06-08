import { useEffect, useRef } from 'react';

/** Uncontrolled text input: DOM owns keystrokes; notify parent after debounce. */
export function useDebouncedUncontrolledInput(delayMs: number) {
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  function scheduleNotify(onNotify: (value: string) => void) {
    const value = inputRef.current?.value ?? '';
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onNotify(value), delayMs);
  }

  return { inputRef, scheduleNotify };
}
