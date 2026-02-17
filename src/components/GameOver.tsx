'use client';

import { GameOverPayload } from '@/lib/types';
import { useRouter } from 'next/navigation';

interface GameOverProps {
  data: GameOverPayload;
  currentSocketId: string | null;
}

const PLACE_LABELS = ['1st', '2nd', '3rd'];
const PLACE_COLORS = ['text-yellow-400', 'text-gray-300', 'text-orange-400'];

export default function GameOver({ data }: GameOverProps) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-md shadow-xl">
        <h1 className="text-3xl font-bold text-center mb-2">Game Over</h1>

        {/* Winner */}
        {data.winner ? (
          <div className="text-center mb-6">
            <p className="text-yellow-400 text-5xl mb-2">&#x1F3C6;</p>
            <p className="text-xl font-bold text-yellow-400">
              {data.winner.username} Wins!
            </p>
          </div>
        ) : (
          <div className="text-center mb-6">
            <p className="text-xl font-bold text-gray-400">Draw!</p>
          </div>
        )}

        {/* Placements */}
        <ul className="space-y-2 mb-6">
          {data.placements.map((p, i) => (
            <li
              key={p.discord_id}
              className="flex items-center justify-between px-4 py-3 rounded-lg bg-gray-700"
            >
              <div className="flex items-center gap-3">
                <span className={`font-bold text-lg ${PLACE_COLORS[i] || 'text-white'}`}>
                  {PLACE_LABELS[i] || `${i + 1}th`}
                </span>
                <span className="font-medium">{p.username}</span>
              </div>
            </li>
          ))}
        </ul>

        {/* Back button */}
        <button
          onClick={() => router.push('/')}
          className="w-full py-3 rounded-lg font-bold text-lg bg-blue-600 hover:bg-blue-500 transition-colors cursor-pointer"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
