
"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState } from '@/types/game';
import {
  GRAVITY,
  PLAYER_SPEED,
  JUMP_STRENGTH,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_COLOR,
  COIN_SIZE,
  COIN_VERTICAL_SPAWN_BOTTOM_OFFSET,
  COIN_SPAWN_TOP_MARGIN,
  MAX_JUMP_HEIGHT,
  COIN_FADE_IN_DURATION,
  COIN_SPAWN_STAGGER_DELAY,
  COIN_PARTICLE_COUNT,
  COIN_PARTICLE_LIFESPAN,
  COIN_PARTICLE_SPEED_MULTIPLIER,
  COIN_PARTICLE_GRAVITY_FACTOR,
  COIN_PARTICLE_SIZE,
  ENEMY_RADIUS,
  // ENEMY_COLOR, // Not used if enemy logic is out
  // ENEMY_SPEED_FACTOR, // Not used
  PLATFORM_SPEED,
  COIN_ROTATION_SPEED_MIN,
  COIN_ROTATION_SPEED_MAX,
  COIN_SHADOW_OFFSET_X,
  COIN_SHADOW_OFFSET_Y,
  COIN_SHADOW_BLUR,
  COIN_SHADOW_COLOR,
  P3_SIZE_W,
  P3_SIZE_H,
  P3_DRIFT_RANGE,
  P3_MOVEMENT_DURATION,
} from '@/config/gameConfig';
// import { useToast } from "@/hooks/use-toast";
import { checkCollision } from '@/game/utils/collision';
import { renderPlayer } from '@/game/entities/playerRenderer';
import { renderCoins } from '@/game/entities/coinRenderer';
// import { renderEnemies } from '@/game/entities/enemyRenderer'; // Temporarily out
import { loadLevel } from '@/lib/levelLoader';

interface GameCanvasProps {
  levelPath: string;
  onPlayerAction?: (action: GameAction) => void;
  playerRef?: React.MutableRefObject<PlayerState | null>;
  executeAction?: GameAction | null;
  resetExecuteAction?: () => void;
}

const parseDimension = (dim: string | number, totalSize: number): number => {
    if (typeof dim === 'number') {
        return dim;
    }
    if (typeof dim === 'string') {
        if (dim.endsWith('%')) {
            return (parseFloat(dim) / 100) * totalSize;
        }
        if (dim.endsWith('px')) {
            return parseFloat(dim);
        }
        return parseFloat(dim);
    }
    console.warn(`[parseDimension] Unexpected dimension type: ${typeof dim}, value: ${dim}. Defaulting to 0.`);
    return 0;
};


export default function GameCanvas({
  levelPath,
  onPlayerAction,
  playerRef: parentPlayerRef,
  executeAction,
  resetExecuteAction,
}: GameCanvasProps) {
  console.log(`[GameCanvas] Component body. levelPath: ${levelPath}`);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [assets, setAssets] = useState({
    playerImage: null as HTMLImageElement | null, playerImageLoaded: false,
    tileImage: null as HTMLImageElement | null, tileImageLoaded: false,
    coinImage: null as HTMLImageElement | null, coinImageLoaded: false,
    stoneImage: null as HTMLImageElement | null, stoneImageLoaded: false,
    tree1Image: null as HTMLImageElement | null, tree1ImageLoaded: false,
    tree2Image: null as HTMLImageElement | null, tree2ImageLoaded: false,
    smallBushImage: null as HTMLImageElement | null, smallBushImageLoaded: false,
    largeBushImage: null as HTMLImageElement | null, largeBushImageLoaded: false,
    houseImage: null as HTMLImageElement | null, houseImageLoaded: false,
  });

  const [rawLevelData, setRawLevelData] = useState<RawLevelData | null>(null);
  const [processedLevel, setProcessedLevel] = useState<ProcessedLevelData | null>(null);
  const playerInstanceRef = useRef<PlayerState | null>(null);
  const [activeCoins, setActiveCoins] = useState<CoinState[]>([]);
  const [activeEnemies, setActiveEnemies] = useState<EnemyState[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  
  const lastFrameTime = useRef<number>(Date.now());
  const executeActionRef = useRef<GameAction | null>(null);

  const p3BasePositionRef = useRef<{ x: number; y: number } | null>(null);
  const p3InterestPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const p3CurrentTargetIndexRef = useRef<number>(0);
  const p3MovementStateRef = useRef<{startTime: number; startX: number; startY: number; targetX: number; targetY: number} | null>(null);
  const processedLevelRef = useRef<ProcessedLevelData | null>(null);

  // const { toast } = useToast();

  const processRawLevelData = useCallback((
    currentRawLevelData: RawLevelData,
    currentCanvasWidth: number,
    currentCanvasHeight: number
  ): ProcessedLevelData | null => {
    console.log(`[GameCanvas processRawLevelData] Called with canvasSize W: ${currentCanvasWidth} H: ${currentCanvasHeight} for level: ${levelPath}`);
    if (!currentRawLevelData || currentCanvasWidth === 0 || currentCanvasHeight === 0) {
      console.warn("[GameCanvas processRawLevelData] Missing rawLevelData or canvas dimensions. Aborting.");
      return null;
    }

    const processedTiles: ProcessedTile[] = currentRawLevelData.tiles.map((rawTile: RawTileData) => {
      const tileWidth = parseDimension(rawTile.width, currentCanvasWidth);
      const tileHeight = parseDimension(rawTile.height, currentCanvasHeight);
      const xOffset = rawTile.positioning.xOffsetPx || 0;
      const yOffset = rawTile.positioning.yOffsetPx || 0;
      let tileX = 0;
      let tileY = 0;

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

    const p_ground_tile = processedTiles.find(t => t.id === 'p_ground');
    if (!p_ground_tile) {
      console.warn("[processRawLevelData] p_ground tile not found! Cannot reliably place other elements like P3.");
      // Depending on game logic, you might want to return null or handle this differently
    }

    if (levelPath === '/levels/level2.json' && p_ground_tile) {
        const p3_actual_size_w = P3_SIZE_W; 
        const p3_actual_size_h = P3_SIZE_H;
        
        const p_ground_top_y = p_ground_tile.y;
        const p3_base_x = (currentCanvasWidth / 2) - (p3_actual_size_w / 2); // Centered horizontally
        const p3_base_y = p_ground_top_y - 300 - p3_actual_size_h; // 300px above p_ground

        p3BasePositionRef.current = { x: p3_base_x, y: p3_base_y };
        // console.log(`[processRawLevelData] Level 2: p_ground_top_y: ${p_ground_top_y} p3BasePosRef.current:`, p3BasePositionRef.current);

        p3InterestPointsRef.current = [
            { x: 0, y: 0 }, // Center
            { x: -P3_DRIFT_RANGE, y: -P3_DRIFT_RANGE }, // Top-left drift
            { x: P3_DRIFT_RANGE, y: P3_DRIFT_RANGE },   // Bottom-right drift
            { x: -P3_DRIFT_RANGE, y: P3_DRIFT_RANGE },  // Bottom-left drift
            { x: P3_DRIFT_RANGE, y: -P3_DRIFT_RANGE },  // Top-right drift
        ];
        p3CurrentTargetIndexRef.current = 0; 
        p3MovementStateRef.current = null;

        const p3Tile: ProcessedTile = {
            id: 'p3',
            x: p3BasePositionRef.current.x + p3InterestPointsRef.current[0].x,
            y: p3BasePositionRef.current.y + p3InterestPointsRef.current[0].y,
            width: p3_actual_size_w,
            height: p3_actual_size_h,
            type: 1,
            color: 'hsl(270, 70%, 60%)', // Purple
            vx: 0, 
            direction: 0,
            layer: 'background', // Or 'foreground' if it should obscure player
        };
        processedTiles.push(p3Tile);
        // console.log(`[processRawLevelData] Level 2: Added p3Tile:`, p3Tile);
    }


    const playerStartPlatform = processedTiles.find(tile => tile.id === currentRawLevelData.playerStart.platformId);
    if (!playerStartPlatform) {
      console.error("[processRawLevelData] Player start platform not found!");
      return null;
    }

    let playerInitialX = playerStartPlatform.x;
    const xOffsetPlayer = currentRawLevelData.playerStart.xOffsetPx || 0;
    if (currentRawLevelData.playerStart.horizontalAlign === 'center') {
      playerInitialX = playerStartPlatform.x + (playerStartPlatform.width / 2) - (PLAYER_WIDTH / 2) + xOffsetPlayer;
    } else if (currentRawLevelData.playerStart.horizontalAlign === 'right') {
      playerInitialX = playerStartPlatform.x + playerStartPlatform.width - PLAYER_WIDTH - xOffsetPlayer;
    } else { 
      playerInitialX += xOffsetPlayer;
    }
    
    const yOffsetPlayer = currentRawLevelData.playerStart.yOffsetPx || 0;
    const playerInitialY = playerStartPlatform.y - PLAYER_HEIGHT - yOffsetPlayer;

    const newPlayer: PlayerState = {
      x: playerInitialX,
      y: playerInitialY,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      vx: 0,
      vy: 0,
      isOnGround: false, 
      isMovingLeft: false,
      isMovingRight: false,
      color: PLAYER_COLOR,
      facingDirection: 'right',
      image: assets.playerImage,
      activePlatformId: null,
    };
    
    // console.log("[processRawLevelData] Player instance to be set:", newPlayer);
    playerInstanceRef.current = newPlayer;
    if (parentPlayerRef) parentPlayerRef.current = newPlayer;

    const newProcessedLevelData: ProcessedLevelData = {
      playerStart: { xPx: playerInitialX, yPx: playerInitialY },
      tiles: processedTiles,
    };
    // console.log(`[processRawLevelData] Successfully processed. Player set. Number of tiles: ${processedTiles.length}`);
    return newProcessedLevelData;
  }, [
    assets.playerImage, levelPath, parentPlayerRef,
    P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE // Ensure these are stable or included if they can change
  ]);

  const spawnNewCoinPair = useCallback((
    currentProcessedLevel: ProcessedLevelData | null, 
    currentCanvasWidth: number, 
    currentCanvasHeight: number
  ): CoinState[] => {
    // console.log(`[spawnNewCoinPair] Called. Canvas W:${currentCanvasWidth}, H:${currentCanvasHeight}. ProcessedLevel exists: ${!!currentProcessedLevel}`);

    if (!currentProcessedLevel || currentCanvasWidth <= 0 || currentCanvasHeight <= 0) {
        // console.warn("[spawnNewCoinPair] Preconditions not met (no processed level or canvas dimensions). No coins spawned.");
        return [];
    }

    const p_ground = currentProcessedLevel.tiles.find(t => t.id === 'p_ground');
    if (!p_ground) {
        console.warn("[spawnNewCoinPair] p_ground tile not found. Cannot reliably calculate coin spawn zone. No coins spawned.");
        return [];
    }
    const p_groundTopY = p_ground.y;
    
    const ySpawnZoneBottomCoinTopEdge = p_groundTopY - COIN_VERTICAL_SPAWN_BOTTOM_OFFSET - COIN_SIZE;

    const gamePlatforms = currentProcessedLevel.tiles.filter(t => t.type === 1 && t.id !== 'p_ground');
    let actualHighestPlatformTopY = p_groundTopY; 

    if (gamePlatforms.length > 0) {
        actualHighestPlatformTopY = Math.min(...gamePlatforms.map(p => p.y));
    }
    
    const ySpawnZoneTopCoinTopEdge = actualHighestPlatformTopY - MAX_JUMP_HEIGHT - COIN_SPAWN_TOP_MARGIN - COIN_SIZE;

    if (ySpawnZoneTopCoinTopEdge >= ySpawnZoneBottomCoinTopEdge) {
        // console.warn(`[spawnNewCoinPair] Invalid spawn zone: Top edge (${ySpawnZoneTopCoinTopEdge}) is not above bottom edge (${ySpawnZoneBottomCoinTopEdge}). No coins spawned.`);
        return [];
    }

    const coins: CoinState[] = [];
    const numberOfCoinsToSpawn = 10; // Spawn 10 coins

    for (let i = 0; i < numberOfCoinsToSpawn; i++) {
        const xPosition = Math.random() * (currentCanvasWidth - COIN_SIZE);
        const yPosition = ySpawnZoneTopCoinTopEdge + Math.random() * (ySpawnZoneBottomCoinTopEdge - ySpawnZoneTopCoinTopEdge);

        coins.push({
            id: `coin-${Date.now()}-${i}`,
            x: xPosition,
            y: yPosition,
            width: COIN_SIZE,
            height: COIN_SIZE,
            isCollected: false,
            targetSpawnTime: Date.now() + (i * COIN_SPAWN_STAGGER_DELAY / 2), // Stagger appearance a bit
            currentOpacity: 0,
            particles: [],
            isVisuallyPresent: true,
            rotationAngle: Math.random() * Math.PI * 2,
            rotationSpeed: COIN_ROTATION_SPEED_MIN + Math.random() * (COIN_ROTATION_SPEED_MAX - COIN_ROTATION_SPEED_MIN),
        });
    }
    // console.log(`[spawnNewCoinPair] Created ${coins.length} coins.`);
    return coins;
  }, [COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, MAX_JUMP_HEIGHT, COIN_SPAWN_TOP_MARGIN, COIN_SPAWN_STAGGER_DELAY, COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX]);


  const spawnSingleEnemy = useCallback((
    currentProcessedLevel: ProcessedLevelData | null, 
    currentCanvasWidth: number
  ): EnemyState | null => {
    if (!currentProcessedLevel || currentCanvasWidth <= 0) return null;
    
    const p1 = currentProcessedLevel.tiles.find(t => t.id === 'p1' || t.id === 'floating_platform_left' || t.id === 'floating_platform_1');
    const p2 = currentProcessedLevel.tiles.find(t => t.id === 'p2' || t.id === 'floating_platform_right' || t.id === 'floating_platform_2');

    if (!p1 || !p2) {
      // console.warn("[spawnSingleEnemy] Could not find P1 or P2 to determine enemy Y position.");
      return null;
    }
    const p1CenterY = p1.y + p1.height / 2;
    const p2CenterY = p2.y + p2.height / 2;
    const enemyY = (p1CenterY + p2CenterY) / 2 - ENEMY_RADIUS; // Center of enemy
    const enemyX = ENEMY_RADIUS; // Start from left

    return {
      id: `enemy-${Date.now()}`,
      x: enemyX,
      y: enemyY,
      radius: ENEMY_RADIUS,
      width: ENEMY_RADIUS * 2,
      height: ENEMY_RADIUS * 2,
      vx: PLATFORM_SPEED * 0.5, 
      direction: 1,
      color: 'red', 
    };
  }, [ENEMY_RADIUS, PLATFORM_SPEED ]); // ENEMY_COLOR and ENEMY_SPEED_FACTOR are from config


  // Effect 1: Set isClient and Load Assets
  useEffect(() => {
    // console.log(`[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state: ${isClient}`);
    setIsClient(true);
    
    const allAssetPromises = [];
    const createImageLoadPromise = (src: string, key: keyof typeof assets, hint: string) => {
        const img = new Image();
        img.src = src;
        img.setAttribute('data-ai-hint', hint);
        return new Promise<void>((resolve) => {
            img.onload = () => {
                setAssets(prev => ({ ...prev, [key]: img, [`${String(key)}Loaded`]: true }));
                resolve();
            };
            img.onerror = () => {
                console.error(`Failed to load ${String(key)} from ${src}.`);
                setAssets(prev => ({ ...prev, [`${String(key)}Loaded`]: true })); // Mark as 'attempted'
                resolve();
            };
        });
    };

    allAssetPromises.push(createImageLoadPromise('/assets/images/hero_jeans3.png', 'playerImage', 'player character jeans'));
    allAssetPromises.push(createImageLoadPromise('/assets/images/platform_grass.png', 'tileImage', 'platform grass tile'));
    allAssetPromises.push(createImageLoadPromise('/assets/images/thankscoin.png', 'coinImage', 'collectible coin gold'));
    allAssetPromises.push(createImageLoadPromise('/assets/images/stone1.jpg', 'stoneImage', 'stone rock texture'));
    allAssetPromises.push(createImageLoadPromise('/assets/images/tree1.png', 'tree1Image', 'tree nature design'));
    allAssetPromises.push(createImageLoadPromise('/assets/images/tree2.png', 'tree2Image', 'tree nature outline'));
    allAssetPromises.push(createImageLoadPromise('/assets/images/flowers.png', 'smallBushImage', 'flowers small bush'));
    allAssetPromises.push(createImageLoadPromise('/assets/images/bush1.png', 'largeBushImage', 'bush large green'));
    allAssetPromises.push(createImageLoadPromise('/assets/images/house1.png', 'houseImage', 'house building facade'));
    
    Promise.all(allAssetPromises).then(() => {
        // console.log("[GameCanvas Effect 1] All asset loading attempts completed.");
    });
  }, []); 

  // Effect 2: Apply canvasSize to canvas attributes
  useEffect(() => {
    // console.log(`[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize: {width: ${canvasSize.width}, height: ${canvasSize.height}}`);
    const canvas = canvasRef.current;
    if (canvas) {
      if (canvas.width !== canvasSize.width) canvas.width = canvasSize.width;
      if (canvas.height !== canvasSize.height) canvas.height = canvasSize.height;
    }
  }, [canvasSize]);

  // Effect 3: Observe parent size
  useEffect(() => {
    // console.log("[GameCanvas Effect 3] Running: Observe parent size");
    const canvas = canvasRef.current;
    if (!canvas || !isClient) return;

    const updateCanvasSizeState = (entries?: ResizeObserverEntry[]) => {
      const parent = canvas.parentElement;
      if (parent) {
        const newWidth = parent.clientWidth > 0 ? parent.clientWidth : 0;
        const newHeight = parent.clientHeight > 0 ? parent.clientHeight : 0;
        setCanvasSize(currentSize => {
          if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
            // console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Updating canvasSize from W:${currentSize.width} H:${currentSize.height} to W:${newWidth} H:${newHeight}`);
            return { width: newWidth, height: newHeight };
          }
          return currentSize;
        });
      }
    };
    updateCanvasSizeState(); 
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateCanvasSizeState);
      if (canvas.parentElement) {
        resizeObserver.observe(canvas.parentElement);
      }
    } else {
      window.addEventListener('resize', updateCanvasSizeState);
    }
    return () => {
      if (resizeObserver && canvas.parentElement) {
        resizeObserver.unobserve(canvas.parentElement);
      } else {
        window.removeEventListener('resize', updateCanvasSizeState);
      }
    };
  }, [isClient]);

  // Effect 4: Load raw level data
  useEffect(() => {
    // console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
    //   console.log("[GameCanvas Effect 4] Not client or no levelPath, returning.");
      return;
    }
    setRawLevelData(null); 
    
    loadLevel(levelPath)
      .then(data => {
        if (data) {
        //   console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}`);
          setRawLevelData(data);
        } else {
          console.error(`[GameCanvas Effect 4] Failed to load rawLevelData for ${levelPath}`);
          setRawLevelData(null);
        }
      })
      .catch(error => {
        console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null);
      });
  }, [isClient, levelPath]);

  // Effect 5: Process raw level data
  useEffect(() => {
    const allAssetsLoaded =
        assets.playerImageLoaded && assets.tileImageLoaded && assets.coinImageLoaded &&
        assets.stoneImageLoaded && assets.tree1ImageLoaded && assets.tree2ImageLoaded &&
        assets.smallBushImageLoaded && assets.largeBushImageLoaded && assets.houseImageLoaded;

    // console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, allAssetsLoaded: ${allAssetsLoaded}`);

    if (isClient && rawLevelData && canvasSize.width > 0 && canvasSize.height > 0 && allAssetsLoaded) {
      // console.log("[GameCanvas Effect 5] Conditions met, processing rawLevelData...");
      const newProcessedLevel = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);
      if (newProcessedLevel) {
        // console.log("[GameCanvas Effect 5] Successfully processed level. Setting newProcessedLevel and newPlayer.");
        setProcessedLevel(newProcessedLevel);
      } else {
        // console.warn("[GameCanvas Effect 5] processRawLevelData returned null. Setting processedLevel to null.");
        setProcessedLevel(null); // Ensure reset if processing fails
      }
    } else {
        if (processedLevel !== null && (!rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsLoaded)) { 
            //  console.log("[GameCanvas Effect 5] Conditions not met or critical data missing. Resetting processedLevel.");
             setProcessedLevel(null); // Reset if critical dependencies become invalid
        }
        // if (!allAssetsLoaded && rawLevelData) console.log("[GameCanvas Effect 5] Waiting for all assets to load...");
    }
  }, [
    isClient, rawLevelData, canvasSize, assets, 
    processRawLevelData, 
    // parentPlayerRef, // Prop, not state that triggers this directly
    // playerInstanceRef, // Ref, not state
    // levelPath // Already handled by Effect 4 which sets rawLevelData
  ]);
  
  // Effect 6: Update processedLevelRef whenever processedLevel state changes
  useEffect(() => {
    processedLevelRef.current = processedLevel;
    // console.log("[GameCanvas Effect for processedLevelRef] processedLevelRef.current updated:", processedLevelRef.current ? "Exists" : "null");
  }, [processedLevel]);

  // Effect 7: Spawn entities and finish loading
  useEffect(() => {
    // console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevel}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, levelPath: ${levelPath}, activeCoins.length: ${activeCoins.length}`);

    if (!isClient || !processedLevel || canvasSize.width === 0 || canvasSize.height === 0) {
    //   console.log("[GameCanvas Effect 7] Pre-conditions (isClient, processedLevel, canvasSize) not met for entity spawn, returning.");
      if (isLoading && (!processedLevel || canvasSize.width === 0 || canvasSize.height === 0) && isClient) {
          // console.log("[GameCanvas Effect 7] Pre-conditions not met, but attempting to set isLoading to false to prevent hang if level processing failed.");
          // setIsLoading(false); // Cautious: This might hide other issues.
      }
      return;
    }
    
    if (isLoading) { 
      let coinsAttempted = activeCoins.length > 0;
      if (!coinsAttempted && processedLevel.tiles.length > 0) {
          // console.log(`[GameCanvas Effect 7] Spawning new coin pair for level ${levelPath}`);
          const newCoins = spawnNewCoinPair(processedLevel, canvasSize.width, canvasSize.height);
          // console.log(`[GameCanvas Effect 7] spawnNewCoinPair returned ${newCoins.length} coins. Setting activeCoins.`);
          setActiveCoins(newCoins);
          coinsAttempted = true; 
      } else if (processedLevel.tiles.length === 0) {
          // console.log("[GameCanvas Effect 7] No tiles in processedLevel, so no coins to spawn.");
          coinsAttempted = true; 
      }

      let enemiesAttempted = activeEnemies.length > 0;
      if (levelPath !== '/levels/level2.json' && levelPath !== '/levels/level1.json') { 
          if (!enemiesAttempted && processedLevel.tiles.length > 0) {
              const newEnemy = spawnSingleEnemy(processedLevel, canvasSize.width);
              if (newEnemy) {
                  setActiveEnemies([newEnemy]);
              }
              enemiesAttempted = true;
          } else if (processedLevel.tiles.length === 0) {
              enemiesAttempted = true;
          }
      } else {
           enemiesAttempted = true; // Enemies not spawned for level 1 or 2
      }
      
      if (coinsAttempted && enemiesAttempted) {
          // console.log(`[GameCanvas Effect 7] All entities attempted or not needed, setting isLoading to false.`);
          setIsLoading(false);
      } else {
        //   console.log(`[GameCanvas Effect 7] Waiting for entities to be ready. coinsAttempted: ${coinsAttempted}, enemiesAttempted: ${enemiesAttempted}`);
      }
    } else {
    //   console.log("[GameCanvas Effect 7] isLoading is false, skipping spawn logic (already loaded or loading finished).");
    }
  }, [
    isClient, isLoading, processedLevel, canvasSize, levelPath, 
    spawnNewCoinPair, spawnSingleEnemy, 
    setActiveCoins, setActiveEnemies, setIsLoading,
    activeCoins.length, activeEnemies.length 
  ]);


  // Effect 8: Coin Respawn Logic
   useEffect(() => {
    // console.log(`[GameCanvas Effect 8] Running: Check coin respawn. isLoading: ${isLoading}, processedLevel: ${!!processedLevel}`);
    if (isLoading || !isClient || !processedLevel || canvasSize.width === 0 || canvasSize.height === 0) {
      return;
    }
    const allCollectedAndParticlesGone = activeCoins.length > 0 && activeCoins.every(c => c.isCollected && c.particles.length === 0 && !c.isVisuallyPresent);
    if (allCollectedAndParticlesGone) {
        // console.log("[GameCanvas Effect 8] All coins collected and particles gone. Spawning new pair.");
        const newCoins = spawnNewCoinPair(processedLevel, canvasSize.width, canvasSize.height);
        setActiveCoins(newCoins);
    }
  }, [
    activeCoins, 
    isClient, isLoading, canvasSize, processedLevel, 
    spawnNewCoinPair, setActiveCoins
  ]);
  
  useEffect(() => {
    executeActionRef.current = executeAction;
  }, [executeAction]);

  const gameLoop = useCallback(() => {
    // console.log("[gameLoop] CALLED"); 
    const canvas = canvasRef.current;
    const player = playerInstanceRef.current;
    const currentLevel = processedLevelRef.current; 

    if (!canvas || !player || !currentLevel) {
      requestAnimationFrame(gameLoop); 
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      requestAnimationFrame(gameLoop);
      return;
    }

    const loopStartTime = Date.now();
    let deltaTime = loopStartTime - lastFrameTime.current;
    const MAX_DELTA_TIME_MS = 100;
    if (deltaTime > MAX_DELTA_TIME_MS) {
        deltaTime = MAX_DELTA_TIME_MS;
    }
    const deltaTimeFactor = Math.max(0.1, Math.min(2, deltaTime / (1000 / 60)));
    lastFrameTime.current = loopStartTime;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // --- Player Update Logic ---
    if (player) {
        const currentExecuteAction = executeActionRef.current;
        if (currentExecuteAction) {
            switch (currentExecuteAction) {
                case 'moveLeft': player.isMovingLeft = true; break;
                case 'moveRight': player.isMovingRight = true; break;
                case 'jump':
                    if (player.isOnGround) {
                        player.vy = JUMP_STRENGTH;
                        player.isOnGround = false;
                    }
                    break;
                case 'stopMoveLeft': player.isMovingLeft = false; break;
                case 'stopMoveRight': player.isMovingRight = false; break;
            }
            if(resetExecuteAction) resetExecuteAction();
            executeActionRef.current = null; 
        }

        player.vx = 0;
        if (player.isMovingLeft) player.vx = -PLAYER_SPEED;
        if (player.isMovingRight) player.vx = PLAYER_SPEED;
        if (player.isMovingLeft && player.isMovingRight) player.vx = 0;

        player.vy += GRAVITY * deltaTimeFactor;
        let nextPlayerX = player.x + player.vx * deltaTimeFactor;
        let nextPlayerY = player.y + player.vy * deltaTimeFactor;
        
        player.isOnGround = false;
        let activePlatform: ProcessedTile | null = null;
        let platformInducedMoveX = 0;

        currentLevel.tiles.forEach(tile => {
            if (tile.type !== 1) return; // Only collide with type 1 tiles

            const playerRect: Rect = { x: nextPlayerX, y: player.y, width: player.width, height: player.height };
            const tileRect: Rect = { x: tile.x, y: tile.y, width: tile.width, height: tile.height };

            if (checkCollision({ ...playerRect, x: nextPlayerX }, tileRect)) {
                if (player.vx > 0) { // Moving right
                    nextPlayerX = tile.x - player.width;
                } else if (player.vx < 0) { // Moving left
                    nextPlayerX = tile.x + tile.width;
                }
                player.vx = 0;
            }

            const playerRectVert: Rect = { x: player.x, y: nextPlayerY, width: player.width, height: player.height };
            if (checkCollision(playerRectVert, tileRect)) {
                if (player.vy > 0) { // Falling
                    nextPlayerY = tile.y - player.height;
                    player.isOnGround = true;
                    activePlatform = tile;
                    player.activePlatformId = tile.id;
                    player.vy = 0;
                } else if (player.vy < 0) { // Jumping up
                    nextPlayerY = tile.y + tile.height;
                    player.vy = 0;
                }
            }
        });
        
        player.x = nextPlayerX;
        player.y = nextPlayerY;

        if (player.vx > 0) player.facingDirection = 'right';
        if (player.vx < 0) player.facingDirection = 'left';

        if (activePlatform && activePlatform.vx && activePlatform.direction) {
            platformInducedMoveX = activePlatform.vx * activePlatform.direction * deltaTimeFactor;
            player.x += platformInducedMoveX;
        }
        if(player.activePlatformId && !activePlatform){ // Fell off a platform
            player.activePlatformId = null;
        }

        if (player.y + player.height > canvas.height) {
            player.y = canvas.height - player.height;
            player.isOnGround = true;
            player.vy = 0;
            player.activePlatformId = 'p_ground'; // Assume p_ground is always there
        }

        if (parentPlayerRef) parentPlayerRef.current = { ...player };
    }

    // --- Platform Update & Render Logic ---
    const backgroundTiles: ProcessedTile[] = [];
    const foregroundTiles: ProcessedTile[] = [];
    const mainLayerTiles: ProcessedTile[] = []; // For platforms

    currentLevel.tiles.forEach(tile => {
        if (tile.vx && tile.direction) { // Update moving platforms
            tile.x += tile.vx * tile.direction * deltaTimeFactor;
            if (tile.x + tile.width > canvas.width && tile.direction === 1) {
                tile.x = canvas.width - tile.width;
                tile.direction = -1;
            } else if (tile.x < 0 && tile.direction === -1) {
                tile.x = 0;
                tile.direction = 1;
            }
        }
        
        if (tile.id === 'p3' && levelPath === '/levels/level2.json' && p3BasePositionRef.current) {
            const p3Tile = tile;
            if (!p3MovementStateRef.current || loopStartTime >= p3MovementStateRef.current.startTime + P3_MOVEMENT_DURATION) {
                p3CurrentTargetIndexRef.current = (p3CurrentTargetIndexRef.current + 1 + Math.floor(Math.random() * (p3InterestPointsRef.current.length -1))) % p3InterestPointsRef.current.length;
                const targetOffset = p3InterestPointsRef.current[p3CurrentTargetIndexRef.current];
                p3MovementStateRef.current = {
                    startTime: loopStartTime,
                    startX: p3Tile.x,
                    startY: p3Tile.y,
                    targetX: p3BasePositionRef.current.x + targetOffset.x,
                    targetY: p3BasePositionRef.current.y + targetOffset.y,
                };
            }

            const state = p3MovementStateRef.current;
            const t = Math.min(1, (loopStartTime - state.startTime) / P3_MOVEMENT_DURATION);
            const newX = state.startX + (state.targetX - state.startX) * t;
            const newY = state.startY + (state.targetY - state.startY) * t;
            
            p3Tile.x = newX;
            p3Tile.y = newY;
        }

        if (tile.layer === 'foreground') {
            foregroundTiles.push(tile);
        } else if (tile.layer === 'background' && tile.type !== 1) { // Background decor, not platforms
            backgroundTiles.push(tile);
        } else { // Platforms and default layer decor
            mainLayerTiles.push(tile);
        }
    });

    // --- Render Logic ---
    // 1. Background decor
    backgroundTiles.forEach(tile => {
        if (tile.id === "tree1" && assets.tree1Image) ctx.drawImage(assets.tree1Image, tile.x, tile.y, tile.width, tile.height);
        else if (tile.id === "tree2" && assets.tree2Image) ctx.drawImage(assets.tree2Image, tile.x, tile.y, tile.width, tile.height);
        else if (tile.id === "house1" && assets.houseImage) ctx.drawImage(assets.houseImage, tile.x, tile.y, tile.width, tile.height);
        else { ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height); }
    });

    // 2. Main layer (platforms and default decor)
    mainLayerTiles.forEach(tile => {
        if (tile.type === 1) { // Platform
            if (tile.id.startsWith("stone_") && assets.stoneImage) ctx.drawImage(assets.stoneImage, tile.x, tile.y, tile.width, tile.height);
            else if (assets.tileImage) ctx.drawImage(assets.tileImage, tile.x, tile.y, tile.width, tile.height);
            else { ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height); }
        } else { // Default layer decor
             ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
        }
    });
    
    // 3. Player
    if (player) renderPlayer(ctx, player, assets.playerImage);

    // 4. Foreground decor
    foregroundTiles.forEach(tile => {
        if ((tile.id === "bush_left_1" || tile.id === "bush_right_1") && assets.smallBushImage) ctx.drawImage(assets.smallBushImage, tile.x, tile.y, tile.width, tile.height);
        else if ((tile.id === "bush_left_2" || tile.id === "bush_right_2") && assets.largeBushImage) ctx.drawImage(assets.largeBushImage, tile.x, tile.y, tile.width, tile.height);
        else { ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height); }
    });


    // (Keep coin and enemy rendering commented out for now)
    // renderCoins(ctx, activeCoins, assets.coinImage); 
    // if (activeEnemies.length > 0) renderEnemies(ctx, activeEnemies);


    requestAnimationFrame(gameLoop);
  }, [
    isClient, assets, resetExecuteAction, parentPlayerRef, levelPath,
    // Note: playerInstanceRef, processedLevelRef, p3 refs are accessed directly
    // Dependencies for useCallback should be stable or values that truly require re-memoization
    // For P3 movement, we might need to include P3_MOVEMENT_DURATION if it can change.
    PLAYER_SPEED, JUMP_STRENGTH, GRAVITY, P3_MOVEMENT_DURATION
  ]);

  // Effect 9: Game Loop Setup
  useEffect(() => {
    console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isLoading: ${isLoading}, isClient: ${isClient}, canvasRef: ${!!canvasRef.current}, canvasSize: W${canvasSize.width}H${canvasSize.height}, processedLevel: ${!!processedLevel}`);
    let animationFrameId: number | null = null;

    const conditionsMet = isClient && !isLoading && canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0 && processedLevel;

    if (conditionsMet) {
      console.log("[GameCanvas Effect 9] Conditions MET. Starting game loop.");
      lastFrameTime.current = Date.now(); 
      animationFrameId = requestAnimationFrame(gameLoop);
    } else {
      console.log("[GameCanvas Effect 9] Conditions NOT MET. Game loop will not start.");
      if (!isClient) console.log("[GameCanvas Effect 9] Reason: Not client");
      if (isLoading) console.log("[GameCanvas Effect 9] Reason: isLoading is true");
      if (!canvasRef.current) console.log("[GameCanvas Effect 9] Reason: canvasRef is null");
      if (!(canvasSize.width > 0 && canvasSize.height > 0)) console.log(`[GameCanvas Effect 9] Reason: canvasSize invalid (W:${canvasSize.width} H:${canvasSize.height})`);
      if (!processedLevel) console.log("[GameCanvas Effect 9] Reason: processedLevel is null (or processedLevelRef.current is null if checking ref)");
    }

    return () => {
      if (animationFrameId) {
        // console.log("[GameCanvas Effect 9] Cleanup: Cancelling animation frame.");
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isClient, isLoading, canvasSize, processedLevel, gameLoop]); // Added gameLoop as dependency


  // console.log(`[GameCanvas] Rendering. isClient: ${isClient}, isLoading: ${isLoading}, canvasSize: W${canvasSize.width}xH${canvasSize.height}`);
  
  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block outline-none"
    >
      Your browser does not support the HTML5 canvas tag.
    </canvas>
  );
}

