'use client';

import { useEffect, useRef } from 'react';

export function useInput(
  sendInput: (dx: number, dy: number) => void,
  enabled: boolean
): void {
  const keysRef = useRef<Set<string>>(new Set());
  const lastSentRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault();
        keysRef.current.add(key);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysRef.current.delete(key);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Send input at tick rate (50ms)
    const interval = setInterval(() => {
      let dx = 0;
      let dy = 0;
      const keys = keysRef.current;

      if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
      if (keys.has('d') || keys.has('arrowright')) dx += 1;
      if (keys.has('w') || keys.has('arrowup')) dy -= 1;
      if (keys.has('s') || keys.has('arrowdown')) dy += 1;

      // Normalize diagonal
      if (dx !== 0 && dy !== 0) {
        const inv = 1 / Math.SQRT2;
        dx *= inv;
        dy *= inv;
      }

      // Only send if changed or non-zero
      const last = lastSentRef.current;
      if (dx !== last.dx || dy !== last.dy) {
        sendInput(dx, dy);
        lastSentRef.current = { dx, dy };
      }
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      clearInterval(interval);
      keysRef.current.clear();
    };
  }, [sendInput, enabled]);
}
