
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
  
  const p3BasePositionRef = useRef<{ x: number; y: number } | null>(null);
  const p3InterestPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const p3CurrentTargetIndexRef = useRef<number>(0);
  const p3MovementStateRef = useRef<{startTime: number; startX: number; startY: number; targetX: number; targetY: number} | null>(null);
  
  const processedLevelRef = useRef<ProcessedLevelData | null>(null);
  const executeActionRef = useRef<GameAction | null>(null);

  useEffect(() => {
    executeActionRef.current = executeAction;
  }, [executeAction]);


  // Helper functions wrapped in useCallback
  const processRawLevelData = useCallback((
    currentRawLevelData: RawLevelData,
    currentCanvasWidth: number,
    currentCanvasHeight: number
  ): ProcessedLevelData | null => {
    if (!currentRawLevelData || currentCanvasWidth === 0 || currentCanvasHeight === 0) {
      console.warn("[processRawLevelData] Aborting: No raw level data or canvas dimensions invalid.", currentRawLevelData, currentCanvasWidth, currentCanvasHeight);
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
          console.warn(`[processRawLevelData] Unknown anchor: ${rawTile.positioning.anchor} for tile ${rawTile.id}. Defaulting to top-left.`);
          tileX = xOffset; tileY = yOffset;
      }
      return { ...rawTile, x: tileX, y: tileY, width: tileWidth, height: tileHeight };
    });

    const p_ground_tile = processedTiles.find(t => t.id === 'p_ground');
    
    if (levelPath === '/levels/level2.json') {
      if (!p_ground_tile) {
        console.warn("[processRawLevelData] Level 2: p_ground tile not found! Cannot reliably place P3.");
      } else {
        const p_ground_top_y = p_ground_tile.y;
        const p3_base_x = (currentCanvasWidth / 2) - (P3_SIZE_W / 2);
        const p3_base_y = p_ground_top_y - 300; // P3 floats 300px above p_ground

        p3BasePositionRef.current = { x: p3_base_x, y: p3_base_y };
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
            width: P3_SIZE_W,
            height: P3_SIZE_H,
            type: 1, 
            color: 'hsl(270, 70%, 60%)', // Distinct color for P3
            vx: 0, 
            direction: 0, // Will be managed by its own movement logic
            layer: 'background', // Or main, depending on desired interaction
        };
        processedTiles.push(p3Tile);
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

    const gamePlatforms = currentProcessedLevel.tiles.filter(t => t.type === 1 && t.id !== 'p_ground');
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
            currentOpacity: 0,
            particles: [],
            isVisuallyPresent: true,
            rotationAngle: Math.random() * Math.PI * 2,
            rotationSpeed: COIN_ROTATION_SPEED_MIN + Math.random() * (COIN_ROTATION_SPEED_MAX - COIN_ROTATION_SPEED_MIN),
        });
    }
    return coins;
  }, [COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, MAX_JUMP_HEIGHT, COIN_SPAWN_TOP_MARGIN, COIN_SPAWN_STAGGER_DELAY, COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX]);


  const spawnSingleEnemy = useCallback((
    currentProcessedLevel: ProcessedLevelData | null, 
    currentCanvasWidth: number
  ): EnemyState | null => {
    if (!currentProcessedLevel || currentCanvasWidth <= 0) {
      console.warn("[spawnSingleEnemy] Aborting: No processed level or canvas width invalid.");
      return null;
    }
    
    const p1 = currentProcessedLevel.tiles.find(t => t.id === 'p1' || t.id === 'floating_platform_left' || t.id === 'floating_platform_1');
    const p2 = currentProcessedLevel.tiles.find(t => t.id === 'p2' || t.id === 'floating_platform_right' || t.id === 'floating_platform_2');

    if (!p1 || !p2) {
      console.warn("[spawnSingleEnemy] Required platforms p1 or p2 not found. Cannot spawn enemy.");
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
      // All asset loading attempts completed.
    });
  }, []); 

  // Effect 2: Apply canvasSize to canvas attributes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      if (canvas.width !== canvasSize.width) canvas.width = canvasSize.width;
      if (canvas.height !== canvasSize.height) canvas.height = canvasSize.height;
    }
  }, [canvasSize]);

  // Effect 3: Observe parent size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isClient) return;

    const updateCanvasSizeState = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const newWidth = parent.clientWidth > 0 ? parent.clientWidth : 0;
        const newHeight = parent.clientHeight > 0 ? parent.clientHeight : 0;
        setCanvasSize(currentSize => {
          if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
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
    if (!isClient || !levelPath) {
      return;
    }
    if (!isLoading) setIsLoading(true); 
    setRawLevelData(null); 
    
    loadLevel(levelPath)
      .then(data => {
        if (data) {
          setRawLevelData(data);
        } else {
          setRawLevelData(null); // Explicitly set to null on failure
        }
      })
      .catch(error => {
        console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null);
      });
  }, [isClient, levelPath, setIsLoading]); // Removed isLoading from here

  // Effect 5: Process raw level data
  useEffect(() => {
    const allAssetsLoaded =
        assets.playerImageLoaded && assets.tileImageLoaded && assets.coinImageLoaded &&
        assets.stoneImageLoaded && assets.tree1ImageLoaded && assets.tree2ImageLoaded &&
        assets.smallBushImageLoaded && assets.largeBushImageLoaded && assets.houseImageLoaded;

    if (isClient && rawLevelData && canvasSize.width > 0 && canvasSize.height > 0 && allAssetsLoaded) {
      const newProcessedLevel = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);
      if (newProcessedLevel) {
        setProcessedLevel(newProcessedLevel);
      } else {
        setProcessedLevel(null); // Explicitly set to null if processing fails
      }
       // Clear previous entities when level data changes or canvas resizes
      setActiveCoins([]);
      setActiveEnemies([]);
    } else {
        if (processedLevel !== null && (!rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsLoaded)) { 
             setProcessedLevel(null); 
             setActiveCoins([]);
             setActiveEnemies([]);
        }
    }
  }, [
    isClient, rawLevelData, canvasSize, assets, 
    processRawLevelData, setProcessedLevel, setActiveCoins, setActiveEnemies 
  ]);
  
  // Effect 6: Update processedLevelRef (for gameLoop)
  useEffect(() => {
    processedLevelRef.current = processedLevel;
  }, [processedLevel]);

  // Effect 7: Spawn entities and finish loading
  useEffect(() => {
    if (!isClient || !processedLevel || canvasSize.width === 0 || canvasSize.height === 0) {
      return; 
    }
    
    if (!isLoading) { 
        return;
    }
      
    let coinsAttempted = activeCoins.length > 0;
    if (!coinsAttempted && processedLevel.tiles.length > 0) {
        const newCoins = spawnNewCoinPair(processedLevel, canvasSize.width, canvasSize.height);
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
    if (isLoading || !isClient || !processedLevel || canvasSize.width === 0 || canvasSize.height === 0) {
      return;
    }
    const allCollectedAndParticlesGone = activeCoins.length > 0 && activeCoins.every(c => c.isCollected && c.particles.length === 0 && !c.isVisuallyPresent);
    if (allCollectedAndParticlesGone) {
        const newCoins = spawnNewCoinPair(processedLevel, canvasSize.width, canvasSize.height);
        setActiveCoins(newCoins);
    }
  }, [
    activeCoins, 
    isClient, isLoading, canvasSize, processedLevel, 
    spawnNewCoinPair, setActiveCoins
  ]);
  

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
    
    // Player Update Logic
    if (player) {
        const currentActionFromRef = executeActionRef.current;
        if (currentActionFromRef) {
            switch (currentActionFromRef) {
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
        
        player.isOnGround = false; // Reset before collision checks
        let activePlatformThisFrame: ProcessedTile | null = null;

        currentLevel.tiles.forEach(tile => {
            if (tile.type !== 1) return; 

            const tileRect: Rect = { x: tile.x, y: tile.y, width: tile.width, height: tile.height };
            let hadHorizontalCollisionWithThisTile = false;

            // Horizontal collision check
            const playerHorizontalRect: Rect = { x: nextPlayerX, y: player.y, width: player.width, height: player.height };
            if (checkCollision(playerHorizontalRect, tileRect)) {
                if (player.vx > 0) { 
                    nextPlayerX = tile.x - player.width;
                } else if (player.vx < 0) { 
                    nextPlayerX = tile.x + tile.width;
                }
                player.vx = 0;
                hadHorizontalCollisionWithThisTile = true;
            }

            // Vertical collision check
            const playerVerticalRect: Rect = { x: player.x, y: nextPlayerY, width: player.width, height: player.height };
            if (checkCollision(playerVerticalRect, tileRect)) {
                if (player.vy > 0) { // Moving down
                    if (hadHorizontalCollisionWithThisTile) {
                        nextPlayerY = tile.y - player.height; 
                        player.vy = 0; 
                        // Do not set player.isOnGround or activePlatformThisFrame for this tile
                    } else {
                        nextPlayerY = tile.y - player.height;
                        player.isOnGround = true;
                        activePlatformThisFrame = tile;
                        player.vy = 0;
                    }
                } else if (player.vy < 0) { // Moving up (jumping)
                    nextPlayerY = tile.y + tile.height;
                    player.vy = 0;
                }
            }
        });
        
        player.x = nextPlayerX;
        player.y = nextPlayerY;
        player.activePlatformId = activePlatformThisFrame ? activePlatformThisFrame.id : null;


        // Movement with platform if player is on it
        if (player.isOnGround && activePlatformThisFrame && activePlatformThisFrame.vx && activePlatformThisFrame.direction) {
             const platformInducedMoveX = activePlatformThisFrame.vx * activePlatformThisFrame.direction * deltaTimeFactor;
             player.x += platformInducedMoveX;
             // Ensure player doesn't get pushed into walls by platform
             currentLevel.tiles.forEach(wallTile => {
                if (wallTile.type !== 1 || wallTile.id === activePlatformThisFrame?.id) return;
                if (checkCollision(player, wallTile)) {
                    if (platformInducedMoveX > 0) player.x = wallTile.x - player.width;
                    else if (platformInducedMoveX < 0) player.x = wallTile.x + wallTile.width;
                }
             });
        }


        // Boundary checks / Fall through floor
        if (player.y + player.height > canvas.height) {
            const pGround = currentLevel.tiles.find(t => t.id === 'p_ground');
            if (pGround && pGround.height > 0) { // Check if p_ground is substantial
                 player.y = canvas.height - player.height; // Fall onto the actual bottom of canvas if p_ground is just 1px
                 player.isOnGround = true;
                 player.vy = 0;
                 player.activePlatformId = pGround.id;
            } else { // If no p_ground or it's negligible, reset to start (or handle game over)
                // This is a basic reset, replace with game over logic if needed
                player.x = currentLevel.playerStart.xPx;
                player.y = currentLevel.playerStart.yPx;
                player.vx = 0;
                player.vy = 0;
                player.isOnGround = false; // Will re-evaluate on next frame
            }
        }


        if (parentPlayerRef) parentPlayerRef.current = { ...player };
    }

    // Platform and Decor Update & Render Logic
    const backgroundTiles: ProcessedTile[] = [];
    const foregroundTiles: ProcessedTile[] = [];
    const mainLayerTiles: ProcessedTile[] = []; 

    currentLevel.tiles.forEach(tile => {
        if (tile.vx && tile.direction) { 
            tile.x += (tile.vx * tile.direction * deltaTimeFactor);
            
            const waterPit = currentLevel.tiles.find(t => t.id === 'water_pit');
            if (tile.id === 'boat1' && waterPit) {
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

    // Render Background decor
    backgroundTiles.forEach(tile => {
        if (tile.id === "tree1" && assets.tree1Image) ctx.drawImage(assets.tree1Image, tile.x, tile.y, tile.width, tile.height);
        else if (tile.id === "tree2" && assets.tree2Image) ctx.drawImage(assets.tree2Image, tile.x, tile.y, tile.width, tile.height);
        else if (tile.id === "house1" && assets.houseImage) ctx.drawImage(assets.houseImage, tile.x, tile.y, tile.width, tile.height);
        else if (tile.type !== 1) { ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height); }
    });

    // Render Main layer (platforms and default decor)
    mainLayerTiles.forEach(tile => {
        if (tile.type === 1) { 
            if (tile.id.startsWith("stone_") && assets.stoneImage) ctx.drawImage(assets.stoneImage, tile.x, tile.y, tile.width, tile.height);
            else if (assets.tileImage) ctx.drawImage(assets.tileImage, tile.x, tile.y, tile.width, tile.height);
            else { ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height); }
        } else if (tile.layer !== 'background' && tile.layer !== 'foreground') { // Only draw non-layered decor here
             ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
        }
    });
    
    if (player) renderPlayer(ctx, player, assets.playerImage);

    // Update and Render Coins
    setActiveCoins(prevCoins => 
        prevCoins.map(coin => {
            let newOpacity = coin.currentOpacity;
            if (!coin.isCollected && Date.now() >= coin.targetSpawnTime && coin.currentOpacity < 1) {
                newOpacity = Math.min(1, coin.currentOpacity + (deltaTime / COIN_FADE_IN_DURATION));
            }

            let newParticles = coin.particles.map(p => {
                const particleDeltaTimeFactor = deltaTime / (1000 / 60); 
                return {
                    ...p,
                    x: p.x + p.vx * particleDeltaTimeFactor,
                    y: p.y + p.vy * particleDeltaTimeFactor,
                    vy: p.vy + (GRAVITY * COIN_PARTICLE_GRAVITY_FACTOR * particleDeltaTimeFactor),
                    life: p.life - deltaTime,
                    opacity: Math.max(0, p.life / COIN_PARTICLE_LIFESPAN),
                };
            }).filter(p => p.life > 0);

            const updatedCoin = { ...coin, currentOpacity: newOpacity, particles: newParticles };
            
            if (coin.isCollected && coin.particles.length === 0 && newParticles.length === 0 && coin.isVisuallyPresent) {
                 updatedCoin.isVisuallyPresent = false;
            }
            
            if (COIN_ROTATION_SPEED_MAX > 0 || COIN_ROTATION_SPEED_MIN > 0) {
              updatedCoin.rotationAngle = (updatedCoin.rotationAngle + updatedCoin.rotationSpeed * deltaTimeFactor) % (Math.PI * 2);
            }

            if (player && !updatedCoin.isCollected && updatedCoin.currentOpacity > 0.5 && updatedCoin.isVisuallyPresent) {
                if (checkCollision(player, updatedCoin)) {
                    updatedCoin.isCollected = true;
                    updatedCoin.collectionTime = Date.now();
                    updatedCoin.currentOpacity = 0; 

                    for (let k = 0; k < COIN_PARTICLE_COUNT; k++) {
                        const angle = Math.random() * Math.PI * 2;
                        const speed = Math.random() * COIN_PARTICLE_SPEED_MULTIPLIER + 1;
                        updatedCoin.particles.push({
                            x: updatedCoin.x + updatedCoin.width / 2,
                            y: updatedCoin.y + updatedCoin.height / 2,
                            vx: Math.cos(angle) * speed,
                            vy: Math.sin(angle) * speed,
                            size: COIN_PARTICLE_SIZE,
                            opacity: 1,
                            life: COIN_PARTICLE_LIFESPAN,
                        });
                    }
                }
            }
            return updatedCoin;
        })
    );
    if(activeCoins.length > 0) {
        renderCoins(ctx, activeCoins, assets.coinImage); 
    }

    // Update and Render Enemies
    setActiveEnemies(prevEnemies =>
        prevEnemies.map(enemy => {
            let newEnemyX = enemy.x + enemy.vx * enemy.direction * deltaTimeFactor;
            let newDirection = enemy.direction;

            if (newEnemyX + enemy.width > canvas.width) {
                newEnemyX = canvas.width - enemy.width;
                newDirection = -1;
            } else if (newEnemyX < 0) {
                newEnemyX = 0;
                newDirection = 1;
            }
            
            const updatedEnemy = { ...enemy, x: newEnemyX, direction: newDirection };

            if (player && checkCollision(player, updatedEnemy)) {
                const pGround = currentLevel.tiles.find(t => t.id === 'p_ground');
                if (pGround) {
                    player.x = canvas.width / 2 - player.width / 2;
                    player.y = pGround.y - player.height;
                } else { // Fallback if p_ground is somehow missing
                    player.x = currentLevel.playerStart.xPx;
                    player.y = currentLevel.playerStart.yPx;
                }
                player.vx = 0;
                player.vy = 0;
                player.isOnGround = true;
                player.activePlatformId = pGround ? pGround.id : null;
                // toast({ title: "Ouch!", description: "Hit by an enemy!", variant: "destructive" });
            }
            return updatedEnemy;
        })
    );
    if (activeEnemies.length > 0) {
        renderEnemies(ctx, activeEnemies);
    }
    
    // Foreground decor
    foregroundTiles.forEach(tile => {
        if ((tile.id === "bush_left_1" || tile.id === "bush_right_1") && assets.smallBushImage) ctx.drawImage(assets.smallBushImage, tile.x, tile.y, tile.width, tile.height);
        else if ((tile.id === "bush_left_2" || tile.id === "bush_right_2") && assets.largeBushImage) ctx.drawImage(assets.largeBushImage, tile.x, tile.y, tile.width, tile.height);
        else if (tile.type !== 1) { ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height); }
    });

    requestAnimationFrame(gameLoop);
  }, [
    isClient, assets, resetExecuteAction, parentPlayerRef, levelPath, 
    PLAYER_SPEED, JUMP_STRENGTH, GRAVITY, P3_MOVEMENT_DURATION,
    COIN_FADE_IN_DURATION, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_GRAVITY_FACTOR,
    COIN_ROTATION_SPEED_MAX, COIN_ROTATION_SPEED_MIN, COIN_PARTICLE_COUNT, COIN_PARTICLE_SIZE, COIN_PARTICLE_SPEED_MULTIPLIER,
    setActiveCoins, setActiveEnemies, PLATFORM_SPEED, ENEMY_SPEED_FACTOR, ENEMY_COLOR, ENEMY_RADIUS, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR
  ]);

  // Effect 9: Game Loop Setup
  useEffect(() => {
    let animationFrameId: number | null = null;
    const conditionsMet = isClient && !isLoading && canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0 && processedLevelRef.current;

    if (conditionsMet) {
      lastFrameTime.current = Date.now(); 
      animationFrameId = requestAnimationFrame(gameLoop);
    } else {
        // console.log(`[GameCanvas Effect 9] Conditions NOT MET. Game loop will not start. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize: W${canvasSize.width}H${canvasSize.height}, processedLevel: ${!!processedLevelRef.current}`);
    }
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isClient, isLoading, canvasSize, gameLoop]); // processedLevelRef is accessed inside gameLoop, gameLoop depends on it via processedLevel


  
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

