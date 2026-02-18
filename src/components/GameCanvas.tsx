'use client';

import { useRef, useEffect } from 'react';
import { GameStatePayload } from '@/lib/types';
import { FIELD_WIDTH, FIELD_HEIGHT, TICK_INTERVAL, INVINCIBILITY_TICKS } from '@/lib/constants';
import VirtualJoystick from './VirtualJoystick';

// Player colors
const PLAYER_COLORS = ['#3b82f6', '#ef4444', '#22c55e']; // blue, red, green
const PLAYER_DEAD_ALPHA = 0.3;
// Duration of hit flash on client (ms) — matches server invincibility
const HIT_FLASH_DURATION_MS = INVINCIBILITY_TICKS * (1000 / 20);

// Canvas background stars (static, generated once at module level)
interface CanvasStar {
  x: number;
  y: number;
  size: number;
  brightness: number;
}

const CANVAS_STARS: CanvasStar[] = Array.from({ length: 80 }, () => ({
  x: Math.random() * FIELD_WIDTH,
  y: Math.random() * FIELD_HEIGHT,
  size: Math.random() * 1.5 + 0.5,
  brightness: Math.random() * 0.5 + 0.2,
}));

interface GameCanvasProps {
  gameState: GameStatePayload | null;
  prevGameState: GameStatePayload | null;
  currentSocketId: string | null;
  countdown: number | null;
  sendInput?: (dx: number, dy: number) => void;
}

export default function GameCanvas({
  gameState,
  prevGameState,
  currentSocketId,
  countdown,
  sendInput,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateTimeRef = useRef<number>(0);
  const prevStateRef = useRef<GameStatePayload | null>(null);
  const currStateRef = useRef<GameStatePayload | null>(null);
  // Track hit flash timestamps per player id
  const hitFlashRef = useRef<Map<string, number>>(new Map());

  const isTouchDevice = typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  // Update refs when new state arrives, detect HP changes for flash
  useEffect(() => {
    if (gameState && gameState !== currStateRef.current) {
      const oldState = currStateRef.current;
      prevStateRef.current = prevGameState;
      currStateRef.current = gameState;
      stateTimeRef.current = performance.now();

      // Detect HP decrease for hit flash
      if (oldState) {
        for (const player of gameState.players) {
          const oldPlayer = oldState.players.find((p) => p.id === player.id);
          if (oldPlayer && player.hp < oldPlayer.hp) {
            hitFlashRef.current.set(player.id, performance.now());
          }
        }
      }
    }
  }, [gameState, prevGameState]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stars = CANVAS_STARS;
    let animId: number;

    const draw = () => {
      animId = requestAnimationFrame(draw);

      const curr = currStateRef.current;
      const now = performance.now();

      // Background — deep space
      ctx.fillStyle = '#050816';
      ctx.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);

      // Stars background (twinkle effect)
      for (const star of stars) {
        const twinkle = star.brightness + 0.3 * Math.sin(now / 1000 + star.x * 10 + star.y);
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.05, Math.min(twinkle, 0.8))})`;
        ctx.fill();
      }

      if (!curr) return;

      const prev = prevStateRef.current;
      const elapsed = performance.now() - stateTimeRef.current;
      const t = Math.min(elapsed / TICK_INTERVAL, 1);

      // Center marker (bullet spawn point)
      ctx.beginPath();
      ctx.arc(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, 8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Bullets — double glow
      for (const bullet of curr.bullets) {
        let bx = bullet.x;
        let by = bullet.y;

        if (prev) {
          const prevBullet = prev.bullets.find((b) => b.id === bullet.id);
          if (prevBullet) {
            bx = prevBullet.x + (bullet.x - prevBullet.x) * t;
            by = prevBullet.y + (bullet.y - prevBullet.y) * t;
          }
        }

        // Outer glow
        ctx.save();
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(bx, by, bullet.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(249, 115, 22, 0.4)';
        ctx.fill();

        // Inner glow
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(bx, by, bullet.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#f97316';
        ctx.fill();
        ctx.restore();
      }

      // Players
      curr.players.forEach((player, index) => {
        let px = player.x;
        let py = player.y;

        if (prev) {
          const prevPlayer = prev.players.find((p) => p.id === player.id);
          if (prevPlayer) {
            px = prevPlayer.x + (player.x - prevPlayer.x) * t;
            py = prevPlayer.y + (player.y - prevPlayer.y) * t;
          }
        }

        const color = PLAYER_COLORS[index % PLAYER_COLORS.length];
        let alpha = player.alive ? 1 : PLAYER_DEAD_ALPHA;

        // Hit flash (blink during invincibility)
        const hitTime = hitFlashRef.current.get(player.id);
        const isFlashing = hitTime && (now - hitTime) < HIT_FLASH_DURATION_MS;
        if (isFlashing && player.alive) {
          alpha = 0.3 + 0.7 * Math.abs(Math.sin(now / 60));
        }
        // Clean up expired flashes
        if (hitTime && (now - hitTime) >= HIT_FLASH_DURATION_MS) {
          hitFlashRef.current.delete(player.id);
        }

        ctx.globalAlpha = alpha;

        // Glow ring
        if (player.alive) {
          ctx.save();
          ctx.shadowColor = color;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(px, py, player.radius + 3, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = alpha * 0.4;
          ctx.stroke();
          ctx.restore();
          ctx.globalAlpha = alpha;
        }

        // Player circle
        ctx.beginPath();
        ctx.arc(px, py, player.radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Highlight current player
        if (player.id === currentSocketId) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        // Username label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(player.username, px, py - player.radius - 20);

        // Dead indicator
        if (!player.alive) {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px - 10, py - 10);
          ctx.lineTo(px + 10, py + 10);
          ctx.moveTo(px + 10, py - 10);
          ctx.lineTo(px - 10, py + 10);
          ctx.stroke();
        }

        ctx.globalAlpha = 1;
      });

      // Countdown overlay
      if (countdown !== null && countdown > 0) {
        ctx.fillStyle = 'rgba(5, 8, 22, 0.7)';
        ctx.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 96px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(countdown), FIELD_WIDTH / 2, FIELD_HEIGHT / 2);
      }

      // Elapsed time display
      if (curr.elapsed > 0 && countdown === null) {
        const seconds = Math.floor((curr.elapsed * TICK_INTERVAL) / 1000);
        ctx.fillStyle = 'rgba(165, 180, 252, 0.6)';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(`${seconds}s`, FIELD_WIDTH - 10, 10);
      }
    };

    animId = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(animId);
  }, [currentSocketId, countdown]);

  // Find current player from latest game state
  const myPlayer = gameState?.players.find((p) => p.id === currentSocketId);
  const myIndex = gameState?.players.findIndex((p) => p.id === currentSocketId) ?? 0;
  const myColor = PLAYER_COLORS[myIndex % PLAYER_COLORS.length];

  return (
    <div className="flex items-center justify-center min-h-screen relative z-10">
      <div>
        {/* Self status — left-aligned above canvas */}
        {myPlayer && (
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: myColor }}
            />
            <span className="text-sm text-indigo-200 font-medium">
              {myPlayer.username}
            </span>
            <span className="flex gap-1 ml-1">
              {Array.from({ length: myPlayer.maxHp }, (_, i) => (
                <span
                  key={i}
                  className={`inline-block w-2.5 h-2.5 rounded-sm ${
                    i < myPlayer.hp ? 'bg-green-500' : 'bg-indigo-900/50'
                  }`}
                />
              ))}
            </span>
            {!myPlayer.alive && (
              <span className="text-xs text-red-400 ml-1">ELIMINATED</span>
            )}
          </div>
        )}

        <div className="relative">
          <canvas
            ref={canvasRef}
            width={FIELD_WIDTH}
            height={FIELD_HEIGHT}
            className="border border-indigo-500/30 rounded-lg"
          />
        </div>
        <p className="text-indigo-400/50 text-sm text-center mt-2">
          {isTouchDevice ? 'Use joystick to move' : 'WASD or Arrow Keys to move'}
        </p>

        {/* Virtual Joystick for touch devices */}
        {isTouchDevice && sendInput && (
          <div className="flex justify-center mt-4">
            <VirtualJoystick onInput={sendInput} />
          </div>
        )}
      </div>
    </div>
  );
}
