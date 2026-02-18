'use client';

import { RoomStatePayload } from '@/lib/types';
import { PLAYERS_REQUIRED } from '@/lib/constants';
import { motion, AnimatePresence } from 'framer-motion';

interface LobbyProps {
  roomState: RoomStatePayload;
  onReady: () => void;
  currentSocketId: string | null;
}

export default function Lobby({ roomState, onReady, currentSocketId }: LobbyProps) {
  const currentPlayer = roomState.players.find((p) => p.id === currentSocketId);
  const isReady = currentPlayer?.ready ?? false;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-white relative z-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-indigo-950/60 border border-indigo-500/20 rounded-2xl p-8 w-full max-w-md shadow-xl backdrop-blur-sm"
      >
        <h1 className="text-2xl font-bold text-center mb-2 text-indigo-100">NyaaGenesis</h1>

        {/* Room Code */}
        <div className="text-center mb-6">
          <p className="text-indigo-300/70 text-sm">ルームID</p>
          <p className="text-4xl font-mono font-bold tracking-widest text-yellow-400">
            {roomState.roomCode}
          </p>
        </div>

        {/* Player Count */}
        <p className="text-center text-indigo-300/70 mb-4">
          {roomState.players.length} / {PLAYERS_REQUIRED} players
        </p>

        {/* Player List */}
        <ul className="space-y-2 mb-6">
          <AnimatePresence mode="popLayout">
            {roomState.players.map((player) => (
              <motion.li
                key={player.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                className={`flex items-center justify-between px-4 py-2 rounded-lg ${
                  player.id === currentSocketId
                    ? 'bg-indigo-800/50 border border-indigo-400/40'
                    : 'bg-indigo-900/40 border border-indigo-500/10'
                }`}
              >
                <span className="font-medium">
                  {player.username}
                  {player.id === currentSocketId && (
                    <span className="text-indigo-300 text-sm ml-2">（あなた）</span>
                  )}
                </span>
                <span
                  className={`text-sm font-semibold ${
                    player.ready ? 'text-green-400' : 'text-indigo-400/50'
                  }`}
                >
                  {player.ready ? 'READY' : '準備中...'}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
          {/* Empty slots */}
          {Array.from({ length: PLAYERS_REQUIRED - roomState.players.length }).map(
            (_, i) => (
              <li
                key={`empty-${i}`}
                className="flex items-center justify-center px-4 py-2 rounded-lg bg-indigo-900/20 border border-indigo-500/10 text-indigo-400/40"
              >
                プレイヤーを待っています...
              </li>
            )
          )}
        </ul>

        {/* Ready Button */}
        <button
          onClick={onReady}
          disabled={isReady}
          className={`w-full py-3 rounded-lg font-bold text-lg transition-colors ${
            isReady
              ? 'bg-green-900/50 text-green-300/70 cursor-not-allowed border border-green-500/20'
              : 'bg-green-600 hover:bg-green-500 text-white cursor-pointer'
          }`}
        >
          {isReady ? '他のプレイヤーを待っています...' : 'READY'}
        </button>

        {roomState.players.length < PLAYERS_REQUIRED && (
          <p className="text-center text-indigo-400/50 text-sm mt-4">
            ルームIDを友達に共有しよう！
          </p>
        )}
      </motion.div>
    </div>
  );
}
