
"use client";

import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { PlayerState, GameAction } from '@/types/game';
import GameHeader from '@/components/game/GameHeader';
import StartScreen from '@/components/game/screens/StartScreen';
import dynamic from 'next/dynamic';

const DynamicGameCanvas = dynamic(() => import('@/components/game/GameCanvas'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground">
      <p>Loading Game Canvas...</p>
    </div>
  ),
});

const DynamicTouchControls = dynamic(() => import('@/components/game/TouchControls'), {
  ssr: false,
  loading: () => null, // No specific loader for touch controls
});


export default function PlatformerPage() {
  console.log("[PlatformerPage] Component body START");
  const playerRef = useRef<PlayerState | null>(null);
  const [executeAction, setExecuteAction] = useState<GameAction | null>(null);
  // Start with level 1 as level 2 might be causing fetch issues
  const [currentLevelPath, setCurrentLevelPath] = useState('/levels/level1.json'); 
  const [gameState, setGameState] = useState<'startScreen' | 'playing'>('playing'); 

  const handlePlayerAction = useCallback((action: GameAction) => {
    console.log("[PlatformerPage] handlePlayerAction called with:", action);
    setExecuteAction(action);
  }, []);

  const resetExecuteAction = useCallback(() => {
    console.log("[PlatformerPage] resetExecuteAction called");
    setExecuteAction(null);
  }, []);

  const requestFullscreen = () => {
    const element = document.documentElement;
    if (element.requestFullscreen) {
      element.requestFullscreen().catch(err => {
        console.warn(`[PlatformerPage] Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else if ((element as any).mozRequestFullScreen) { // Firefox
      (element as any).mozRequestFullScreen();
    } else if ((element as any).webkitRequestFullscreen) { // Chrome, Safari and Opera
      (element as any).webkitRequestFullscreen();
    } else if ((element as any).msRequestFullscreen) { // IE/Edge
      (element as any).msRequestFullscreen();
    }
  };

  const handleStartGame = () => {
    setGameState('playing');
    // requestFullscreen(); // Enable if you want auto-fullscreen on game start
  };

  const handleExitToStart = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(err => console.warn(`[PlatformerPage] Error exiting fullscreen: ${err.message}`));
    }
    setGameState('startScreen');
  };

  useEffect(() => {
    console.log("[PlatformerPage] useEffect for keyboard listeners, gameState:", gameState);
    const handleKeyDown = (event: KeyboardEvent) => {
      let actionToDispatch: GameAction | null = null;
      switch (event.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          actionToDispatch = 'moveLeft';
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          actionToDispatch = 'moveRight';
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
        case ' ': // Space bar for jump
          actionToDispatch = 'jump';
          break;
      }
      if (actionToDispatch) {
        console.log("[PlatformerPage] KeyDown, dispatching action:", actionToDispatch);
        handlePlayerAction(actionToDispatch);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      let actionToDispatch: GameAction | null = null;
      switch (event.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          actionToDispatch = 'stopMoveLeft';
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          actionToDispatch = 'stopMoveRight';
          break;
      }
      if (actionToDispatch) {
        console.log("[PlatformerPage] KeyUp, dispatching action:", actionToDispatch);
        handlePlayerAction(actionToDispatch);
      }
    };

    if (gameState === 'playing') {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
    } else {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState, handlePlayerAction]);

  if (gameState === 'startScreen') {
    return <StartScreen onStartGame={handleStartGame} />;
  }

  console.log("[PlatformerPage] Rendering game view. Current level path:", currentLevelPath);
  return (
    <div
      className="flex flex-col h-screen bg-background text-foreground overflow-hidden"
    >
      <GameHeader onExitToStart={handleExitToStart} />
      <main className="flex-1 w-full overflow-hidden flex flex-col"> 
        <div
          className="relative w-full h-full"
          style={{
            backgroundImage: "url('/assets/images/level1_bkg.png')",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'top right',
          }}
          data-ai-hint="sky clouds"
        >
          <DynamicGameCanvas
            levelPath={currentLevelPath} 
            playerRef={playerRef}
            executeAction={executeAction}
            resetExecuteAction={resetExecuteAction}
          />
        </div>
      </main>
      <DynamicTouchControls onAction={handlePlayerAction} />
    </div>
  );
}
