'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function Home() {
  const router = useRouter();
  const [discordId, setDiscordId] = useState('');
  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!discordId.trim() || !username.trim() || !roomCode.trim()) {
      setError('All fields are required.');
      return;
    }
    // Store credentials in sessionStorage for the game page
    sessionStorage.setItem('discord_id', discordId.trim());
    sessionStorage.setItem('username', username.trim());
    router.push(`/dodge/${roomCode.trim().toUpperCase()}`);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen relative z-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-indigo-950/60 border border-indigo-500/20 rounded-2xl p-8 w-full max-w-md shadow-xl backdrop-blur-sm"
      >
        <h1 className="text-3xl font-bold text-center mb-2 text-indigo-100">
          Dodge Game
        </h1>
        <p className="text-indigo-300/70 text-center mb-6">
          3-player bullet dodge battle
        </p>

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-indigo-200 mb-1">
              Discord ID
            </label>
            <input
              type="text"
              value={discordId}
              onChange={(e) => setDiscordId(e.target.value)}
              placeholder="123456789"
              className="w-full px-4 py-2 rounded-lg bg-indigo-900/40 border border-indigo-500/30 text-white placeholder-indigo-400/40 focus:outline-none focus:border-indigo-400 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-indigo-200 mb-1">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Player1"
              className="w-full px-4 py-2 rounded-lg bg-indigo-900/40 border border-indigo-500/30 text-white placeholder-indigo-400/40 focus:outline-none focus:border-indigo-400 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-indigo-200 mb-1">
              Room Code
            </label>
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="ABC123"
              className="w-full px-4 py-2 rounded-lg bg-indigo-900/40 border border-indigo-500/30 text-white placeholder-indigo-400/40 focus:outline-none focus:border-indigo-400 uppercase transition-colors"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            className="w-full py-3 rounded-lg font-bold text-lg bg-indigo-600 hover:bg-indigo-500 transition-colors cursor-pointer"
          >
            Join Game
          </button>
        </form>
      </motion.div>
    </div>
  );
}
