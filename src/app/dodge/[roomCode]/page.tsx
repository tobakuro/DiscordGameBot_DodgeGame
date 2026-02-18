'use client';

import { useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { useInput } from '@/hooks/useInput';
import { AnimatePresence, motion } from 'framer-motion';
import Lobby from '@/components/Lobby';
import GameCanvas from '@/components/GameCanvas';
import GameOver from '@/components/GameOver';

export default function DodgePage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.roomCode as string;

  const joinedRef = useRef(false);

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
    if (!connected || joinedRef.current) return;

    const discord_id = sessionStorage.getItem('discord_id');
    const username = sessionStorage.getItem('username');

    if (!discord_id || !username) {
      router.push('/');
      return;
    }

    joinedRef.current = true;
    join(discord_id, username);
  }, [connected, join, router]);

  // Enable input only during gameplay
  useInput(sendInput, gameStatus === 'playing' && countdown === null);

  // Determine which view to render
  const getView = () => {
    if (!connected) {
      return (
        <motion.div
          key="connecting"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex items-center justify-center min-h-screen text-indigo-300/70"
        >
          Connecting...
        </motion.div>
      );
    }

    if (error) {
      return (
        <motion.div
          key="error"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex flex-col items-center justify-center min-h-screen gap-4"
        >
          <p className="text-red-400 text-lg">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors cursor-pointer"
          >
            Back to Home
          </button>
        </motion.div>
      );
    }

    if (gameStatus === 'waiting' && roomState) {
      return (
        <motion.div
          key="lobby"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Lobby
            roomState={roomState}
            onReady={sendReady}
            currentSocketId={socketId}
          />
        </motion.div>
      );
    }

    if (gameStatus === 'playing') {
      return (
        <motion.div
          key="playing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <GameCanvas
            gameState={gameState}
            prevGameState={prevGameState}
            currentSocketId={socketId}
            countdown={countdown}
            sendInput={sendInput}
          />
        </motion.div>
      );
    }

    if (gameStatus === 'finished' && gameOverData) {
      return (
        <motion.div
          key="finished"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <GameOver data={gameOverData} currentSocketId={socketId} />
        </motion.div>
      );
    }

    return (
      <motion.div
        key="loading"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex items-center justify-center min-h-screen text-indigo-300/70"
      >
        Loading...
      </motion.div>
    );
  };

  return (
    <AnimatePresence mode="wait">
      {getView()}
    </AnimatePresence>
  );
}
