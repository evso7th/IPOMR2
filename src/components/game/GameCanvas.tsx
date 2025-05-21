
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
    playerImage: null as HTMLImageElement | null,
    playerImageLoaded: false,
    tileImage: null as HTMLImageElement | null,
    tileImageLoaded: false,
    coinImage: null as HTMLImageElement | null,
    coinImageLoaded: false,
    stoneImage: null as HTMLImageElement | null,
    stoneImageLoaded: false,
    tree1Image: null as HTMLImageElement | null,
    tree1ImageLoaded: false,
    tree2Image: null as HTMLImageElement | null,
    tree2ImageLoaded: false,
    smallBushImage: null as HTMLImageElement | null,
    smallBushImageLoaded: false,
    largeBushImage: null as HTMLImageElement | null,
    largeBushImageLoaded: false,
    houseImage: null as HTMLImageElement | null,
    houseImageLoaded: false,
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

  const processRawLevelData = useCallback(
    (
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
          case 'top-left':
            tileX = xOffset;
            tileY = yOffset;
            break;
          case 'top-center':
            tileX = (currentCanvasWidth / 2) - (tileWidth / 2) + xOffset;
            tileY = yOffset;
            break;
          case 'top-right':
            tileX = currentCanvasWidth - tileWidth - xOffset;
            tileY = yOffset;
            break;
          case 'center-left':
            tileX = xOffset;
            tileY = (currentCanvasHeight / 2) - (tileHeight / 2) + yOffset;
            break;
          case 'center':
            tileX = (currentCanvasWidth / 2) - (tileWidth / 2) + xOffset;
            tileY = (currentCanvasHeight / 2) - (tileHeight / 2) + yOffset;
            break;
          case 'center-right':
            tileX = currentCanvasWidth - tileWidth - xOffset;
            tileY = (currentCanvasHeight / 2) - (tileHeight / 2) + yOffset;
            break;
          case 'bottom-left':
            tileX = xOffset;
            tileY = currentCanvasHeight - tileHeight - yOffset;
            break;
          case 'bottom-center':
            tileX = (currentCanvasWidth / 2) - (tileWidth / 2) + xOffset;
            tileY = currentCanvasHeight - tileHeight - yOffset;
            break;
          case 'bottom-right':
            tileX = currentCanvasWidth - tileWidth - xOffset;
            tileY = currentCanvasHeight - tileHeight - yOffset;
            break;
          default:
            tileX = xOffset;
            tileY = yOffset;
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
        console.log(`[processRawLevelData] Level 2: p_ground_top_y: ${p_ground_top_y} p3BasePosRef.current:`, p3BasePositionRef.current);

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
        console.log(`[processRawLevelData] Level 2: Added p3Tile:`, p3Tile);
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
        isOnGround: false, // Start in air, gravity will apply
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
      console.log(`[processRawLevelData] Successfully processed. Player:`, newPlayer, "Number of tiles:", processedTiles.length);
      return newProcessedLevelData;
    },
    [
      assets.playerImage, 
      levelPath, 
      P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, 
      parentPlayerRef
    ]
  );

  const spawnNewCoinPair = useCallback(
    (currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number, currentCanvasHeight: number): CoinState[] => {
       // For now, return empty array. We'll restore coin spawning later.
      console.log("[spawnNewCoinPair] DIAGNOSTIC: Returning empty array for now.");
      return [];
    },
    [] // No dependencies for now as it's simplified
  );

  const spawnSingleEnemy = useCallback(
    (currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number): EnemyState | null => {
      // For now, return null. We'll restore enemy spawning later.
      console.log("[spawnSingleEnemy] DIAGNOSTIC: Returning null for now.");
      return null;
    },
    [] // No dependencies for now
  );


  // Effect 1: Set isClient and Load Assets
  useEffect(() => {
    console.log(`[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state: ${isClient}`);
    setIsClient(true);
    
    const allAssetPromises = [];

    const createAssetPromise = (src: string, assetName: string, hint: string) => {
        const img = new Image();
        img.src = src;
        img.setAttribute('data-ai-hint', hint);
        return new Promise<void>((resolve) => {
            img.onload = () => {
                console.log(`[GameCanvas Effect 1] ${assetName} loaded.`);
                setAssets(prev => ({ ...prev, [assetName]: img, [`${assetName}Loaded`]: true }));
                resolve();
            };
            img.onerror = () => {
                console.error(`Failed to load ${assetName}.`);
                setAssets(prev => ({ ...prev, [`${assetName}Loaded`]: true }));
                resolve(); // Resolve even on error to not block loading
            };
        });
    };

    allAssetPromises.push(createAssetPromise('/assets/images/hero_jeans3.png', 'playerImage', 'player character jeans'));
    allAssetPromises.push(createAssetPromise('/assets/images/platform_grass.png', 'tileImage', 'platform grass tile'));
    allAssetPromises.push(createAssetPromise('/assets/images/thankscoin.png', 'coinImage', 'collectible coin gold'));
    allAssetPromises.push(createAssetPromise('/assets/images/stone1.jpg', 'stoneImage', 'stone rock texture'));
    allAssetPromises.push(createAssetPromise('/assets/images/tree1.png', 'tree1Image', 'tree nature design'));
    allAssetPromises.push(createAssetPromise('/assets/images/tree2.png', 'tree2Image', 'tree nature outline'));
    allAssetPromises.push(createAssetPromise('/assets/images/flowers.png', 'smallBushImage', 'flowers small bush'));
    allAssetPromises.push(createAssetPromise('/assets/images/bush1.png', 'largeBushImage', 'bush large green'));
    allAssetPromises.push(createAssetPromise('/assets/images/house1.png', 'houseImage', 'house building facade'));
    
    Promise.all(allAssetPromises).then(() => {
        console.log("[GameCanvas Effect 1] All asset loading attempts completed.");
    });
  }, []); // Empty dependency array, runs once on mount

  // Effect 2: Apply canvasSize to canvas attributes
  useEffect(() => {
    console.log(`[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize: {width: ${canvasSize.width}, height: ${canvasSize.height}}`);
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

    const updateCanvasSizeState = (entries?: ResizeObserverEntry[]) => {
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
    
    loadLevel(levelPath)
      .then(data => {
        if (data) {
          console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}`);
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

    console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, allAssetsLoaded: ${allAssetsLoaded}`);

    if (isClient && rawLevelData && canvasSize.width > 0 && canvasSize.height > 0 && allAssetsLoaded) {
      console.log("[GameCanvas Effect 5] Conditions met, processing rawLevelData...");
      const newProcessedLevel = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);
      if (newProcessedLevel) {
        console.log("[GameCanvas Effect 5] Successfully processed level. Setting newProcessedLevel.");
        setProcessedLevel(newProcessedLevel);
        processedLevelRef.current = newProcessedLevel; 
      } else {
        console.warn("[GameCanvas Effect 5] processRawLevelData returned null. Setting processedLevel to null.");
        setProcessedLevel(null);
        processedLevelRef.current = null;
      }
    } else {
        if (processedLevel !== null) { 
             console.log("[GameCanvas Effect 5] Conditions not met or critical data missing. Setting processedLevel to null.");
             setProcessedLevel(null);
             processedLevelRef.current = null;
        }
         if (!allAssetsLoaded) console.log("[GameCanvas Effect 5] Waiting for all assets to load...");
    }
  }, [
    isClient, rawLevelData, canvasSize, assets, 
    processRawLevelData, 
    setProcessedLevel 
  ]);
  
  // Effect 7: Spawn entities and finish loading
  useEffect(() => {
    console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevel}, canvasSize W:${canvasSize.width}H${canvasSize.height}, levelPath: ${levelPath}, activeCoins.length: ${activeCoins.length}`);

    if (!isClient || !processedLevel || canvasSize.width === 0 || canvasSize.height === 0) {
      console.log("[GameCanvas Effect 7] Pre-conditions (isClient, processedLevel, canvasSize) not met for entity spawn, returning.");
      if (isLoading && isClient && (canvasSize.width === 0 || canvasSize.height === 0)) {
          // Still waiting for canvas size
      } else if (isLoading && isClient && !processedLevel) {
          // Still waiting for processedLevel
      }
      return;
    }

    if (isLoading) { // Only attempt to spawn and set isLoading to false if we are currently loading
      let coinsSpawned = activeCoins.length > 0;
      if (!coinsSpawned && processedLevel.tiles.length > 0) {
          console.log(`[GameCanvas Effect 7] Spawning new coin pair for level ${levelPath}`);
          const newCoins = spawnNewCoinPair(processedLevel, canvasSize.width, canvasSize.height);
          console.log(`[GameCanvas Effect 7] spawnNewCoinPair returned ${newCoins.length} coins. Setting activeCoins.`);
          setActiveCoins(newCoins);
          coinsSpawned = newCoins.length > 0; // Update based on actual spawn
      }

      let enemiesSpawned = activeEnemies.length > 0;
      if (levelPath !== '/levels/level2.json' && levelPath !== '/levels/level1.json') { // Only spawn enemies if not level 1 or 2
          if (!enemiesSpawned && processedLevel.tiles.length > 0) {
              console.log(`[GameCanvas Effect 7] Spawning enemy for level ${levelPath}`);
              const newEnemy = spawnSingleEnemy(processedLevel, canvasSize.width);
              if (newEnemy) {
                  setActiveEnemies([newEnemy]);
                  enemiesSpawned = true;
              }
          }
      } else {
           console.log(`[GameCanvas Effect 7] Enemies not spawned for level: ${levelPath}`);
           enemiesSpawned = true; // Consider "spawned" as not needed
      }
      
      // Only finish loading if coins are spawned (or not needed) AND enemies are spawned (or not needed)
      const coinsReady = activeCoins.length > 0 || processedLevel.tiles.length === 0; // Coins are ready if spawned or no tiles to spawn on
      
      if (coinsReady && enemiesSpawned) {
          console.log(`[GameCanvas Effect 7] All entities attempted or not needed (coinsReady: ${coinsReady}, enemiesSpawned: ${enemiesSpawned}), setting isLoading to false.`);
          setIsLoading(false);
      } else {
          console.log(`[GameCanvas Effect 7] Waiting for entities to be ready. coinsReady: ${coinsReady}, enemiesSpawned: ${enemiesSpawned}`);
      }
    } else {
      console.log("[GameCanvas Effect 7] isLoading is false, skipping spawn logic (already loaded or loading finished).");
    }
  }, [
    isClient, isLoading, processedLevel, canvasSize, levelPath, 
    activeCoins.length, activeEnemies.length, // Keep these to re-evaluate if entities are missing
    spawnNewCoinPair, spawnSingleEnemy, 
    setActiveCoins, setActiveEnemies, setIsLoading
  ]);


  // Effect 8: Coin Respawn Logic
   useEffect(() => {
    console.log(`[GameCanvas Effect 8] Running: Check coin respawn. isLoading: ${isLoading}, processedLevel: ${!!processedLevel}`);
    if (isLoading || !isClient || !processedLevel || canvasSize.width === 0 || canvasSize.height === 0) {
      return;
    }
    const allCollectedAndParticlesGone = activeCoins.length > 0 && activeCoins.every(c => c.isCollected && c.particles.length === 0 && !c.isVisuallyPresent);
    if (allCollectedAndParticlesGone) {
        console.log("[GameCanvas Effect 8] All coins collected and particles gone. Spawning new pair.");
        const newCoins = spawnNewCoinPair(processedLevel, canvasSize.width, canvasSize.height);
        setActiveCoins(newCoins);
    }
  }, [
    activeCoins, // Direct dependency on the array itself for deep comparison
    isClient, isLoading, canvasSize, processedLevel, 
    spawnNewCoinPair, setActiveCoins
  ]);
  
  useEffect(() => {
    executeActionRef.current = executeAction;
  }, [executeAction]);

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const player = playerInstanceRef.current;
    const currentLevel = processedLevelRef.current;

    if (!canvas || !player || !currentLevel) {
      requestAnimationFrame(gameLoop); // Keep trying if critical elements aren't ready
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

    // Player movement logic
    let newVx = player.vx;
    if (player.isMovingLeft) {
      newVx = -PLAYER_SPEED;
      player.facingDirection = 'left';
    } else if (player.isMovingRight) {
      newVx = PLAYER_SPEED;
      player.facingDirection = 'right';
    } else {
      newVx = 0;
    }

    const currentExecuteActionVal = executeActionRef.current;
    if (currentExecuteActionVal === 'jump' && player.isOnGround) {
      player.vy = JUMP_STRENGTH;
      player.isOnGround = false;
      if (resetExecuteAction) resetExecuteAction();
      executeActionRef.current = null;
    }
    
    player.vy += GRAVITY * deltaTimeFactor;
    let newPlayerX = player.x + newVx * deltaTimeFactor;
    let newPlayerY = player.y + player.vy * deltaTimeFactor;
    let platformInducedMoveX = 0;
    player.activePlatformId = null;

    // Tile updates and collision
    const updatedTiles = currentLevel.tiles.map(tile => {
      let newTileX = tile.x;
      if (tile.vx && tile.direction) {
        newTileX = tile.x + (tile.vx * tile.direction * deltaTimeFactor);
        if (newTileX < 0 || newTileX + tile.width > canvas.width) {
          return { ...tile, x: tile.x, direction: (tile.direction || 1) * -1 }; // Reverse direction
        }
        return { ...tile, x: newTileX };
      }
      return tile;
    });
    
    if (processedLevelRef.current) {
        processedLevelRef.current.tiles = updatedTiles;
    }


    // P3 Platform specific movement (if level2)
    if (levelPath === '/levels/level2.json') {
        const p3Tile = updatedTiles.find(t => t.id === 'p3');
        if (p3Tile && p3BasePositionRef.current && p3InterestPointsRef.current.length > 0) {
            if (!p3MovementStateRef.current || Date.now() >= p3MovementStateRef.current.startTime + P3_MOVEMENT_DURATION) {
                const currentTarget = p3InterestPointsRef.current[p3CurrentTargetIndexRef.current];
                const nextTargetIndex = (p3CurrentTargetIndexRef.current + 1) % p3InterestPointsRef.current.length;
                const nextTarget = p3InterestPointsRef.current[nextTargetIndex];
                
                p3MovementStateRef.current = {
                    startTime: Date.now(),
                    startX: p3Tile.x,
                    startY: p3Tile.y,
                    targetX: p3BasePositionRef.current.x + nextTarget.x,
                    targetY: p3BasePositionRef.current.y + nextTarget.y,
                };
                p3CurrentTargetIndexRef.current = nextTargetIndex;
            }

            if (p3MovementStateRef.current) {
                const { startTime, startX, startY, targetX, targetY } = p3MovementStateRef.current;
                const elapsedTime = Date.now() - startTime;
                const progress = Math.min(elapsedTime / P3_MOVEMENT_DURATION, 1);
                
                const oldP3X = p3Tile.x;
                const oldP3Y = p3Tile.y;

                p3Tile.x = startX + (targetX - startX) * progress;
                p3Tile.y = startY + (targetY - startY) * progress;

                const p3DeltaX = p3Tile.x - oldP3X;
                const p3DeltaY = p3Tile.y - oldP3Y;

                if (player.activePlatformId === 'p3') { // If player was on P3 last frame
                    newPlayerX += p3DeltaX;
                    newPlayerY += p3DeltaY; 
                }
            }
        }
    }


    // Vertical collision with platforms
    player.isOnGround = false;
    updatedTiles.forEach(tile => {
      if (tile.type === 1) { // Collidable platforms
        const playerFeet = { x: newPlayerX, y: newPlayerY + player.height, width: player.width, height: 1 };
        const platformSurface = { x: tile.x, y: tile.y, width: tile.width, height: 1 };

        if (checkCollision(playerFeet, tile) && player.vy >= 0) { // Check collision with top of the tile
           if (newPlayerY + player.height - tile.y <= player.vy * deltaTimeFactor + GRAVITY * deltaTimeFactor + 1) { // Ensure landing from above or same level
                newPlayerY = tile.y - player.height;
                player.vy = 0;
                player.isOnGround = true;
                player.activePlatformId = tile.id;
                if (tile.vx && tile.direction) {
                  platformInducedMoveX = tile.vx * tile.direction * deltaTimeFactor;
                }
           }
        }
      }
    });
    
    newPlayerX += platformInducedMoveX;

    // Horizontal collision with platforms
    updatedTiles.forEach(tile => {
      if (tile.type === 1) {
        const playerRect = { x: newPlayerX, y: newPlayerY, width: player.width, height: player.height };
        if (checkCollision(playerRect, tile)) {
          if (newPlayerX + player.width > tile.x && player.x <= tile.x) { // Colliding from left
            newPlayerX = tile.x - player.width;
            if(player.activePlatformId === tile.id) newPlayerX -= platformInducedMoveX; // Counteract platform movement if also on it
          } else if (newPlayerX < tile.x + tile.width && player.x + player.width >= tile.x + tile.width) { // Colliding from right
            newPlayerX = tile.x + tile.width;
            if(player.activePlatformId === tile.id) newPlayerX -= platformInducedMoveX; // Counteract platform movement
          }
        }
      }
    });
    
    // Canvas boundary checks
    if (newPlayerX < 0) newPlayerX = 0;
    if (newPlayerX + player.width > canvas.width) newPlayerX = canvas.width - player.width;
    if (newPlayerY < 0) { // Hit ceil
        newPlayerY = 0;
        player.vy = 0;
    }
    if (newPlayerY + player.height > canvas.height) {
        newPlayerY = canvas.height - player.height;
        player.isOnGround = true;
        player.vy = 0;
        player.activePlatformId = 'canvas_bottom'; // Special ID for canvas bottom
    }
    
    player.x = newPlayerX;
    player.y = newPlayerY;

    if (parentPlayerRef) parentPlayerRef.current = { ...player };

    // Render background tiles
    updatedTiles.forEach(tile => {
      if (tile.type === 1) { // Platforms
        if (assets.tileImageLoaded && assets.tileImage && tile.id !== 'p3') {
          ctx.drawImage(assets.tileImage, tile.x, tile.y, tile.width, tile.height);
        } else if (tile.id === 'p3' && assets.stoneImageLoaded && assets.stoneImage) { // Specific image for P3
          ctx.drawImage(assets.stoneImage, tile.x, tile.y, tile.width, tile.height);
        } else {
          ctx.fillStyle = tile.color || 'grey';
          ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
        }
      } else if (tile.layer !== 'foreground') { // Background decorative elements
          // Add specific image rendering for background decor if needed
          if (tile.id === "tree1" && assets.tree1ImageLoaded && assets.tree1Image) {
            ctx.drawImage(assets.tree1Image, tile.x, tile.y, tile.width, tile.height);
          } else if (tile.id === "tree2" && assets.tree2ImageLoaded && assets.tree2Image) {
            ctx.drawImage(assets.tree2Image, tile.x, tile.y, tile.width, tile.height);
          } else if (tile.id === "house1" && assets.houseImageLoaded && assets.houseImage) {
            ctx.drawImage(assets.houseImage, tile.x, tile.y, tile.width, tile.height);
          } else {
            ctx.fillStyle = tile.color || 'lightgrey';
            ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
          }
      }
    });

    // Render player
    renderPlayer(ctx, player, assets.playerImage);

    // Render foreground tiles
     updatedTiles.forEach(tile => {
        if (tile.type !== 1 && tile.layer === 'foreground') {
            if ((tile.id === "bush_left_1" || tile.id === "bush_right_1") && assets.smallBushImageLoaded && assets.smallBushImage) {
              ctx.drawImage(assets.smallBushImage, tile.x, tile.y, tile.width, tile.height);
            } else if ((tile.id === "bush_left_2" || tile.id === "bush_right_2") && assets.largeBushImageLoaded && assets.largeBushImage) {
              ctx.drawImage(assets.largeBushImage, tile.x, tile.y, tile.width, tile.height);
            } else {
              ctx.fillStyle = tile.color || 'darkgrey';
              ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
            }
        }
    });
    
    requestAnimationFrame(gameLoop);
  }, [
    isClient, assets, resetExecuteAction, parentPlayerRef, levelPath, 
    // Dependencies for P3 movement logic
    p3BasePositionRef, p3InterestPointsRef, p3CurrentTargetIndexRef, p3MovementStateRef,
    P3_DRIFT_RANGE, P3_MOVEMENT_DURATION, P3_SIZE_W, P3_SIZE_H
    // Note: playerInstanceRef and processedLevelRef are used via .current, so not direct dependencies here
    // canvasSize is read directly from canvas.width/height
  ]);

  // Effect 9: Game Loop Setup
  useEffect(() => {
    console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize: W${canvasSize.width}H${canvasSize.height}, processedLevel: ${!!processedLevelRef.current}`);
    let animationFrameId: number | null = null;

    const conditionsMet = isClient && !isLoading && canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0 && processedLevelRef.current;

    if (conditionsMet) {
      console.log("[GameCanvas Effect 9] Conditions MET. Starting game loop.");
      lastFrameTime.current = Date.now(); // Reset last frame time before starting loop
      animationFrameId = requestAnimationFrame(gameLoop);
    } else {
      console.log("[GameCanvas Effect 9] Conditions NOT MET. Game loop will not start.");
    }

    return () => {
      if (animationFrameId) {
        console.log("[GameCanvas Effect 9] Cleanup: Cancelling animation frame.");
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isClient, isLoading, canvasSize, gameLoop]); // Depends on gameLoop to restart if it changes, and isLoading/canvasSize

  // Simplified Diagnostic Rendering
  // useEffect(() => {
  //   if (isClient && canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
  //     const canvas = canvasRef.current;
  //     const ctx = canvas.getContext('2d');
  //     if (ctx) {
  //       ctx.clearRect(0, 0, canvas.width, canvas.height);
  //       ctx.fillStyle = 'red';
  //       ctx.fillRect(10, 10, 100, 50); // Draw a visible red rectangle
  //       console.log("[GameCanvas Diagnostic Draw] Red rectangle drawn.");
  //     }
  //   } else {
  //     console.log("[GameCanvas Diagnostic Draw] Conditions not met for drawing red rectangle.");
  //   }
  // }, [isClient, canvasSize]); 

  console.log(`[GameCanvas] Rendering. isClient: ${isClient}, isLoading: ${isLoading}, canvasSize: W${canvasSize.width}xH${canvasSize.height}`);
  
  // Always render the canvas to allow refs and parentElement access early
  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block outline-none"
    >
      Your browser does not support the HTML5 canvas tag.
    </canvas>
  );
}
