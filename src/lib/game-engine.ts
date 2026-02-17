import {
  Player,
  Bullet,
  PlayerPublic,
  GameStatePayload,
  GameOverPayload,
  RoomStatus,
} from './types';
import {
  FIELD_WIDTH,
  FIELD_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  KNOCKBACK,
  BULLET_RADIUS,
  BULLET_BASE_SPEED,
  BULLET_SPAWN_INTERVAL_TICKS,
  BULLET_SPAWN_INTERVAL_MIN,
  BULLET_COUNT_PER_SPAWN,
  BULLET_COUNT_MAX,
  PLAYERS_REQUIRED,
  STARTING_POSITIONS,
} from './constants';

let bulletIdCounter = 0;

export class GameEngine {
  roomCode: string;
  players: Map<string, Player> = new Map();
  bullets: Bullet[] = [];
  tick = 0;
  status: RoomStatus = 'waiting';
  private inputs: Map<string, { dx: number; dy: number }> = new Map();
  private eliminationOrder: string[] = []; // socket ids in elimination order

  constructor(roomCode: string) {
    this.roomCode = roomCode;
  }

  // --------------------------------------------------------
  // Player management
  // --------------------------------------------------------
  addPlayer(socketId: string, discord_id: string, username: string): boolean {
    if (this.players.size >= PLAYERS_REQUIRED) return false;
    if (this.status !== 'waiting') return false;

    const pos = STARTING_POSITIONS[this.players.size];
    this.players.set(socketId, {
      id: socketId,
      discord_id,
      username,
      x: pos.x,
      y: pos.y,
      radius: PLAYER_RADIUS,
      alive: true,
      ready: false,
      eliminatedAt: null,
    });
    return true;
  }

  removePlayer(socketId: string): void {
    const player = this.players.get(socketId);
    if (!player) return;

    if (this.status === 'waiting') {
      this.players.delete(socketId);
      // Reassign starting positions for remaining players
      const remaining = Array.from(this.players.values());
      remaining.forEach((p, i) => {
        const pos = STARTING_POSITIONS[i];
        p.x = pos.x;
        p.y = pos.y;
      });
    } else if (this.status === 'playing') {
      this.eliminatePlayer(socketId);
      // Check win condition after disconnect elimination
      if (this.getAlivePlayers().length <= 1) {
        this.status = 'finished';
      }
    }
  }

  setReady(socketId: string): boolean {
    const player = this.players.get(socketId);
    if (!player) return false;
    player.ready = true;
    return this.allReady();
  }

  allReady(): boolean {
    if (this.players.size < PLAYERS_REQUIRED) return false;
    return Array.from(this.players.values()).every((p) => p.ready);
  }

  startGame(): void {
    this.status = 'playing';
    this.tick = 0;
    this.bullets = [];
    this.eliminationOrder = [];
  }

  // --------------------------------------------------------
  // Input
  // --------------------------------------------------------
  queueInput(socketId: string, dx: number, dy: number): void {
    // Normalize and cap magnitude
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    this.inputs.set(socketId, { dx, dy });
  }

  // --------------------------------------------------------
  // Tick — main game loop iteration
  // --------------------------------------------------------
  doTick(): { hits: Player[] } {
    this.tick++;
    const hits: Player[] = [];

    // 1. Process inputs
    for (const [socketId, input] of this.inputs) {
      const player = this.players.get(socketId);
      if (!player || !player.alive) continue;

      player.x += input.dx * PLAYER_SPEED;
      player.y += input.dy * PLAYER_SPEED;

      // Clamp to field
      player.x = clamp(player.x, player.radius, FIELD_WIDTH - player.radius);
      player.y = clamp(player.y, player.radius, FIELD_HEIGHT - player.radius);
    }
    this.inputs.clear();

    // 2. Player-player knockback
    const alivePlayers = this.getAlivePlayers();
    for (let i = 0; i < alivePlayers.length; i++) {
      for (let j = i + 1; j < alivePlayers.length; j++) {
        const a = alivePlayers[i];
        const b = alivePlayers[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const minDist = a.radius + b.radius;
        if (dist < minDist && dist > 0) {
          const nx = (b.x - a.x) / dist;
          const ny = (b.y - a.y) / dist;
          const pushDist = KNOCKBACK / 2;
          a.x -= nx * pushDist;
          a.y -= ny * pushDist;
          b.x += nx * pushDist;
          b.y += ny * pushDist;
          // Clamp after knockback
          a.x = clamp(a.x, a.radius, FIELD_WIDTH - a.radius);
          a.y = clamp(a.y, a.radius, FIELD_HEIGHT - a.radius);
          b.x = clamp(b.x, b.radius, FIELD_WIDTH - b.radius);
          b.y = clamp(b.y, b.radius, FIELD_HEIGHT - b.radius);
        }
      }
    }

    // 3. Spawn bullets
    this.spawnBullets();

    // 4. Move bullets
    for (const bullet of this.bullets) {
      bullet.x += bullet.dx;
      bullet.y += bullet.dy;
    }

    // 5. Remove off-screen bullets
    const margin = 50;
    this.bullets = this.bullets.filter(
      (b) =>
        b.x > -margin &&
        b.x < FIELD_WIDTH + margin &&
        b.y > -margin &&
        b.y < FIELD_HEIGHT + margin
    );

    // 6. Collision: player vs bullet
    for (const player of alivePlayers) {
      for (const bullet of this.bullets) {
        if (checkCollision(player, bullet)) {
          this.eliminatePlayer(player.id);
          hits.push(player);
          break; // one hit is enough to eliminate
        }
      }
    }

    // 7. Check win condition
    const remaining = this.getAlivePlayers();
    if (remaining.length <= 1) {
      this.status = 'finished';
    }

    return { hits };
  }

  // --------------------------------------------------------
  // Bullet spawning
  // --------------------------------------------------------
  private spawnBullets(): void {
    // Spawn interval decreases over time
    const interval = Math.max(
      BULLET_SPAWN_INTERVAL_MIN,
      BULLET_SPAWN_INTERVAL_TICKS - Math.floor(this.tick / 40)
    );
    if (this.tick % interval !== 0) return;

    // Number of bullets per wave increases over time
    const count = Math.min(
      BULLET_COUNT_MAX,
      BULLET_COUNT_PER_SPAWN + Math.floor(this.tick / 100)
    );

    // Speed increases slightly over time
    const speed = BULLET_BASE_SPEED + this.tick * 0.002;

    const cx = FIELD_WIDTH / 2;
    const cy = FIELD_HEIGHT / 2;
    const angleOffset = Math.random() * Math.PI * 2;

    for (let i = 0; i < count; i++) {
      const angle = angleOffset + (i * Math.PI * 2) / count;
      this.bullets.push({
        id: `b${bulletIdCounter++}`,
        x: cx,
        y: cy,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        radius: BULLET_RADIUS,
      });
    }
  }

  // --------------------------------------------------------
  // Helpers
  // --------------------------------------------------------
  private eliminatePlayer(socketId: string): void {
    const player = this.players.get(socketId);
    if (!player || !player.alive) return;
    player.alive = false;
    player.eliminatedAt = this.tick;
    this.eliminationOrder.push(socketId);
  }

  getAlivePlayers(): Player[] {
    return Array.from(this.players.values()).filter((p) => p.alive);
  }

  getWinner(): Player | null {
    const alive = this.getAlivePlayers();
    return alive.length === 1 ? alive[0] : null;
  }

  getState(): GameStatePayload {
    return {
      players: Array.from(this.players.values()).map(toPublic),
      bullets: this.bullets,
      elapsed: this.tick,
    };
  }

  getGameOverData(): GameOverPayload {
    const winner = this.getWinner();
    const allPlayers = Array.from(this.players.values());

    // Build placements: winner is 1st, then reverse elimination order
    const placements = allPlayers
      .map((p) => ({
        discord_id: p.discord_id,
        username: p.username,
        eliminatedAt: p.eliminatedAt,
        place: 0,
      }))
      .sort((a, b) => {
        // alive (null eliminatedAt) first, then later elimination = better
        if (a.eliminatedAt === null) return -1;
        if (b.eliminatedAt === null) return 1;
        return b.eliminatedAt - a.eliminatedAt;
      });
    placements.forEach((p, i) => (p.place = i + 1));

    return {
      winner: winner
        ? { discord_id: winner.discord_id, username: winner.username }
        : null,
      placements,
    };
  }
}

// ============================================================
// Utility functions
// ============================================================
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function checkCollision(
  a: { x: number; y: number; radius: number },
  b: { x: number; y: number; radius: number }
): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius;
}

function toPublic(p: Player): PlayerPublic {
  return {
    id: p.id,
    discord_id: p.discord_id,
    username: p.username,
    x: p.x,
    y: p.y,
    radius: p.radius,
    alive: p.alive,
    ready: p.ready,
  };
}
