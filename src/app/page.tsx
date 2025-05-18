
"use client";

import React, { useRef, useState, useCallback } from 'react';
import GameCanvas from '@/components/game/GameCanvas';
import TouchControls from '@/components/game/TouchControls';
import type { PlayerState, GameAction } from '@/types/game';
import GameHeader from '@/components/game/GameHeader';

export default function PlatformerPage() {
  const playerRef = useRef<PlayerState | null>(null);
  const [executeAction, setExecuteAction] = useState<GameAction | null>(null);

  const handlePlayerAction = useCallback((action: GameAction) => {
    setExecuteAction(action);
  }, []);

  const resetExecuteAction = useCallback(() => {
    setExecuteAction(null);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <GameHeader />

      <main className="flex-grow flex flex-col w-full pb-16">
        
        <div className="relative w-full flex-grow">
          <GameCanvas 
            levelPath="/levels/level2.json" // Changed to level2.json
            onPlayerAction={handlePlayerAction}
            playerRef={playerRef}
            executeAction={executeAction}
            resetExecuteAction={resetExecuteAction}
          />
        </div>
      </main>
      
      <TouchControls onAction={handlePlayerAction} />
    </div>
  );
}
