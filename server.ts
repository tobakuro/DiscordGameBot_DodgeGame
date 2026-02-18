import { createServer } from 'http';
import next from 'next';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { GameEngine } from './src/lib/game-engine';
import {
  JoinPayload,
  InputPayload,
  RoomStatePayload,
  PlayerPublic,
} from './src/lib/types';
import {
  TICK_INTERVAL,
  ROOM_WAIT_TIMEOUT,
  ROOM_CLEANUP_DELAY,
  COUNTDOWN_SECONDS,
} from './src/lib/constants';

// ============================================================
// Configuration
// ============================================================
const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const DJANGO_API_URL = process.env.DJANGO_API_URL || 'http://localhost:8000';
const DJANGO_ADMIN_USERNAME = process.env.DJANGO_ADMIN_USERNAME || 'admin';
const DJANGO_ADMIN_PASSWORD = process.env.DJANGO_ADMIN_PASSWORD || 'password';

let djangoToken: string | null = null;

// ============================================================
// Room management
// ============================================================
interface Room {
  code: string;
  engine: GameEngine;
  sockets: Map<string, Socket>;
  tickInterval: ReturnType<typeof setInterval> | null;
  waitTimeout: ReturnType<typeof setTimeout> | null;
  cleanupTimeout: ReturnType<typeof setTimeout> | null;
}

const rooms = new Map<string, Room>();

function getOrCreateRoom(roomCode: string): Room {
  let room = rooms.get(roomCode);
  if (!room) {
    room = {
      code: roomCode,
      engine: new GameEngine(roomCode),
      sockets: new Map(),
      tickInterval: null,
      waitTimeout: null,
      cleanupTimeout: null,
    };
    rooms.set(roomCode, room);
    // Start wait timeout
    room.waitTimeout = setTimeout(() => {
      dissolveRoom(roomCode, 'Room timed out waiting for players.');
    }, ROOM_WAIT_TIMEOUT);
  }
  return room;
}

function dissolveRoom(roomCode: string, reason: string): void {
  const room = rooms.get(roomCode);
  if (!room) return;
  // Notify all sockets
  for (const s of room.sockets.values()) {
    s.emit('room_error', { message: reason });
    s.leave(roomCode);
  }
  cleanupRoom(roomCode);
}

function cleanupRoom(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (!room) return;
  if (room.tickInterval) clearInterval(room.tickInterval);
  if (room.waitTimeout) clearTimeout(room.waitTimeout);
  if (room.cleanupTimeout) clearTimeout(room.cleanupTimeout);
  rooms.delete(roomCode);
}

function broadcastRoomState(room: Room, io: SocketIOServer): void {
  const players: PlayerPublic[] = Array.from(room.engine.players.values()).map(
    (p) => ({
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
    })
  );
  const payload: RoomStatePayload = {
    roomCode: room.code,
    players,
    status: room.engine.status,
  };
  io.to(room.code).emit('room_state', payload);
}

// ============================================================
// Game loop
// ============================================================
function startGameLoop(room: Room, io: SocketIOServer): void {
  room.engine.startGame();

  room.tickInterval = setInterval(() => {
    const { hits } = room.engine.doTick();

    // Broadcast game state
    io.to(room.code).emit('game_state', room.engine.getState());

    // Notify about eliminations
    for (const hit of hits) {
      io.to(room.code).emit('player_hit', {
        discord_id: hit.discord_id,
        username: hit.username,
        remaining: room.engine.getAlivePlayers().length,
        hp_remaining: hit.hp,
      });
    }

    // Check if game ended
    if (room.engine.status === 'finished') {
      if (room.tickInterval) clearInterval(room.tickInterval);
      room.tickInterval = null;

      const gameOverData = room.engine.getGameOverData();
      io.to(room.code).emit('game_over', gameOverData);

      // Report to Django API
      reportGameResult(room).catch((err) =>
        console.error('Failed to report game result:', err)
      );

      // Schedule cleanup
      room.cleanupTimeout = setTimeout(() => {
        cleanupRoom(room.code);
      }, ROOM_CLEANUP_DELAY);
    }
  }, TICK_INTERVAL);
}

// ============================================================
// Django API integration
// ============================================================
async function loginToDjango(): Promise<void> {
  try {
    const res = await fetch(`${DJANGO_API_URL}/api/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: DJANGO_ADMIN_USERNAME,
        password: DJANGO_ADMIN_PASSWORD,
      }),
    });
    if (!res.ok) {
      console.warn(`Django login failed (${res.status}). Game results will not be reported.`);
      return;
    }
    const data = (await res.json()) as { token: string };
    djangoToken = data.token;
    console.log('Django API login successful.');
  } catch (err) {
    console.warn('Could not connect to Django API. Game results will not be reported.', err);
  }
}

async function reportGameResult(room: Room): Promise<void> {
  if (!djangoToken) {
    console.warn('No Django token. Skipping result report.');
    return;
  }

  const players = Array.from(room.engine.players.values());
  const winner = room.engine.getWinner();
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Token ${djangoToken}`,
  };

  // Report play for all players
  for (const p of players) {
    try {
      await fetch(`${DJANGO_API_URL}/api/dodge/play/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ discord_id: p.discord_id, username: p.username }),
      });
    } catch (err) {
      console.error(`Failed to report play for ${p.username}:`, err);
    }
  }

  // Report win
  if (winner) {
    try {
      await fetch(`${DJANGO_API_URL}/api/dodge/win/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          discord_id: winner.discord_id,
          username: winner.username,
        }),
      });
    } catch (err) {
      console.error(`Failed to report win for ${winner.username}:`, err);
    }
  }
}

// ============================================================
// Socket.IO — find room by socket
// ============================================================
const socketRoomMap = new Map<string, string>(); // socketId → roomCode

// ============================================================
// Main
// ============================================================
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // Login to Django API (non-blocking on failure)
  await loginToDjango();

  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
  });

  io.on('connection', (socket: Socket) => {
    // ------ JOIN ------
    socket.on('join', async (data: JoinPayload) => {
      const { roomCode, username, auth_code } = data;
      if (!roomCode || !username || !auth_code) {
        socket.emit('room_error', { message: '入力項目が不足しています。' });
        return;
      }

      // Verify auth_code with Django API
      let discord_id: string;
      let verified_username: string;
      try {
        const verifyRes = await fetch(`${DJANGO_API_URL}/api/dodge/verify/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, auth_code }),
        });
        if (!verifyRes.ok) {
          const errBody = await verifyRes.json().catch(() => ({})) as { message?: string };
          socket.emit('room_error', {
            message: errBody.message ?? '認証に失敗しました。認証コードを確認してください。',
          });
          return;
        }
        const verifyData = await verifyRes.json() as { discord_id: string; username: string };
        discord_id = verifyData.discord_id;
        verified_username = verifyData.username;
      } catch {
        socket.emit('room_error', { message: '認証サーバーに接続できませんでした。' });
        return;
      }

      const room = getOrCreateRoom(roomCode);

      if (room.engine.status !== 'waiting') {
        socket.emit('room_error', { message: 'ゲームはすでに進行中です。' });
        return;
      }

      const added = room.engine.addPlayer(socket.id, discord_id, verified_username);
      if (!added) {
        socket.emit('room_error', { message: 'ルームが満員です。' });
        return;
      }

      room.sockets.set(socket.id, socket);
      socketRoomMap.set(socket.id, roomCode);
      socket.join(roomCode);

      broadcastRoomState(room, io);
    });

    // ------ READY ------
    socket.on('ready', () => {
      const roomCode = socketRoomMap.get(socket.id);
      if (!roomCode) return;
      const room = rooms.get(roomCode);
      if (!room) return;

      const allReady = room.engine.setReady(socket.id);
      broadcastRoomState(room, io);

      if (allReady) {
        // Clear wait timeout
        if (room.waitTimeout) {
          clearTimeout(room.waitTimeout);
          room.waitTimeout = null;
        }

        // Countdown then start
        io.to(roomCode).emit('game_start', { countdown: COUNTDOWN_SECONDS });
        setTimeout(() => {
          startGameLoop(room, io);
        }, COUNTDOWN_SECONDS * 1000);
      }
    });

    // ------ INPUT ------
    socket.on('input', (data: InputPayload) => {
      const roomCode = socketRoomMap.get(socket.id);
      if (!roomCode) return;
      const room = rooms.get(roomCode);
      if (!room || room.engine.status !== 'playing') return;

      room.engine.queueInput(socket.id, data.dx, data.dy);
    });

    // ------ DISCONNECT ------
    socket.on('disconnect', () => {
      const roomCode = socketRoomMap.get(socket.id);
      if (!roomCode) return;
      const room = rooms.get(roomCode);
      if (!room) return;

      room.engine.removePlayer(socket.id);
      room.sockets.delete(socket.id);
      socketRoomMap.delete(socket.id);

      if (room.sockets.size === 0) {
        cleanupRoom(roomCode);
        return;
      }

      // removePlayer may cause status to change to 'finished'
      // so we need to re-read status after removal
      const statusAfterRemove = room.engine.status;
      if (statusAfterRemove === 'finished') {
        if (room.tickInterval) clearInterval(room.tickInterval);
        room.tickInterval = null;
        const gameOverData = room.engine.getGameOverData();
        io.to(roomCode).emit('game_over', gameOverData);
        reportGameResult(room).catch((err) =>
          console.error('Failed to report game result:', err)
        );
        room.cleanupTimeout = setTimeout(() => {
          cleanupRoom(roomCode);
        }, ROOM_CLEANUP_DELAY);
      } else if (statusAfterRemove === 'playing') {
        io.to(roomCode).emit('game_state', room.engine.getState());
      } else {
        broadcastRoomState(room, io);
      }
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
