
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

    let p_ground_top_y = currentCanvasHeight - 1;
    const p_ground_tile = processedTiles.find(t => t.id === 'p_ground');
    if (p_ground_tile) {
      p_ground_top_y = p_ground_tile.y;
    } else {
      console.warn("[processRawLevelData] p_ground tile not found! Defaulting p_ground_top_y to canvas bottom.");
    }

    if (levelPath === '/levels/level2.json') {
        const p3_actual_size_w = P3_SIZE_W; 
        const p3_actual_size_h = P3_SIZE_H;
        
        const p3_base_x = (currentCanvasWidth / 2) - (p3_actual_size_w / 2);
        const p3_base_y = p_ground_top_y - 300 - p3_actual_size_h;


      p3BasePositionRef.current = { x: p3_base_x, y: p3_base_y };
      // console.log(`[processRawLevelData] Level 2: p_ground_top_y: ${p_ground_top_y} p3BasePosRef.current:`, p3BasePositionRef.current);

      p3InterestPointsRef.current = [
        { x: 0, y: 0 }, 
        { x: -P3_DRIFT_RANGE, y: -P3_DRIFT_RANGE }, 
        { x: P3_DRIFT_RANGE, y: P3_DRIFT_RANGE },   
        { x: -P3_DRIFT_RANGE, y: P3_DRIFT_RANGE },  
        { x: P3_DRIFT_RANGE, y: -P3_DRIFT_RANGE },  
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
        color: 'purple', 
        vx: 0, 
        direction: 0,
        layer: 'background',
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
    
    playerInstanceRef.current = newPlayer;
    if (parentPlayerRef) parentPlayerRef.current = newPlayer;

    const newProcessedLevelData: ProcessedLevelData = {
      playerStart: { xPx: playerInitialX, yPx: playerInitialY },
      tiles: processedTiles,
    };
    console.log(`[processRawLevelData] Successfully processed. Player set. Number of tiles: ${processedTiles.length}`);
    return newProcessedLevelData;
  }, [
    assets.playerImage, levelPath, parentPlayerRef,
    P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE 
  ]);

  const spawnNewCoinPair = useCallback((
    currentProcessedLevel: ProcessedLevelData | null, 
    currentCanvasWidth: number, 
    currentCanvasHeight: number
  ): CoinState[] => {
    // Simplified diagnostic spawn - one coin in the center
    if (!currentProcessedLevel || currentCanvasWidth <= 0 || currentCanvasHeight <= 0) {
      console.warn("[spawnNewCoinPair] DIAGNOSTIC SPAWN: Preconditions not met.");
      return [];
    }
    const coin: CoinState = {
        id: `test-coin-${Date.now()}`,
        x: currentCanvasWidth / 2 - COIN_SIZE / 2,
        y: currentCanvasHeight / 2 - COIN_SIZE / 2,
        width: COIN_SIZE,
        height: COIN_SIZE,
        isCollected: false,
        targetSpawnTime: Date.now(),
        currentOpacity: 1, // Full opacity for testing
        particles: [],
        isVisuallyPresent: true,
        rotationAngle: 0,
        rotationSpeed: 0,
    };
    console.log("[spawnNewCoinPair] DIAGNOSTIC SPAWN: Created 1 test coin:", coin);
    return [coin];
  }, []);


  const spawnSingleEnemy = useCallback((
    currentProcessedLevel: ProcessedLevelData | null, 
    currentCanvasWidth: number
  ): EnemyState | null => {
    if (!currentProcessedLevel || currentCanvasWidth <= 0) return null;
    
    const p1 = currentProcessedLevel.tiles.find(t => t.id === 'p1' || t.id === 'floating_platform_left' || t.id === 'floating_platform_1');
    const p2 = currentProcessedLevel.tiles.find(t => t.id === 'p2' || t.id === 'floating_platform_right' || t.id === 'floating_platform_2');

    if (!p1 || !p2) {
      console.warn("[spawnSingleEnemy] Could not find P1 or P2 to determine enemy Y position.");
      return null;
    }
    const p1CenterY = p1.y + p1.height / 2;
    const p2CenterY = p2.y + p2.height / 2;
    const enemyY = (p1CenterY + p2CenterY) / 2 - ENEMY_RADIUS;
    const enemyX = ENEMY_RADIUS; // Start from left

    return {
      id: `enemy-${Date.now()}`,
      x: enemyX,
      y: enemyY,
      radius: ENEMY_RADIUS,
      width: ENEMY_RADIUS * 2,
      height: ENEMY_RADIUS * 2,
      vx: PLATFORM_SPEED * 0.5, // Slower than platforms
      direction: 1,
      color: 'red', // Using a default color as ENEMY_COLOR might not be imported
    };
  }, []);


  // Effect 1: Set isClient and Load Assets
  useEffect(() => {
    console.log(`[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state: ${isClient}`);
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
        console.log("[GameCanvas Effect 1] All asset loading attempts completed.");
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
    //   console.log("[GameCanvas Effect 5] Conditions met, processing rawLevelData...");
      const newProcessedLevel = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);
      if (newProcessedLevel) {
        // console.log("[GameCanvas Effect 5] Successfully processed level. Setting newProcessedLevel and newPlayer.");
        setProcessedLevel(newProcessedLevel);
      } else {
        console.warn("[GameCanvas Effect 5] processRawLevelData returned null. Setting processedLevel to null.");
        setProcessedLevel(null);
      }
    } else {
        if (processedLevel !== null) { 
            //  console.log("[GameCanvas Effect 5] Conditions not met or critical data missing. Setting processedLevel to null.");
             setProcessedLevel(null);
        }
        // if (!allAssetsLoaded && rawLevelData) console.log("[GameCanvas Effect 5] Waiting for all assets to load...");
    }
  }, [
    isClient, rawLevelData, canvasSize, assets, 
    processRawLevelData, 
    // setProcessedLevel // setProcessedLevel itself should not be a dependency
    // playerInstanceRef is a ref, parentPlayerRef is a prop ref - not state dependencies for this effect's trigger
  ]);
  
  // Effect to update processedLevelRef whenever processedLevel state changes
  useEffect(() => {
    processedLevelRef.current = processedLevel;
    // console.log("[GameCanvas Effect for processedLevelRef] processedLevelRef.current updated:", processedLevelRef.current ? "Exists" : "null");
  }, [processedLevel]);


  // Effect 7: Spawn entities and finish loading
  useEffect(() => {
    console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevel}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, levelPath: ${levelPath}, activeCoins.length: ${activeCoins.length}`);

    if (!isClient || !processedLevel || canvasSize.width === 0 || canvasSize.height === 0) {
    //   console.log("[GameCanvas Effect 7] Pre-conditions (isClient, processedLevel, canvasSize) not met for entity spawn, returning.");
      return;
    }

    if (isLoading) { 
      let coinsAttempted = activeCoins.length > 0;
      if (!coinsAttempted && processedLevel.tiles.length > 0) {
          console.log(`[GameCanvas Effect 7] Spawning new coin pair for level ${levelPath}`);
          const newCoins = spawnNewCoinPair(processedLevel, canvasSize.width, canvasSize.height);
          console.log(`[GameCanvas Effect 7] spawnNewCoinPair returned ${newCoins.length} coins. Setting activeCoins.`);
          setActiveCoins(newCoins);
          coinsAttempted = true; 
      } else if (processedLevel.tiles.length === 0) {
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
           enemiesAttempted = true; 
      }
      
      if (coinsAttempted && enemiesAttempted) {
          console.log(`[GameCanvas Effect 7] All entities attempted or not needed, setting isLoading to false.`);
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
    activeCoins.length, activeEnemies.length // Keep these to re-evaluate if entities are missing after initial load
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
    // console.log("[gameLoop] CALLED"); // Diagnostic
    const canvas = canvasRef.current;
    const player = playerInstanceRef.current;
    const currentLevel = processedLevelRef.current; // Use the ref for level data

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
    
    // SIMPLIFIED DRAW FOR DEBUGGING
    ctx.fillStyle = 'red';
    ctx.fillRect(10, 10, 50, 50);
    // console.log("[gameLoop] Red square drawn.");

    requestAnimationFrame(gameLoop);
  }, [
    // Minimal stable dependencies. States accessed via refs or setters.
    assets, resetExecuteAction, parentPlayerRef, levelPath, 
    p3BasePositionRef, p3InterestPointsRef, p3CurrentTargetIndexRef, p3MovementStateRef,
    // No canvasSize, activeCoins, activeEnemies as direct dependencies here.
    // spawnNewCoinPair, spawnSingleEnemy, processRawLevelData are memoized.
    // setIsLoading, setActiveCoins, setActiveEnemies are stable setters.
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
      if (!processedLevel) console.log("[GameCanvas Effect 9] Reason: processedLevel is null");
    }

    return () => {
      if (animationFrameId) {
        // console.log("[GameCanvas Effect 9] Cleanup: Cancelling animation frame.");
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isClient, isLoading, canvasSize, processedLevel, gameLoop]); 


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

