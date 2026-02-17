'use client';

import { useRef, useEffect, useState } from 'react';
import { GameStatePayload } from '@/lib/types';
import { FIELD_WIDTH, FIELD_HEIGHT, TICK_INTERVAL, INVINCIBILITY_TICKS } from '@/lib/constants';

// Player colors
const PLAYER_COLORS = ['#3b82f6', '#ef4444', '#22c55e']; // blue, red, green
const PLAYER_DEAD_ALPHA = 0.3;
// Duration of hit flash on client (ms) — matches server invincibility
const HIT_FLASH_DURATION_MS = INVINCIBILITY_TICKS * (1000 / 20);

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
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateTimeRef = useRef<number>(0);
  const prevStateRef = useRef<GameStatePayload | null>(null);
  const currStateRef = useRef<GameStatePayload | null>(null);
  // Track hit flash timestamps per player id
  const hitFlashRef = useRef<Map<string, number>>(new Map());

  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

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

    let animId: number;

    const draw = () => {
      animId = requestAnimationFrame(draw);

      const curr = currStateRef.current;
      if (!curr) {
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
        return;
      }

      const prev = prevStateRef.current;
      const elapsed = performance.now() - stateTimeRef.current;
      const t = Math.min(elapsed / TICK_INTERVAL, 1);
      const now = performance.now();

      // Background
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);

      // Grid lines
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 1;
      for (let x = 0; x <= FIELD_WIDTH; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, FIELD_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y <= FIELD_HEIGHT; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(FIELD_WIDTH, y);
        ctx.stroke();
      }

      // Center marker (bullet spawn point)
      ctx.beginPath();
      ctx.arc(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Bullets
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

        ctx.beginPath();
        ctx.arc(bx, by, bullet.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#f97316';
        ctx.fill();
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
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

        // HP bar (above username)
        if (player.alive) {
          const hpBarWidth = 30;
          const hpBarHeight = 4;
          const hpBarX = px - hpBarWidth / 2;
          const hpBarY = py - player.radius - 16;

          // Background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.fillRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);

          // HP fill (green → yellow → red)
          const ratio = player.hp / player.maxHp;
          const hpColor = ratio > 0.66 ? '#22c55e' : ratio > 0.33 ? '#eab308' : '#ef4444';
          ctx.fillStyle = hpColor;
          ctx.fillRect(hpBarX, hpBarY, hpBarWidth * ratio, hpBarHeight);
        }

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
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
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
        ctx.fillStyle = '#9ca3af';
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
    <div className="flex items-center justify-center min-h-screen bg-gray-950">
      <div>
        {/* Self status — left-aligned above canvas */}
        {myPlayer && (
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: myColor }}
            />
            <span className="text-sm text-gray-300 font-medium">
              {myPlayer.username}
            </span>
            <span className="flex gap-1 ml-1">
              {Array.from({ length: myPlayer.maxHp }, (_, i) => (
                <span
                  key={i}
                  className={`inline-block w-2.5 h-2.5 rounded-sm ${
                    i < myPlayer.hp ? 'bg-green-500' : 'bg-gray-700'
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
            className="border border-gray-700 rounded-lg"
          />
        </div>
        <p className="text-gray-500 text-sm text-center mt-2">
          {isTouchDevice ? 'Use joystick to move' : 'WASD or Arrow Keys to move'}
        </p>
      </div>
    </div>
  );
}
