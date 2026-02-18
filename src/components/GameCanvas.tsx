'use client';

import { useRef, useEffect, useCallback } from 'react';
import { GameStatePayload } from '@/lib/types';
import { FIELD_WIDTH, FIELD_HEIGHT, TICK_INTERVAL, INVINCIBILITY_TICKS } from '@/lib/constants';
import VirtualJoystick from './VirtualJoystick';
import {
  initAudio,
  playHitSound,
  playDeathSound,
  playCountdownBeep,
  playGoSound,
  playItemPickupSound,
  startBgm,
  stopBgm,
} from '@/lib/sounds';

// Player colors
const PLAYER_COLORS = ['#3b82f6', '#ef4444', '#22c55e']; // blue, red, green
const PLAYER_DEAD_ALPHA = 0.3;
// Duration of hit flash on client (ms) — matches server invincibility
const HIT_FLASH_DURATION_MS = INVINCIBILITY_TICKS * (1000 / 20);

// ============================================================
// Canvas background stars (static, generated once at module level)
// ============================================================
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

// ============================================================
// Skin images (loaded once at module level; fallback to circles if not ready)
// ============================================================
function createSkinImage(src: string): HTMLImageElement | null {
  if (typeof window === 'undefined') return null;
  const img = new Image();
  img.src = src;
  return img;
}

const PLAYER_SKINS: (HTMLImageElement | null)[] = [
  createSkinImage('/skins/player-blue.png'),
  createSkinImage('/skins/player-red.png'),
  createSkinImage('/skins/player-green.png'),
];
const BULLET_SKIN: HTMLImageElement | null = createSkinImage('/skins/bullet.png');

// ============================================================
// Particle
// ============================================================
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  maxAge: number;
  size: number;
  color: string;
}

// ============================================================
// Toast (death notification)
// ============================================================
interface Toast {
  text: string;
  age: number;
  maxAge: number;
  color: string;
  offsetY: number; // cumulative upward drift (px)
}

// ============================================================
// Props
// ============================================================
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

  // Hit flash timestamps per player id
  const hitFlashRef = useRef<Map<string, number>>(new Map());

  // Particles
  const particlesRef = useRef<Particle[]>([]);

  // Toasts
  const toastsRef = useRef<Toast[]>([]);

  // Countdown animation
  const countdownChangeTimeRef = useRef<number>(0);
  const prevCountdownRef = useRef<number | null>(null);

  // GO! flash
  const goFlashRef = useRef<number | null>(null); // timestamp when GO! started

  // Audio init flag
  const audioInitedRef = useRef(false);

  // Item tracking for sound detection
  const prevItemIdsRef = useRef<Set<string>>(new Set());
  // BGM state
  const bgmStartedRef = useRef(false);

  const isTouchDevice =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  // ============================================================
  // Audio init on first interaction
  // ============================================================
  const ensureAudio = useCallback(() => {
    if (!audioInitedRef.current) {
      initAudio();
      audioInitedRef.current = true;
    }
  }, []);

  // ============================================================
  // Update refs when new state arrives
  // ============================================================
  useEffect(() => {
    if (gameState && gameState !== currStateRef.current) {
      const oldState = currStateRef.current;
      prevStateRef.current = prevGameState;
      currStateRef.current = gameState;
      stateTimeRef.current = performance.now();

      if (oldState) {
        for (const player of gameState.players) {
          const oldPlayer = oldState.players.find((p) => p.id === player.id);

          // HP decrease → hit flash + particles + sound
          if (oldPlayer && player.hp < oldPlayer.hp) {
            hitFlashRef.current.set(player.id, performance.now());

            // Particles
            const idx = gameState.players.indexOf(player);
            const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
            const count = 10 + Math.floor(Math.random() * 4);
            for (let i = 0; i < count; i++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 1.5 + Math.random() * 2.5;
              particlesRef.current.push({
                x: player.x,
                y: player.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                age: 0,
                maxAge: 25 + Math.floor(Math.random() * 15),
                size: 2 + Math.random() * 3,
                color,
              });
            }

            // Sound
            ensureAudio();
            if (player.alive) {
              playHitSound();
            }
          }

          // Alive → dead → toast + sound
          if (oldPlayer && oldPlayer.alive && !player.alive) {
            const idx = gameState.players.indexOf(player);
            const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
            toastsRef.current.push({
              text: `⚡ ${player.username} 撃墜！`,
              age: 0,
              maxAge: 120,
              color,
              offsetY: 0,
            });
            ensureAudio();
            playDeathSound();
          }
        }

        // Item pickup sound: field item disappeared (was picked up or used)
        const oldItemIds = prevItemIdsRef.current;
        const newItemIds = new Set(gameState.items.map((i) => i.id));
        for (const id of oldItemIds) {
          if (!newItemIds.has(id)) {
            ensureAudio();
            // If an item vanished it was either picked up or used — play pickup sound
            playItemPickupSound();
          }
        }
        prevItemIdsRef.current = newItemIds;

        // BGM: start on first game tick, stop when game over
        const allDead = gameState.players.every((p) => !p.alive);
        if (!bgmStartedRef.current && gameState.elapsed > 0) {
          ensureAudio();
          startBgm();
          bgmStartedRef.current = true;
        }
        if (bgmStartedRef.current && allDead) {
          stopBgm();
          bgmStartedRef.current = false;
        }
      }
    }
  }, [gameState, prevGameState, ensureAudio]);

  // ============================================================
  // Stop BGM on unmount
  // ============================================================
  useEffect(() => {
    return () => {
      stopBgm();
    };
  }, []);

  // ============================================================
  // Countdown sound + animation trigger
  // ============================================================
  useEffect(() => {
    const prev = prevCountdownRef.current;

    if (countdown !== null && countdown !== prev) {
      countdownChangeTimeRef.current = performance.now();
      if (countdown > 0) {
        ensureAudio();
        playCountdownBeep();
      }
    }

    // countdown just ended (prev was 0 or 1, now null) → GO! + BGM start
    if (countdown === null && prev !== null) {
      goFlashRef.current = performance.now();
      ensureAudio();
      playGoSound();
      if (!bgmStartedRef.current) {
        startBgm();
        bgmStartedRef.current = true;
      }
    }

    prevCountdownRef.current = countdown;
  }, [countdown, ensureAudio]);

  // ============================================================
  // Render loop
  // ============================================================
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

      // ---- Background ----
      ctx.fillStyle = '#050816';
      ctx.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);

      // ---- Stars ----
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

      // ---- Center marker ----
      ctx.beginPath();
      ctx.arc(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, 8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // ---- Particles (draw before players so they appear under players) ----
      const aliveParticles: Particle[] = [];
      for (const p of particlesRef.current) {
        p.age++;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.04; // gravity
        p.vx *= 0.96; // drag
        if (p.age < p.maxAge) {
          const ratio = 1 - p.age / p.maxAge;
          ctx.globalAlpha = ratio * 0.9;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * ratio, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
          aliveParticles.push(p);
        }
      }
      particlesRef.current = aliveParticles;
      ctx.globalAlpha = 1;

      // ---- Bullets ----
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

        const skin = BULLET_SKIN;
        const r = bullet.radius;

        ctx.save();
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 16;

        if (skin && skin.complete && skin.naturalWidth > 0) {
          // Draw skin image centered on bullet position
          ctx.drawImage(skin, bx - r, by - r, r * 2, r * 2);
        } else {
          // Fallback: double-glow circle
          ctx.beginPath();
          ctx.arc(bx, by, r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(249, 115, 22, 0.4)';
          ctx.fill();
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(bx, by, r, 0, Math.PI * 2);
          ctx.fillStyle = '#f97316';
          ctx.fill();
        }
        ctx.restore();
      }

      // ---- Items ----
      for (const item of curr.items) {
        const pulse = 0.7 + 0.3 * Math.sin(now / 300);
        ctx.save();
        ctx.shadowColor = '#a78bfa';
        ctx.shadowBlur = 18 * pulse;
        // Outer ring
        ctx.beginPath();
        ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(167, 139, 250, ${0.6 + 0.4 * pulse})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        // Inner fill
        ctx.beginPath();
        ctx.arc(item.x, item.y, item.radius * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(167, 139, 250, ${0.35 * pulse})`;
        ctx.fill();
        // Symbol
        ctx.fillStyle = '#e9d5ff';
        ctx.font = `bold ${Math.round(item.radius * 1.1)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💥', item.x, item.y);
        ctx.restore();
      }

      // ---- Players ----
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
        const isFlashing = hitTime !== undefined && now - hitTime < HIT_FLASH_DURATION_MS;
        if (isFlashing && player.alive) {
          alpha = 0.3 + 0.7 * Math.abs(Math.sin(now / 60));
        }
        if (hitTime !== undefined && now - hitTime >= HIT_FLASH_DURATION_MS) {
          hitFlashRef.current.delete(player.id);
        }

        ctx.globalAlpha = alpha;

        // Glow ring (alive only)
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

        // Player body — skin image or circle fallback
        const skin = PLAYER_SKINS[index % PLAYER_SKINS.length];
        const r = player.radius;

        if (skin && skin.complete && skin.naturalWidth > 0) {
          ctx.drawImage(skin, px - r, py - r, r * 2, r * 2);
        } else {
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }

        // Highlight current player
        if (player.id === currentSocketId) {
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        // Username label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(player.username, px, py - r - 20);

        // Dead indicator (X mark)
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

      // ---- Toasts (death notifications) ----
      const aliveToasts: Toast[] = [];
      for (let i = 0; i < toastsRef.current.length; i++) {
        const toast = toastsRef.current[i];
        toast.age++;
        toast.offsetY += 0.4;
        if (toast.age < toast.maxAge) {
          const ratio = 1 - toast.age / toast.maxAge;
          const x = FIELD_WIDTH - 12;
          const y = 40 + i * 28 - toast.offsetY;
          ctx.save();
          ctx.globalAlpha = ratio;
          ctx.font = 'bold 13px sans-serif';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          // Shadow for readability
          ctx.shadowColor = '#000000';
          ctx.shadowBlur = 4;
          ctx.fillStyle = toast.color;
          ctx.fillText(toast.text, x, y);
          ctx.restore();
          aliveToasts.push(toast);
        }
      }
      toastsRef.current = aliveToasts;

      // ---- Countdown overlay (enhanced) ----
      if (countdown !== null && countdown > 0) {
        ctx.fillStyle = 'rgba(5, 8, 22, 0.7)';
        ctx.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);

        const changeElapsed = now - countdownChangeTimeRef.current;
        // scale: starts at 1.6, decays to 1.0 exponentially
        const scale = 1 + 0.6 * Math.exp(-changeElapsed / 150);

        ctx.save();
        ctx.translate(FIELD_WIDTH / 2, FIELD_HEIGHT / 2);
        ctx.scale(scale, scale);

        // Glow
        ctx.shadowColor = '#a5b4fc';
        ctx.shadowBlur = 40;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 96px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(countdown), 0, 0);
        ctx.restore();
      }

      // ---- GO! flash ----
      const goStart = goFlashRef.current;
      if (goStart !== null) {
        const goElapsed = now - goStart;
        const goDuration = 700;
        if (goElapsed < goDuration) {
          const ratio = 1 - goElapsed / goDuration;
          const scale = 1 + 0.5 * Math.exp(-goElapsed / 100);
          ctx.save();
          ctx.globalAlpha = ratio * 0.9;
          ctx.translate(FIELD_WIDTH / 2, FIELD_HEIGHT / 2);
          ctx.scale(scale, scale);
          ctx.shadowColor = '#fbbf24';
          ctx.shadowBlur = 60;
          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 96px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('GO!', 0, 0);
          ctx.restore();
        } else {
          goFlashRef.current = null;
        }
      }

      // ---- Elapsed time ----
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

  // ============================================================
  // Self status display
  // ============================================================
  const myPlayer = gameState?.players.find((p) => p.id === currentSocketId);
  const myIndex = gameState?.players.findIndex((p) => p.id === currentSocketId) ?? 0;
  const myColor = PLAYER_COLORS[myIndex % PLAYER_COLORS.length];

  // Wrap sendInput to also init audio on first touch/key
  const handleSendInput = useCallback(
    (dx: number, dy: number) => {
      ensureAudio();
      sendInput?.(dx, dy);
    },
    [ensureAudio, sendInput],
  );

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
              <span className="text-xs text-red-400 ml-1">撃墜</span>
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
          {isTouchDevice ? '仮想スティックを操作で移動！' : 'WASD or 方向キーを連打で移動！'}
        </p>

        {/* Virtual Joystick for touch devices */}
        {isTouchDevice && sendInput && (
          <div className="flex justify-center mt-4">
            <VirtualJoystick onInput={handleSendInput} />
          </div>
        )}
      </div>
    </div>
  );
}
