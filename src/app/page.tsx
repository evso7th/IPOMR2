
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
  loading: () => null,
});


export default function PlatformerPage() {
  console.log("[PlatformerPage] Component body START");
  const playerRef = useRef<PlayerState | null>(null);
  const [executeAction, setExecuteAction] = useState<GameAction | null>(null);
  const [gameState, setGameState] = useState<'startScreen' | 'playing'>('playing'); 

  const handlePlayerAction = useCallback((action: GameAction) => {
    console.log("[PlatformerPage] handlePlayerAction called with:", action);
    setExecuteAction(action);
  }, []);

  const resetExecuteAction = useCallback(() => {
    console.log("[PlatformerPage] resetExecuteAction called, setting executeAction to null");
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
    console.log("[PlatformerPage] handleStartGame called");
    setGameState('playing');
  };

  const handleExitToStart = () => {
    console.log("[PlatformerPage] handleExitToStart called");
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(err => console.warn(`[PlatformerPage] Error exiting fullscreen: ${err.message}`));
    }
    setGameState('startScreen');
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      console.log(`[PlatformerPage] KeyDown event: key='${event.key}' code='${event.code}'`);
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
        console.log(`[PlatformerPage] Dispatching action from KeyDown: ${actionToDispatch}`);
        handlePlayerAction(actionToDispatch);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      console.log(`[PlatformerPage] KeyUp event: key='${event.key}' code='${event.code}'`);
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
        console.log(`[PlatformerPage] Dispatching action from KeyUp: ${actionToDispatch}`);
        handlePlayerAction(actionToDispatch);
      }
    };

    if (gameState === 'playing') {
      console.log('[PlatformerPage] Adding keyboard listeners because gameState is "playing"');
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
    } else {
      console.log('[PlatformerPage] Removing keyboard listeners because gameState is not "playing"');
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    }

    return () => {
      console.log('[PlatformerPage] Cleanup: Removing keyboard listeners');
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState, handlePlayerAction]);

  useEffect(() => {
    if (gameState === 'playing' && typeof window !== 'undefined' && !document.fullscreenElement && window.innerWidth < 768) { 
        // requestFullscreen(); // Temporarily disable auto-fullscreen for easier debugging
    }
  }, [gameState]);


  if (gameState === 'startScreen') {
    console.log("[PlatformerPage] Rendering StartScreen");
    return <StartScreen onStartGame={handleStartGame} />;
  }

  console.log("[PlatformerPage] Rendering Game Interface. Current executeAction prop for GameCanvas:", executeAction);
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
            levelPath="/levels/level2.json" 
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

    