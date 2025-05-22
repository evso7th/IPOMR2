
"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState } from '@/types/game';
import {
  GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
  COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT,
  COIN_FADE_IN_DURATION, COIN_SPAWN_STAGGER_DELAY, NUMBER_OF_COIN_PAIRS,
  COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER,
  COIN_PARTICLE_GRAVITY_FACTOR, COIN_PARTICLE_SIZE,
  ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR, PLATFORM_SPEED,
  COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX,
  COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SHADOW_BLUR, COIN_SHADOW_COLOR,
  P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, P3_MOVEMENT_DURATION,
} from '@/config/gameConfig';
// import { useToast } from "@/hooks/use-toast";
import { checkCollision } from '@/game/utils/collision';
import { renderPlayer } from '@/game/entities/playerRenderer';
import { renderCoins } from '@/game/entities/coinRenderer';
// import { renderEnemies } from '@/game/entities/enemyRenderer'; // Temporarily unused
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
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.endsWith('%')) {
      return (parseFloat(value) / 100) * totalSize;
    }
    if (value.endsWith('px')) {
      return parseFloat(value);
    }
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
  
  const [rawLevelData, setRawLevelData] = useState<RawLevelData | null>(null);
  const [processedLevel, setProcessedLevel] = useState<ProcessedLevelData | null>(null);
  const processedLevelRef = useRef<ProcessedLevelData | null>(null);

  // Player state and related refs temporarily unused/simplified
  // const playerInstanceRef = useRef<PlayerState | null>(null);
  // const executeActionRef = useRef<GameAction | null>(executeAction);
  
  // Coin and Enemy states temporarily unused/simplified
  // const [activeCoins, setActiveCoins] = useState<CoinState[]>([]);
  // const activeCoinsRef = useRef<CoinState[]>(activeCoins);
  // const [currentPairIndex, setCurrentPairIndex] = useState(0);
  // const currentPairIndexRef = useRef<number>(currentPairIndex);
  // const [activeEnemies, setActiveEnemies] = useState<EnemyState[]>([]);
  // const activeEnemiesRef = useRef<EnemyState[]>(activeEnemies);

  const [assets, setAssets] = useState<AssetContainer>({
    playerImage: null, tileImage: null, coinImage: null, stoneImage: null,
    tree1Image: null, tree2Image: null, flowersImage: null, smallBushImage: null,
    largeBushImage: null, houseImage: null,
    playerImageLoaded: true, // Assume loaded for simplicity for now
    tileImageLoaded: false,   // We only care about this for Step 1
    coinImageLoaded: true,    // Assume loaded
    stoneImageLoaded: true,   // Assume loaded
    tree1ImageLoaded: true,   // Assume loaded
    tree2ImageLoaded: true,  // Assume loaded
    flowersImageLoaded: true, // Assume loaded
    smallBushImageLoaded: true, // Assume loaded
    largeBushImageLoaded: true, // Assume loaded
    houseImageLoaded: true,   // Assume loaded
  });

  // Refs for P3 platform movement temporarily unused
  // const p3BasePositionRef = useRef<{ x: number; y: number } | null>(null);
  // const p3InterestPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  // const p3CurrentTargetIndexRef = useRef<number>(0);
  // const p3MovementStateRef = useRef<{ startTime: number; startX: number; startY: number; targetX: number; targetY: number } | null>(null);

  const lastFrameTime = useRef<number>(Date.now());
  const animationFrameIdRef = useRef<number | null>(null);

  // Effect 1: Set isClient and Load Tile Asset
  useEffect(() => {
    console.log(`[GameCanvas Effect 1] Running: Set isClient, Load Tile Asset. Current isClient state: ${isClient}`);
    setIsClient(true);
    
    const tImg = new Image();
    tImg.src = '/assets/images/platform_grass.png';
    tImg.setAttribute('data-ai-hint', 'grass platform tile');
    tImg.onload = () => {
      console.log("[GameCanvas Effect 1] Tile image loaded.");
      setAssets(prev => ({ ...prev, tileImage: tImg, tileImageLoaded: true }));
    };
    tImg.onerror = () => {
      console.error("[GameCanvas Effect 1] Failed to load tile image.");
      setAssets(prev => ({ ...prev, tileImageLoaded: true })); // Mark as loaded to not block
    };
  }, [isClient]); // Removed 'assets' from dependencies for this simplified step

  // Effect 2: Apply canvasSize to canvas attributes
  useEffect(() => {
    console.log(`[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize: {width: ${canvasSize.width}, height: ${canvasSize.height}}`);
    if (canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
      if (!ctxRef.current) {
        ctxRef.current = canvasRef.current.getContext('2d');
        console.log("[GameCanvas Effect 2] Canvas context obtained/confirmed.");
      }
      console.log(`[GameCanvas Effect 2] Canvas attributes set to W:${canvasSize.width}, H:${canvasSize.height}`);
    }
  }, [canvasSize]);

  // Effect 3: Observe parent element size and update canvasSize state
  useEffect(() => {
    console.log(`[GameCanvas Effect 3] Running: Observe parent size. isClient: ${isClient}`);
    if (!isClient || !canvasRef.current?.parentElement) {
      console.log(`[GameCanvas Effect 3] Not client or no parent element yet.`);
      return;
    }
    const parentElement = canvasRef.current.parentElement;
    console.log(`[GameCanvas Effect 3] Parent element found:`, parentElement);

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
    };
    
    updateCanvasSizeState(); 
    const resizeObserver = new ResizeObserver(updateCanvasSizeState);
    resizeObserver.observe(parentElement);
    console.log("[GameCanvas Effect 3] ResizeObserver observing parent.");
    
    window.addEventListener('resize', updateCanvasSizeState);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateCanvasSizeState);
      console.log("[GameCanvas Effect 3] Cleanup: ResizeObserver disconnected, resize listener removed.");
    };
  }, [isClient]);

  // Effect 4: Load raw level data
  useEffect(() => {
    console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
      console.log(`[GameCanvas Effect 4] Not client or no levelPath, returning.`);
      return;
    }
    setIsLoading(true); 
    setRawLevelData(null);
    setProcessedLevel(null); 
    processedLevelRef.current = null;
    // setActiveCoins([]); // Temporarily disabled
    // setActiveEnemies([]); // Temporarily disabled
    // setCurrentPairIndex(0); // Temporarily disabled

    loadLevel(levelPath)
      .then(data => {
        if (data) {
          console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}`);
          setRawLevelData(data);
        } else {
          console.error(`[GameCanvas Effect 4] Failed to load rawLevelData for ${levelPath}, or data was null.`);
          setRawLevelData(null); 
        }
      })
      .catch(error => {
        console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null);
      });
  }, [levelPath, isClient, setIsLoading, setRawLevelData, setProcessedLevel]); // Removed coin/enemy setters
  
  const processRawLevelData = useCallback((
    rawJSONLevelData: RawLevelData | null,
    currentCanvasWidth: number,
    currentCanvasHeight: number
  ): ProcessedLevelData | null => {
    console.log(`[GameCanvas processRawLevelData] Called with canvasSize W: ${currentCanvasWidth} H: ${currentCanvasHeight} for level: ${levelPath}`);
    if (!rawJSONLevelData) {
      console.warn("[processRawLevelData] Raw data is null. Cannot process.");
      return null;
    }

    const processedTiles: ProcessedTile[] = rawJSONLevelData.tiles.map((rawTile: RawTileData) => {
      const tileWidth = parseDimension(rawTile.width, currentCanvasWidth);
      const tileHeight = parseDimension(rawTile.height, currentCanvasHeight);
      let tileX = 0;
      let tileY = 0;

      const xOffset = rawTile.positioning.xOffsetPx || 0;
      const yOffset = rawTile.positioning.yOffsetPx || 0;

      switch (rawTile.positioning.anchor) {
        case 'top-left': tileX = xOffset; tileY = yOffset; break;
        case 'top-center': tileX = (currentCanvasWidth / 2) - (tileWidth / 2) + xOffset; tileY = yOffset; break;
        case 'top-right': tileX = currentCanvasWidth - tileWidth - xOffset; tileY = yOffset; break;
        case 'center-left': tileX = xOffset; tileY = (currentCanvasHeight / 2) - (tileHeight / 2) + yOffset; break;
        case 'center': tileX = (currentCanvasWidth / 2) - (tileWidth / 2) + xOffset; tileY = (currentCanvasHeight / 2) - (tileHeight / 2) + yOffset; break;
        case 'center-right': tileX = currentCanvasWidth - tileWidth - xOffset; tileY = (currentCanvasHeight / 2) - (tileHeight / 2) + yOffset; break;
        case 'bottom-left': tileX = xOffset; tileY = currentCanvasHeight - tileHeight - yOffset; break;
        case 'bottom-center': tileX = (currentCanvasWidth / 2) - (tileWidth / 2) + xOffset; tileY = currentCanvasHeight - tileHeight - yOffset; break;
        case 'bottom-right': tileX = currentCanvasWidth - tileWidth - xOffset; tileY = currentCanvasHeight - tileHeight - yOffset; break;
        default: tileX = xOffset; tileY = yOffset;
      }
      return {
        ...rawTile, x: tileX, y: tileY, width: tileWidth, height: tileHeight,
        vx: rawTile.vx || 0, direction: rawTile.direction || 0,
      };
    });
    
    console.log("[processRawLevelData] Successfully processed tiles. Number of tiles:", processedTiles.length);
    // Simplified: No player initialization in this step
    return {
      playerStart: { xPx: 0, yPx: 0 }, // Dummy player start
      tiles: processedTiles,
    };
  }, [levelPath]); // Removed assets.playerImage, parentPlayerRef as player is not init'd

  // Effect 5: Process raw level data when available and canvas is sized
  useEffect(() => {
    console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, tileImageLoaded: ${assets.tileImageLoaded}`);
    
    const allCriticalAssetsLoaded = assets.tileImageLoaded; // Only tileImage for this step

    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allCriticalAssetsLoaded) {
      if (!allCriticalAssetsLoaded && rawLevelData) {
         console.log("[GameCanvas Effect 5] Waiting for tile asset to load...");
      } else if (!rawLevelData && isClient && canvasSize.width > 0 && canvasSize.height > 0){
         console.log("[GameCanvas Effect 5] Waiting for rawLevelData...");
      } else {
        console.log("[GameCanvas Effect 5] Preconditions not met, or already handled. Ensuring processedLevel is null if needed.");
        if (processedLevelRef.current !== null) {
            setProcessedLevel(null);
            processedLevelRef.current = null;
        }
      }
      return;
    }
    console.log("[GameCanvas Effect 5] Conditions met, processing rawLevelData...");
    const newProcessedLevel = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);
    if (newProcessedLevel) {
      console.log("[GameCanvas Effect 5] Successfully processed level. Setting newProcessedLevel.");
      setProcessedLevel(newProcessedLevel);
    } else {
      console.error("[GameCanvas Effect 5] Processing rawLevelData failed. Setting processedLevel to null.");
      setProcessedLevel(null);
    }
  }, [isClient, rawLevelData, canvasSize, assets.tileImageLoaded, processRawLevelData, setProcessedLevel]);

  // Effect to update processedLevelRef when processedLevel state changes
  useEffect(() => {
    processedLevelRef.current = processedLevel;
    console.log("[GameCanvas Effect for processedLevelRef] processedLevelRef.current updated:", processedLevelRef.current ? "Exists" : "null");
  }, [processedLevel]);


  // Effect 7: Set isLoading to false (Simplified for this step)
  useEffect(() => {
    console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevelRef.current}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, tileImageLoaded: ${assets.tileImageLoaded}`);
    
    if (isLoading && isClient && processedLevelRef.current && canvasSize.width > 0 && canvasSize.height > 0 && assets.tileImageLoaded) {
      console.log("[GameCanvas Effect 7] All conditions met, setting isLoading to false.");
      setIsLoading(false);
    } else if (isLoading) {
        console.log("[GameCanvas Effect 7] Conditions for setting isLoading to false NOT YET MET.");
    }
  }, [isLoading, isClient, processedLevel, canvasSize, assets.tileImageLoaded, setIsLoading]); // Depends on processedLevel state


  const gameLoop = useCallback(() => {
    // Simplified game loop for Step 1: Render only static tiles
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const currentLevel = processedLevelRef.current;

    if (!ctx || !canvas) {
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
      return;
    }
    
    console.log("[gameLoop] CALLED and rendering tiles");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (currentLevel && currentLevel.tiles) {
      currentLevel.tiles.forEach(tile => {
        if (tile.type === 1 && assets.tileImage && assets.tileImageLoaded) {
          ctx.drawImage(assets.tileImage, tile.x, tile.y, tile.width, tile.height);
        } else {
          ctx.fillStyle = tile.color;
          ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
        }
      });
    } else {
        // Draw a fallback if level data is missing, to indicate loop is running
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)'; // Semi-transparent red
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Game Loop Running - No Level Data or Tiles', canvas.width / 2, canvas.height / 2);
    }

    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
  }, [assets.tileImage, assets.tileImageLoaded]); // Depends on assets for rendering

  // Effect 9: Start/Stop Game Loop
  useEffect(() => {
    console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize: W${canvasSize.width}H${canvasSize.height}, processedLevel: ${!!processedLevelRef.current}`);
    
    const conditionsMet = isClient && !isLoading && canvasRef.current && ctxRef.current && canvasSize.width > 0 && canvasSize.height > 0 && processedLevelRef.current;
    
    if (conditionsMet) {
      console.log("[GameCanvas Effect 9] Conditions MET. Starting game loop.");
      lastFrameTime.current = Date.now();
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    } else {
      console.log(`[GameCanvas Effect 9] Conditions NOT MET. Game loop will not start. isClient: ${isClient}, isLoading: ${isLoading}, canvas: ${!!canvasRef.current}, ctx: ${!!ctxRef.current}, canvasW: ${canvasSize.width}, canvasH: ${canvasSize.height}, procLevel: ${!!processedLevelRef.current}`);
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
  }, [isClient, isLoading, canvasSize, processedLevel, gameLoop]); // Depends on processedLevel state for initial start


  if (!isClient) {
    console.log("[GameCanvas] Rendering null because not client-side yet (isClient is false).");
    return null; 
  }
  
  if (isLoading) {
      console.log(`[GameCanvas] Rendering 'Internal Loading...' because isLoading is true.`);
      return (
        <div className="relative w-full h-full">
           <canvas
              ref={canvasRef}
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                border: '2px dashed hotpink', 
              }}
              aria-label="Game Canvas Loading"
              tabIndex={0}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50 text-muted-foreground">
              <p>[GameCanvas] Internal Loading...</p>
            </div>
        </div>
      );
  }

  console.log(`[GameCanvas] Rendering canvas element because isClient is true and isLoading is false.`);
  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block', 
        width: '100%',    
        height: '100%',
        border: '2px solid limegreen', // For debug
      }}
      aria-label="Game Canvas"
      tabIndex={0} 
    />
  );
}
