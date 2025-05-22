
"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState } from '@/types/game';
import {
  // Constants for full game (many are not used in this simplified version)
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
// import { renderCoins } from '@/game/entities/coinRenderer'; // Will be restored later
// import { renderEnemies } from '@/game/entities/enemyRenderer'; // Will be restored later
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
  playerRef?: React.MutableRefObject<PlayerState | null>; // This prop might be from parent
  executeAction: GameAction | null;
  resetExecuteAction: () => void;
  onGameStatsUpdate?: (stats: { uncollectedInPair: number; currentPairNum: number; totalPairsNum: number }) => void;
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
  
  const [rawLevelData, setRawLevelData] = useState<RawLevelData | null>(null);
  const [processedLevel, setProcessedLevel] = useState<ProcessedLevelData | null>(null);
  const processedLevelRef = useRef<ProcessedLevelData | null>(null);

  const playerInstanceRef = useRef<PlayerState | null>(null);
  
  const [activeCoins, setActiveCoins] = useState<CoinState[]>([]);
  const activeCoinsRef = useRef<CoinState[]>(activeCoins);
  
  const [currentPairIndex, setCurrentPairIndex] = useState(0);
  const currentPairIndexRef = useRef<number>(currentPairIndex);

  const [activeEnemies, setActiveEnemies] = useState<EnemyState[]>([]);
  const activeEnemiesRef = useRef<EnemyState[]>(activeEnemies);

  const [assets, setAssets] = useState<AssetContainer>({
    playerImage: null, tileImage: null, coinImage: null, stoneImage: null,
    tree1Image: null, tree2Image: null, flowersImage: null, smallBushImage: null,
    largeBushImage: null, houseImage: null,
    playerImageLoaded: false, tileImageLoaded: false, coinImageLoaded: false, stoneImageLoaded: false,
    tree1ImageLoaded: false, tree2ImageLoaded: false, flowersImageLoaded: false, smallBushImageLoaded: false,
    largeBushImageLoaded: false, houseImageLoaded: false,
  });

  // Refs for P3 platform movement (will be used when P3 logic is restored)
  const p3BasePositionRef = useRef<{ x: number; y: number } | null>(null);
  const p3InterestPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const p3CurrentTargetIndexRef = useRef<number>(0);
  const p3MovementStateRef = useRef<{ startTime: number; startX: number; startY: number; targetX: number; targetY: number } | null>(null);
  
  const lastFrameTime = useRef<number>(Date.now());
  const animationFrameIdRef = useRef<number | null>(null);
  // const executeActionRef = useRef<GameAction | null>(executeAction); // Will be restored if needed

  // --- Start of useCallback-wrapped helper functions ---
  const processRawLevelData = useCallback((
    currentRawLevelData: RawLevelData | null,
    currentCanvasWidth: number,
    currentCanvasHeight: number
  ): ProcessedLevelData | null => {
    console.log(`[GameCanvas processRawLevelData] CALLED (Simplified - tiles only) with canvasSize W: ${currentCanvasWidth} H: ${currentCanvasHeight}`);
    if (!currentRawLevelData || !currentRawLevelData.tiles || currentCanvasWidth === 0 || currentCanvasHeight === 0) {
      console.warn("[processRawLevelData] Raw data is null, or tiles missing, or canvas dimensions are zero. Cannot process.");
      return null;
    }

    const processedTiles: ProcessedTile[] = currentRawLevelData.tiles.map((rawTile: RawTileData) => {
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
    
    console.log("[processRawLevelData] Successfully processed tiles (simplified). Number of tiles:", processedTiles.length);
    return {
      playerStart: { xPx: 0, yPx: 0 }, // Dummy playerStart for now
      tiles: processedTiles,
    };
  }, [/* Minimal dependencies for static tile processing, if any, e.g. parseDimension if it were a prop or state */]);

  const spawnNewCoinPair = useCallback((): CoinState[] => {
    console.log("[spawnNewCoinPair] CALLED (Simplified for static platform test - returns empty array)");
    return []; // Simplified: no coins for static platform test
  }, []);
  
  const spawnSingleEnemy = useCallback((): EnemyState | null => {
    console.log("[spawnSingleEnemy] CALLED (Simplified for static platform test - returns null)");
    return null; // Simplified: no enemy for static platform test
  }, []);

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const currentLevel = processedLevelRef.current;

    if (!ctx || !canvas) {
      console.warn("[gameLoop] No context or canvas, skipping frame.");
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
      return;
    }
    
    // console.log("[gameLoop] CALLED"); // Keep this for verifying loop start

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!currentLevel || !currentLevel.tiles || currentLevel.tiles.length === 0) {
      // console.log("[gameLoop] No currentLevel or no tiles to draw.");
      // Draw placeholder if no level
      ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
      ctx.fillRect(canvas.width / 4, canvas.height / 4, canvas.width / 2, canvas.height / 2);
      ctx.fillStyle = "white";
      ctx.font = "16px Arial";
      ctx.textAlign = "center";
      ctx.fillText("Level data not available or empty.", canvas.width / 2, canvas.height / 2);
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
      return;
    }
    
    // Simplified rendering: Draw static tiles only
    currentLevel.tiles.forEach(tile => {
      if (tile.type === 1 && assets.tileImage && assets.tileImage.complete) {
        ctx.drawImage(assets.tileImage, tile.x, tile.y, tile.width, tile.height);
      } else if (tile.type === 1) { // Fallback for type 1 if image not ready
        ctx.fillStyle = tile.color || 'grey';
        ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
      } else { // For other types (like decorative), draw with color
        ctx.fillStyle = tile.color || 'transparent';
        ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
      }
    });
    
    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
  }, [assets.tileImage]); // Depends only on tileImage for static rendering

  // --- End of useCallback-wrapped helper functions ---

  // Effect 1: Set isClient and Load Assets
  useEffect(() => {
    console.log(`[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state: ${isClient}`);
    if (!isClient) {
      setIsClient(true);
    }

    const loadImage = (src: string, hint: string, onLoaded: (img: HTMLImageElement) => void, onLoadedFlag: (flag: boolean) => void) => {
      const img = new Image();
      img.src = src;
      img.setAttribute('data-ai-hint', hint);
      img.onload = () => { 
        onLoaded(img);
        onLoadedFlag(true);
      };
      img.onerror = () => { 
        console.error(`[GameCanvas Effect 1] Failed to load ${hint} image from ${src}.`);
        onLoadedFlag(true); 
      };
    };
    
    // Only load tileImage for this simplified step
    if (!assets.tileImageLoaded && !assets.tileImage) {
      loadImage('/assets/images/platform_grass.png', 'platform tile', 
        (img) => setAssets(prev => ({ ...prev, tileImage: img })), 
        (flag) => setAssets(prev => ({ ...prev, tileImageLoaded: flag }))
      );
    }
    // Other assets (player, coin, etc.) will be restored later
  }, [isClient, assets.tileImage, assets.tileImageLoaded]);


  // Effect 2: Apply canvasSize to canvas attributes
  useEffect(() => {
    // console.log(`[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize: {width: ${canvasSize.width}, height: ${canvasSize.height}}`);
    if (canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
      if (!ctxRef.current) {
        ctxRef.current = canvasRef.current.getContext('2d');
        // console.log("[GameCanvas Effect 2] Canvas context obtained/confirmed.");
      }
    }
  }, [canvasSize]);

  // Effect 3: Observe parent element size and update canvasSize state
  useEffect(() => {
    // console.log(`[GameCanvas Effect 3] Running: Observe parent size. isClient: ${isClient}`);
    if (!isClient || !canvasRef.current?.parentElement) {
      return;
    }
    const parentElement = canvasRef.current.parentElement;
    const updateCanvasSizeState = () => {
      const newWidth = parentElement.clientWidth;
      const newHeight = parentElement.clientHeight;
      setCanvasSize(currentSize => {
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
          if ((newWidth > 0 && newHeight > 0) || (newWidth === 0 && newHeight === 0 && (currentSize.width !== 0 || currentSize.height !== 0))) {
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
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateCanvasSizeState);
    };
  }, [isClient]);

  // Effect 4: Load raw level data
  useEffect(() => {
    console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
      console.log(`[GameCanvas Effect 4] Not client or no levelPath, returning.`);
      return;
    }
    
    console.log("[GameCanvas Effect 4] Setting isLoading to true, resetting states.");
    setIsLoading(true); 
    setRawLevelData(null);
    setProcessedLevel(null); 
    processedLevelRef.current = null;
    // playerInstanceRef.current = null; // Player logic removed for this step
    // if (parentPlayerRef) parentPlayerRef.current = null; // Player logic removed
    // setActiveCoins([]);  // Coin logic removed for this step
    // activeCoinsRef.current = []; // Coin logic removed
    // setCurrentPairIndex(0); // Coin logic removed
    // currentPairIndexRef.current = 0; // Coin logic removed
    // setActiveEnemies([]); // Enemy logic removed
    // activeEnemiesRef.current = []; // Enemy logic removed

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
  }, [levelPath, isClient /*, parentPlayerRef - Player logic removed */]);

  // Effect 5: Process raw level data when available and canvas is sized (Simplified for static tiles)
  useEffect(() => {
    console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, tileImageLoaded: ${assets.tileImageLoaded}`);
    
    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !assets.tileImageLoaded) {
      if (processedLevelRef.current !== null) {
        setProcessedLevel(null); 
        processedLevelRef.current = null;
      }
      console.log(`[GameCanvas Effect 5] Conditions not met. isClient:${isClient}, rawLevelData:${!!rawLevelData}, canvasW:${canvasSize.width}, tileImageLoaded:${assets.tileImageLoaded}`);
      return;
    }
    
    console.log("[GameCanvas Effect 5] Conditions met, processing rawLevelData...");
    const newProcessedLevel = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);

    if (newProcessedLevel) {
      console.log("[GameCanvas Effect 5] Successfully processed level. Setting newProcessedLevel.");
      setProcessedLevel(newProcessedLevel);
      processedLevelRef.current = newProcessedLevel; // Keep ref in sync
    } else {
      console.error("[GameCanvas Effect 5] Processing rawLevelData failed. Setting processedLevel to null.");
      setProcessedLevel(null);
      processedLevelRef.current = null;
    }
  }, [isClient, rawLevelData, canvasSize, assets.tileImageLoaded, processRawLevelData]);

  // Effect 7: Finalize loading (Simplified for static tiles)
  useEffect(() => {
    console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevel}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, tileImageLoaded: ${assets.tileImageLoaded}`);

    if (!isLoading) {
        // console.log("[GameCanvas Effect 7] isLoading is false, skipping all logic.");
        return;
    }

    if (isClient && processedLevel && canvasSize.width > 0 && canvasSize.height > 0 && assets.tileImageLoaded) {
        console.log("[GameCanvas Effect 7] All conditions met (simplified for static tiles). Setting isLoading to false.");
        setIsLoading(false);
    } else {
        // console.log("[GameCanvas Effect 7] Conditions for setting isLoading=false NOT MET (simplified).");
        // Ensure isLoading stays true if not all conditions met
        if (!isLoading) setIsLoading(true);
    }
  }, [isClient, isLoading, processedLevel, canvasSize, assets.tileImageLoaded, setIsLoading]);


  // Effect 8: Check and respawn coin pair (Simplified/Disabled)
  useEffect(() => {
    // This effect is for coin logic, keep it disabled for now or ensure it doesn't run complex logic
    console.log(`[GameCanvas Effect 8] Running (Simplified/Disabled). isLoading: ${isLoading}`);
  }, [/* dependencies for coin logic, e.g. activeCoins */ isLoading]);

  // Effect 8.5: Spawn new coin pair (Simplified/Disabled)
  useEffect(() => {
    console.log(`[GameCanvas Effect 8.5] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevelRef.current}, canvasSize W: ${canvasSize.width}, H: ${canvasSize.height}, currentPairIndex: ${currentPairIndexRef.current}, activeCoins.length: ${activeCoinsRef.current.length}`);
    if (isLoading || !isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) {
      // console.log("[GameCanvas Effect 8.5] Pre-conditions not met, returning.");
      return;
    }
    // Only attempt to spawn if the current pair index is valid and no coins are currently active for this pair
    if (currentPairIndexRef.current < NUMBER_OF_COIN_PAIRS && activeCoinsRef.current.length === 0) {
      console.log(`[GameCanvas Effect 8.5] Attempting to spawn pair ${currentPairIndexRef.current}`);
      // const newPair = spawnNewCoinPair(processedLevelRef.current, canvasSize.width, canvasSize.height); // spawnNewCoinPair IS defined
      const newPair = spawnNewCoinPair(); // Calling simplified version
      if (newPair.length > 0) { 
          // setActiveCoins(newPair); // setActiveCoins IS defined
          console.log("[GameCanvas Effect 8.5] setActiveCoins would be called (but is simplified out)");
      } else {
        console.log("[GameCanvas Effect 8.5] spawnNewCoinPair returned empty, no coins set.");
      }
    }
  }, [isClient, isLoading, canvasSize, spawnNewCoinPair, setActiveCoins, NUMBER_OF_COIN_PAIRS]);


  // Effect 9: Start/Stop Game Loop (Simplified for static tiles)
  useEffect(() => {
    console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, processedLevel: ${!!processedLevel}`);
    
    const conditionsMet = isClient && !isLoading && canvasRef.current && ctxRef.current && canvasSize.width > 0 && canvasSize.height > 0 && processedLevel && processedLevel.tiles.length > 0;
    
    if (conditionsMet) {
      console.log("[GameCanvas Effect 9] Conditions MET. Starting game loop.");
      lastFrameTime.current = Date.now();
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    } else {
      console.log(`[GameCanvas Effect 9] Conditions NOT MET for starting game loop. isClient:${isClient}, isLoading:${isLoading}, canvas:${!!canvasRef.current}, ctx:${!!ctxRef.current}, canvasW:${canvasSize.width}, tiles:${processedLevel?.tiles?.length}`);
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    }
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
        // console.log("[GameCanvas Effect 9] Cleanup: Game loop cancelled.");
      }
    };
  }, [isClient, isLoading, canvasSize, processedLevel, gameLoop]);

  if (!isClient) {
    // console.log("[GameCanvas] Rendering null because not client-side yet (isClient is false).");
    return null; 
  }
  
  if (isLoading) {
      // console.log(`[GameCanvas] Rendering 'Internal Loading...' because isLoading is true.`);
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

  // console.log(`[GameCanvas] Rendering canvas element. Canvas Size: W${canvasSize.width}xH${canvasSize.height}`);
  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full border-2 border-lime-500" // For debug
      aria-label="Game Canvas"
      tabIndex={0} 
    />
  );
}

