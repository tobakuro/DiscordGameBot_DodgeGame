'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { useInput } from '@/hooks/useInput';
import Lobby from '@/components/Lobby';
import GameCanvas from '@/components/GameCanvas';
import GameOver from '@/components/GameOver';

export default function DodgePage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.roomCode as string;

  const [joined, setJoined] = useState(false);

  const {
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
  } = useSocket(roomCode);

  // Auto-join on connect
  useEffect(() => {
    if (!connected || joined) return;

    const discord_id = sessionStorage.getItem('discord_id');
    const username = sessionStorage.getItem('username');

    if (!discord_id || !username) {
      router.push('/');
      return;
    }

    join(discord_id, username);
    setJoined(true);
  }, [connected, joined, join, router]);

  // Enable input only during gameplay
  useInput(sendInput, gameStatus === 'playing' && countdown === null);

  // Connection / error states
  if (!connected) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400">
        Connecting...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-red-400 text-lg">{error}</p>
        <button
          onClick={() => router.push('/')}
          className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors cursor-pointer"
        >
          Back to Home
        </button>
      </div>
    );
  }

  // Waiting / Lobby
  if (gameStatus === 'waiting' && roomState) {
    return (
      <Lobby
        roomState={roomState}
        onReady={sendReady}
        currentSocketId={socketId}
      />
    );
  }

  // Playing
  if (gameStatus === 'playing') {
    return (
      <GameCanvas
        gameState={gameState}
        prevGameState={prevGameState}
        currentSocketId={socketId}
        countdown={countdown}
      />
    );
  }

  // Finished
  if (gameStatus === 'finished' && gameOverData) {
    return <GameOver data={gameOverData} currentSocketId={socketId} />;
  }

  return (
    <div className="flex items-center justify-center min-h-screen text-gray-400">
      Loading...
    </div>
  );
}
