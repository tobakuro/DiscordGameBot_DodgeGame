'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  RoomStatePayload,
  GameStatePayload,
  GameStartPayload,
  GameOverPayload,
  RoomStatus,
} from '@/lib/types';

interface UseSocketReturn {
  connected: boolean;
  roomState: RoomStatePayload | null;
  gameState: GameStatePayload | null;
  prevGameState: GameStatePayload | null;
  gameStatus: RoomStatus;
  gameOverData: GameOverPayload | null;
  countdown: number | null;
  error: string | null;
  join: (discord_id: string, username: string) => void;
  sendReady: () => void;
  sendInput: (dx: number, dy: number) => void;
  socketId: string | null;
}

export function useSocket(roomCode: string): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [roomState, setRoomState] = useState<RoomStatePayload | null>(null);
  const [gameState, setGameState] = useState<GameStatePayload | null>(null);
  const [prevGameState, setPrevGameState] = useState<GameStatePayload | null>(null);
  const [gameStatus, setGameStatus] = useState<RoomStatus>('waiting');
  const [gameOverData, setGameOverData] = useState<GameOverPayload | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [socketId, setSocketId] = useState<string | null>(null);

  useEffect(() => {
    const socket = io({ autoConnect: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setSocketId(socket.id ?? null);
    });

    socket.on('disconnect', () => {
      setConnected(false);
      setSocketId(null);
    });

    socket.on('room_state', (data: RoomStatePayload) => {
      setRoomState(data);
      setGameStatus(data.status);
    });

    socket.on('game_start', (data: GameStartPayload) => {
      setGameStatus('playing');
      setCountdown(data.countdown);
      // Countdown timer
      let remaining = data.countdown;
      const interval = setInterval(() => {
        remaining--;
        setCountdown(remaining);
        if (remaining <= 0) {
          clearInterval(interval);
          setCountdown(null);
        }
      }, 1000);
    });

    socket.on('game_state', (data: GameStatePayload) => {
      setPrevGameState((prev) => prev);
      setGameState((prev) => {
        setPrevGameState(prev);
        return data;
      });
    });

    socket.on('player_hit', () => {
      // Could add visual/audio feedback here
    });

    socket.on('game_over', (data: GameOverPayload) => {
      setGameStatus('finished');
      setGameOverData(data);
    });

    socket.on('room_error', (data: { message: string }) => {
      setError(data.message);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomCode]);

  const join = useCallback(
    (discord_id: string, username: string) => {
      socketRef.current?.emit('join', { roomCode, discord_id, username });
    },
    [roomCode]
  );

  const sendReady = useCallback(() => {
    socketRef.current?.emit('ready');
  }, []);

  const sendInput = useCallback((dx: number, dy: number) => {
    socketRef.current?.emit('input', { dx, dy });
  }, []);

  return {
    connected,
    roomState,
    gameState,
    prevGameState,
    gameStatus,
    gameOverData,
    countdown,
    error,
    join,
    sendReady,
    sendInput,
    socketId,
  };
}
