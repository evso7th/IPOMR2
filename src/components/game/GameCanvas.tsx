
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
  ENEMY_COLOR,
  ENEMY_SPEED_FACTOR,
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
import { renderEnemies } from '@/game/entities/enemyRenderer';
import { loadLevel } from '@/lib/levelLoader';

interface GameCanvasProps {
  levelPath: string;
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
    console.warn(`[parseDimension] Invalid dimension value: ${dim}. Defaulting to 0.`);
    return 0;
};


export default function GameCanvas({
  levelPath,
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
    tree1Image: null as HTMLImageElement | null, tree1ImageLoaded: false, // For default tree
    tree2Image: null as HTMLImageElement | null, tree2ImageLoaded: false, // For tree2 specific
    smallBushImage: null as HTMLImageElement | null, smallBushImageLoaded: false, // For flowers.png
    largeBushImage: null as HTMLImageElement | null, largeBushImageLoaded: false, // For bush1.png
    houseImage: null as HTMLImageElement | null, houseImageLoaded: false, // For house1.png
  });

  const [rawLevelData, setRawLevelData] = useState<RawLevelData | null>(null);
  const [processedLevel, setProcessedLevel] = useState<ProcessedLevelData | null>(null);
  const playerInstanceRef = useRef<PlayerState | null>(null);
  const [activeCoins, setActiveCoins] = useState<CoinState[]>([]);
  const [activeEnemies, setActiveEnemies] = useState<EnemyState[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  
  const lastFrameTime = useRef<number>(Date.now());
  
  const p3BasePositionRef = useRef<{ x: number; y: number } | null>(null);
  const p3InterestPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const p3CurrentTargetIndexRef = useRef<number>(0);
  const p3MovementStateRef = useRef<{startTime: number; startX: number; startY: number; targetX: number; targetY: number} | null>(null);
  
  const processedLevelRef = useRef<ProcessedLevelData | null>(null);
  const executeActionRef = useRef<GameAction | null>(null);

  const processRawLevelData = useCallback((
    currentRawLevelData: RawLevelData,
    currentCanvasWidth: number,
    currentCanvasHeight: number
  ): ProcessedLevelData | null => {
    console.log(`[GameCanvas processRawLevelData] Called with canvasSize W: ${currentCanvasWidth} H: ${currentCanvasHeight} for level: ${levelPath}`);
    if (!currentRawLevelData || currentCanvasWidth === 0 || currentCanvasHeight === 0) {
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
        default: 
          tileX = xOffset; tileY = yOffset;
      }
      return { ...rawTile, x: tileX, y: tileY, width: tileWidth, height: tileHeight };
    });

    // Programmatically add P3 for level2.json
    if (levelPath === '/levels/level2.json') {
        const p_ground_tile = processedTiles.find(t => t.id === 'p_ground');
        if (!p_ground_tile) {
            console.warn("[processRawLevelData] Level 2: p_ground_tile not found! Cannot reliably place P3 relative to it.");
        } else {
            const p_ground_top_y = p_ground_tile.y;
            
            const p3_actual_size_w = P3_SIZE_W;
            const p3_actual_size_h = P3_SIZE_H;

            // Center P3 horizontally
            const p3_base_x = (currentCanvasWidth / 2) - (p3_actual_size_w / 2);
            // P3's top surface is 300px above p_ground's top surface
            const p3_base_y = p_ground_top_y - 300 - p3_actual_size_h;

            p3BasePositionRef.current = { x: p3_base_x, y: p3_base_y };
            console.log('[processRawLevelData] Level 2: p_ground_top_y:', p_ground_top_y, 'p3BasePosRef.current:', p3BasePositionRef.current);

            p3InterestPointsRef.current = [
                { x: 0, y: 0 }, 
                { x: -P3_DRIFT_RANGE, y: -P3_DRIFT_RANGE }, 
                { x: P3_DRIFT_RANGE, y: P3_DRIFT_RANGE },   
                { x: -P3_DRIFT_RANGE, y: P3_DRIFT_RANGE },  
                { x: P3_DRIFT_RANGE, y: -P3_DRIFT_RANGE },  
            ];
            p3CurrentTargetIndexRef.current = 0; 
            p3MovementStateRef.current = null; // Reset movement state

            const p3TileToAdd: ProcessedTile = {
                id: 'p3',
                x: p3BasePositionRef.current.x + p3InterestPointsRef.current[0].x,
                y: p3BasePositionRef.current.y + p3InterestPointsRef.current[0].y,
                width: p3_actual_size_w,
                height: p3_actual_size_h,
                type: 1, 
                color: 'hsl(270, 70%, 60%)', 
                vx: 0, // Will be handled by P3 specific logic
                direction: 0,
                layer: 'main', 
            };
            processedTiles.push(p3TileToAdd);
            console.log('[processRawLevelData] Level 2: Added p3Tile:', p3TileToAdd);
        }
    }


    const playerStartPlatform = processedTiles.find(tile => tile.id === currentRawLevelData.playerStart.platformId);
    if (!playerStartPlatform) {
      console.error("[processRawLevelData] Player start platform not found! ID:", currentRawLevelData.playerStart.platformId);
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
    
    playerInstanceRef.current = newPlayer;
    if (parentPlayerRef) parentPlayerRef.current = newPlayer;

    const newProcessedLevelData: ProcessedLevelData = {
      playerStart: { xPx: playerInitialX, yPx: playerInitialY },
      tiles: processedTiles,
    };
    console.log("[processRawLevelData] Successfully processed. Player:", newPlayer, "Number of tiles:", processedTiles.length);
    return newProcessedLevelData;
  }, [
    assets.playerImage, 
    levelPath, parentPlayerRef,
    P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, 
    PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
    p3BasePositionRef, p3InterestPointsRef, p3CurrentTargetIndexRef, p3MovementStateRef
  ]);

  const spawnNewCoinPair = useCallback((
    currentProcessedLevel: ProcessedLevelData | null, 
    currentCanvasWidth: number, 
    currentCanvasHeight: number
  ): CoinState[] => {
    console.log(`[spawnNewCoinPair] DIAGNOSTIC SPAWN Called. Canvas W:${currentCanvasWidth}, H:${currentCanvasHeight}. ProcessedLevel exists: ${!!currentProcessedLevel}`);
    if (!currentProcessedLevel || currentCanvasWidth <= 0 || currentCanvasHeight <= 0) {
      return [];
    }
  
    const p_ground = currentProcessedLevel.tiles.find(t => t.id === 'p_ground');
    if (!p_ground) {
      console.warn("[spawnNewCoinPair] p_ground tile not found. Cannot spawn coins.");
      return [];
    }
    const p_groundTopY = p_ground.y;
    
    const ySpawnZoneBottomCoinTopEdge = p_groundTopY - COIN_VERTICAL_SPAWN_BOTTOM_OFFSET - COIN_SIZE;
    const gamePlatforms = currentProcessedLevel.tiles.filter(t => t.type === 1 && t.id !== 'p_ground' && t.id !== 'p3');
    let actualHighestPlatformTopY = p_groundTopY; 
  
    if (gamePlatforms.length > 0) {
        actualHighestPlatformTopY = Math.min(...gamePlatforms.map(p => p.y));
    }
    
    const ySpawnZoneTopCoinTopEdge = actualHighestPlatformTopY - MAX_JUMP_HEIGHT - COIN_SPAWN_TOP_MARGIN - COIN_SIZE;
  
    if (ySpawnZoneTopCoinTopEdge >= ySpawnZoneBottomCoinTopEdge) {
      console.warn(`[spawnNewCoinPair] Invalid spawn zone. Top: ${ySpawnZoneTopCoinTopEdge}, Bottom: ${ySpawnZoneBottomCoinTopEdge}. No coins spawned.`);
      return [];
    }
  
    const coins: CoinState[] = [];
    const numberOfCoinsToSpawn = 10; 
    console.log(`[spawnNewCoinPair] Attempting to spawn ${numberOfCoinsToSpawn} coins.`);
  
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
            targetSpawnTime: Date.now() + (i * COIN_SPAWN_STAGGER_DELAY), 
            currentOpacity: 0, // Start fully transparent for fade-in
            particles: [],
            isVisuallyPresent: true,
            rotationAngle: Math.random() * Math.PI * 2,
            rotationSpeed: COIN_ROTATION_SPEED_MIN + Math.random() * (COIN_ROTATION_SPEED_MAX - COIN_ROTATION_SPEED_MIN),
        });
    }
    console.log(`[spawnNewCoinPair] Created ${coins.length} coins. Coins:`, coins);
    return coins;
  }, [COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, MAX_JUMP_HEIGHT, COIN_SPAWN_TOP_MARGIN, COIN_SPAWN_STAGGER_DELAY, COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX]);

  const spawnSingleEnemy = useCallback((
    currentProcessedLevel: ProcessedLevelData | null, 
    currentCanvasWidth: number
  ): EnemyState | null => {
    if (!currentProcessedLevel || currentCanvasWidth <= 0) {
      return null;
    }
    
    const p1 = currentProcessedLevel.tiles.find(t => t.id === 'p1' || t.id === 'floating_platform_left' || t.id === 'floating_platform_1');
    const p2 = currentProcessedLevel.tiles.find(t => t.id === 'p2' || t.id === 'floating_platform_right' || t.id === 'floating_platform_2');

    if (!p1 || !p2) {
      return null;
    }
    const p1CenterY = p1.y + p1.height / 2;
    const p2CenterY = p2.y + p2.height / 2;
    const enemyY = (p1CenterY + p2CenterY) / 2 - ENEMY_RADIUS; 
    const enemyX = ENEMY_RADIUS; 

    return {
      id: `enemy-${Date.now()}`,
      x: enemyX,
      y: enemyY,
      radius: ENEMY_RADIUS,
      width: ENEMY_RADIUS * 2,
      height: ENEMY_RADIUS * 2,
      vx: PLATFORM_SPEED * ENEMY_SPEED_FACTOR, 
      direction: 1,
      color: ENEMY_COLOR, 
    };
  }, [ENEMY_RADIUS, PLATFORM_SPEED, ENEMY_SPEED_FACTOR, ENEMY_COLOR]);

  // Effect 1: Set isClient and Load Assets
  useEffect(() => {
    console.log("[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state:", isClient);
    setIsClient(true);
    
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
                setAssets(prev => ({ ...prev, [`${String(key)}Loaded`]: true })); 
                resolve();
            };
        });
    };
    
    const assetPromises = [
        createImageLoadPromise('/assets/images/hero_jeans3.png', 'playerImage', 'character orange blue'),
        createImageLoadPromise('/assets/images/platform_grass.png', 'tileImage', 'platform grass dirt'),
        createImageLoadPromise('/assets/images/thankscoin.png', 'coinImage', 'collectible coin gold'),
        createImageLoadPromise('/assets/images/stone1.jpg', 'stoneImage', 'stone rock texture'),
        createImageLoadPromise('/assets/images/tree1.png', 'tree1Image', 'tree nature design'), 
        createImageLoadPromise('/assets/images/tree2.png', 'tree2Image', 'tree nature outline'), 
        createImageLoadPromise('/assets/images/flowers.png', 'smallBushImage', 'flowers small bush'), 
        createImageLoadPromise('/assets/images/bush1.png', 'largeBushImage', 'bush large green'),
        createImageLoadPromise('/assets/images/house1.png', 'houseImage', 'house building facade')
    ];
    
    Promise.all(assetPromises).then(() => {
      console.log("[GameCanvas Effect 1] All asset loading attempts completed.");
    });
  }, []); 

  // Effect 2: Apply canvasSize to canvas attributes
  useEffect(() => {
    console.log("[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize:", canvasSize);
    const canvas = canvasRef.current;
    if (canvas) {
      if (canvas.width !== canvasSize.width) canvas.width = canvasSize.width;
      if (canvas.height !== canvasSize.height) canvas.height = canvasSize.height;
    }
  }, [canvasSize]);

  // Effect 3: Observe parent size
  useEffect(() => {
    console.log("[GameCanvas Effect 3] Running: Observe parent size");
    const canvas = canvasRef.current;
    if (!canvas || !isClient) return;

    const updateCanvasSizeState = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const newWidth = parent.clientWidth > 0 ? parent.clientWidth : 0;
        const newHeight = parent.clientHeight > 0 ? parent.clientHeight : 0;
        setCanvasSize(currentSize => {
          if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
            console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Updating canvasSize from W:${currentSize.width} H:${currentSize.height} to W:${newWidth} H:${newHeight}`);
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
    console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
      console.log("[GameCanvas Effect 4] Not client or no levelPath, returning.");
      return;
    }
    setRawLevelData(null); 
    if (!isLoading) setIsLoading(true); 
    
    loadLevel(levelPath)
      .then(data => {
        if (data) {
          console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}`);
          setRawLevelData(data);
        } else {
          console.warn(`[GameCanvas Effect 4] loadLevel returned null for ${levelPath}. Setting rawLevelData to null.`);
          setRawLevelData(null);
        }
      })
      .catch(error => {
        console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null);
      });
  }, [isClient, levelPath, setIsLoading, setRawLevelData, isLoading]); // Added isLoading to dependencies

  // Effect 5: Process raw level data
  useEffect(() => {
    const allAssetsReallyLoaded =
        assets.playerImageLoaded && assets.tileImageLoaded && assets.coinImageLoaded &&
        assets.stoneImageLoaded && assets.tree1ImageLoaded && assets.tree2ImageLoaded &&
        assets.smallBushImageLoaded && assets.largeBushImageLoaded && assets.houseImageLoaded;
    
    console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, allAssetsLoaded: ${allAssetsReallyLoaded}`);

    if (isClient && rawLevelData && canvasSize.width > 0 && canvasSize.height > 0 && allAssetsReallyLoaded) {
      console.log("[GameCanvas Effect 5] Conditions met, processing rawLevelData...");
      const newProcessedLevel = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);
      if (newProcessedLevel) {
        setProcessedLevel(newProcessedLevel);
        if (playerInstanceRef.current && parentPlayerRef) { 
          parentPlayerRef.current = playerInstanceRef.current;
        }
        console.log("[GameCanvas Effect 5] Successfully processed level. Setting newProcessedLevel and newPlayer.");
      } else {
        console.warn("[GameCanvas Effect 5] processRawLevelData returned null. Setting processedLevel to null.");
        setProcessedLevel(null);
      }
    } else {
        console.log("[GameCanvas Effect 5] Conditions NOT met for processing rawLevelData or critical data missing.");
        if (processedLevel !== null && (!rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsReallyLoaded)) {
            console.log("[GameCanvas Effect 5] Critical data became invalid, clearing processedLevel.");
             setProcessedLevel(null); 
        }
    }
  }, [
    isClient, rawLevelData, canvasSize, assets.playerImageLoaded, assets.tileImageLoaded, assets.coinImageLoaded, assets.stoneImageLoaded, assets.tree1ImageLoaded, assets.tree2ImageLoaded, assets.smallBushImageLoaded, assets.largeBushImageLoaded, assets.houseImageLoaded,
    processRawLevelData, setProcessedLevel, playerInstanceRef, parentPlayerRef, processedLevel
  ]);
  
  // Effect 6: Update processedLevelRef (for gameLoop)
  useEffect(() => {
    processedLevelRef.current = processedLevel;
    console.log("[GameCanvas Effect 6] processedLevelRef.current updated:", processedLevelRef.current ? "Exists" : "null");
  }, [processedLevel]);

  // Effect 7: Spawn entities and finish loading
  useEffect(() => {
    console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevel}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, levelPath: ${levelPath}, activeCoins.length: ${activeCoins.length}`);
    
    if (!isClient || !processedLevel || canvasSize.width === 0 || canvasSize.height === 0) {
      console.log("[GameCanvas Effect 7] Pre-conditions (isClient, processedLevel, canvasSize) not met for entity spawn, returning.");
      return; 
    }
    
    if (!isLoading) { 
      console.log("[GameCanvas Effect 7] isLoading is false, skipping spawn logic (already loaded or loading finished).");
      return;
    }
      
    let coinsSpawnedOrAttempted = activeCoins.length > 0;
    if (!coinsSpawnedOrAttempted && processedLevel.tiles.length > 0) {
        console.log(`[GameCanvas Effect 7] Spawning new coin pair for level ${levelPath}`);
        const newCoins = spawnNewCoinPair(processedLevel, canvasSize.width, canvasSize.height);
        setActiveCoins(newCoins);
        console.log(`[GameCanvas Effect 7] spawnNewCoinPair returned ${newCoins.length} coins. Setting activeCoins.`);
        coinsSpawnedOrAttempted = true; 
    } else if (processedLevel.tiles.length === 0) {
        console.log("[GameCanvas Effect 7] No tiles in level, so no coins needed.");
        coinsSpawnedOrAttempted = true; 
    }

    let enemiesSpawnedOrAttempted = activeEnemies.length > 0;
    if (levelPath !== '/levels/level2.json' && levelPath !== '/levels/level1.json') { 
        if (!enemiesSpawnedOrAttempted && processedLevel.tiles.length > 0) {
          const p1 = processedLevel.tiles.find(t => t.id === 'p1' || t.id === 'floating_platform_left' || t.id === 'floating_platform_1');
          const p2 = processedLevel.tiles.find(t => t.id === 'p2' || t.id === 'floating_platform_right' || t.id === 'floating_platform_2');
          if (p1 && p2) { 
            console.log(`[GameCanvas Effect 7] Spawning new enemy for level ${levelPath}`);
            const newEnemy = spawnSingleEnemy(processedLevel, canvasSize.width);
            if (newEnemy) {
                setActiveEnemies([newEnemy]);
            }
          }
          enemiesSpawnedOrAttempted = true;
        } else if (processedLevel.tiles.length === 0) {
            enemiesSpawnedOrAttempted = true;
        }
    } else {
         enemiesSpawnedOrAttempted = true; 
    }
    
    if (coinsSpawnedOrAttempted && enemiesSpawnedOrAttempted) {
        console.log("[GameCanvas Effect 7] All entities attempted or not needed, setting isLoading to false.");
        setIsLoading(false);
    }
  }, [
    isClient, isLoading, processedLevel, canvasSize, levelPath, 
    activeCoins.length, activeEnemies.length,
    spawnNewCoinPair, spawnSingleEnemy, 
    setActiveCoins, setActiveEnemies, setIsLoading
  ]);

  // Effect 8: Coin Respawn Logic
   useEffect(() => {
    console.log(`[GameCanvas Effect 8] Running: Check coin respawn. isLoading: ${isLoading}, processedLevel: ${!!processedLevelRef.current}, activeCoins length: ${activeCoins.length}`);
    if (isLoading || !isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) {
      return;
    }
    const allCollectedAndParticlesGone = activeCoins.length > 0 && activeCoins.every(c => c.isCollected && c.particles.length === 0 && !c.isVisuallyPresent);
    if (allCollectedAndParticlesGone) {
        console.log("[GameCanvas Effect 8] All coins collected and particles gone. Spawning new pair.");
        const newCoins = spawnNewCoinPair(processedLevelRef.current, canvasSize.width, canvasSize.height);
        setActiveCoins(newCoins);
    }
  }, [
    activeCoins, 
    isClient, isLoading, canvasSize,
    spawnNewCoinPair, // processRawLevelData already has spawnNewCoinPair in its deps
    setActiveCoins // Added setActiveCoins
  ]);
  
  useEffect(() => {
    executeActionRef.current = executeAction;
  }, [executeAction]);

  const gameLoop = useCallback(() => {
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
    
    const currentExecuteActionVal = executeActionRef.current;
    if (player) {
        if (currentExecuteActionVal) {
            switch (currentExecuteActionVal) {
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
            if(resetExecuteAction) {
                resetExecuteAction(); 
            }
            executeActionRef.current = null; 
        }

        player.vx = 0;
        if (player.isMovingLeft) player.vx = -PLAYER_SPEED;
        if (player.isMovingRight) player.vx = PLAYER_SPEED;
        if (player.isMovingLeft && player.isMovingRight) player.vx = 0;

        if (player.vx > 0) player.facingDirection = 'right';
        if (player.vx < 0) player.facingDirection = 'left';
        
        player.vy += GRAVITY * deltaTimeFactor;
        let nextPlayerX = player.x + player.vx * deltaTimeFactor;
        let nextPlayerY = player.y + player.vy * deltaTimeFactor;
        
        player.isOnGround = false; 
        let activePlatformThisFrame: ProcessedTile | null = null;

        currentLevel.tiles.forEach(tile => {
            if (tile.type !== 1) return; 

            const tileRect: Rect = { x: tile.x, y: tile.y, width: tile.width, height: tile.height };
            let hadHorizontalCollisionWithThisTile = false;

            const playerHorizontalRect: Rect = { x: nextPlayerX, y: player.y, width: player.width, height: player.height };
            if (checkCollision(playerHorizontalRect, tileRect)) {
                const playerCenter_X = nextPlayerX + player.width / 2;
                const tileCenter_X = tile.x + tile.width / 2;

                if (playerCenter_X < tileCenter_X) { 
                    nextPlayerX = tile.x - player.width;
                } else { 
                    nextPlayerX = tile.x + tile.width;
                }
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
                        player.isOnGround = true;
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
        player.activePlatformId = activePlatformThisFrame ? activePlatformThisFrame.id : null;

        if (player.isOnGround && activePlatformThisFrame && activePlatformThisFrame.vx && activePlatformThisFrame.direction) {
             const platformInducedMoveX = activePlatformThisFrame.vx * activePlatformThisFrame.direction * deltaTimeFactor;
             player.x += platformInducedMoveX;
             currentLevel.tiles.forEach(wallTile => {
                if (wallTile.type !== 1 || wallTile.id === activePlatformThisFrame?.id) return;
                if (checkCollision(player, wallTile)) {
                    if (platformInducedMoveX > 0) player.x = wallTile.x - player.width;
                    else if (platformInducedMoveX < 0) player.x = wallTile.x + wallTile.width;
                }
             });
        }
        
        const pGroundTile = currentLevel.tiles.find(t => t.id === 'p_ground');
        if (player.y + player.height > canvas.height) { // Check against canvas bottom first
          if (pGroundTile && player.y < pGroundTile.y + pGroundTile.height && player.y + player.height > pGroundTile.y) {
            player.y = pGroundTile.y - player.height;
            player.isOnGround = true;
            player.vy = 0;
            player.activePlatformId = pGroundTile.id;
          } else {
            // If no p_ground or not colliding with it, reset to player start
            // (This might need adjustment if levels can exist without p_ground)
            player.x = currentLevel.playerStart.xPx;
            player.y = currentLevel.playerStart.yPx;
            player.vx = 0;
            player.vy = 0;
            player.isOnGround = false;
            player.activePlatformId = null;
          }
        }
        if (parentPlayerRef) parentPlayerRef.current = { ...player };
    }
    
    setActiveCoins(prevCoins => {
      const now = Date.now();
      return prevCoins.map(coin => {
        let newOpacity = coin.currentOpacity;
        let newParticles = [...coin.particles];
        let newIsVisuallyPresent = coin.isVisuallyPresent;

        if (!coin.isCollected && now >= coin.targetSpawnTime && coin.currentOpacity < 1) {
          const fadeInProgress = Math.min(1, (now - coin.targetSpawnTime) / COIN_FADE_IN_DURATION);
          newOpacity = fadeInProgress;
        }

        if (coin.isCollected && coin.collectionTime && newIsVisuallyPresent) {
            if (newParticles.length === 0 && now >= coin.collectionTime) { 
                for (let i = 0; i < COIN_PARTICLE_COUNT; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = Math.random() * COIN_PARTICLE_SPEED_MULTIPLIER + 0.5;
                    newParticles.push({
                        x: coin.x + coin.width / 2,
                        y: coin.y + coin.height / 2,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        size: COIN_PARTICLE_SIZE,
                        opacity: 1,
                        life: COIN_PARTICLE_LIFESPAN,
                    });
                }
            }
            if (newParticles.length > 0) newOpacity = 0;
        }
        
        if (newParticles.length > 0) {
            newParticles = newParticles.map(p => {
                const pLifeProgress = Math.max(0, p.life - deltaTime);
                return {
                    ...p,
                    x: p.x + p.vx * deltaTimeFactor,
                    y: p.y + p.vy * deltaTimeFactor + (GRAVITY * COIN_PARTICLE_GRAVITY_FACTOR * deltaTimeFactor),
                    vy: p.vy + (GRAVITY * COIN_PARTICLE_GRAVITY_FACTOR * deltaTimeFactor),
                    opacity: pLifeProgress / COIN_PARTICLE_LIFESPAN,
                    life: pLifeProgress,
                };
            }).filter(p => p.life > 0);

            if (newParticles.length === 0 && coin.isCollected && coin.isVisuallyPresent) {
              newIsVisuallyPresent = false;
            }
        }
        
        let newRotationAngle = coin.rotationAngle;
        if(COIN_ROTATION_SPEED_MAX > 0) {
            newRotationAngle = (coin.rotationAngle + coin.rotationSpeed * deltaTimeFactor) % (Math.PI * 2);
        }

        return { ...coin, currentOpacity: newOpacity, particles: newParticles, isVisuallyPresent: newIsVisuallyPresent, rotationAngle: newRotationAngle };
      });
    });

    setActiveEnemies(prevEnemies => prevEnemies.map(enemy => {
        let newEnemyX = enemy.x + (enemy.vx * enemy.direction * deltaTimeFactor);
        let newEnemyDirection = enemy.direction;

        if (newEnemyX + enemy.width > canvas.width && enemy.direction === 1) {
            newEnemyX = canvas.width - enemy.width;
            newEnemyDirection = -1;
        } else if (newEnemyX < 0 && enemy.direction === -1) {
            newEnemyX = 0;
            newEnemyDirection = 1;
        }
        return { ...enemy, x: newEnemyX, direction: newEnemyDirection };
    }));
    
    activeEnemies.forEach(enemy => {
      if (player && checkCollision(player, enemy)) {
        const pGroundTile = currentLevel.tiles.find(t => t.id === 'p_ground');
        if (pGroundTile) {
          player.x = canvas.width / 2 - player.width / 2;
          player.y = pGroundTile.y - player.height;
          player.vx = 0;
          player.vy = 0;
          player.isOnGround = true;
          player.activePlatformId = pGroundTile.id;
        } else { 
            player.x = currentLevel.playerStart.xPx;
            player.y = currentLevel.playerStart.yPx;
            player.activePlatformId = null;
        }
      }
    });

    activeCoins.forEach(coin => {
      if (player && !coin.isCollected && coin.currentOpacity > 0.5 && checkCollision(player, coin)) {
        setActiveCoins(prevCoins => prevCoins.map(c => 
          c.id === coin.id ? { ...c, isCollected: true, collectionTime: Date.now() } : c
        ));
      }
    });

    const backgroundTiles: ProcessedTile[] = [];
    const foregroundTiles: ProcessedTile[] = [];
    const mainLayerTiles: ProcessedTile[] = []; 

    currentLevel.tiles.forEach(tile => {
        if (tile.vx && tile.direction) { 
            const tileSpeed = tile.vx * tile.direction * deltaTimeFactor;
            tile.x += tileSpeed;
            
            const waterPit = currentLevel.tiles.find(t => t.id === 'water_pit'); 
            if (tile.id === 'boat1' && waterPit && (levelPath === '/levels/level1.json' || levelPath.includes('level1'))) { 
                if (tile.x + tile.width > waterPit.x + waterPit.width && tile.direction === 1) {
                    tile.x = waterPit.x + waterPit.width - tile.width;
                    tile.direction = -1;
                } else if (tile.x < waterPit.x && tile.direction === -1) {
                    tile.x = waterPit.x;
                    tile.direction = 1;
                }
            } else { 
                if (tile.x + tile.width > canvas.width && tile.direction === 1) {
                    tile.x = canvas.width - tile.width;
                    tile.direction = -1;
                } else if (tile.x < 0 && tile.direction === -1) {
                    tile.x = 0;
                    tile.direction = 1;
                }
            }
        }
        
        if (tile.id === 'p3' && levelPath === '/levels/level2.json' && p3BasePositionRef.current && p3InterestPointsRef.current.length > 0) {
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
            
            const p3_delta_x = newX - p3Tile.x;
            const p3_delta_y = newY - p3Tile.y;

            p3Tile.x = newX;
            p3Tile.y = newY;

            if (player && player.activePlatformId === 'p3') {
                player.x += p3_delta_x;
                player.y += p3_delta_y;
            }
        }

        if (tile.layer === 'foreground') {
            foregroundTiles.push(tile);
        } else if (tile.layer === 'background' && tile.type !== 1) { 
            backgroundTiles.push(tile);
        } else { 
            mainLayerTiles.push(tile);
        }
    });

    backgroundTiles.forEach(tile => {
        if (tile.id === "tree1" && assets.tree1Image) ctx.drawImage(assets.tree1Image, tile.x, tile.y, tile.width, tile.height);
        else if (tile.id === "tree2" && assets.tree2Image) ctx.drawImage(assets.tree2Image, tile.x, tile.y, tile.width, tile.height);
        else if (tile.id === "tree_level1_1" && assets.tree2Image) ctx.drawImage(assets.tree2Image, tile.x, tile.y, tile.width, tile.height); // Level 1 tree
        else if (tile.id === "tree_stone_left" && assets.tree2Image) ctx.drawImage(assets.tree2Image, tile.x, tile.y, tile.width, tile.height); // Level 1 tree on stone
        else if (tile.id === "house1" && assets.houseImage) ctx.drawImage(assets.houseImage, tile.x, tile.y, tile.width, tile.height);
        else if (tile.type !== 1) { ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height); }
    });

    mainLayerTiles.forEach(tile => {
        if (tile.type === 1) { 
            if (tile.id.startsWith("stone_") && assets.stoneImage) ctx.drawImage(assets.stoneImage, tile.x, tile.y, tile.width, tile.height);
            else if (assets.tileImage) ctx.drawImage(assets.tileImage, tile.x, tile.y, tile.width, tile.height);
            else { ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height); }
        } else if (tile.layer !== 'background' && tile.layer !== 'foreground') { // Main layer non-platform decorative items
             if (tile.id === "water_area" || tile.id === "water_pit") { 
                ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
             } else if (tile.type !==1) { // Other decorative tiles on main layer that aren't platforms
                ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
             }
        }
    });
    
    if (activeCoins.length > 0) {
        renderCoins(ctx, activeCoins, assets.coinImage); 
    }

    if (activeEnemies.length > 0) {
        renderEnemies(ctx, activeEnemies);
    }
    
    if (player) renderPlayer(ctx, player, assets.playerImage);

    foregroundTiles.forEach(tile => {
        if ((tile.id === "bush_left_1" || tile.id === "bush_right_1" || tile.id === "bush_stone_left" || tile.id === "bush_stone_right") && assets.smallBushImage) ctx.drawImage(assets.smallBushImage, tile.x, tile.y, tile.width, tile.height);
        else if ((tile.id === "bush_left_2" || tile.id === "bush_right_2") && assets.largeBushImage) ctx.drawImage(assets.largeBushImage, tile.x, tile.y, tile.width, tile.height);
        else if (tile.type !== 1) { ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height); }
    });

    requestAnimationFrame(gameLoop);
  }, [ 
    isClient, assets, resetExecuteAction, parentPlayerRef, levelPath, 
    PLAYER_SPEED, JUMP_STRENGTH, GRAVITY, P3_MOVEMENT_DURATION,
    COIN_FADE_IN_DURATION, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_GRAVITY_FACTOR,
    COIN_ROTATION_SPEED_MAX, COIN_PARTICLE_COUNT, COIN_PARTICLE_SIZE, COIN_PARTICLE_SPEED_MULTIPLIER,
    setActiveCoins, setActiveEnemies, PLATFORM_SPEED, ENEMY_SPEED_FACTOR, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
    p3BasePositionRef, p3InterestPointsRef, p3CurrentTargetIndexRef, p3MovementStateRef
  ]);

  // Effect 9: Game Loop Setup
  useEffect(() => {
    console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize W: ${canvasSize.width} H: ${canvasSize.height}, processedLevel: ${!!processedLevelRef.current}`);
    let animationFrameId: number | null = null;
    const conditionsMet = isClient && !isLoading && canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0 && processedLevelRef.current;

    if (conditionsMet) {
      console.log("[GameCanvas Effect 9] Conditions MET. Starting game loop.");
      lastFrameTime.current = Date.now(); 
      animationFrameId = requestAnimationFrame(gameLoop);
    } else {
      console.log(`[GameCanvas Effect 9] Conditions NOT MET. Game loop will not start. isClient: ${isClient}, isLoading: ${isLoading}, canvas: ${!!canvasRef.current}, W: ${canvasSize.width}, H: ${canvasSize.height}, processedLevel: ${!!processedLevelRef.current}`);
    }
    return () => {
      if (animationFrameId) {
        console.log("[GameCanvas Effect 9] Cleanup: Cancelling animation frame.");
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isClient, isLoading, canvasSize, processedLevelRef, gameLoop]); // Ensure processedLevelRef.current stability or use processedLevel state if direct changes needed

  console.log(`[GameCanvas] Rendering. isClient: ${isClient}, isLoading: ${isLoading}, canvasSize: W${canvasSize.width}xH${canvasSize.height}`);
  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block outline-none"
      tabIndex={0} 
    >
      Your browser does not support the HTML5 canvas tag.
    </canvas>
  );
}


    