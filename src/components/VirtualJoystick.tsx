'use client';

import { useRef, useCallback, useEffect } from 'react';

interface VirtualJoystickProps {
  onInput: (dx: number, dy: number) => void;
  size?: number;
}

const KNOB_RATIO = 0.4; // knob radius relative to base radius

export default function VirtualJoystick({ onInput, size = 120 }: VirtualJoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const touchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dxRef = useRef(0);
  const dyRef = useRef(0);

  const baseRadius = size / 2;
  const knobSize = size * KNOB_RATIO;

  const updateKnob = useCallback(
    (clientX: number, clientY: number) => {
      const base = baseRef.current;
      const knob = knobRef.current;
      if (!base || !knob) return;

      const rect = base.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      let offsetX = clientX - centerX;
      let offsetY = clientY - centerY;

      // Clamp to base radius
      const dist = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
      const maxDist = baseRadius - knobSize / 2;
      if (dist > maxDist) {
        offsetX = (offsetX / dist) * maxDist;
        offsetY = (offsetY / dist) * maxDist;
      }

      // Normalize to -1..1
      dxRef.current = offsetX / maxDist;
      dyRef.current = offsetY / maxDist;

      // Apply deadzone
      if (Math.abs(dxRef.current) < 0.15) dxRef.current = 0;
      if (Math.abs(dyRef.current) < 0.15) dyRef.current = 0;

      knob.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    },
    [baseRadius, knobSize]
  );

  const resetKnob = useCallback(() => {
    const knob = knobRef.current;
    if (knob) knob.style.transform = 'translate(0px, 0px)';
    dxRef.current = 0;
    dyRef.current = 0;
    onInput(0, 0);
  }, [onInput]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (touchIdRef.current !== null) return;
      const touch = e.changedTouches[0];
      touchIdRef.current = touch.identifier;
      updateKnob(touch.clientX, touch.clientY);

      // Start sending input at 50ms interval (matching tick rate)
      intervalRef.current = setInterval(() => {
        onInput(dxRef.current, dyRef.current);
      }, 50);
    },
    [updateKnob, onInput]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === touchIdRef.current) {
          updateKnob(touch.clientX, touch.clientY);
          break;
        }
      }
    },
    [updateKnob]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchIdRef.current) {
          touchIdRef.current = null;
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          resetKnob();
          break;
        }
      }
    },
    [resetKnob]
  );

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div
      ref={baseRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className="relative flex items-center justify-center rounded-full touch-none select-none"
      style={{
        width: size,
        height: size,
        background: 'rgba(99, 102, 241, 0.15)',
        border: '2px solid rgba(99, 102, 241, 0.3)',
      }}
    >
      <div
        ref={knobRef}
        className="absolute rounded-full"
        style={{
          width: knobSize,
          height: knobSize,
          background: 'rgba(99, 102, 241, 0.5)',
          border: '2px solid rgba(165, 180, 252, 0.6)',
          transition: 'transform 0.15s ease-out',
        }}
      />
    </div>
  );
}
