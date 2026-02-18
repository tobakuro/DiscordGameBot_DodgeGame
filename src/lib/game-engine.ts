import {
  Player,
  Bullet,
  Item,
  PlayerPublic,
  GameStatePayload,
  GameOverPayload,
  RoomStatus,
} from './types';
import {
  FIELD_WIDTH,
  FIELD_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_MAX_SPEED,
  PLAYER_ACCEL,
  PLAYER_FRICTION,
  KNOCKBACK,
  BULLET_RADIUS,
  BULLET_BASE_SPEED,
  BULLET_SPAWN_INTERVAL_TICKS,
  BULLET_SPAWN_INTERVAL_MIN,
  BULLET_COUNT_PER_SPAWN,
  BULLET_COUNT_MAX,
  PLAYERS_REQUIRED,
  PLAYER_MAX_HP,
  INVINCIBILITY_TICKS,
  STARTING_POSITIONS,
  ITEM_RADIUS,
  ITEM_SPAWN_INTERVAL_TICKS,
  ITEM_MAX_ON_FIELD,
  ITEM_KNOCKBACK,
  ITEM_HELD_DURATION_TICKS,
} from './constants';

let bulletIdCounter = 0;
let itemIdCounter = 0;

export class GameEngine {
  roomCode: string;
  players: Map<string, Player> = new Map();
  bullets: Bullet[] = [];
  items: Item[] = [];
  // track when each held item expires: itemId → expiry tick
  private itemExpiry: Map<string, number> = new Map();
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
      vx: 0,
      vy: 0,
      radius: PLAYER_RADIUS,
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      invincibleUntil: null,
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
    this.items = [];
    this.itemExpiry = new Map();
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

    // 1. Process inputs — acceleration / friction based movement
    for (const player of this.players.values()) {
      if (!player.alive) continue;

      const input = this.inputs.get(player.id);
      const hasInput = input && (input.dx !== 0 || input.dy !== 0);

      if (hasInput) {
        // Accelerate toward input direction
        player.vx += input.dx * PLAYER_ACCEL;
        player.vy += input.dy * PLAYER_ACCEL;
      } else {
        // Apply friction (decelerate) when no input
        player.vx *= PLAYER_FRICTION;
        player.vy *= PLAYER_FRICTION;
        // Stop completely if very slow
        if (Math.abs(player.vx) < 0.05) player.vx = 0;
        if (Math.abs(player.vy) < 0.05) player.vy = 0;
      }

      // Cap to max speed
      const speed = Math.hypot(player.vx, player.vy);
      if (speed > PLAYER_MAX_SPEED) {
        player.vx = (player.vx / speed) * PLAYER_MAX_SPEED;
        player.vy = (player.vy / speed) * PLAYER_MAX_SPEED;
      }

      // Apply velocity
      player.x += player.vx;
      player.y += player.vy;

      // Clamp to field & zero out velocity on wall hit
      if (player.x < player.radius) { player.x = player.radius; player.vx = 0; }
      if (player.x > FIELD_WIDTH - player.radius) { player.x = FIELD_WIDTH - player.radius; player.vx = 0; }
      if (player.y < player.radius) { player.y = player.radius; player.vy = 0; }
      if (player.y > FIELD_HEIGHT - player.radius) { player.y = FIELD_HEIGHT - player.radius; player.vy = 0; }
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

    // 6. Collision: player vs bullet (HP system with invincibility)
    for (const player of alivePlayers) {
      // Skip invincible players
      if (player.invincibleUntil !== null && this.tick <= player.invincibleUntil) {
        continue;
      }

      for (const bullet of this.bullets) {
        if (checkCollision(player, bullet)) {
          player.hp -= 1;
          player.invincibleUntil = this.tick + INVINCIBILITY_TICKS;

          if (player.hp <= 0) {
            this.eliminatePlayer(player.id);
          }

          hits.push(player);
          break; // one bullet per tick per player
        }
      }
    }

    // 7. Item logic
    this.processItems(alivePlayers);

    // 8. Check win condition
    const remaining = this.getAlivePlayers();
    if (remaining.length <= 1) {
      this.status = 'finished';
    }

    return { hits };
  }

  // --------------------------------------------------------
  // Item processing
  // --------------------------------------------------------
  private processItems(alivePlayers: Player[]): void {
    // Expire held items
    for (const item of this.items) {
      if (item.heldBy !== null) {
        const expiry = this.itemExpiry.get(item.id);
        if (expiry !== undefined && this.tick >= expiry) {
          item.heldBy = null;
          this.itemExpiry.delete(item.id);
        }
      }
    }

    // Remove expired (no longer held, already used) — items on field stay until picked up
    // Items that were held and expired become null heldBy but stay until removed below
    this.items = this.items.filter((item) => {
      // Remove if held and expired (heldBy already cleared above, so remove orphans)
      if (item.heldBy === null && !this.itemExpiry.has(item.id)) {
        // If it was never picked up it's still on the field — keep it
        // We track "was ever held" by checking expiry map; if absent and heldBy null it's on field
        return true;
      }
      return true;
    });
    // Simpler: just remove items whose expiry tick has passed and heldBy is null
    // (already cleaned above). Keep field items indefinitely until picked up.

    // Spawn new items
    const fieldItems = this.items.filter((i) => i.heldBy === null && !this.itemExpiry.has(i.id));
    if (
      fieldItems.length < ITEM_MAX_ON_FIELD &&
      this.tick % ITEM_SPAWN_INTERVAL_TICKS === 0 &&
      this.tick > 0
    ) {
      const margin = 60;
      this.items.push({
        id: `item${itemIdCounter++}`,
        x: margin + Math.random() * (FIELD_WIDTH - margin * 2),
        y: margin + Math.random() * (FIELD_HEIGHT - margin * 2),
        radius: ITEM_RADIUS,
        heldBy: null,
      });
    }

    // Pickup: player touches field item
    for (const item of this.items) {
      if (item.heldBy !== null) continue;
      if (this.itemExpiry.has(item.id)) continue; // expired, being cleaned
      for (const player of alivePlayers) {
        if (checkCollision(player, item)) {
          item.heldBy = player.id;
          this.itemExpiry.set(item.id, this.tick + ITEM_HELD_DURATION_TICKS);
          break;
        }
      }
    }

    // Use: holder collides with another alive player → knockback
    for (const item of this.items) {
      if (item.heldBy === null) continue;
      const holder = this.players.get(item.heldBy);
      if (!holder || !holder.alive) continue;

      // Move item to holder position
      item.x = holder.x;
      item.y = holder.y;

      for (const other of alivePlayers) {
        if (other.id === holder.id) continue;
        if (checkCollision(holder, other)) {
          // Apply knockback to the other player away from holder
          const dist = Math.hypot(other.x - holder.x, other.y - holder.y) || 1;
          const nx = (other.x - holder.x) / dist;
          const ny = (other.y - holder.y) / dist;
          other.x = clamp(other.x + nx * ITEM_KNOCKBACK, other.radius, FIELD_WIDTH - other.radius);
          other.y = clamp(other.y + ny * ITEM_KNOCKBACK, other.radius, FIELD_HEIGHT - other.radius);
          other.vx = nx * 6;
          other.vy = ny * 6;

          // Consume item
          item.heldBy = null;
          this.itemExpiry.delete(item.id);
          // Mark item as used (remove from list)
          this.items = this.items.filter((i) => i.id !== item.id);
          break;
        }
      }
    }

    // Remove used items (heldBy null and expiry gone and not on field originally)
    // Field items stay visible; held-then-expired items are already cleaned
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
      items: this.items.filter((i) => i.heldBy === null),
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
    hp: p.hp,
    maxHp: p.maxHp,
    alive: p.alive,
    ready: p.ready,
  };
}
