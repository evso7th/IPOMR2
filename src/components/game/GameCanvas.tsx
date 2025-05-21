
"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState } from '@/types/game';
// import {
//   GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
//   COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT,
//   COIN_FADE_IN_DURATION, COIN_SPAWN_STAGGER_DELAY,
//   COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR, COIN_PARTICLE_SIZE,
//   ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR, PLATFORM_SPEED,
//   COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX, COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SHADOW_BLUR, COIN_SHADOW_COLOR,
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
  executeAction?: GameAction | null;
  resetExecuteAction?: () => void;
}

export default function GameCanvas({
  levelPath,
  // playerRef: parentPlayerRef, // Renamed for clarity
  // executeAction: propExecuteAction,
  // resetExecuteAction: propResetExecuteAction,
}: GameCanvasProps) {
  const [isClient, setIsClient] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  console.log(`[GameCanvas] Component body. levelPath: ${levelPath}, isClient: ${isClient}, canvasSize: W${canvasSize.width}xH${canvasSize.height}`);

  // Effect 1: Set isClient and attempt to draw test rect
  useEffect(() => {
    console.log("[GameCanvas Effect 1] Running: Set isClient. Current isClient state:", isClient);
    if (!isClient) {
      setIsClient(true);
      console.log("[GameCanvas Effect 1] setIsClient(true) called.");
    }

    if (canvasRef.current && ctxRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      const ctx = ctxRef.current;
      // Clear canvas before drawing new frame or test rect
      ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
      
      // Fill entire canvas with a bright color
      ctx.fillStyle = 'lime'; // Bright green
      ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
      console.log(`[GameCanvas Effect 1] Lime green fill drawn. W:${canvasSize.width}, H:${canvasSize.height}`);
      
      // Draw a smaller blue rectangle on top
      ctx.fillStyle = 'blue';
      const rectWidth = canvasSize.width / 3;
      const rectHeight = canvasSize.height / 3;
      const rectX = canvasSize.width / 10;
      const rectY = canvasSize.height / 10;
      ctx.fillRect(rectX, rectY, rectWidth, rectHeight);
      console.log(`[GameCanvas Effect 1] Blue test rectangle drawn on top of lime. X:${rectX.toFixed(0)}, Y:${rectY.toFixed(0)}, W:${rectWidth.toFixed(0)}, H:${rectHeight.toFixed(0)}`);
    } else {
      console.log("[GameCanvas Effect 1] Conditions not met for drawing test rectangle. canvasRef.current:", !!canvasRef.current, "ctxRef.current:", !!ctxRef.current, "canvasSize:", canvasSize);
    }
  }, [canvasSize, isClient]); // Re-run if canvasSize changes or after isClient is set

  // Effect 2: Apply canvasSize to canvas attributes and get context
  useEffect(() => {
    console.log("[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize:", canvasSize);
    if (canvasRef.current) {
      if (canvasSize.width > 0 && canvasSize.height > 0) {
        canvasRef.current.width = canvasSize.width;
        canvasRef.current.height = canvasSize.height;
        console.log(`[GameCanvas Effect 2] Canvas attributes set to W:${canvasSize.width}, H:${canvasSize.height}`);
        
        const context = canvasRef.current.getContext('2d');
        if (context) {
          ctxRef.current = context;
          console.log("[GameCanvas Effect 2] Canvas context obtained/confirmed.");
        } else {
          console.error("[GameCanvas Effect 2] Failed to get 2D context after resize.");
        }
      } else {
        console.log("[GameCanvas Effect 2] canvasSize width or height is 0, not setting attributes yet.");
      }
    }
  }, [canvasSize]);

  // Effect 3: Observe parent size to set canvas dimensions
  useEffect(() => {
    console.log("[GameCanvas Effect 3] Running: Observe parent size. isClient:", isClient);
    if (!isClient || !canvasRef.current?.parentElement) {
      if (!isClient) console.log("[GameCanvas Effect 3] Not client yet.");
      if (isClient && !canvasRef.current?.parentElement) console.log("[GameCanvas Effect 3] Client, but no parentElement for canvasRef.");
      return;
    }

    const parentElement = canvasRef.current.parentElement;
    console.log("[GameCanvas Effect 3] Parent element found:", parentElement);

    const updateCanvasSizeState = () => {
      const newWidth = parentElement.clientWidth;
      const newHeight = parentElement.clientHeight;
      console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Parent dims: W:${newWidth}, H:${newHeight}`);

      setCanvasSize(currentSize => {
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
          if (newWidth > 0 && newHeight > 0) { 
            console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Updating canvasSize from W:${currentSize.width} H:${currentSize.height} to W:${newWidth} H:${newHeight}`);
            return { width: newWidth, height: newHeight };
          } else {
            console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Invalid new dimensions W:${newWidth} H:${newHeight}, not updating.`);
            return currentSize;
          }
        }
        return currentSize;
      });
    };
    
    updateCanvasSizeState(); 

    const resizeObserver = new ResizeObserver(updateCanvasSizeState);
    resizeObserver.observe(parentElement);
    console.log("[GameCanvas Effect 3] ResizeObserver observing parent.");

    const handleWindowResize = () => { // Renamed for clarity
        console.log("[GameCanvas Effect 3] Window resize event detected.");
        updateCanvasSizeState();
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      console.log("[GameCanvas Effect 3] Cleanup: Disconnecting ResizeObserver, removing window resize listener.");
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [isClient]);


  if (!isClient) {
    console.log("[GameCanvas] Rendering null because not client-side yet (isClient is false).");
    return null; 
  }
  
  console.log("[GameCanvas] Rendering canvas element because isClient is true.");
  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 w-full h-full border-2 border-pink-500" 
      // Removed style={{ backgroundColor: 'rgba(200, 200, 255, 0.3)' }}
    ></canvas>
  );
}
