
"use client";

import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { PlayerState, GameAction, GameStats } from '@/types/game';
import GameHeader from '@/components/game/GameHeader';
import StartScreen from '@/components/game/screens/StartScreen';
import dynamic from 'next/dynamic';
import { TOTAL_COINS_ON_LEVEL } from '@/config/gameConfig';

const DynamicGameCanvas = dynamic(() => import('@/components/game/GameCanvas'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground">
      <p>Initializing Canvas...</p>
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
  const [currentLevelPath, setCurrentLevelPath] = useState('/levels/level3.json'); // Start with level 3
  const [gameState, setGameState] = useState<'startScreen' | 'playing'>('playing'); // Bypass start screen
  const [gameStats, setGameStats] = useState<GameStats>({ collectedCoins: 0, totalCoinsOnLevel: TOTAL_COINS_ON_LEVEL });

  const handlePlayerAction = useCallback((action: GameAction) => {
    // console.log(`[PlatformerPage] handlePlayerAction: ${action}`);
    setExecuteAction(action);
  }, []);

  const resetExecuteAction = useCallback(() => {
    // console.log("[PlatformerPage] resetExecuteAction called");
    setExecuteAction(null);
  }, []);

  const handleStartGame = () => {
    console.log("[PlatformerPage] handleStartGame called");
    setGameState('playing');
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

  const handleExitToStart = () => {
    console.log("[PlatformerPage] handleExitToStart called");
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(err => console.warn(`[PlatformerPage] Error exiting fullscreen: ${err.message}`));
    }
    setGameState('startScreen');
    setCurrentLevelPath('/levels/level1.json'); 
  };

  const handleGameStatsUpdate = useCallback((newStats: GameStats) => {
    // console.log("[PlatformerPage] handleGameStatsUpdate:", newStats);
    setGameStats(prevStats => {
      if (prevStats.collectedCoins !== newStats.collectedCoins || prevStats.totalCoinsOnLevel !== newStats.totalCoinsOnLevel) {
        return newStats;
      }
      return prevStats;
    });
  }, []);

  useEffect(() => {
    // console.log("[PlatformerPage] Keyboard listeners effect. GameState:", gameState);
    const handleKeyDown = (event: KeyboardEvent) => {
      // console.log(`[PlatformerPage] KeyDown: ${event.key}, GameState: ${gameState}`);
      if (gameState !== 'playing') return;
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
        case ' ':
          actionToDispatch = 'jump';
          break;
      }
      if (actionToDispatch) {
        // console.log(`[PlatformerPage] Dispatching action from KeyDown: ${actionToDispatch}`);
        handlePlayerAction(actionToDispatch);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      // console.log(`[PlatformerPage] KeyUp: ${event.key}, GameState: ${gameState}`);
      if (gameState !== 'playing') return;
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
        // console.log(`[PlatformerPage] Dispatching action from KeyUp: ${actionToDispatch}`);
        handlePlayerAction(actionToDispatch);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      // console.log("[PlatformerPage] Removing keyboard listeners");
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState, handlePlayerAction]);

  const parseLevelNumber = (path: string): number => {
    const match = path.match(/level(\d+)\.json/);
    return match && match[1] ? parseInt(match[1], 10) : 1;
  };
  
  const currentLevelNumber = parseLevelNumber(currentLevelPath);
  
  let controlPanelBackgroundUrl = "/assets/images/groundfloor.png";
  let pageBackgroundUrl = "/assets/images/level1_bkg.png"; // Default background

  if (currentLevelPath === '/levels/level3.json') {
    controlPanelBackgroundUrl = "/assets/images/platform_ice2.png";
    pageBackgroundUrl = "/assets/images/level2_bkg1.png";
  } else if (currentLevelPath === '/levels/level2.json') {
    pageBackgroundUrl = "/assets/images/level1_bkg.png"; 
  }
  // For level 1, default pageBackgroundUrl is already set.

  if (gameState === 'startScreen') {
    console.log("[PlatformerPage] Rendering StartScreen");
    return <StartScreen onStartGame={handleStartGame} />;
  }

  console.log("[PlatformerPage] Rendering game view. Current level path:", currentLevelPath);
  return (
    <div
      className="flex flex-col h-screen bg-background text-foreground overflow-hidden"
    >
      <GameHeader 
        onExitToStart={handleExitToStart} 
        stats={gameStats}
        currentLevelNumber={currentLevelNumber}
      />
      <main className="flex-1 w-full overflow-hidden flex flex-col">
        <div
          className="relative w-full h-full"
          style={{
            backgroundImage: `url('${pageBackgroundUrl}')`, 
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center center', 
            backgroundSize: 'cover',
          }}
          data-ai-hint="sky clouds" 
        >
          <DynamicGameCanvas
            levelPath={currentLevelPath}
            playerRef={playerRef}
            executeAction={executeAction}
            resetExecuteAction={resetExecuteAction}
            onGameStatsUpdate={handleGameStatsUpdate}
          />
        </div>
      </main>
      <DynamicTouchControls 
        onAction={handlePlayerAction} 
        controlPanelBackgroundUrl={controlPanelBackgroundUrl}
      />
    </div>
  );
}
