
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
  const [gameState, setGameState] = useState<'startScreen' | 'playing'>('playing'); 

  const handlePlayerAction = useCallback((action: GameAction) => {
    // console.log("[PlatformerPage] handlePlayerAction called with:", action);
    setExecuteAction(action);
  }, []);

  const resetExecuteAction = useCallback(() => {
    // console.log("[PlatformerPage] resetExecuteAction called");
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
    requestFullscreen();
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
    // console.log("[PlatformerPage] Mounted or gameState changed. Current gameState:", gameState);
    if (gameState === 'playing' && typeof window !== 'undefined' && !document.fullscreenElement && window.innerWidth < 768) { 
        // requestFullscreen(); // Temporarily disable auto-fullscreen for easier debugging
    }
  }, [gameState]);

  // console.log("[PlatformerPage] Before return, gameState:", gameState);

  if (gameState === 'startScreen') {
    // console.log("[PlatformerPage] Rendering StartScreen");
    return <StartScreen onStartGame={handleStartGame} />;
  }

  // console.log("[PlatformerPage] Rendering Game Interface");
  return (
    <div
      className="flex flex-col h-screen bg-background text-foreground overflow-hidden"
    >
      <GameHeader onExitToStart={handleExitToStart} />
      <main className="flex-1 w-full"> 
        <div
          className="relative w-full h-full"
          style={{
            backgroundImage: "url('/assets/images/level1_bkg.png')",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'top right',
            // backgroundSize: 'cover', 
          }}
          data-ai-hint="sky clouds"
        >
          {/* {console.log("[PlatformerPage] About to render DynamicGameCanvas")} */}
          <DynamicGameCanvas
            levelPath="/levels/level2.json" 
            onPlayerAction={handlePlayerAction}
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
