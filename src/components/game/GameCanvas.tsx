
"use client";

import type { ReactNode } from 'react';
import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState } from '@/types/game';
// Config imports might be needed if any simple logic remains, otherwise can be commented
// import {
//   GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
//   COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT,
//   COIN_FADE_IN_DURATION, COIN_SPAWN_STAGGER_DELAY, COIN_PARTICLE_COUNT,
//   COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR,
//   COIN_PARTICLE_SIZE, ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR,
//   PLATFORM_SPEED, COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX,
//   COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SHADOW_BLUR, COIN_SHADOW_COLOR,
//   P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, P3_MOVEMENT_DURATION,
// } from '@/config/gameConfig';

// import { checkCollision } from '@/game/utils/collision';
// import { renderPlayer } from '@/game/entities/playerRenderer';
// import { renderCoins } from '@/game/entities/coinRenderer';
// import { renderEnemies } from '@/game/entities/enemyRenderer';
// import { loadLevel } from '@/lib/levelLoader';

interface GameCanvasProps {
  levelPath: string;
  onPlayerAction: (action: GameAction) => void;
  playerRef: React.MutableRefObject<PlayerState | null>;
  executeAction: GameAction | null;
  resetExecuteAction: () => void;
}

// Helper functions defined but not used by effects for now
const processRawLevelData = (
    currentRawLevelData: RawLevelData,
    currentLevelPath: string,
    currentCanvasWidth: number,
    currentCanvasHeight: number,
    assets: any, // Simplified for now
    p3BasePosRef: React.MutableRefObject<any>,
    p3InterestPointsRef: React.MutableRefObject<any[]>,
    p3CurrentTargetIndexRef: React.MutableRefObject<number>,
    p3MovementStateRef: React.MutableRefObject<any>
  ): { processedLevel: ProcessedLevelData | null; player: PlayerState | null } => {
  console.log("[GameCanvas processRawLevelData] DIAGNOSTIC - Called but not used by effects yet");
  return { processedLevel: null, player: null };
};

const spawnNewCoinPair = (
    currentProcessedLevel: ProcessedLevelData | null,
    currentCanvasWidth: number,
    currentCanvasHeight: number
  ): CoinState[] => {
  console.log("[GameCanvas spawnNewCoinPair] DIAGNOSTIC - Called but not used by effects yet");
  return [];
};

const spawnSingleEnemy = (
    currentProcessedLevel: ProcessedLevelData | null,
    currentCanvasWidth: number,
  ): EnemyState | null => {
  console.log("[GameCanvas spawnSingleEnemy] DIAGNOSTIC - Called but not used by effects yet");
  return null;
};


export default function GameCanvas({ levelPath, onPlayerAction, playerRef: parentPlayerRef, executeAction, resetExecuteAction }: GameCanvasProps) {
  console.log(`[GameCanvas] Component body. levelPath: ${levelPath}`);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);
  
  // const gameLoop = useCallback(() => {
  //   console.log("[GameCanvas gameLoop] DIAGNOSTIC - Loop called");
  //   // Minimal loop logic or nothing for now
  //   requestAnimationFrame(gameLoop);
  // }, []);


  // Effect 1: Set isClient and simulate loading completion
  useEffect(() => {
    console.log(`[GameCanvas Effect 1] Running: Set isClient. Current isClient state before set: ${isClient}`);
    setIsClient(true);
    console.log(`[GameCanvas Effect 1] isClient set to true.`);
    
    // Simulate asset/level loading for testing purposes
    const timer = setTimeout(() => {
        console.log(`[GameCanvas Effect 1] Simulating asset/level load complete. Setting isLoading to false.`);
        setIsLoading(false);
    }, 1500); // Give it a bit more time to ensure logs are seen

    return () => clearTimeout(timer);
  }, []); // Empty dependency array, runs once on mount


  // --- All other useEffect hooks are commented out for now to simplify ---
  
  // useEffect(() => { // Effect 2: Apply canvasSize to canvas element attributes
  //   console.log(`[GameCanvas Effect 2] Running. canvasSize: width=${canvasSize.width}, height=${canvasSize.height}`);
  //   // ...
  // }, [isClient, canvasSize]);

  // useEffect(() => { // Effect 3: Observe parent size and update canvasSize state
  //   console.log(`[GameCanvas Effect 3] Running. isClient: ${isClient}`);
  //   // ...
  // }, [isClient]); 

  // useEffect(() => { // Effect 4: Load raw level data
  //   console.log(`[GameCanvas Effect 4] Running. levelPath: ${levelPath}, isClient: ${isClient}`);
  //   // ...
  // }, [levelPath, isClient, setIsLoading]);

  // useEffect(() => { // Effect 5: Process raw level data and initialize player
  //   console.log(`[GameCanvas Effect 5] Running. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: ${canvasSize.width}x${canvasSize.height}, allAssetsLoaded: ${Object.values(assets).every(a => (a as any)?.loaded === true )}`);
  //   // ...
  // }, [isClient, rawLevelData, canvasSize, assets, levelPath, parentPlayerRef, processRawLevelData, setIsLoading, setProcessedLevel, setActiveCoins, setActiveEnemies]);
  
  // useEffect(() => { // Effect 6: Sync processedLevel to ref
  //    console.log(`[GameCanvas Effect 6] Running. processedLevel updated.`);
  //   // ...
  // }, [processedLevel]);

  // useEffect(() => { // Effect 7: Spawn entities and finish loading
  //   console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevel}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, levelPath: ${levelPath}, activeCoins.length: ${activeCoins.length}`);
  //   // ...
  // }, [ isClient, isLoading, processedLevel, canvasSize, levelPath, spawnNewCoinPair, spawnSingleEnemy, setActiveCoins, setActiveEnemies, setIsLoading]);

  // useEffect(() => { // Effect 8: Respawn coins
  //   console.log(`[GameCanvas Effect 8] Running: Check coin respawn. isLoading: ${isLoading}, activeCoins length: ${activeCoins.length}`);
  //   // ...
  // }, [activeCoins, isClient, isLoading, canvasSize, spawnNewCoinPair, setActiveCoins, processedLevelRef]);
  
  // useEffect(() => { // Effect 9: Game Loop Setup
  //   console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, processedLevel: ${!!processedLevelRef.current}`);
  //   // ...
  // }, [isClient, isLoading, canvasSize, gameLoop, processedLevelRef]);

  // useEffect(() => { // Keyboard controls
  //   console.log(`[GameCanvas Keyboard Effect] Running. isClient: ${isClient}`);
  //   // ...
  // }, [onPlayerAction, isClient]);
  
  console.log(`[GameCanvas] Before return. isClient: ${isClient}, isLoading: ${isLoading}`);

  if (!isClient) {
    console.log("[GameCanvas] Rendering: Loading Game Client (isClient is false)...");
    return <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground rounded-md">Loading Game Client...</div>;
  }

  if (isLoading) {
    console.log("[GameCanvas] Rendering: Initializing Canvas... (isLoading is true)");
    return (
      <div className="relative w-full h-full">
        <canvas ref={canvasRef} className="w-full h-full block" tabIndex={0} />
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center text-muted-foreground rounded-md z-10">
          Initializing Canvas... (Simplified Test Mode)
        </div>
      </div>
    );
  }

  console.log("[GameCanvas] Rendering: Basic Canvas Render Test - SUCCESS!");
  return (
    <div className="relative w-full h-full border-4 border-green-500"> {/* Changed border to green for visibility */}
      <canvas ref={canvasRef} className="w-full h-full block" tabIndex={0} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl text-green-500 bg-white p-4">
        GameCanvas Basic Render Test - LOADED!
      </div>
    </div>
  );
}
