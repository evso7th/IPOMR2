
"use client";

import React, { useRef, useState, useCallback, useEffect } from 'react';
import GameCanvas from '@/components/game/GameCanvas';
import TouchControls from '@/components/game/TouchControls';
import type { PlayerState, GameAction } from '@/types/game';
import GameHeader from '@/components/game/GameHeader';
import StartScreen from '@/components/game/screens/StartScreen';

export default function PlatformerPage() {
  const playerRef = useRef<PlayerState | null>(null);
  const [executeAction, setExecuteAction] = useState<GameAction | null>(null);
  const [gameState, setGameState] = useState<'startScreen' | 'playing'>('playing'); // Изменено начальное состояние

  const handlePlayerAction = useCallback((action: GameAction) => {
    setExecuteAction(action);
  }, []);

  const resetExecuteAction = useCallback(() => {
    setExecuteAction(null);
  }, []);

  const requestFullscreen = () => {
    const element = document.documentElement;
    if (element.requestFullscreen) {
      element.requestFullscreen().catch(err => {
        console.warn(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else if ((element as any).mozRequestFullScreen) { // Firefox
      (element as any).mozRequestFullScreen();
    } else if ((element as any).webkitRequestFullscreen) { // Chrome, Safari and Opera
      (element as any).webkitRequestFullscreen();
    } else if ((element as any).msRequestFullscreen) { // IE/Edge
      (element as any).msRequestFullscreen();
    }
  };

  // Эта функция больше не будет вызываться автоматически при запуске, если gameState сразу 'playing'
  const handleStartGame = () => { 
    requestFullscreen();
    setGameState('playing');
  };

  const handleExitToStart = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(err => console.warn(`Error exiting fullscreen: ${err.message}`));
    }
    setGameState('startScreen');
  };

  if (gameState === 'startScreen') {
    return <StartScreen onStartGame={handleStartGame} />;
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <GameHeader onExitToStart={handleExitToStart} />
      <main className="flex-1 w-full overflow-hidden flex flex-col">
        <div className="relative w-full h-full">
          <GameCanvas
            levelPath="/levels/level2.json"
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
