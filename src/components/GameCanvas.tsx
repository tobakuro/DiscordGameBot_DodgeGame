'use client';

import { useRef, useEffect } from 'react';
import { GameStatePayload } from '@/lib/types';
import { FIELD_WIDTH, FIELD_HEIGHT, TICK_INTERVAL } from '@/lib/constants';

// Player colors
const PLAYER_COLORS = ['#3b82f6', '#ef4444', '#22c55e']; // blue, red, green
const PLAYER_DEAD_ALPHA = 0.3;

interface GameCanvasProps {
  gameState: GameStatePayload | null;
  prevGameState: GameStatePayload | null;
  currentSocketId: string | null;
  countdown: number | null;
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

  // Update refs when new state arrives
  useEffect(() => {
    if (gameState && gameState !== currStateRef.current) {
      prevStateRef.current = prevGameState;
      currStateRef.current = gameState;
      stateTimeRef.current = performance.now();
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
        // Draw empty field
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
        return;
      }

      const prev = prevStateRef.current;
      const elapsed = performance.now() - stateTimeRef.current;
      const t = Math.min(elapsed / TICK_INTERVAL, 1);

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

        // Interpolate if we have previous state
        if (prev) {
          const prevBullet = prev.bullets.find((b) => b.id === bullet.id);
          if (prevBullet) {
            bx = prevBullet.x + (bullet.x - prevBullet.x) * t;
            by = prevBullet.y + (bullet.y - prevBullet.y) * t;
          }
        }

        ctx.beginPath();
        ctx.arc(bx, by, bullet.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#f97316'; // orange
        ctx.fill();
        // Glow effect
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Players
      curr.players.forEach((player, index) => {
        let px = player.x;
        let py = player.y;

        // Interpolate
        if (prev) {
          const prevPlayer = prev.players.find((p) => p.id === player.id);
          if (prevPlayer) {
            px = prevPlayer.x + (player.x - prevPlayer.x) * t;
            py = prevPlayer.y + (player.y - prevPlayer.y) * t;
          }
        }

        const color = PLAYER_COLORS[index % PLAYER_COLORS.length];
        const alpha = player.alive ? 1 : PLAYER_DEAD_ALPHA;

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
        ctx.fillText(player.username, px, py - player.radius - 8);

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

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={FIELD_WIDTH}
          height={FIELD_HEIGHT}
          className="border border-gray-700 rounded-lg"
        />
        <p className="text-gray-500 text-sm text-center mt-2">
          WASD or Arrow Keys to move
        </p>
      </div>
    </div>
  );
}
