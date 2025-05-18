
"use client";

import React, { useRef, useState, useCallback } from 'react';
import GameCanvas from '@/components/game/GameCanvas';
import TouchControls from '@/components/game/TouchControls';
import type { PlayerState, GameAction } from '@/types/game';
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'; // Removed Card imports
// import { AlertTriangle } from 'lucide-react'; // Removed AlertTriangle import
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

      {/* Removed overflow-hidden from main to allow content to scroll if it exceeds available height, ensuring flex-grow on canvas container works */}
      <main className="flex-grow flex flex-col items-center w-full p-4">
        {/* Removed Informational Card */}
        
        <div className="relative w-full max-w-4xl flex-grow">
          <GameCanvas 
            levelPath="/levels/level1.json" 
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
