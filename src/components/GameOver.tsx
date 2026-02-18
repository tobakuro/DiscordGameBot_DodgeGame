'use client';

import { GameOverPayload } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

interface GameOverProps {
  data: GameOverPayload;
  currentSocketId: string | null;
}

const PLACE_LABELS = ['1位', '2位', '3位'];
const PLACE_COLORS = ['text-yellow-400', 'text-gray-300', 'text-orange-400'];

export default function GameOver({ data }: GameOverProps) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-white relative z-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-indigo-950/60 border border-indigo-500/20 rounded-2xl p-8 w-full max-w-md shadow-xl backdrop-blur-sm"
      >
        <h1 className="text-3xl font-bold text-center mb-2 text-indigo-100">リザルト</h1>

        {/* Winner */}
        {data.winner ? (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3, type: 'spring', stiffness: 200 }}
            className="text-center mb-6"
          >
            <p className="text-yellow-400 text-5xl mb-2">&#x1F3C6;</p>
            <p className="text-xl font-bold text-yellow-400">
              {data.winner.username} の勝利！
            </p>
          </motion.div>
        ) : (
          <div className="text-center mb-6">
            <p className="text-xl font-bold text-indigo-300/70">ドロー</p>
          </div>
        )}

        {/* Placements */}
        <ul className="space-y-2 mb-6">
          {data.placements.map((p, i) => (
            <motion.li
              key={`${p.discord_id}-${i}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.4 + i * 0.1 }}
              className="flex items-center justify-between px-4 py-3 rounded-lg bg-indigo-900/40 border border-indigo-500/10"
            >
              <div className="flex items-center gap-3">
                <span className={`font-bold text-lg ${PLACE_COLORS[i] || 'text-white'}`}>
                  {PLACE_LABELS[i] || `${i + 1}位`}
                </span>
                <span className="font-medium">{p.username}</span>
              </div>
            </motion.li>
          ))}
        </ul>

        {/* Back button */}
        <button
          onClick={() => router.push('/')}
          className="w-full py-3 rounded-lg font-bold text-lg bg-indigo-600 hover:bg-indigo-500 transition-colors cursor-pointer"
        >
          ホームに戻る
        </button>
      </motion.div>
    </div>
  );
}
