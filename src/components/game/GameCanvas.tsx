
"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState, GameStats } from '@/types/game';
// Config imports will be restored later as needed
// import {
//   GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
//   COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT,
//   COIN_FADE_IN_DURATION, COIN_SPAWN_STAGGER_DELAY, NUMBER_OF_COIN_PAIRS,
//   COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER,
//   COIN_PARTICLE_GRAVITY_FACTOR, COIN_PARTICLE_SIZE,
//   ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR, PLATFORM_SPEED,
//   COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX,
//   COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SHADOW_BLUR, COIN_SHADOW_COLOR,
//   P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, P3_MOVEMENT_DURATION,
// } from '@/config/gameConfig';

// import { useToast } from "@/hooks/use-toast";
// import { checkCollision } from '@/game/utils/collision';
// import { renderPlayer } from '@/game/entities/playerRenderer';
// import { renderCoins } from '@/game/entities/coinRenderer';
// import { renderEnemies } from '@/game/entities/enemyRenderer';
// import { loadLevel } from '@/lib/levelLoader';

interface GameCanvasProps {
  levelPath: string;
  playerRef?: React.MutableRefObject<PlayerState | null>;
  executeAction: GameAction | null;
  resetExecuteAction: () => void;
  onGameStatsUpdate?: (stats: GameStats) => void;
}

// const parseDimension = (value: string | number, totalSize: number): number => {
//   if (typeof value === 'number') {
//     return value;
//   }
//   if (typeof value === 'string') {
//     if (value.endsWith('%')) {
//       return (parseFloat(value) / 100) * totalSize;
//     }
//     if (value.endsWith('px')) {
//       return parseFloat(value);
//     }
//     return parseFloat(value);
//   }
//   return 0;
// };

export default function GameCanvas({
  levelPath,
  // playerRef: parentPlayerRef,
  // executeAction,
  // resetExecuteAction,
  // onGameStatsUpdate,
}: GameCanvasProps) {
  console.log(`[GameCanvas] SIMPLIFIED - Component body. levelPath: ${levelPath}`);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const animationFrameIdRef = useRef<number | null>(null);
  const lastFrameTime = useRef<number>(Date.now());


  // Effect 1: Set isClient and handle basic canvas setup for drawing test
  useEffect(() => {
    console.log(`[GameCanvas SIMPLIFIED Effect 1] Running: Set isClient.`);
    setIsClient(true);
    // No asset loading in this simplified version
  }, []);

  // Effect 2: Apply canvasSize to canvas attributes
  useEffect(() => {
    console.log(`[GameCanvas SIMPLIFIED Effect 2] Running: Apply canvasSize to attributes. Current canvasSize: ${JSON.stringify(canvasSize)}`);
    if (canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
      console.log(`[GameCanvas SIMPLIFIED Effect 2] Canvas attributes set to W:${canvasSize.width}, H:${canvasSize.height}`);
      if (!ctxRef.current) {
        ctxRef.current = canvasRef.current.getContext('2d');
        console.log(`[GameCanvas SIMPLIFIED Effect 2] Canvas context ${ctxRef.current ? 'obtained' : 'NOT obtained'}.`);
      }
    }
  }, [canvasSize]);

  // Effect 3: Observe parent element size and update canvasSize state
  useEffect(() => {
    console.log(`[GameCanvas SIMPLIFIED Effect 3] Running: Observe parent size. isClient: ${isClient}`);
    if (!isClient || !canvasRef.current?.parentElement) {
      console.log(`[GameCanvas SIMPLIFIED Effect 3] Not client or no parentElement. isClient: ${isClient}`);
      return;
    }
    const parentElement = canvasRef.current.parentElement;
    console.log(`[GameCanvas SIMPLIFIED Effect 3] Parent element found:`, parentElement);

    const updateCanvasSizeState = () => {
      const newWidth = parentElement.clientWidth;
      const newHeight = parentElement.clientHeight;
      console.log(`[GameCanvas SIMPLIFIED Effect 3 updateCanvasSizeState] Parent dims: W:${newWidth}, H:${newHeight}`);
      
      setCanvasSize(currentSize => {
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
          if ((newWidth > 0 && newHeight > 0) || (newWidth === 0 && newHeight === 0 && (currentSize.width !== 0 || currentSize.height !== 0) )) {
            console.log(`[GameCanvas SIMPLIFIED Effect 3 updateCanvasSizeState] Updating canvasSize from W:${currentSize.width} H:${currentSize.height} to W:${newWidth} H:${newHeight}`);
            // SIMPLIFIED: Set isLoading to false once we have valid dimensions
            if (newWidth > 0 && newHeight > 0 && isLoading) {
                console.log("[GameCanvas SIMPLIFIED Effect 3] Valid canvas dimensions determined, setting isLoading to false.");
                setIsLoading(false);
            }
            return { width: newWidth, height: newHeight };
          }
        }
        return currentSize;
      });
    };
    
    updateCanvasSizeState(); 
    const resizeObserver = new ResizeObserver(updateCanvasSizeState);
    resizeObserver.observe(parentElement);
    window.addEventListener('resize', updateCanvasSizeState);
    console.log(`[GameCanvas SIMPLIFIED Effect 3] ResizeObserver observing parent.`);

    return () => {
      console.log(`[GameCanvas SIMPLIFIED Effect 3] Cleanup: Disconnecting ResizeObserver.`);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateCanvasSizeState);
    };
  }, [isClient, isLoading]); // Added isLoading to dependencies

  const gameLoop = useCallback(() => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;

    if (!ctx || !canvas || canvas.width === 0 || canvas.height === 0) {
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
      return;
    }
    console.log("[GameCanvas SIMPLIFIED gameLoop] CALLED");

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'red';
    ctx.fillRect(canvas.width / 2 - 25, canvas.height / 2 - 25, 50, 50); // Draw red square in the middle

    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
  }, []); // Minimal dependencies for simplified loop

  // Effect 9: Start/Stop Game Loop (Simplified)
  useEffect(() => {
    console.log(`[GameCanvas SIMPLIFIED Effect 9] Running: Game Loop Setup. isClient: ${isClient}, isLoading: ${isLoading}, canvasRef: ${!!canvasRef.current}, canvasSize: W${canvasSize.width}H${canvasSize.height}`);
    
    const conditionsMet = isClient && !isLoading && canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0 && ctxRef.current;
    
    if (conditionsMet) {
      console.log("[GameCanvas SIMPLIFIED Effect 9] Conditions MET. Starting game loop.");
      lastFrameTime.current = Date.now(); 
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    } else {
      console.log(`[GameCanvas SIMPLIFIED Effect 9] Conditions NOT MET. isClient:${isClient}, isLoading:${isLoading}, canvasExists:${!!canvasRef.current}, canvasW:${canvasSize.width}, canvasH:${canvasSize.height}, ctxExists:${!!ctxRef.current}`);
      if (animationFrameIdRef.current) {
        console.log("[GameCanvas SIMPLIFIED Effect 9] Conditions no longer met, cancelling animation frame.");
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    }
    return () => {
      if (animationFrameIdRef.current) {
        console.log("[GameCanvas SIMPLIFIED Effect 9] Cleanup: Cancelling animation frame.");
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [isClient, isLoading, canvasSize, gameLoop]); 


  console.log(`[GameCanvas SIMPLIFIED] Rendering. isClient: ${isClient}, isLoading: ${isLoading}, canvasSize: W${canvasSize.width}xH${canvasSize.height}`);
  
  if (!isClient) {
    console.log("[GameCanvas SIMPLIFIED] Rendering null because not client-side yet (isClient is false).");
    return null; 
  }

  if (isLoading) {
    return (
      <div className="relative w-full h-full">
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            border: '2px dashed hotpink', // Visible border for canvas element
          }}
          aria-label="Game Canvas Loading"
          tabIndex={0}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50 text-muted-foreground">
          <p>GameCanvas: SIMPLIFIED LOADING...</p>
        </div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block', 
        width: '100%',    
        height: '100%',
        border: '2px solid limegreen', // Visible border for canvas element
      }}
      aria-label="Game Canvas Simplified Test"
      tabIndex={0} 
    />
  );
}
