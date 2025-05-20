
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
} from '@/config/gameConfig';
import { useToast } from "@/hooks/use-toast";
import { checkCollision } from '@/game/utils/collision';
import { renderPlayer } from '@/game/entities/playerRenderer';
import { renderLevel } from '@/game/entities/levelRenderer';
import { renderCoins } from '@/game/entities/coinRenderer';
import { renderEnemies } from '@/game/entities/enemyRenderer';
import { loadLevel } from '@/lib/levelLoader';

interface GameCanvasProps {
  levelPath: string;
  onPlayerAction: (action: GameAction) => void;
  playerRef: React.MutableRefObject<PlayerState | null>;
  executeAction: GameAction | null;
  resetExecuteAction: () => void;
}

const P3_SIZE = 32;
const P3_DRIFT_RANGE = 32;
const P3_MOVEMENT_DURATION = 3000;


function parseDimension(value: number | string, totalSize: number): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.endsWith('%')) {
      return (parseFloat(value.substring(0, value.length - 1)) / 100) * totalSize;
    }
    if (value.endsWith('px')) {
      return parseFloat(value.substring(0, value.length - 2));
    }
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) return parsed;
  }
  console.warn(`Could not parse dimension value: ${value} against totalSize: ${totalSize}. Defaulting to 0.`);
  return 0;
}

function processRawLevelData(
  rawData: RawLevelData,
  canvasWidth: number,
  canvasHeight: number,
  assets: { playerImage: HTMLImageElement | null; tileImage: HTMLImageElement | null; coinImage: HTMLImageElement | null; },
  p3BasePosRef: React.MutableRefObject<{ x: number; y: number } | null>,
  p3InterestPointsRef: React.MutableRefObject<Array<{ xOffset: number; yOffset: number }>>,
  p3CurrentTargetIndexRef: React.MutableRefObject<number>,
  p3MovementStateRef: React.MutableRefObject<{startTime: number, startX: number, startY: number, targetX: number, targetY: number} | null>
): { processedLevel: ProcessedLevelData | null; player: PlayerState | null } {
  if (!rawData || canvasWidth <= 0 || canvasHeight <= 0) {
    console.error("processRawLevelData: Invalid input data, or canvas dimensions are zero.", { rawData, canvasWidth, canvasHeight });
    return { processedLevel: null, player: null };
  }
  try {
    const processedTiles: ProcessedTile[] = rawData.tiles.map((rawTile: RawTileData) => {
      const tileWidth = parseDimension(rawTile.width, canvasWidth);
      const tileHeight = parseDimension(rawTile.height, canvasHeight);
      let tileX = 0;
      let tileY = 0;
      const xOffset = rawTile.positioning.xOffsetPx || 0;
      const yOffset = rawTile.positioning.yOffsetPx || 0;

      switch (rawTile.positioning.anchor) {
        case 'top-left':    tileX = xOffset; break;
        case 'center-left': tileX = xOffset; break;
        case 'bottom-left': tileX = xOffset; break;
        case 'top-center':    tileX = (canvasWidth / 2) - (tileWidth / 2) + xOffset; break;
        case 'center':        tileX = (canvasWidth / 2) - (tileWidth / 2) + xOffset; break;
        case 'bottom-center': tileX = (canvasWidth / 2) - (tileWidth / 2) + xOffset; break;
        case 'top-right':     tileX = canvasWidth - tileWidth - xOffset; break;
        case 'center-right':  tileX = canvasWidth - tileWidth - xOffset; break;
        case 'bottom-right':  tileX = canvasWidth - tileWidth - xOffset; break;
        default: tileX = xOffset;
      }

      switch (rawTile.positioning.anchor) {
        case 'top-left':    tileY = yOffset; break;
        case 'top-center':  tileY = yOffset; break;
        case 'top-right':   tileY = yOffset; break;
        case 'center-left': tileY = (canvasHeight / 2) - (tileHeight / 2) + yOffset; break;
        case 'center':      tileY = (canvasHeight / 2) - (tileHeight / 2) + yOffset; break;
        case 'center-right':tileY = (canvasHeight / 2) - (tileHeight / 2) + yOffset; break;
        case 'bottom-left':   tileY = canvasHeight - tileHeight - yOffset; break;
        case 'bottom-center': tileY = canvasHeight - tileHeight - yOffset; break;
        case 'bottom-right':  tileY = canvasHeight - tileHeight - yOffset; break;
        default: tileY = yOffset;
      }

      return {
        id: rawTile.id,
        x: tileX,
        y: tileY,
        width: tileWidth,
        height: tileHeight,
        type: rawTile.type,
        color: rawTile.color,
        vx: rawTile.vx,
        direction: rawTile.direction,
      };
    });

    let playerStartX = 50;
    let playerStartY = canvasHeight - PLAYER_HEIGHT - 50;
    const startPlatform = processedTiles.find(tile => tile.id === rawData.playerStart.platformId);

    if (startPlatform) {
      const playerXOffset = rawData.playerStart.xOffsetPx || 0;
      const playerYOffset = rawData.playerStart.yOffsetPx || 0;
      switch (rawData.playerStart.horizontalAlign) {
        case 'left': playerStartX = startPlatform.x + playerXOffset; break;
        case 'center': playerStartX = startPlatform.x + (startPlatform.width / 2) - (PLAYER_WIDTH / 2) + playerXOffset; break;
        case 'right': playerStartX = startPlatform.x + startPlatform.width - PLAYER_WIDTH - playerXOffset; break;
      }
      playerStartY = startPlatform.y - PLAYER_HEIGHT - playerYOffset;
    } else {
      if (canvasWidth > 0 && canvasHeight > 0) {
         console.warn(`Player start platform with id "${rawData.playerStart.platformId}" not found. Defaulting player position.`);
      }
    }
    
    const p_ground_tile = processedTiles.find(tile => tile.id === 'p_ground');
    if (p_ground_tile && canvasWidth > 0 && canvasHeight > 0) {
        const p_ground_top_y = p_ground_tile.y;
        
        p3BasePosRef.current = { x: (canvasWidth / 2) - (P3_SIZE / 2), y: p_ground_top_y - 300 };

        p3InterestPointsRef.current = [
            { xOffset: 0, yOffset: 0 },
            { xOffset: P3_DRIFT_RANGE * 0.8, yOffset: -P3_DRIFT_RANGE * 0.6 },
            { xOffset: -P3_DRIFT_RANGE * 0.7, yOffset: P3_DRIFT_RANGE * 0.9 },
            { xOffset: 0, yOffset: -P3_DRIFT_RANGE * 0.8 },
            { xOffset: P3_DRIFT_RANGE * 0.9, yOffset: 0 },
        ];
        p3CurrentTargetIndexRef.current = 0;
        p3MovementStateRef.current = null;
        
        if (p3BasePosRef.current){
            const initialOffset = p3InterestPointsRef.current[p3CurrentTargetIndexRef.current];
            const p3TileToAdd: ProcessedTile = {
              id: 'p3',
              x: p3BasePosRef.current.x + initialOffset.xOffset,
              y: p3BasePosRef.current.y + initialOffset.yOffset,
              width: P3_SIZE,
              height: P3_SIZE,
              type: 1,
              color: 'hsl(var(--secondary))',
              vx: 0,
              direction: 0,
            };
            processedTiles.push(p3TileToAdd);
        }
    } else if (canvasWidth > 0 && canvasHeight > 0) {
        console.warn("p_ground platform not found for P3 positioning. P3 will not be added.");
    }

    const newPlayer: PlayerState = {
        x: playerStartX, y: playerStartY,
        width: PLAYER_WIDTH, height: PLAYER_HEIGHT, vx: 0, vy: 0, isOnGround: false,
        isMovingLeft: false, isMovingRight: false, color: PLAYER_COLOR, facingDirection: 'right', image: assets.playerImage,
    };

    return {
      processedLevel: {
        playerStart: { xPx: playerStartX, yPx: playerStartY },
        tiles: processedTiles,
      },
      player: newPlayer,
    };
  } catch (error) {
    console.error("Error in processRawLevelData:", error);
    return { processedLevel: null, player: null };
  }
}

const spawnNewCoinPair = (
  processedLevel: ProcessedLevelData | null,
  canvasWidth: number,
  canvasHeight: number
): CoinState[] => {
  if (!processedLevel || !processedLevel.tiles || canvasWidth <= 0 || canvasHeight <= 0 || processedLevel.tiles.length === 0) return [];

  const p_ground = processedLevel.tiles.find(tile => tile.id === 'p_ground');
  if (!p_ground) {
    console.warn(`Coin spawn: Ground platform 'p_ground' not found. No coins will be generated.`);
    return [];
  }
  const p_groundTopY = p_ground.y;

  const ySpawnZoneBottomCoinTopEdge = p_groundTopY - COIN_VERTICAL_SPAWN_BOTTOM_OFFSET - COIN_SIZE;

  let ySpawnZoneTopCoinTopEdge: number;
  const gamePlatforms = processedLevel.tiles.filter(tile => tile.id !== 'p_ground' && tile.id !== 'p3' && tile.type === 1 && tile.height > 1);

  if (gamePlatforms.length > 0) {
    const actualHighestPlatformTopY = Math.min(...gamePlatforms.map(tile => tile.y));
    ySpawnZoneTopCoinTopEdge = actualHighestPlatformTopY - MAX_JUMP_HEIGHT - COIN_SPAWN_TOP_MARGIN - COIN_SIZE;
  } else {
    ySpawnZoneTopCoinTopEdge = p_groundTopY - MAX_JUMP_HEIGHT - COIN_SPAWN_TOP_MARGIN - COIN_SIZE;
  }

  if (ySpawnZoneTopCoinTopEdge >= ySpawnZoneBottomCoinTopEdge) {
    console.warn("Coin spawn zone is invalid or too small. Top edge for coin:", ySpawnZoneTopCoinTopEdge, "Bottom edge for coin:", ySpawnZoneBottomCoinTopEdge, "p_ground top:", p_groundTopY);
    return [];
  }

  const newPair: CoinState[] = [];
  const midPoint = canvasWidth / 2;
  const horizontalSpawnMargin = COIN_SIZE * 2;
  const currentTime = Date.now();

  const randomRotationSpeed = () => COIN_ROTATION_SPEED_MIN + Math.random() * (COIN_ROTATION_SPEED_MAX - COIN_ROTATION_SPEED_MIN);

  const leftHalfWidth = midPoint - horizontalSpawnMargin - COIN_SIZE;
  if (leftHalfWidth > 0) {
    const coin1X = Math.max(0, Math.random() * leftHalfWidth);
    const coin1Y = Math.random() * (ySpawnZoneBottomCoinTopEdge - ySpawnZoneTopCoinTopEdge) + ySpawnZoneTopCoinTopEdge;
    newPair.push({
      id: `coin-${currentTime}-1`, x: coin1X, y: coin1Y, width: COIN_SIZE, height: COIN_SIZE,
      isCollected: false, targetSpawnTime: currentTime, currentOpacity: 0, particles: [], isVisuallyPresent: true,
      rotationAngle: Math.random() * Math.PI * 2, rotationSpeed: randomRotationSpeed(),
    });
  }

  const rightHalfBaseX = midPoint + horizontalSpawnMargin;
  const rightHalfWidth = canvasWidth - rightHalfBaseX - COIN_SIZE;
  if (rightHalfWidth > 0) {
    const coin2X = rightHalfBaseX + (Math.random() * rightHalfWidth);
    const coin2Y = Math.random() * (ySpawnZoneBottomCoinTopEdge - ySpawnZoneTopCoinTopEdge) + ySpawnZoneTopCoinTopEdge;
    newPair.push({
      id: `coin-${currentTime}-2`, x: coin2X, y: coin2Y, width: COIN_SIZE, height: COIN_SIZE,
      isCollected: false, targetSpawnTime: currentTime + COIN_SPAWN_STAGGER_DELAY, currentOpacity: 0, particles: [], isVisuallyPresent: true,
      rotationAngle: Math.random() * Math.PI * 2, rotationSpeed: randomRotationSpeed(),
    });
  }
  return newPair;
};

const spawnSingleEnemy = (
  processedLevel: ProcessedLevelData | null,
  canvasWidth: number,
): EnemyState | null => {
  if (!processedLevel || !processedLevel.tiles || canvasWidth <= 0 || processedLevel.tiles.length === 0) return null;

  const p1 = processedLevel.tiles.find(tile => tile.id === 'p1');
  const p2 = processedLevel.tiles.find(tile => tile.id === 'p2');
  if (!p1 || !p2) {
    console.warn("Enemy spawn: Platforms P1 or P2 not found. Cannot spawn enemy.");
    return null;
  }

  const p1CenterY = p1.y + p1.height / 2;
  const p2CenterY = p2.y + p2.height / 2;
  const enemyCenterY = (p1CenterY + p2CenterY) / 2;
  const enemyX = ENEMY_RADIUS + 10;
  const enemyY = enemyCenterY - ENEMY_RADIUS;

  return {
    id: `enemy-${Date.now()}`, x: enemyX, y: enemyY, radius: ENEMY_RADIUS,
    width: ENEMY_RADIUS * 2, height: ENEMY_RADIUS * 2,
    vx: PLATFORM_SPEED * ENEMY_SPEED_FACTOR, direction: 1, color: ENEMY_COLOR,
  };
};

export default function GameCanvas({ levelPath, onPlayerAction, playerRef: parentPlayerRef, executeAction, resetExecuteAction }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rawLevelData, setRawLevelData] = useState<RawLevelData | null>(null);
  const [processedLevel, setProcessedLevel] = useState<ProcessedLevelData | null>(null);

  const [activeCoins, setActiveCoins] = useState<CoinState[]>([]);
  const [activeEnemies, setActiveEnemies] = useState<EnemyState[]>([]);

  const playerInstanceRef = useRef<PlayerState | null>(null);
  const lastFrameTime = useRef<number>(Date.now());

  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const p3BasePosition = useRef<{ x: number; y: number } | null>(null);
  const p3InterestPoints = useRef<Array<{ xOffset: number; yOffset: number }>>([]);
  const p3CurrentTargetIndex = useRef<number>(-1);
  const p3MovementState = useRef<{startTime: number, startX: number, startY: number, targetX: number, targetY: number} | null>(null);

  const [assets, setAssets] = useState<{
    playerImage: HTMLImageElement | null; tileImage: HTMLImageElement | null; coinImage: HTMLImageElement | null;
    playerImageLoaded: boolean; tileImageLoaded: boolean; coinImageLoaded: boolean;
  }>({ playerImage: null, tileImage: null, coinImage: null, playerImageLoaded: false, tileImageLoaded: false, coinImageLoaded: false });

  useEffect(() => {
    setIsClient(true);
    const pImg = new Image();
    pImg.src = `/assets/images/hero_jeans3.png`;
    pImg.setAttribute('data-ai-hint', 'character orange blue');
    pImg.onload = () => setAssets(prev => ({ ...prev, playerImage: pImg, playerImageLoaded: true }));
    pImg.onerror = () => { console.error("Failed to load player image."); setAssets(prev => ({ ...prev, playerImageLoaded: true })); };

    const tImg = new Image();
    tImg.src = `/assets/images/platform_grass.png`;
    tImg.setAttribute('data-ai-hint', 'platform grass dirt');
    tImg.onload = () => setAssets(prev => ({...prev, tileImage: tImg, tileImageLoaded: true}));
    tImg.onerror = () => {
        console.error("Failed to load tile image.");
        setAssets(prev => ({...prev, tileImageLoaded: true}));
    };

    const cImg = new Image();
    cImg.src = `/assets/images/thankscoin.png`;
    cImg.setAttribute('data-ai-hint', 'collectible coin gold');
    cImg.onload = () => setAssets(prev => ({ ...prev, coinImage: cImg, coinImageLoaded: true }));
    cImg.onerror = () => { console.error("Failed to load coin image."); setAssets(prev => ({ ...prev, coinImageLoaded: true })); };
  }, []);

  useEffect(() => {
    if (!isClient) return;
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;

    const observedElement = canvas.parentElement;

    const updateCanvasSizeState = () => {
      if (canvasRef.current && canvasRef.current.parentElement) {
        const parentElement = canvasRef.current.parentElement;
        let newWidth = 0; 
        let newHeight = 0;
    
        if (parentElement.clientWidth > 0 && parentElement.clientHeight > 0) {
          newWidth = parentElement.clientWidth;
          newHeight = parentElement.clientHeight;
        }
        
        setCanvasSize(currentSize => {
          if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
            return { width: newWidth, height: newHeight };
          }
          return currentSize;
        });
      }
    };

    updateCanvasSizeState(); 

    const observer = new ResizeObserver(updateCanvasSizeState);
    observer.observe(observedElement);

    let usingWindowListener = false;
    if (typeof ResizeObserver === 'undefined') {
        window.addEventListener('resize', updateCanvasSizeState);
        usingWindowListener = true;
    }

    return () => {
      observer.unobserve(observedElement);
      if (usingWindowListener) {
        window.removeEventListener('resize', updateCanvasSizeState);
      }
    };
  }, [isClient]);

  useEffect(() => {
    if (!isClient || !canvasRef.current) return;
    const canvas = canvasRef.current;
    if (canvasSize.width > 0 && canvas.width !== canvasSize.width) {
      canvas.width = canvasSize.width;
    }
    if (canvasSize.height > 0 && canvas.height !== canvasSize.height) {
      canvas.height = canvasSize.height;
    }
  }, [isClient, canvasSize]);


  useEffect(() => {
    if (!isClient || !levelPath) {
      return; 
    }
    
    setIsLoading(true);
    setRawLevelData(null); 
    setProcessedLevel(null);
    setActiveCoins([]);
    setActiveEnemies([]);


    loadLevel(levelPath)
      .then(data => {
        if (data) {
          setRawLevelData(data);
        } else {
          toast({ title: "Error", description: `Failed to load level: ${levelPath}`, variant: "destructive" });
          setRawLevelData(null);
          setIsLoading(false); // Stop loading if level fetch fails
        }
      })
      .catch(error => {
        console.error("Error in loadLevel promise chain:", error);
        toast({ title: "Error", description: "An unexpected error occurred loading level data.", variant: "destructive" });
        setRawLevelData(null);
        setIsLoading(false); // Stop loading on error
      });
  }, [levelPath, isClient, toast, setIsLoading, setRawLevelData, setProcessedLevel, setActiveCoins, setActiveEnemies]);

  useEffect(() => {
    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !assets.playerImageLoaded || !assets.tileImageLoaded || !assets.coinImageLoaded) {
      // If critical data for processing is missing, ensure isLoading remains true or becomes true
      // This also handles the case where canvasSize might temporarily be 0x0 during resize.
      if (isLoading === false && (canvasSize.width === 0 || canvasSize.height === 0 || !rawLevelData)) {
        setIsLoading(true);
      }
      if (processedLevel !== null) setProcessedLevel(null); // Clear old processed data
      return;
    }

    // Conditions met to process raw level data
    setActiveCoins([]);
    setActiveEnemies([]);
    
    const { processedLevel: newProcessedLevel, player: newPlayer } = processRawLevelData(
        rawLevelData,
        canvasSize.width,
        canvasSize.height,
        assets,
        p3BasePosition,
        p3InterestPoints,
        p3CurrentTargetIndex,
        p3MovementState
    );

    if (newProcessedLevel && newPlayer) {
      setProcessedLevel(newProcessedLevel);
      playerInstanceRef.current = newPlayer;
      if (parentPlayerRef) parentPlayerRef.current = newPlayer;
    } else {
      toast({ title: "Processing Error", description: "Failed to process level data.", variant: "destructive" });
      setProcessedLevel(null);
      playerInstanceRef.current = null;
      if (parentPlayerRef) parentPlayerRef.current = null;
      setIsLoading(false); // If processing fails, stop loading
    }
  }, [
    isClient, rawLevelData, canvasSize, assets,
    parentPlayerRef, toast, setIsLoading, setProcessedLevel, setActiveCoins, setActiveEnemies,
    p3BasePosition, p3InterestPoints, p3CurrentTargetIndex, p3MovementState, isLoading, processedLevel
  ]);


  useEffect(() => {
    if (!isClient || !isLoading) return; // Only run if client-side and currently loading

    if (!processedLevel || !processedLevel.tiles || canvasSize.width === 0 || canvasSize.height === 0) {
        // If processedLevel is not ready, or canvas is not ready, we can't finalize loading.
        // isLoading remains true.
        return;
    }
    
    let coinsSpawnedOrAttempted = activeCoins.length > 0;
    if (!coinsSpawnedOrAttempted && processedLevel.tiles.length > 0) {
        const newCoins = spawnNewCoinPair(processedLevel, canvasSize.width, canvasSize.height);
        if (newCoins.length > 0) setActiveCoins(newCoins);
        coinsSpawnedOrAttempted = true;
    } else if (processedLevel.tiles.length === 0){
         coinsSpawnedOrAttempted = true; 
    }

    let enemiesSpawnedOrAttempted = activeEnemies.length > 0;
    if (levelPath !== '/levels/level2.json') { 
        if (!enemiesSpawnedOrAttempted && processedLevel.tiles.length > 0 && processedLevel.tiles.find(t => t.id === 'p1') && processedLevel.tiles.find(t => t.id === 'p2')) {
            const newEnemy = spawnSingleEnemy(processedLevel, canvasSize.width);
            if (newEnemy) setActiveEnemies([newEnemy]);
            enemiesSpawnedOrAttempted = true;
        } else if (processedLevel.tiles.length === 0 || !processedLevel.tiles.find(t => t.id === 'p1') || !processedLevel.tiles.find(t => t.id === 'p2')){
             enemiesSpawnedOrAttempted = true; 
        }
    } else {
        enemiesSpawnedOrAttempted = true; 
    }

    if ((processedLevel.tiles.length === 0) || (coinsSpawnedOrAttempted && enemiesSpawnedOrAttempted)) {
        setIsLoading(false);
    }
  }, [
    isClient, processedLevel, canvasSize, isLoading, levelPath,
    activeCoins.length, activeEnemies.length,
    setActiveCoins, setActiveEnemies, setIsLoading, toast
  ]);


  useEffect(() => {
    if (!isClient || isLoading || !processedLevel || !processedLevel.tiles || canvasSize.width === 0 || canvasSize.height === 0) return;

    const allCollectedAndParticlesGone = activeCoins.length > 0 && activeCoins.every(c => c.isCollected && c.particles.length === 0 && !c.isVisuallyPresent);
    if (allCollectedAndParticlesGone) {
       const newCoins = spawnNewCoinPair(processedLevel, canvasSize.width, canvasSize.height);
       setActiveCoins(newCoins);
    }
  }, [activeCoins, isClient, isLoading, processedLevel, canvasSize, setActiveCoins]);

  useEffect(() => {
    if (!isClient || isLoading || !processedLevel || !playerInstanceRef.current || !canvasRef.current || canvasSize.width === 0 || canvasSize.height === 0) return;

    const canvas = canvasRef.current; const ctx = canvas.getContext('2d'); if (!ctx) return;
    let animationFrameId: number;
    lastFrameTime.current = Date.now();

    const gameLoop = () => {
      const loopStartTime = Date.now(); const deltaTime = (loopStartTime - lastFrameTime.current);
      const deltaTimeFactor = deltaTime / (1000 / 60); 
      lastFrameTime.current = loopStartTime;

      const player = playerInstanceRef.current; const currentLevel = processedLevel;
      if (!player || !currentLevel || !currentLevel.tiles) { animationFrameId = requestAnimationFrame(gameLoop); return; }

      const p3Tile = currentLevel.tiles.find(tile => tile.id === 'p3');
      let p3_delta_x = 0;
      let p3_delta_y = 0;

      if (p3Tile && p3BasePosition.current && p3InterestPoints.current.length > 0) {
        const currentTimeForP3 = Date.now();
        if (!p3MovementState.current || currentTimeForP3 >= p3MovementState.current.startTime + P3_MOVEMENT_DURATION) {
          let nextTargetIndex = Math.floor(Math.random() * p3InterestPoints.current.length);
          if (p3InterestPoints.current.length > 1 && nextTargetIndex === p3CurrentTargetIndex.current) {
            nextTargetIndex = (nextTargetIndex + 1) % p3InterestPoints.current.length;
          }
          p3CurrentTargetIndex.current = nextTargetIndex;
          const targetOffset = p3InterestPoints.current[nextTargetIndex];
          const targetX = p3BasePosition.current.x + targetOffset.xOffset;
          const targetY = p3BasePosition.current.y + targetOffset.yOffset;
          p3MovementState.current = { startTime: currentTimeForP3, startX: p3Tile.x, startY: p3Tile.y, targetX, targetY };
        }

        const { startTime, startX, startY, targetX, targetY } = p3MovementState.current;
        const elapsedTime = currentTimeForP3 - startTime;
        const t = Math.min(1, elapsedTime / P3_MOVEMENT_DURATION);
        const eased_t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        const oldP3X = p3Tile.x;
        const oldP3Y = p3Tile.y;

        p3Tile.x = startX + (targetX - startX) * eased_t;
        p3Tile.y = startY + (targetY - startY) * eased_t;

        p3_delta_x = p3Tile.x - oldP3X;
        p3_delta_y = p3Tile.y - oldP3Y;
      }


      if (executeAction) {
        switch (executeAction) {
          case 'moveLeft': player.isMovingLeft = true; player.facingDirection = 'left'; break;
          case 'moveRight': player.isMovingRight = true; player.facingDirection = 'right'; break;
          case 'stopMoveLeft': player.isMovingLeft = false; break;
          case 'stopMoveRight': player.isMovingRight = false; break;
          case 'jump': if (player.isOnGround) { player.vy = JUMP_STRENGTH; player.isOnGround = false; } break;
        }
        resetExecuteAction();
      }

      if (player.isMovingLeft) {
        player.vx = -PLAYER_SPEED;
      } else if (player.isMovingRight) {
        player.vx = PLAYER_SPEED;
      } else {
        player.vx = 0;
      }


      currentLevel.tiles.forEach(tile => {
        if (tile.id !== 'p3' && tile.vx !== undefined && tile.direction !== undefined && canvas.width > 0) {
          tile.x += (tile.vx * tile.direction * deltaTimeFactor);
          if (tile.x <= 0 && tile.direction === -1) { tile.x = 0; tile.direction *= -1; }
          else if (tile.x + tile.width >= canvas.width && tile.direction === 1) { tile.x = canvas.width - tile.width; tile.direction *= -1; }
        }
      });

      player.vy += GRAVITY * deltaTimeFactor;
      let tentativePlayerY = player.y + (player.vy * deltaTimeFactor);
      let newPlayerY = tentativePlayerY;
      player.isOnGround = false;
      let platformInducedMoveX = 0;
      let activePlatform: ProcessedTile | null = null;

      currentLevel.tiles.forEach(tile => {
        const tempPlayerStateForVerticalCheck = { ...player, y: newPlayerY, x: player.x };
        if (checkCollision(tempPlayerStateForVerticalCheck, tile)) {
          if (player.vy > 0) {
            newPlayerY = tile.y - player.height; player.vy = 0; player.isOnGround = true;
            activePlatform = tile;
          } else if (player.vy < 0) {
            newPlayerY = tile.y + tile.height; player.vy = 0;
          }
        }
      });
      player.y = newPlayerY;

      if (player.isOnGround && activePlatform) {
        if (activePlatform.id === 'p3') {
            platformInducedMoveX = p3_delta_x; 
            player.y += p3_delta_y; 
        } else if (activePlatform.vx !== undefined && activePlatform.direction !== undefined) {
            platformInducedMoveX = (activePlatform.vx * activePlatform.direction * deltaTimeFactor);
        }
      }


      const tentativePlayerX = player.x + (player.vx * deltaTimeFactor) + platformInducedMoveX; let newPlayerX = tentativePlayerX;
      currentLevel.tiles.forEach(tile => {
        const tempPlayerStateForHorizontalCheck = { ...player, x: tentativePlayerX };
        if (checkCollision(tempPlayerStateForHorizontalCheck, tile)) {
          const totalIntentVx = (player.vx * deltaTimeFactor) + platformInducedMoveX;
          if (totalIntentVx > 0) newPlayerX = tile.x - player.width;
          else if (totalIntentVx < 0) newPlayerX = tile.x + tile.width;
        }
      });
      player.x = newPlayerX;
      if (player.x < 0) player.x = 0; if (canvas.width > 0 && player.x + player.width > canvas.width) player.x = canvas.width - player.width;

      const groundPlatform = currentLevel.tiles.find(t => t.id === 'p_ground');
      if (groundPlatform && player.y + player.height > groundPlatform.y && player.vy >=0 && player.y < groundPlatform.y + groundPlatform.height ) {
          if (player.y + player.height > groundPlatform.y + (groundPlatform.height / 2) ) {
             player.y = groundPlatform.y - player.height;
          }
          player.vy = 0;
          player.isOnGround = true;
      } else if (canvas.height > 0 && player.y + player.height > canvas.height && player.vy >=0 ) {
           player.y = canvas.height - player.height;
           player.vy = 0;
           player.isOnGround = true;
      }


      const updatedCoins = activeCoins.map(coin => {
        let newCoin = { ...coin };

        newCoin.rotationAngle += newCoin.rotationSpeed * deltaTimeFactor;
        if (newCoin.rotationAngle > Math.PI * 2) newCoin.rotationAngle -= Math.PI * 2;


        if (newCoin.particles.length > 0) {
          newCoin.particles = newCoin.particles.map(p => ({
            ...p,
            x: p.x + p.vx * deltaTimeFactor,
            y: p.y + p.vy * deltaTimeFactor,
            vy: p.vy + (GRAVITY * COIN_PARTICLE_GRAVITY_FACTOR * deltaTimeFactor),
            life: p.life - deltaTime,
            opacity: Math.max(0, (p.life - deltaTime) / COIN_PARTICLE_LIFESPAN),
          })).filter(p => p.life > 0);
          if (newCoin.particles.length === 0 && newCoin.isCollected) {
            newCoin.isVisuallyPresent = false;
          }
        } else if (newCoin.isCollected && newCoin.isVisuallyPresent && newCoin.currentOpacity === 0 && newCoin.particles.length === 0) {
            newCoin.isVisuallyPresent = false;
        }


        if (!newCoin.isCollected && loopStartTime >= newCoin.targetSpawnTime && newCoin.currentOpacity < 1) {
          const opacityIncrease = deltaTime / COIN_FADE_IN_DURATION;
          newCoin.currentOpacity = Math.min(1, newCoin.currentOpacity + opacityIncrease);
        }

        const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };
        if (!newCoin.isCollected && newCoin.isVisuallyPresent && newCoin.currentOpacity > 0.5 && checkCollision(playerRect, newCoin as Rect)) {
          newCoin.isCollected = true;
          newCoin.collectionTime = loopStartTime;
          newCoin.currentOpacity = 0;
          newCoin.particles = [];
          for (let i = 0; i < COIN_PARTICLE_COUNT; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * COIN_PARTICLE_SPEED_MULTIPLIER + 0.5;
            newCoin.particles.push({
              x: newCoin.x + newCoin.width / 2, y: newCoin.y + newCoin.height / 2,
              vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
              size: COIN_PARTICLE_SIZE, opacity: 1, life: COIN_PARTICLE_LIFESPAN,
            });
          }
        }
        return newCoin;
      });
      setActiveCoins(updatedCoins);

      const updatedEnemies = activeEnemies.map(enemy => {
        let newEnemy = { ...enemy };
        newEnemy.x += (newEnemy.vx * newEnemy.direction * deltaTimeFactor);

        if (canvas.width > 0) {
            if (newEnemy.x <= 0 && newEnemy.direction === -1) { newEnemy.x = 0; newEnemy.direction *= -1; }
            else if (newEnemy.x + newEnemy.width >= canvas.width && newEnemy.direction === 1) { newEnemy.x = canvas.width - newEnemy.width; newEnemy.direction *= -1; }
        }

        const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };
        const enemyRect = { x: newEnemy.x, y: newEnemy.y, width: newEnemy.width, height: newEnemy.height };
        if (checkCollision(playerRect, enemyRect)) {
          const p_ground = currentLevel.tiles.find(tile => tile.id === 'p_ground');
          if (p_ground && canvas.width > 0 && playerInstanceRef.current) {
            playerInstanceRef.current.x = (canvas.width / 2) - (playerInstanceRef.current.width / 2);
            playerInstanceRef.current.y = p_ground.y - playerInstanceRef.current.height;
            playerInstanceRef.current.vx = 0; playerInstanceRef.current.vy = 0; playerInstanceRef.current.isOnGround = true;
            toast({ title: "Ouch!", description: "You hit an enemy!", variant: "destructive" });
          }
        }
        return newEnemy;
      });
      setActiveEnemies(updatedEnemies);


      if (parentPlayerRef) parentPlayerRef.current = { ...player };

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      renderLevel(ctx, currentLevel, assets.tileImage);
      renderCoins(ctx, activeCoins, assets.coinImage);
      renderEnemies(ctx, activeEnemies);
      renderPlayer(ctx, player, assets.playerImage);
      animationFrameId = requestAnimationFrame(gameLoop);
    };
    animationFrameId = requestAnimationFrame(gameLoop);
    return () => { cancelAnimationFrame(animationFrameId); };
  }, [
      isClient, isLoading, processedLevel, executeAction, resetExecuteAction, parentPlayerRef, assets,
      canvasSize, activeCoins, activeEnemies, toast, setActiveCoins, setActiveEnemies, levelPath,
      p3BasePosition, p3InterestPoints, p3CurrentTargetIndex, p3MovementState
    ]);

  useEffect(() => {
    if (!isClient) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // const player = playerInstanceRef.current; if (!player) return; // playerInstanceRef can be null
      if (e.key === 'ArrowLeft') onPlayerAction('moveLeft');
      if (e.key === 'ArrowRight') onPlayerAction('moveRight');
      if (e.key === 'ArrowUp' || e.key === ' ') onPlayerAction('jump');
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onPlayerAction('stopMoveLeft');
      if (e.key === 'ArrowRight') onPlayerAction('stopMoveRight');
    };
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [onPlayerAction, isClient]);

  if (!isClient) {
    return <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground rounded-md">Loading Game...</div>;
  }

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full block" tabIndex={0} />
      {isLoading && (
        <div className="absolute inset-0 bg-muted/80 backdrop-blur-sm flex items-center justify-center text-muted-foreground rounded-md z-10">
          Initializing Canvas...
        </div>
      )}
    </div>
  );
}


    