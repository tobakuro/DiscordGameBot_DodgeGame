'use client';

import { RoomStatePayload } from '@/lib/types';
import { PLAYERS_REQUIRED } from '@/lib/constants';

interface LobbyProps {
  roomState: RoomStatePayload;
  onReady: () => void;
  currentSocketId: string | null;
}

export default function Lobby({ roomState, onReady, currentSocketId }: LobbyProps) {
  const currentPlayer = roomState.players.find((p) => p.id === currentSocketId);
  const isReady = currentPlayer?.ready ?? false;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-md shadow-xl">
        <h1 className="text-2xl font-bold text-center mb-2">Dodge Game</h1>

        {/* Room Code */}
        <div className="text-center mb-6">
          <p className="text-gray-400 text-sm">Room Code</p>
          <p className="text-4xl font-mono font-bold tracking-widest text-yellow-400">
            {roomState.roomCode}
          </p>
        </div>

        {/* Player Count */}
        <p className="text-center text-gray-400 mb-4">
          {roomState.players.length} / {PLAYERS_REQUIRED} players
        </p>

        {/* Player List */}
        <ul className="space-y-2 mb-6">
          {roomState.players.map((player) => (
            <li
              key={player.id}
              className={`flex items-center justify-between px-4 py-2 rounded-lg ${
                player.id === currentSocketId
                  ? 'bg-blue-900/50 border border-blue-500'
                  : 'bg-gray-700'
              }`}
            >
              <span className="font-medium">
                {player.username}
                {player.id === currentSocketId && (
                  <span className="text-blue-400 text-sm ml-2">(You)</span>
                )}
              </span>
              <span
                className={`text-sm font-semibold ${
                  player.ready ? 'text-green-400' : 'text-gray-500'
                }`}
              >
                {player.ready ? 'READY' : 'NOT READY'}
              </span>
            </li>
          ))}
          {/* Empty slots */}
          {Array.from({ length: PLAYERS_REQUIRED - roomState.players.length }).map(
            (_, i) => (
              <li
                key={`empty-${i}`}
                className="flex items-center justify-center px-4 py-2 rounded-lg bg-gray-700/50 text-gray-600"
              >
                Waiting for player...
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
              ? 'bg-green-800 text-green-300 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-500 text-white cursor-pointer'
          }`}
        >
          {isReady ? 'Waiting for others...' : 'READY'}
        </button>

        {roomState.players.length < PLAYERS_REQUIRED && (
          <p className="text-center text-gray-500 text-sm mt-4">
            Share the room code with your friends!
          </p>
        )}
      </div>
    </div>
  );
}
