
"use client";

import type { DependencyList } from 'react';
import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState } from '@/types/game';
import {
  GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
  COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT,
  COIN_FADE_IN_DURATION, COIN_SPAWN_STAGGER_DELAY, NUMBER_OF_COIN_PAIRS,
  COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR, COIN_PARTICLE_SIZE,
  ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR, PLATFORM_SPEED,
  COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX, COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SHADOW_BLUR, COIN_SHADOW_COLOR,
  P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, P3_MOVEMENT_DURATION,
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
  // console.log(`[GameCanvas] Component body. levelPath: ${levelPath}`);
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

  const processRawLevelData = useCallback((
    currentRawLevelData: RawLevelData,
    currentCanvasWidth: number,
    currentCanvasHeight: number
  ): ProcessedLevelData | null => {
    // console.log(`[GameCanvas processRawLevelData] Called with canvasSize W: ${currentCanvasWidth} H: ${currentCanvasHeight} for level: ${levelPath}`);
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
    
    // Player Start Logic
    let playerStartX = 50; // Default
    let playerStartY = currentCanvasHeight - PLAYER_HEIGHT - 50; // Default (on ground)

    const startPlatform = processedTiles.find(tile => tile.id === currentRawLevelData.playerStart.platformId);
    if (startPlatform) {
      switch (currentRawLevelData.playerStart.horizontalAlign) {
        case 'left': playerStartX = startPlatform.x + (currentRawLevelData.playerStart.xOffsetPx || 0); break;
        case 'center': playerStartX = startPlatform.x + (startPlatform.width / 2) - (PLAYER_WIDTH / 2) + (currentRawLevelData.playerStart.xOffsetPx || 0); break;
        case 'right': playerStartX = startPlatform.x + startPlatform.width - PLAYER_WIDTH - (currentRawLevelData.playerStart.xOffsetPx || 0); break;
      }
      playerStartY = startPlatform.y - PLAYER_HEIGHT - (currentRawLevelData.playerStart.yOffsetPx || 0);
    } else {
      console.warn(`[processRawLevelData] Start platform with id "${currentRawLevelData.playerStart.platformId}" not found! Using default player start.`);
    }

    const newPlayer: PlayerState = {
      x: playerStartX,
      y: playerStartY,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      vx: 0,
      vy: 0,
      isOnGround: false,
      isMovingLeft: false,
      isMovingRight: false,
      color: PLAYER_COLOR,
      image: assets.playerImage || undefined,
      facingDirection: 'right',
      activePlatformId: null,
    };
    playerInstanceRef.current = newPlayer;
    if (parentPlayerRef) parentPlayerRef.current = newPlayer;

    // console.log(`[processRawLevelData] Successfully processed. Player:`, newPlayer, `Number of tiles: ${processedTiles.length}`);
    return {
      playerStart: { xPx: playerStartX, yPx: playerStartY }, // Though player is now separate
      tiles: processedTiles,
    };
  }, [levelPath, assets.playerImage, parentPlayerRef]);


  // Effect 1: Set isClient, Load Assets
  useEffect(() => {
    // console.log(`[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state: ${isClient}`);
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
      smallBushImage: '/assets/images/flowers.png',
      largeBushImage: '/assets/images/bush1.png',
      houseImage: '/assets/images/house1.png',
    };
     const assetDataHints: Record<string, string> = {
        playerImage: 'character hero jeans',
        tileImage: 'grass platform surface',
        coinImage: 'collectible coin gold',
        stoneImage: 'stone rock texture',
        tree1Image: 'tree nature tall',
        tree2Image: 'tree nature smaller',
        flowersImage: 'flowers plant colorful',
        smallBushImage: 'bush flowers small', 
        largeBushImage: 'bush large green',
        houseImage: 'house building simple',
    };
    
    allAssetKeys.filter(key => key.endsWith('Image')).forEach(imageKey => {
        const loadedKey = `${imageKey}Loaded` as keyof AssetContainer;
        if (!assets[imageKey as keyof AssetContainer] && !(assets[loadedKey] as boolean)) {
            const img = new Image();
            img.src = assetPaths[imageKey];
            img.setAttribute('data-ai-hint', assetDataHints[imageKey] || 'game asset');
            img.onload = () => {
                // console.log(`[GameCanvas Effect 1] Asset ${imageKey} loaded successfully.`);
                setAssets(prev => ({ ...prev, [imageKey]: img, [loadedKey]: true }));
            };
            img.onerror = () => {
                console.error(`[GameCanvas Effect 1] Failed to load ${imageKey}.`);
                setAssets(prev => ({ ...prev, [loadedKey]: true })); 
            };
        }
    });
  }, [isClient]);

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
    // console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
      // console.log("[GameCanvas Effect 4] Not client or no levelPath, returning.");
      return;
    }
    if (!isLoading) setIsLoading(true);
    setRawLevelData(null);
    setProcessedLevel(null); 
    setActiveCoins([]); 
    setActiveEnemies([]); 
    setCurrentPairIndex(0);
    
    loadLevel(levelPath)
      .then(data => {
        if (data) {
          // console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}`);
          setRawLevelData(data);
        } else {
          console.error(`[GameCanvas Effect 4] Failed to load rawLevelData for ${levelPath}, data is null.`);
          setRawLevelData(null); 
          setIsLoading(false); 
        }
      })
      .catch(error => {
        console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null);
        setIsLoading(false);
      });
  }, [levelPath, isClient, setIsLoading, setRawLevelData, setProcessedLevel, setActiveCoins, setActiveEnemies, setCurrentPairIndex]);

  // Effect 5: Process raw level data when available and canvas is sized
  useEffect(() => {
    const allAssetsReallyLoaded = assets.tileImageLoaded && assets.playerImageLoaded && assets.coinImageLoaded && assets.stoneImageLoaded && assets.tree1ImageLoaded && assets.tree2ImageLoaded && assets.flowersImageLoaded && assets.smallBushImageLoaded && assets.largeBushImageLoaded && assets.houseImageLoaded;
    // console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, allAssetsLoaded: ${allAssetsReallyLoaded}`);

    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsReallyLoaded) {
      if (rawLevelData && (canvasSize.width === 0 || !allAssetsReallyLoaded)) {
        //  console.log("[GameCanvas Effect 5] Waiting for canvas size or all assets to load...");
      }
      if (processedLevel !== null) { 
        //  console.log("[GameCanvas Effect 5] Conditions no longer met, clearing processedLevel.");
      }
      return;
    }
    
    // console.log("[GameCanvas Effect 5] Conditions met, processing rawLevelData...");
    const newProcessedLevelData = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);

    if (newProcessedLevelData) {
      // console.log("[GameCanvas Effect 5] Successfully processed level. Setting newProcessedLevel.");
      setProcessedLevel(newProcessedLevelData);
      // Player is initialized inside processRawLevelData and set to playerInstanceRef
    } else {
      console.warn("[GameCanvas Effect 5] processRawLevelData returned null. Clearing processedLevel.");
      setProcessedLevel(null);
      playerInstanceRef.current = null;
    }
  }, [isClient, rawLevelData, canvasSize, assets, processRawLevelData, setProcessedLevel]);

  // Effect 6: Update refs when their corresponding state changes
  useEffect(() => {
    processedLevelRef.current = processedLevel;
  }, [processedLevel]);
  useEffect(() => {
    activeCoinsRef.current = activeCoins;
  }, [activeCoins]);
  useEffect(() => {
    currentPairIndexRef.current = currentPairIndex;
  }, [currentPairIndex]);
   useEffect(() => {
    activeEnemiesRef.current = activeEnemies;
  }, [activeEnemies]);

  // Effect 7: Spawn entities and set isLoading to false
  useEffect(() => {
    // console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevel}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, levelPath: ${levelPath}, activeCoins.length: ${activeCoins.length}`);
    
    if (!isClient || !processedLevel || canvasSize.width === 0 || canvasSize.height === 0) {
        // console.log("[GameCanvas Effect 7] Pre-conditions (isClient, processedLevel, canvasSize) not met for entity spawn, returning.");
        return;
    }
    
    if (!isLoading) {
        // console.log("[GameCanvas Effect 7] isLoading is false, skipping spawn logic (already loaded or loading finished).");
        return;
    }

    // If level is empty, no need to spawn, just finish loading.
    if (processedLevel.tiles.length === 0) {
        // console.log("[GameCanvas Effect 7] Level has no tiles. Setting isLoading to false.");
        setIsLoading(false);
        return;
    }
    
    let coinsAttempted = false;
    let enemiesAttempted = false;

    if (activeCoins.length === 0) {
        // console.log(`[GameCanvas Effect 7] Spawning new coin pair for level ${levelPath}`);
        // const newCoins = spawnNewCoinPair(processedLevel, canvasSize.width, canvasSize.height);
        // setActiveCoins(newCoins);
        // console.log(`[GameCanvas Effect 7] spawnNewCoinPair returned ${newCoins.length} coins. Setting activeCoins.`);
        coinsAttempted = true;
    } else {
        coinsAttempted = true; // Coins already exist or were attempted
    }

    if (levelPath !== '/levels/level2.json' && levelPath !== '/levels/level1.json') {
      if (activeEnemies.length === 0) {
        // console.log(`[GameCanvas Effect 7] Spawning enemy for level ${levelPath}`);
        // const newEnemy = spawnSingleEnemy(processedLevel, canvasSize.width);
        // if (newEnemy) setActiveEnemies([newEnemy]);
        enemiesAttempted = true;
      } else {
        enemiesAttempted = true;
      }
    } else {
      // console.log(`[GameCanvas Effect 7] Enemies not spawned for level: ${levelPath}`);
      enemiesAttempted = true; // No enemies for level 1 or 2 for now
    }

    if (coinsAttempted && enemiesAttempted) {
        // console.log("[GameCanvas Effect 7] All entities attempted or not needed, setting isLoading to false.");
        setIsLoading(false);
    }

  }, [isClient, isLoading, processedLevel, canvasSize, levelPath, activeCoins.length, activeEnemies.length, /*spawnNewCoinPair, spawnSingleEnemy,*/ setActiveCoins, setActiveEnemies, setIsLoading]);
  
  // Effect 8: Check coin respawn logic (for multiple pairs)
  useEffect(() => {
      // console.log(`[GameCanvas Effect 8] Running: Check coin respawn. isLoading: ${isLoading}, processedLevel: ${!!processedLevelRef.current}`);
      if (isLoading || !isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) return;
      // This effect is for respawning new pairs, not the initial spawn
  }, [
      isLoading, isClient, canvasSize, processedLevelRef, 
      activeCoins, /*spawnNewCoinPair,*/ setActiveCoins, 
      currentPairIndex, setCurrentPairIndex
  ]);

  // Effect 8.5: Spawn coin pair when currentPairIndex changes
   useEffect(() => {
    //  console.log(`[GameCanvas Effect 8.5] Running: Spawn on pair index change. currentPairIndex: ${currentPairIndex}, activeCoins.length: ${activeCoins.length}, isLoading: ${isLoading}`);
     if (isLoading || !isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) {
        // console.log("[GameCanvas Effect 8.5] Pre-conditions not met, returning.");
        return;
     }
     // This effect is for subsequent pairs
   }, [
       currentPairIndex, isLoading, isClient, canvasSize, 
       processedLevelRef, activeCoins.length, /*spawnNewCoinPair,*/ setActiveCoins
   ]);
  
  // Update executeActionRef when executeAction prop changes
  useEffect(() => {
    executeActionRef.current = executeAction;
    // console.log(`[GameCanvas] executeActionRef updated:`, executeActionRef.current);
  }, [executeAction]);

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const currentLevel = processedLevelRef.current;
    const player = playerInstanceRef.current;
    const currentAssets = assets;
    
    const loopStartTime = Date.now();
    let deltaTime = loopStartTime - lastFrameTime.current;
    const MAX_DELTA_TIME_MS = 100; 
    if (deltaTime > MAX_DELTA_TIME_MS) {
        deltaTime = MAX_DELTA_TIME_MS;
    }
    const deltaTimeFactor = Math.max(0.1, Math.min(2, deltaTime / (1000 / 60)));
    lastFrameTime.current = loopStartTime;

    if (!ctx || !canvas || canvas.width === 0 || canvas.height === 0 ) {
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
      return;
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Render Background Tiles
    if (currentLevel && currentLevel.tiles) {
      currentLevel.tiles.forEach(tile => {
        if (tile.type === 1 && currentAssets.tileImage && currentAssets.tileImageLoaded && currentAssets.tileImage.complete) {
          ctx.drawImage(currentAssets.tileImage, tile.x, tile.y, tile.width, tile.height);
        } else if (tile.type !== 1) { // Decorative tiles
            if (tile.id === 'tree1' && currentAssets.tree1Image?.complete) ctx.drawImage(currentAssets.tree1Image, tile.x, tile.y, tile.width, tile.height);
            else if (tile.id === 'tree2' && currentAssets.tree2Image?.complete) ctx.drawImage(currentAssets.tree2Image, tile.x, tile.y, tile.width, tile.height);
            else if (tile.id === 'house1' && currentAssets.houseImage?.complete) ctx.drawImage(currentAssets.houseImage, tile.x, tile.y, tile.width, tile.height);
            else if (tile.id.startsWith('stone_') && currentAssets.stoneImage?.complete) ctx.drawImage(currentAssets.stoneImage, tile.x, tile.y, tile.width, tile.height);
            else {
                 ctx.fillStyle = tile.color;
                 ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
            }
        } else {
             ctx.fillStyle = tile.color; // Fallback for type 1 if image not ready
             ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
        }
      });
    }
    
    // Player Update Logic
    if (player && currentLevel && currentLevel.tiles) {
        const currentExecuteAction = executeActionRef.current;
        if (currentExecuteAction) {
          if (currentExecuteAction === 'moveLeft') player.isMovingLeft = true;
          else if (currentExecuteAction === 'moveRight') player.isMovingRight = true;
          else if (currentExecuteAction === 'stopMoveLeft') player.isMovingLeft = false;
          else if (currentExecuteAction === 'stopMoveRight') player.isMovingRight = false;
          else if (currentExecuteAction === 'jump' && player.isOnGround) {
            player.vy = JUMP_STRENGTH;
            player.isOnGround = false;
            player.activePlatformId = null; 
          }
          resetExecuteAction();
          executeActionRef.current = null;
        }

        player.vy += GRAVITY * deltaTimeFactor;
        if (player.isMovingLeft) player.vx = -PLAYER_SPEED;
        else if (player.isMovingRight) player.vx = PLAYER_SPEED;
        else player.vx = 0;

        let nextPlayerX = player.x + player.vx * deltaTimeFactor;
        let nextPlayerY = player.y + player.vy * deltaTimeFactor;
        
        let tempIsOnGround = false;
        let activePlatformThisFrame: ProcessedTile | null = null;
        let platformInducedMoveX = 0;

        currentLevel.tiles.forEach(tile => {
            if (tile.type !== 1) return; 

            const tileRect: Rect = { x: tile.x, y: tile.y, width: tile.width, height: tile.height };
            let hadHorizontalCollisionWithThisTile = false;

            const playerHorizontalRect: Rect = { x: nextPlayerX, y: player.y, width: player.width, height: player.height };
            if (checkCollision(playerHorizontalRect, tileRect)) {
                const playerCenter_X = nextPlayerX + player.width / 2;
                const tileCenter_X = tile.x + tile.width / 2;
                if (playerCenter_X < tileCenter_X) nextPlayerX = tile.x - player.width;
                else nextPlayerX = tile.x + tile.width;
                player.vx = 0;
                hadHorizontalCollisionWithThisTile = true;
            }

            const playerVerticalRect: Rect = { x: player.x, y: nextPlayerY, width: player.width, height: player.height };
            if (checkCollision(playerVerticalRect, tileRect)) {
                if (player.vy > 0) {
                    if (hadHorizontalCollisionWithThisTile) {
                        nextPlayerY = tile.y - player.height;
                        player.vy = 0;
                    } else {
                        nextPlayerY = tile.y - player.height;
                        tempIsOnGround = true;
                        activePlatformThisFrame = tile;
                        player.vy = 0;
                    }
                } else if (player.vy < 0) {
                    nextPlayerY = tile.y + tile.height;
                    player.vy = 0;
                }
            }
        });
        
        player.x = nextPlayerX;
        player.y = nextPlayerY;
        player.isOnGround = tempIsOnGround;
        player.activePlatformId = activePlatformThisFrame ? activePlatformThisFrame.id : null;

        if (player.isOnGround && activePlatformThisFrame && activePlatformThisFrame.vx && activePlatformThisFrame.direction) {
          platformInducedMoveX = (activePlatformThisFrame.vx * activePlatformThisFrame.direction * deltaTimeFactor);
          player.x += platformInducedMoveX;
        }
        
        if (player.y + player.height > canvas.height) {
            player.y = canvas.height - player.height;
            player.isOnGround = true; 
            player.vy = 0;
            player.activePlatformId = currentLevel.tiles.find(t => t.id === 'p_ground')?.id || null;
        }
        renderPlayer(ctx, player, currentAssets.playerImage);
    }
        
    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
  }, [
      isClient, assets, resetExecuteAction, levelPath,
      // Removed: isLoading, canvasSize, processedLevel, playerInstanceRef (accessed via refs or not needed for gameLoop identity)
      // Dependencies for P3 movement (refs passed to it)
      p3BasePositionRef, p3InterestPointsRef, p3CurrentTargetIndexRef, p3MovementStateRef,
      // Callbacks from GameCanvas
      onGameStatsUpdate,
      // Direct access to refs for coins/enemies
      activeCoinsRef, activeEnemiesRef, currentPairIndexRef,
      // Stable setters
      setActiveCoins, setActiveEnemies,
      // Configs used in player/platform updates
      GRAVITY, JUMP_STRENGTH, PLAYER_SPEED, PLAYER_HEIGHT, PLAYER_WIDTH, PLATFORM_SPEED,
  ]);

  // Effect 9: Start/Stop Game Loop
  useEffect(() => {
    // console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, processedLevel: ${!!processedLevelRef.current}`);
    
    const conditionsMet = isClient && !isLoading && canvasRef.current && ctxRef.current && canvasSize.width > 0 && canvasSize.height > 0 && processedLevelRef.current && processedLevelRef.current.tiles && processedLevelRef.current.tiles.length > 0;
    // console.log(`[GameCanvas Effect 9] isClient=${isClient}, !isLoading=${!isLoading}, canvasRef=${!!canvasRef.current}, ctxRef=${!!ctxRef.current}, canvasW=${canvasSize.width}, canvasH=${canvasSize.height}, processedLevelExists=${!!processedLevelRef.current}, hasTiles=${!!(processedLevelRef.current?.tiles?.length > 0)}. MET: ${conditionsMet}`);
    
    if (conditionsMet) {
      // console.log("[GameCanvas Effect 9] Conditions MET. Starting game loop.");
      lastFrameTime.current = Date.now(); 
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    } else {
      // console.log(`[GameCanvas Effect 9] Conditions NOT MET. Game loop will not start.`);
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
  
  // Show a loading overlay if isLoading is true
  // The canvas element is always rendered to ensure refs are available.
  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        aria-label="Game Canvas"
        tabIndex={0} 
      />
      {isLoading && (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-muted/50 text-muted-foreground z-10">
          <p>Loading Game Assets and Level...</p>
        </div>
      )}
    </div>
  );
}

