
"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState } from '@/types/game';
import {
  GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
  COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT,
  COIN_FADE_IN_DURATION, COIN_SPAWN_STAGGER_DELAY, NUMBER_OF_COIN_PAIRS,
  COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR, COIN_PARTICLE_SIZE,
  ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR, PLATFORM_SPEED,
  COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX, COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SHADOW_BLUR, COIN_SHADOW_COLOR,
  P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, P3_MOVEMENT_DURATION
} from '@/config/gameConfig';
// import { useToast } from "@/hooks/use-toast";
import { checkCollision } from '@/game/utils/collision';
import { renderPlayer } from '@/game/entities/playerRenderer';
import { renderCoins } from '@/game/entities/coinRenderer';
import { renderEnemies } from '@/game/entities/enemyRenderer';
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
    tree1Image: null, tree2Image: null, flowersImage: null,
    smallBushImage: null, largeBushImage: null, houseImage: null,
    playerImageLoaded: false, tileImageLoaded: false, coinImageLoaded: false, stoneImageLoaded: false,
    tree1ImageLoaded: false, tree2ImageLoaded: false, flowersImageLoaded: false,
    smallBushImageLoaded: false, largeBushImageLoaded: false, houseImageLoaded: false,
  });

  const p3BasePositionRef = useRef<{ x: number; y: number } | null>(null);
  const p3InterestPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const p3CurrentTargetIndexRef = useRef<number>(0);
  const p3MovementStateRef = useRef<{ startTime: number; startX: number; startY: number; targetX: number; targetY: number } | null>(null);
  
  const lastFrameTime = useRef<number>(Date.now());
  const animationFrameIdRef = useRef<number | null>(null);
  const executeActionRef = useRef<GameAction | null>(executeAction);

  // Effect 1: Set isClient, Load Assets
  useEffect(() => {
    console.log(`[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state: ${isClient}`);
    if (!isClient) setIsClient(true);

    const allAssetKeys: (keyof AssetContainer)[] = [
      'playerImage', 'tileImage', 'coinImage', 'stoneImage', 
      'tree1Image', 'tree2Image', 'flowersImage', 'smallBushImage', 
      'largeBushImage', 'houseImage'
    ];
    const assetPaths: Record<string, string> = {
      playerImage: '/assets/images/hero_jeans3.png',
      tileImage: '/assets/images/platform_grass.png',
      coinImage: '/assets/images/thankscoin.png',
      stoneImage: '/assets/images/stone1.jpg',
      tree1Image: '/assets/images/tree1.png',
      tree2Image: '/assets/images/tree2.png',
      flowersImage: '/assets/images/flowers.png',
      smallBushImage: '/assets/images/flowers.png', // using flowers for small bush
      largeBushImage: '/assets/images/bush1.png',
      houseImage: '/assets/images/house1.png',
    };
    const assetDataHints: Record<string, string> = {
        playerImage: 'hero character sprite',
        tileImage: 'grass platform_surface',
        coinImage: 'collectible coin gold',
        stoneImage: 'stone rock texture',
        tree1Image: 'tree nature tall',
        tree2Image: 'tree nature smaller',
        flowersImage: 'flowers plant colorful',
        smallBushImage: 'flowers small bush',
        largeBushImage: 'bush large green',
        houseImage: 'house building simple',
    };
    
    allAssetKeys.filter(key => key.endsWith('Image')).forEach(imageKey => {
        const loadedKey = `${imageKey}Loaded` as keyof AssetContainer;
        // Only load if not already loaded or loading
        if (!assets[imageKey as keyof AssetContainer] && !(assets[loadedKey] as boolean)) {
            const img = new Image();
            img.src = assetPaths[imageKey];
            img.setAttribute('data-ai-hint', assetDataHints[imageKey] || 'game asset');
            img.onload = () => {
                console.log(`[GameCanvas Effect 1] Asset ${imageKey} loaded successfully.`);
                setAssets(prev => ({ ...prev, [imageKey]: img, [loadedKey]: true }));
            };
            img.onerror = () => {
                console.error(`[GameCanvas Effect 1] Failed to load ${imageKey}.`);
                setAssets(prev => ({ ...prev, [loadedKey]: true })); // Mark as "attempted" to not block loading
            };
        }
    });
  }, [isClient]); // assets removed from deps to prevent loop with setAssets

  // Effect 2: Apply canvasSize to canvas attributes
  useEffect(() => {
    // console.log(`[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize: {width: ${canvasSize.width}, height: ${canvasSize.height}}`);
    if (canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
      // console.log(`[GameCanvas Effect 2] Canvas attributes set to W:${canvasSize.width}, H:${canvasSize.height}`);
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
      // console.log(`[GameCanvas Effect 3] Not client or no parentElement. isClient: ${isClient}, parent: ${!!canvasRef.current?.parentElement}`);
      return;
    }
    const parentElement = canvasRef.current.parentElement;
    // console.log("[GameCanvas Effect 3] Parent element found:", parentElement);

    const updateCanvasSizeState = () => {
      const newWidth = parentElement.clientWidth;
      const newHeight = parentElement.clientHeight;
      // console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Parent dims: W:${newWidth}, H:${newHeight}`);
      
      setCanvasSize(currentSize => {
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
           if ((newWidth > 0 && newHeight > 0) || (newWidth === 0 && newHeight === 0 && (currentSize.width !== 0 || currentSize.height !== 0))) {
            // console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Updating canvasSize from W:${currentSize.width} H:${currentSize.height} to W:${newWidth} H:${newHeight}`);
            return { width: newWidth, height: newHeight };
           }
        }
        return currentSize;
      });
    };

    updateCanvasSizeState(); 
    const resizeObserver = new ResizeObserver(updateCanvasSizeState);
    resizeObserver.observe(parentElement);
    // console.log("[GameCanvas Effect 3] ResizeObserver observing parent.");
    
    const initialSizer = () => {
        if (canvasRef.current?.parentElement) {
            updateCanvasSizeState();
        }
    };
    window.addEventListener('resize', initialSizer);


    return () => {
      // console.log("[GameCanvas Effect 3] Cleanup: Disconnecting ResizeObserver and removing window resize listener.");
      resizeObserver.disconnect();
      window.removeEventListener('resize', initialSizer);
    };
  }, [isClient]);

  // Effect 4: Load raw level data
  useEffect(() => {
    console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
      console.log("[GameCanvas Effect 4] Not client or no levelPath, returning.");
      return;
    }
    setIsLoading(true); // Start loading
    setRawLevelData(null);
    setProcessedLevel(null);
    processedLevelRef.current = null;
    // setActiveCoins([]); // Moved to Effect 7's pre-spawn logic
    // setActiveEnemies([]); // Moved to Effect 7's pre-spawn logic
    // setCurrentPairIndex(0); // Reset coin pair index
    
    loadLevel(levelPath)
      .then(data => {
        if (data) {
          console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}`);
          setRawLevelData(data);
        } else {
          console.error(`[GameCanvas Effect 4] Failed to load rawLevelData for ${levelPath}, data is null.`);
          setRawLevelData(null); // Ensure it's null on failure
          setIsLoading(false); // Stop loading if level load fails critically
        }
      })
      .catch(error => {
        console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null);
        setIsLoading(false); // Stop loading on error
      });
  }, [levelPath, isClient, setIsLoading, setRawLevelData, setProcessedLevel, setActiveCoins, setActiveEnemies, setCurrentPairIndex]);


  const processRawLevelData = useCallback((
    currentRawLevelData: RawLevelData,
    currentCanvasWidth: number,
    currentCanvasHeight: number
  ): ProcessedLevelData | null => {
    console.log(`[GameCanvas processRawLevelData] Called with canvasSize W: ${currentCanvasWidth} H: ${currentCanvasHeight} for level: ${levelPath}`);
    if (!currentRawLevelData || currentCanvasWidth === 0 || currentCanvasHeight === 0) {
        console.warn("[GameCanvas processRawLevelData] Aborting: No raw level data or zero canvas dimensions.");
        return null;
    }

    const processedTiles: ProcessedTile[] = currentRawLevelData.tiles.map(rawTile => {
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
        return { ...rawTile, x: tileX, y: tileY, width: tileWidth, height: tileHeight };
    });

    // For this step, playerStart is formal as player is not rendered
    const playerStartX = 0;
    const playerStartY = 0;
    
    console.log(`[processRawLevelData] Successfully processed. Number of tiles: ${processedTiles.length}`);
    return {
        playerStart: { xPx: playerStartX, yPx: playerStartY },
        tiles: processedTiles,
    };
  }, [levelPath]);

  // Effect 5: Process raw level data when available and canvas is sized
  useEffect(() => {
    const allAssetsReallyLoaded = assets.tileImageLoaded; // Only tileImage needed for this step
    console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, tileImageLoaded: ${assets.tileImageLoaded}`);

    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsReallyLoaded) {
      if (rawLevelData && (canvasSize.width === 0 || !assets.tileImageLoaded)) {
         console.log("[GameCanvas Effect 5] Waiting for canvas size or tile image to load...");
      }
      if (processedLevel !== null) { // Clear if conditions no longer met
        // console.log("[GameCanvas Effect 5] Conditions no longer met, clearing processedLevel.");
        // setProcessedLevel(null); // This could cause a loop if isLoading isn't managed carefully
        // playerInstanceRef.current = null;
      }
      return;
    }
    
    console.log("[GameCanvas Effect 5] Conditions met, processing rawLevelData...");
    const newProcessedLevel = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);

    if (newProcessedLevel) {
      console.log("[GameCanvas Effect 5] Successfully processed level. Setting newProcessedLevel.");
      setProcessedLevel(newProcessedLevel);
      // player logic removed for this step
    } else {
      console.warn("[GameCanvas Effect 5] processRawLevelData returned null. Clearing processedLevel.");
      setProcessedLevel(null);
      // playerInstanceRef.current = null;
    }
  }, [isClient, rawLevelData, canvasSize, assets.tileImageLoaded, processRawLevelData, setProcessedLevel]);


  // Effect 6: Update processedLevelRef when processedLevel state changes
  useEffect(() => {
    processedLevelRef.current = processedLevel;
    // console.log("[GameCanvas Effect 6] processedLevelRef.current updated:", processedLevelRef.current ? "Exists" : "null");
  }, [processedLevel]);


  // Effect 7: Spawn entities and set isLoading to false
  useEffect(() => {
    console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevel}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, tileImageLoaded: ${assets.tileImageLoaded}`);

    if (isLoading && isClient && processedLevel && canvasSize.width > 0 && assets.tileImageLoaded) {
        console.log("[GameCanvas Effect 7] All conditions met, setting isLoading to false.");
        setIsLoading(false);
    } else if (isLoading) {
        // console.log("[GameCanvas Effect 7] Conditions for finishing load not yet met.");
    }
  }, [isLoading, isClient, processedLevel, canvasSize, assets.tileImageLoaded, setIsLoading]);


  const gameLoop = useCallback(() => {
    // console.log("[gameLoop] CALLED - Step 2: Static Tiles");
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const currentLevel = processedLevelRef.current; // Use ref for gameLoop stability
    const currentAssets = assets; // Use a local variable for assets inside the loop

    if (!ctx || !canvas || canvas.width === 0 || canvas.height === 0) {
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
      return;
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (currentLevel && currentLevel.tiles) {
        // console.log(`[gameLoop] Rendering ${currentLevel.tiles.length} tiles.`);
        currentLevel.tiles.forEach(tile => {
            if (tile.type === 1 && currentAssets.tileImage && currentAssets.tileImageLoaded && currentAssets.tileImage.complete) {
                ctx.drawImage(currentAssets.tileImage, tile.x, tile.y, tile.width, tile.height);
            } else {
                ctx.fillStyle = tile.color;
                ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
            }
        });
    } else {
        // console.log("[gameLoop] No currentLevel or no tiles to render.");
    }
        
    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
  }, [assets]); // Depends on assets for tileImage

  // Effect 9: Start/Stop Game Loop
  useEffect(() => {
    console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, processedLevel: ${!!processedLevel}`);
    
    const conditionsMet = isClient && !isLoading && canvasRef.current && ctxRef.current && canvasSize.width > 0 && canvasSize.height > 0 && processedLevelRef.current && processedLevelRef.current.tiles && processedLevelRef.current.tiles.length > 0;
    
    console.log(`[GameCanvas Effect 9] Conditions for game loop: isClient=${isClient}, !isLoading=${!isLoading}, canvasRef=${!!canvasRef.current}, ctxRef=${!!ctxRef.current}, canvasW=${canvasSize.width}, canvasH=${canvasSize.height}, processedLevelExists=${!!processedLevelRef.current}, hasTiles=${!!(processedLevelRef.current?.tiles?.length > 0)}. MET: ${conditionsMet}`);
    
    if (conditionsMet) {
      console.log("[GameCanvas Effect 9] Conditions MET. Starting game loop.");
      lastFrameTime.current = Date.now(); 
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
        // console.log("[GameCanvas Effect 9] Cleanup: Game loop cancelled.");
      }
    };
  }, [isClient, isLoading, canvasSize, processedLevel, gameLoop]); // gameLoop and processedLevel (state) are dependencies

  if (!isClient) {
    // console.log("[GameCanvas] Rendering null because not client-side yet (isClient is false).");
    return null; 
  }
  
  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full border-2 border-pink-500 bg-pink-500/10" 
      aria-label="Game Canvas"
      tabIndex={0} 
    />
  );
}

