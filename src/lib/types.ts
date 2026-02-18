// ============================================================
// Player
// ============================================================
export interface Player {
  id: string;          // socket.id
  discord_id: string;
  username: string;
  x: number;
  y: number;
  vx: number;          // velocity per tick
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  invincibleUntil: number | null;
  alive: boolean;
  ready: boolean;
  eliminatedAt: number | null; // tick when eliminated
}

// Subset sent to clients
export interface PlayerPublic {
  id: string;
  discord_id: string;
  username: string;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  ready: boolean;
}

// ============================================================
// Item (knockback)
// ============================================================
export interface Item {
  id: string;
  x: number;
  y: number;
  radius: number;
  heldBy: string | null; // socket.id of holder, null if on field
}

// ============================================================
// Bullet
// ============================================================
export interface Bullet {
  id: string;
  x: number;
  y: number;
  dx: number;  // velocity per tick
  dy: number;
  radius: number;
}

// ============================================================
// Room / Game status
// ============================================================
export type RoomStatus = 'waiting' | 'playing' | 'finished';

// ============================================================
// Socket.IO — Client → Server
// ============================================================
export interface JoinPayload {
  roomCode: string;
  username: string;
  auth_code: string;
}

export interface InputPayload {
  dx: number; // -1 ~ 1
  dy: number; // -1 ~ 1
}

// ready has no payload

// ============================================================
// Socket.IO — Server → Client
// ============================================================
export interface RoomStatePayload {
  roomCode: string;
  players: PlayerPublic[];
  status: RoomStatus;
}

export interface GameStartPayload {
  countdown: number; // seconds
}

export interface GameStatePayload {
  players: PlayerPublic[];
  bullets: Bullet[];
  items: Item[];
  elapsed: number; // ticks since game start
}

export interface PlayerHitPayload {
  discord_id: string;
  username: string;
  remaining: number;    // alive players count
  hp_remaining: number; // hit player's remaining HP
}

export interface GameOverPayload {
  winner: { discord_id: string; username: string } | null;
  placements: Array<{
    discord_id: string;
    username: string;
    place: number;        // 1 = winner
    eliminatedAt: number | null;
  }>;
}

// ============================================================
// Django API
// ============================================================
export interface DjangoLoginRequest {
  username: string;
  password: string;
}

export interface DjangoLoginResponse {
  token: string;
}

export interface DjangoPlayerPayload {
  discord_id: string;
  username: string;
}
