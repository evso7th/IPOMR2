
"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState, GameStats } from '@/types/game';
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
  playerRef?: React.MutableRefObject<PlayerState | null>; // Made optional for initial render
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
    return parseFloat(value); // Fallback for numbers as strings
  }
  console.warn(`[parseDimension] Unexpected value type: ${typeof value}, value: ${value}`);
  return 0;
};


export default function GameCanvas({
  levelPath,
  playerRef: parentPlayerRef,
  executeAction,
  resetExecuteAction,
  onGameStatsUpdate,
}: GameCanvasProps) {
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

  // Refs for P3 platform movement
  const p3BasePositionRef = useRef<{ x: number; y: number } | null>(null);
  const p3InterestPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const p3CurrentTargetIndexRef = useRef<number>(0);
  const p3MovementStateRef = useRef<{ startTime: number; startX: number; startY: number; targetX: number; targetY: number } | null>(null);

  const lastFrameTime = useRef<number>(Date.now());
  const animationFrameIdRef = useRef<number | null>(null);
  const executeActionRef = useRef<GameAction | null>(executeAction);

  // Effect 1: Set isClient and Load Assets
  useEffect(() => {
    console.log(`[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state: ${isClient}`);
    setIsClient(true);
    
    const allAssetPromises = [];

    const loadImage = (src: string, hint: string, loadedFlag: keyof AssetContainer) => {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.src = src;
        img.setAttribute('data-ai-hint', hint);
        img.onload = () => {
          setAssets(prev => ({ ...prev, [loadedFlag]: true, [src.includes('hero') ? 'playerImage' : src.includes('platform') ? 'tileImage' : src.includes('coin') ? 'coinImage' : src.includes('stone') ? 'stoneImage' : src.includes('tree1') ? 'tree1Image' : src.includes('tree2') ? 'tree2Image' : src.includes('flowers') ? 'flowersImage' : src.includes('bush1') ? 'largeBushImage' : src.includes('house1') ? 'houseImage' : 'smallBushImage']: img }));
          resolve(img);
        };
        img.onerror = () => {
          console.error(`[GameCanvas Effect 1] Failed to load image: ${src}`);
          setAssets(prev => ({ ...prev, [loadedFlag]: true })); // Mark as loaded to not block game
          reject(new Error(`Failed to load ${src}`));
        };
      });
    };

    allAssetPromises.push(loadImage('/assets/images/hero_jeans3.png', 'hero character', 'playerImageLoaded'));
    allAssetPromises.push(loadImage('/assets/images/platform_grass.png', 'grass platform tile', 'tileImageLoaded'));
    allAssetPromises.push(loadImage('/assets/images/thankscoin.png', 'collectible coin gold', 'coinImageLoaded'));
    allAssetPromises.push(loadImage('/assets/images/stone1.jpg', 'stone rock', 'stoneImageLoaded'));
    allAssetPromises.push(loadImage('/assets/images/tree1.png', 'tree nature decorative', 'tree1ImageLoaded'));
    allAssetPromises.push(loadImage('/assets/images/tree2.png', 'tree nature decorative', 'tree2ImageLoaded'));
    allAssetPromises.push(loadImage('/assets/images/flowers.png', 'flowers small bush', 'flowersImageLoaded'));
    allAssetPromises.push(loadImage('/assets/images/bush1.png', 'bush large decorative', 'largeBushImageLoaded'));
    allAssetPromises.push(loadImage('/assets/images/house1.png', 'house building decorative', 'houseImageLoaded'));
    allAssetPromises.push(loadImage('/assets/images/flowers.png', 'small bush decorative', 'smallBushImageLoaded'));


    Promise.allSettled(allAssetPromises).then(() => {
      console.log('[GameCanvas Effect 1] All asset loading attempts finished.');
    });
  }, []);

  // Effect 2: Apply canvasSize to canvas attributes
  useEffect(() => {
    if (canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
      if (!ctxRef.current) {
        ctxRef.current = canvasRef.current.getContext('2d');
      }
    }
  }, [canvasSize]);

  // Effect 3: Observe parent element size and update canvasSize state
  useEffect(() => {
    if (!isClient || !canvasRef.current?.parentElement) {
      return;
    }
    const parentElement = canvasRef.current.parentElement;

    const updateCanvasSizeState = () => {
      const newWidth = parentElement.clientWidth;
      const newHeight = parentElement.clientHeight;
      
      setCanvasSize(currentSize => {
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
          if ((newWidth > 0 && newHeight > 0) || (newWidth === 0 && newHeight === 0 && (currentSize.width !== 0 || currentSize.height !== 0) )) {
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
    if (!isClient || !levelPath) {
      return;
    }
    setIsLoading(true);
    setRawLevelData(null);
    setProcessedLevel(null);
    processedLevelRef.current = null;
    setActiveCoins([]);
    setActiveEnemies([]);
    setCurrentPairIndex(0); 

    loadLevel(levelPath)
      .then(data => {
        if (data) {
          setRawLevelData(data);
        } else {
          setRawLevelData(null); 
          console.error(`[GameCanvas Effect 4] Failed to load rawLevelData for ${levelPath}, or data was null.`);
        }
      })
      .catch(error => {
        console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null);
      });
  }, [levelPath, isClient, setIsLoading, setRawLevelData, setProcessedLevel, setActiveCoins, setActiveEnemies, setCurrentPairIndex]);
  
  const processRawLevelData = useCallback((
    rawData: RawLevelData | null,
    currentCanvasWidth: number,
    currentCanvasHeight: number
  ): ProcessedLevelData | null => {
    if (!rawData) {
      console.warn("[processRawLevelData] Raw data is null. Cannot process.");
      return null;
    }
    // console.log(`[GameCanvas processRawLevelData] Called with canvasSize W: ${currentCanvasWidth} H: ${currentCanvasHeight} for level: ${levelPath}`);

    const processedTiles: ProcessedTile[] = rawData.tiles.map((rawTile: RawTileData) => {
      const tileWidth = parseDimension(rawTile.width, currentCanvasWidth);
      const tileHeight = parseDimension(rawTile.height, currentCanvasHeight);
      let tileX = 0;
      let tileY = 0;

      const xOffset = rawTile.positioning.xOffsetPx || 0;
      const yOffset = rawTile.positioning.yOffsetPx || 0;

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
          console.warn(`[processRawLevelData] Unknown anchor: ${rawTile.positioning.anchor}`);
          tileX = xOffset;
          tileY = yOffset;
      }
      return {
        ...rawTile,
        x: tileX,
        y: tileY,
        width: tileWidth,
        height: tileHeight,
        vx: rawTile.vx || 0,
        direction: rawTile.direction || 0,
      };
    });

    const p_ground_tile = processedTiles.find(tile => tile.id === 'p_ground');
    if (levelPath === '/levels/level2.json') {
        const p3_size_w = P3_SIZE_W;
        const p3_size_h = P3_SIZE_H;
        let p3_x_val = (currentCanvasWidth / 2) - (p3_size_w / 2);
        let p3_y_val = (p_ground_tile ? p_ground_tile.y : currentCanvasHeight) - 300 - p3_size_h;

        p3BasePositionRef.current = { x: p3_x_val, y: p3_y_val };
        
        const drift = P3_DRIFT_RANGE;
        p3InterestPointsRef.current = [
            { x: p3_x_val - drift, y: p3_y_val - drift },
            { x: p3_x_val + drift, y: p3_y_val + drift },
            { x: p3_x_val - drift, y: p3_y_val + drift },
            { x: p3_x_val + drift, y: p3_y_val - drift },
            { x: p3_x_val, y: p3_y_val },
        ];
        p3CurrentTargetIndexRef.current = 0; // Start with the first interest point or base
        p3MovementStateRef.current = null;
        
        const initialTarget = p3InterestPointsRef.current[p3CurrentTargetIndexRef.current] || p3BasePositionRef.current;

        const p3Tile: ProcessedTile = {
            id: 'p3',
            x: initialTarget.x,
            y: initialTarget.y,
            width: p3_size_w,
            height: p3_size_h,
            type: 1,
            color: 'hsl(var(--accent))',
            vx: 0, // P3 movement is handled separately
            direction: 0,
            positioning: { anchor: 'top-left' }, // Actual position is now set directly
            'data-ai-hint': 'floating platform interactive',
        };
        processedTiles.push(p3Tile);
    }


    let playerStartX = currentCanvasWidth / 2 - PLAYER_WIDTH / 2;
    let playerStartY = currentCanvasHeight / 2 - PLAYER_HEIGHT / 2;

    const startPlatform = processedTiles.find(tile => tile.id === rawData.playerStart.platformId);
    if (startPlatform) {
        playerStartY = startPlatform.y - PLAYER_HEIGHT - (rawData.playerStart.yOffsetPx || 0);
        switch (rawData.playerStart.horizontalAlign) {
            case 'left':
                playerStartX = startPlatform.x + (rawData.playerStart.xOffsetPx || 0);
                break;
            case 'center':
                playerStartX = startPlatform.x + (startPlatform.width / 2) - (PLAYER_WIDTH / 2) + (rawData.playerStart.xOffsetPx || 0);
                break;
            case 'right':
                playerStartX = startPlatform.x + startPlatform.width - PLAYER_WIDTH - (rawData.playerStart.xOffsetPx || 0);
                break;
        }
    } else {
        console.warn(`[processRawLevelData] Player start platform with ID '${rawData.playerStart.platformId}' not found! Player will start at default position.`);
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
        image: assets.playerImage,
        facingDirection: 'right',
        activePlatformId: null,
      };
      playerInstanceRef.current = newPlayer;
      if (parentPlayerRef) parentPlayerRef.current = newPlayer;


    return {
      playerStart: { xPx: playerStartX, yPx: playerStartY },
      tiles: processedTiles,
    };
  }, [assets.playerImage, levelPath, parentPlayerRef]);

  // Effect 5: Process raw level data when available and canvas is sized
  useEffect(() => {
    const allAssetsLoaded = Object.values(assets).every(val => val === true || typeof val === 'object' && val !== null);
    
    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsLoaded) {
      if (isLoading && (!rawLevelData || !allAssetsLoaded)) {
        // Still waiting for data or assets
      } else if (isLoading && (canvasSize.width === 0 || canvasSize.height === 0)) {
        // Waiting for canvas size
      } else {
        // Conditions not met, ensure processedLevel is null if it's not already
        if (processedLevelRef.current !== null) {
            setProcessedLevel(null);
            processedLevelRef.current = null;
        }
      }
      return;
    }

    const newProcessedLevel = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);
    if (newProcessedLevel) {
      setProcessedLevel(newProcessedLevel);
      // Player is initialized within processRawLevelData and set to playerInstanceRef.current
    } else {
      setProcessedLevel(null); // Ensure reset if processing failed
      playerInstanceRef.current = null;
    }
  }, [isClient, rawLevelData, canvasSize, assets, processRawLevelData, isLoading, setIsLoading]);

  // Effect 7: Spawn entities and finish loading state
  useEffect(() => {
    if (!isLoading || !isClient || !processedLevel || canvasSize.width === 0 || canvasSize.height === 0) {
      if (isLoading && processedLevel === null && isClient && canvasSize.width > 0 && canvasSize.height > 0 && rawLevelData !== undefined /* rawLevelData might be null due to fetch error */) {
        // This case handles when rawLevelData failed to load or process
        setIsLoading(false);
      }
      return;
    }
    
    // At this point, isLoading is true, and all pre-conditions are met for entity spawn.
    let coinsSpawned = activeCoinsRef.current.length > 0;
    // For now, no coins to simplify
    // if (!coinsSpawned && processedLevel.tiles.length > 0) {
    //     // const newCoins = spawnNewCoinPair(processedLevel, canvasSize.width, canvasSize.height);
    //     // setActiveCoins(newCoins);
    // }

    // For now, no enemies to simplify
    // let enemiesSpawned = activeEnemiesRef.current.length > 0;
    // if (levelPath !== '/levels/level2.json' && levelPath !== '/levels/level1.json') {
    //    // spawn enemies
    // }
    
    setIsLoading(false); // Finish loading state

  }, [isLoading, isClient, processedLevel, canvasSize, levelPath, setActiveCoins, setActiveEnemies, setIsLoading]);


  useEffect(() => {
    executeActionRef.current = executeAction;
  }, [executeAction]);

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const player = playerInstanceRef.current;
    const currentLevel = processedLevelRef.current;

    if (!ctx || !canvas || !player || !currentLevel) {
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
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

    // --- Update P3 Platform (if level 2) ---
    if (levelPath === '/levels/level2.json') {
        const p3Tile = currentLevel.tiles.find(t => t.id === 'p3');
        const basePos = p3BasePositionRef.current;
        const interestPoints = p3InterestPointsRef.current;
        
        if (p3Tile && basePos && interestPoints.length > 0) {
            let movementState = p3MovementStateRef.current;
            if (!movementState || (p3Tile.x === movementState.targetX && p3Tile.y === movementState.targetY)) {
                const currentTargetIndex = p3CurrentTargetIndexRef.current;
                let nextTargetIndex = Math.floor(Math.random() * interestPoints.length);
                while (nextTargetIndex === currentTargetIndex && interestPoints.length > 1) {
                    nextTargetIndex = Math.floor(Math.random() * interestPoints.length);
                }
                p3CurrentTargetIndexRef.current = nextTargetIndex;
                const nextTargetPos = interestPoints[nextTargetIndex];

                movementState = {
                    startTime: Date.now(),
                    startX: p3Tile.x,
                    startY: p3Tile.y,
                    targetX: nextTargetPos.x,
                    targetY: nextTargetPos.y,
                };
                p3MovementStateRef.current = movementState;
            }

            const elapsed = Date.now() - movementState.startTime;
            let t = Math.min(elapsed / P3_MOVEMENT_DURATION, 1);
            t = t * t * (3 - 2 * t); // Smoothstep easing

            const newP3X = movementState.startX + (movementState.targetX - movementState.startX) * t;
            const newP3Y = movementState.startY + (movementState.targetY - movementState.startY) * t;
            
            player.p3_delta_x = newP3X - p3Tile.x;
            player.p3_delta_y = newP3Y - p3Tile.y;

            p3Tile.x = newP3X;
            p3Tile.y = newP3Y;
        }
    }


    // --- Update other moving platforms (P1, P2) ---
    currentLevel.tiles.forEach(tile => {
        if (tile.id !== 'p3' && tile.vx && tile.direction) { // P3 is handled above
            let newX = tile.x + (tile.vx * tile.direction * deltaTimeFactor);
            if (newX + tile.width > canvas.width) {
                newX = canvas.width - tile.width;
                tile.direction *= -1;
            } else if (newX < 0) {
                newX = 0;
                tile.direction *= -1;
            }
            tile.x = newX;
        }
    });

    // --- Player Update Logic ---
    const currentExecuteAction = executeActionRef.current;

    if (player.isMovingLeft) player.vx = -PLAYER_SPEED;
    else if (player.isMovingRight) player.vx = PLAYER_SPEED;
    else player.vx = 0;

    if (currentExecuteAction === 'moveLeft') player.isMovingLeft = true;
    if (currentExecuteAction === 'stopMoveLeft') player.isMovingLeft = false;
    if (currentExecuteAction === 'moveRight') player.isMovingRight = true;
    if (currentExecuteAction === 'stopMoveRight') player.isMovingRight = false;
    if (currentExecuteAction === 'jump' && player.isOnGround) {
        player.vy = JUMP_STRENGTH;
        player.isOnGround = false;
        player.activePlatformId = null; 
    }
    if (currentExecuteAction) {
      resetExecuteAction();
      executeActionRef.current = null;
    }

    player.vy += GRAVITY * deltaTimeFactor;
    let nextPlayerX = player.x + player.vx * deltaTimeFactor;
    let nextPlayerY = player.y + player.vy * deltaTimeFactor;
    
    player.isOnGround = false; 
    let activePlatformThisFrame: ProcessedTile | null = null;
    let platformInducedMoveX = 0;
    let platformInducedMoveY = 0;


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
    
    if (activePlatformThisFrame) {
        player.activePlatformId = activePlatformThisFrame.id;
        if (activePlatformThisFrame.vx && activePlatformThisFrame.direction) {
            platformInducedMoveX = activePlatformThisFrame.vx * activePlatformThisFrame.direction * deltaTimeFactor;
        }
        if (activePlatformThisFrame.id === 'p3' && player.p3_delta_y !== undefined) { // Check p3_delta_y
            platformInducedMoveY = player.p3_delta_y;
        }
    } else {
        player.activePlatformId = null;
    }
    
    player.x += platformInducedMoveX;
    player.y += platformInducedMoveY; // Apply vertical movement from P3

    if (player.y + player.height > canvas.height) {
        player.y = canvas.height - player.height;
        player.isOnGround = true;
        player.vy = 0;
        player.activePlatformId = null; 
    }
    if (player.y < 0) {
      player.y = 0;
      player.vy = 0;
    }


    if (player.isMovingLeft) player.facingDirection = 'left';
    if (player.isMovingRight) player.facingDirection = 'right';

    // --- Rendering ---
    currentLevel.tiles.forEach(tile => {
        if (tile.layer !== 'foreground') {
            if (tile.type === 1) { // Platforms
                if (tile.id === 'p3' && assets.tileImage) { // P3 always uses default tile image for now
                     ctx.drawImage(assets.tileImage, tile.x, tile.y, tile.width, tile.height);
                } else if (tile.id.startsWith('stone_') && assets.stoneImage) {
                     ctx.drawImage(assets.stoneImage, tile.x, tile.y, tile.width, tile.height);
                } else if (assets.tileImage) {
                    ctx.drawImage(assets.tileImage, tile.x, tile.y, tile.width, tile.height);
                } else {
                    ctx.fillStyle = tile.color;
                    ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
                }
            } else { // Decorative background elements
                 if (tile.id === 'tree1' && assets.tree1Image) ctx.drawImage(assets.tree1Image, tile.x, tile.y, tile.width, tile.height);
                 else if (tile.id === 'tree2' && assets.tree2Image) ctx.drawImage(assets.tree2Image, tile.x, tile.y, tile.width, tile.height);
                 else if (tile.id === 'house1' && assets.houseImage) ctx.drawImage(assets.houseImage, tile.x, tile.y, tile.width, tile.height);
                 else {
                    ctx.fillStyle = tile.color;
                    ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
                 }
            }
        }
    });
    
    renderPlayer(ctx, player, assets.playerImage);

    currentLevel.tiles.forEach(tile => {
        if (tile.layer === 'foreground') { // Decorative foreground elements
            if ((tile.id.startsWith("bush_left_") || tile.id.startsWith("bush_right_")) && tile.id.endsWith("_1") && assets.smallBushImage) {
                 ctx.drawImage(assets.smallBushImage, tile.x, tile.y, tile.width, tile.height);
            } else if ((tile.id.startsWith("bush_left_") || tile.id.startsWith("bush_right_")) && tile.id.endsWith("_2") && assets.largeBushImage) {
                 ctx.drawImage(assets.largeBushImage, tile.x, tile.y, tile.width, tile.height);
            } else {
                ctx.fillStyle = tile.color;
                ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
            }
        }
    });

    if (parentPlayerRef) parentPlayerRef.current = { ...player };

    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
  }, [
    isClient, assets, resetExecuteAction, parentPlayerRef, levelPath,
    // Dependencies for P3 movement refs are stable as they are refs.
    // Game logic constants are also stable.
    // Critical state setters are stable.
    // Removed: canvasSize, isLoading, processedLevel (now accessed via refs or indirectly)
    // playerInstanceRef, processedLevelRef are refs, don't need to be in deps for useCallback's identity
  ]);

  // Effect 9: Start/Stop Game Loop
  useEffect(() => {
    console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize: W${canvasSize.width}H${canvasSize.height}, processedLevelRef.current: ${!!processedLevelRef.current}`);
    
    const conditionsMet = isClient && !isLoading && canvasRef.current && ctxRef.current && canvasSize.width > 0 && canvasSize.height > 0 && processedLevelRef.current;
    
    if (conditionsMet) {
      console.log("[GameCanvas Effect 9] Conditions MET. Starting game loop.");
      lastFrameTime.current = Date.now(); // Reset last frame time before starting loop
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    } else {
      console.log("[GameCanvas Effect 9] Conditions NOT MET. Game loop will not start.");
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    }
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [isClient, isLoading, canvasSize, processedLevel, gameLoop]); // Add processedLevel (state) here


  if (!isClient) {
    return null; 
  }
  
  // Simplified rendering for initial loading state
  if (isLoading) {
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

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block', 
        width: '100%',    
        height: '100%',
        // border: '2px solid limegreen', // For debug
      }}
      aria-label="Game Canvas"
      tabIndex={0} 
    />
  );
}


    