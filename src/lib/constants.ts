// Server tick
export const TICK_RATE = 20;                    // Hz
export const TICK_INTERVAL = 1000 / TICK_RATE;  // 50ms

// Field
export const FIELD_WIDTH = 800;
export const FIELD_HEIGHT = 600;

// Player
export const PLAYER_RADIUS = 15;
export const PLAYER_MAX_SPEED = 4;   // px per tick (top speed)
export const PLAYER_ACCEL = 0.8;     // px/tick² acceleration when input held
export const PLAYER_FRICTION = 0.85; // velocity multiplier per tick when no input
export const KNOCKBACK = 8;          // px

// Bullet
export const BULLET_RADIUS = 5;
export const BULLET_BASE_SPEED = 3;             // px per tick
export const BULLET_SPAWN_INTERVAL_TICKS = 20;  // initial: every 20 ticks (1s)
export const BULLET_SPAWN_INTERVAL_MIN = 4;     // fastest: every 4 ticks (200ms)
export const BULLET_COUNT_PER_SPAWN = 3;        // initial bullets per spawn wave
export const BULLET_COUNT_MAX = 8;              // max bullets per spawn wave

// Room
export const PLAYERS_REQUIRED = 3;
export const ROOM_WAIT_TIMEOUT = 5 * 60 * 1000;    // 5 min
export const ROOM_CLEANUP_DELAY = 5 * 60 * 1000;   // 5 min after finish

// HP
export const PLAYER_MAX_HP = 3;
export const INVINCIBILITY_TICKS = 40; // 2 seconds at 20Hz

// Countdown
export const COUNTDOWN_SECONDS = 3;

// Item (knockback)
export const ITEM_RADIUS = 12;                   // px
export const ITEM_SPAWN_INTERVAL_TICKS = 100;    // every 5s at 20Hz
export const ITEM_MAX_ON_FIELD = 2;              // max simultaneous field items
export const ITEM_KNOCKBACK = 60;               // px — strong push on use
export const ITEM_HELD_DURATION_TICKS = 60;     // 3s window to use after pickup

// Starting positions (3 symmetric spots)
export const STARTING_POSITIONS = [
  { x: FIELD_WIDTH / 2, y: 80 },                    // top center
  { x: 120, y: FIELD_HEIGHT - 80 },                 // bottom left
  { x: FIELD_WIDTH - 120, y: FIELD_HEIGHT - 80 },   // bottom right
];
