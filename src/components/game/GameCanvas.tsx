
"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState, GameStats } from '@/types/game';
// Config imports are not used in this simplified version yet
// import { ... } from '@/config/gameConfig'; 
// import { useToast } from "@/hooks/use-toast";
// import { checkCollision } from '@/game/utils/collision';
// import { renderPlayer } from '@/game/entities/playerRenderer';
// import { renderCoins } from '@/game/entities/coinRenderer';
// import { renderEnemies } from '@/game/entities/enemyRenderer';
import { loadLevel } from '@/lib/levelLoader';

interface AssetContainer {
  playerImage: HTMLImageElement | null;
  tileImage: HTMLImageElement | null;
  coinImage: HTMLImageElement | null;
  stoneImage: HTMLImageElement | null;
  tree1Image: HTMLImageElement | null;
  tree2Image: HTMLImageElement | null;
  flowersImage: HTMLImageElement | null;
  smallBushImage: HTMLImageElement | null;
  largeBushImage: HTMLImageElement | null;
  houseImage: HTMLImageElement | null;

  playerImageLoaded: boolean;
  tileImageLoaded: boolean;
  coinImageLoaded: boolean;
  stoneImageLoaded: boolean;
  tree1ImageLoaded: boolean;
  tree2ImageLoaded: boolean;
  flowersImageLoaded: boolean;
  smallBushImageLoaded: boolean;
  largeBushImageLoaded: boolean;
  houseImageLoaded: boolean;
}

interface GameCanvasProps {
  levelPath: string;
  playerRef?: React.MutableRefObject<PlayerState | null>;
  executeAction: GameAction | null;
  resetExecuteAction: () => void;
  onGameStatsUpdate?: (stats: GameStats) => void;
}

const parseDimension = (value: string | number, totalSize: number): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (value.endsWith('%')) return (parseFloat(value) / 100) * totalSize;
    if (value.endsWith('px')) return parseFloat(value);
    return parseFloat(value);
  }
  return 0;
};

export default function GameCanvas({
  levelPath,
  playerRef: parentPlayerRef,
  executeAction,
  resetExecuteAction,
  onGameStatsUpdate,
}: GameCanvasProps) {
  console.log(`[GameCanvas] Component body. levelPath: ${levelPath}`);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  
  // Temporarily not using these states or refs for extreme simplification
  // const [rawLevelData, setRawLevelData] = useState<RawLevelData | null>(null);
  // const [processedLevel, setProcessedLevel] = useState<ProcessedLevelData | null>(null);
  // const processedLevelRef = useRef<ProcessedLevelData | null>(null);
  // const playerInstanceRef = useRef<PlayerState | null>(null);
  // const [activeCoins, setActiveCoins] = useState<CoinState[]>([]);
  // const activeCoinsRef = useRef<CoinState[]>(activeCoins);
  // const [currentPairIndex, setCurrentPairIndex] = useState(0);
  // const currentPairIndexRef = useRef<number>(currentPairIndex);
  // const [activeEnemies, setActiveEnemies] = useState<EnemyState[]>([]);
  // const activeEnemiesRef = useRef<EnemyState[]>(activeEnemies);
  // const [assets, setAssets] = useState<AssetContainer>({ /* ... initial asset states ... */ });
  // const p3BasePositionRef = useRef<{ x: number; y: number } | null>(null);
  // const p3InterestPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  // const p3CurrentTargetIndexRef = useRef<number>(0);
  // const p3MovementStateRef = useRef<{ startTime: number; startX: number; startY: number; targetX: number; targetY: number } | null>(null);
  
  const animationFrameIdRef = useRef<number | null>(null);
  // const executeActionRef = useRef<GameAction | null>(executeAction);

  // Effect 1: Set isClient
  useEffect(() => {
    console.log(`[GameCanvas Effect 1] Running: Set isClient. Current isClient state: ${isClient}`);
    if (!isClient) {
      setIsClient(true);
      console.log("[GameCanvas Effect 1] Client mode activated.");
    }
  }, [isClient]);

  // Effect 2: Apply canvasSize to canvas attributes
  useEffect(() => {
    console.log(`[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize: {width: ${canvasSize.width}, height: ${canvasSize.height}}`);
    if (canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
      console.log(`[GameCanvas Effect 2] Canvas attributes set to W:${canvasSize.width}, H:${canvasSize.height}`);
      if (!ctxRef.current) {
        ctxRef.current = canvasRef.current.getContext('2d');
        console.log("[GameCanvas Effect 2] Canvas context obtained/confirmed.");
      }
    }
  }, [canvasSize]);

  // Effect 3: Observe parent element size and update canvasSize state, and set isLoading
  useEffect(() => {
    console.log(`[GameCanvas Effect 3] Running: Observe parent size. isClient: ${isClient}`);
    if (!isClient || !canvasRef.current?.parentElement) {
      console.log(`[GameCanvas Effect 3] Not client or no parentElement. isClient: ${isClient}, parent: ${!!canvasRef.current?.parentElement}`);
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
          if ((newWidth > 0 && newHeight > 0) || (newWidth === 0 && newHeight === 0 && (currentSize.width !== 0 || currentSize.height !== 0))) {
            console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Updating canvasSize from W:${currentSize.width} H:${currentSize.height} to W:${newWidth} H:${newHeight}`);
            return { width: newWidth, height: newHeight };
          }
        }
        return currentSize;
      });

      // SIMPLIFIED: Set isLoading to false once we have a valid canvas size
      if (newWidth > 0 && newHeight > 0 && isLoading) {
        console.log("[GameCanvas Effect 3] Valid canvas size obtained. Setting isLoading to false.");
        setIsLoading(false);
      }
    };

    updateCanvasSizeState(); 
    const resizeObserver = new ResizeObserver(updateCanvasSizeState);
    resizeObserver.observe(parentElement);
    console.log("[GameCanvas Effect 3] ResizeObserver observing parent.");
    
    // Fallback for browsers that don't support ResizeObserver or for initial sizing
    const initialSizer = () => {
        if (canvasRef.current?.parentElement) {
            updateCanvasSizeState();
        }
    };
    initialSizer(); // Call once on mount
    window.addEventListener('resize', initialSizer);


    return () => {
      console.log("[GameCanvas Effect 3] Cleanup: Disconnecting ResizeObserver and removing window resize listener.");
      resizeObserver.disconnect();
      window.removeEventListener('resize', initialSizer);
    };
  }, [isClient, isLoading]); // isLoading added to re-evaluate if it's still true


  const gameLoop = useCallback(() => {
    // console.log("[gameLoop] CALLED - Simplified");
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;

    if (!ctx || !canvas || canvas.width === 0 || canvas.height === 0) {
      // console.warn("[gameLoop] No context or canvas or zero size, skipping frame.");
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
      return;
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw a simple red square
    ctx.fillStyle = 'red';
    ctx.fillRect(10, 10, 50, 50);
    // console.log("[gameLoop] Red square drawn.");
        
    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
  }, []); // No dependencies for this simplified loop

  // Effect 9: Start/Stop Game Loop (Simplified)
  useEffect(() => {
    console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize W:${canvasSize.width}H:${canvasSize.height}`);
    
    const conditionsMet = isClient && !isLoading && canvasRef.current && ctxRef.current && canvasSize.width > 0 && canvasSize.height > 0;
    console.log(`[GameCanvas Effect 9] conditionsMet: ${conditionsMet} (isClient:${isClient}, !isLoading:${!isLoading}, canvasRef:${!!canvasRef.current}, ctxRef:${!!ctxRef.current}, canvasW:${canvasSize.width}, canvasH:${canvasSize.height})`);
    
    if (conditionsMet) {
      console.log("[GameCanvas Effect 9] Conditions MET. Starting game loop.");
      // lastFrameTime.current = Date.now(); // Not needed for simplified loop
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    } else {
      console.log(`[GameCanvas Effect 9] Conditions NOT MET. Game loop will not start.`);
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    }
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
        console.log("[GameCanvas Effect 9] Cleanup: Game loop cancelled.");
      }
    };
  }, [isClient, isLoading, canvasSize, gameLoop]);


  if (!isClient) {
    console.log("[GameCanvas] Rendering null because not client-side yet (isClient is false).");
    return null; 
  }
  
  // Show "Initializing Canvas..." from PlatformerPage.tsx while GameCanvas itself is loading its internal logic
  // Or, if GameCanvas is still in its own isLoading phase (e.g. waiting for canvasSize)
  if (isLoading) {
      console.log(`[GameCanvas] Rendering 'Internal Loading...' because isLoading is true.`);
      return (
        <div className="relative w-full h-full">
           <canvas
              ref={canvasRef}
              className="block w-full h-full border-2 border-pink-500 bg-pink-500/10"
              aria-label="Game Canvas Loading"
              tabIndex={0}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50 text-muted-foreground">
              <p>[GameCanvas] Internal Loading (Static Platform Test)...</p>
            </div>
        </div>
      );
  }

  console.log(`[GameCanvas] Rendering canvas element. Canvas Size: W${canvasSize.width}xH${canvasSize.height}`);
  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full border-2 border-lime-500" 
      aria-label="Game Canvas"
      tabIndex={0} 
    />
  );
}

