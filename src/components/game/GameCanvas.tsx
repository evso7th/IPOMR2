
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

const P3_DRIFT_RANGE = 32;
const P3_MOVEMENT_DURATION = 3000; // 3 seconds to move to a target point

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
  p3BasePosRef: React.MutableRefObject<{ x: number; y: number } | null>,
  p3InterestPointsRef: React.MutableRefObject<Array<{ xOffset: number; yOffset: number }>>,
  p3CurrentTargetIndexRef: React.MutableRefObject<number>,
  p3MovementStateRef: React.MutableRefObject<{startTime: number, startX: number, startY: number, targetX: number, targetY: number} | null>
): ProcessedLevelData | null {
  if (!rawData || canvasWidth <= 0 || canvasHeight <= 0) {
    console.error("processRawLevelData: Invalid input data, or canvas dimensions are zero.", { rawData, canvasWidth, canvasHeight });
    return null;
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
        const p3_size = 48;
        const p_ground_top_y = p_ground_tile.y;
        
        const p3_base_x = (canvasWidth / 2) - (p3_size / 2); // Centered horizontally
        const p3_base_y = p_ground_top_y - 300; // 300px above p_ground's top surface
        
        p3BasePosRef.current = { x: p3_base_x, y: p3_base_y };
        p3InterestPointsRef.current = [
            { xOffset: 0, yOffset: 0 }, // Center point
            { xOffset: P3_DRIFT_RANGE * 0.8, yOffset: -P3_DRIFT_RANGE * 0.6 },
            { xOffset: -P3_DRIFT_RANGE * 0.7, yOffset: P3_DRIFT_RANGE * 0.9 },
            { xOffset: 0, yOffset: -P3_DRIFT_RANGE * 0.8 },
            { xOffset: P3_DRIFT_RANGE * 0.9, yOffset: 0 },
        ];
        p3CurrentTargetIndexRef.current = 0; // Start at the base position (first interest point)
        p3MovementStateRef.current = null;   // No movement state initially

        const initialOffset = p3InterestPointsRef.current[p3CurrentTargetIndexRef.current];
        
        const p3TileToAdd: ProcessedTile = {
          id: 'p3',
          x: p3_base_x + initialOffset.xOffset,
          y: p3_base_y + initialOffset.yOffset,
          width: p3_size,
          height: p3_size,
          type: 1, 
          color: 'hsl(var(--secondary))', // Give it a distinct color for now
          vx: 0, 
          direction: 0,
        };
        processedTiles.push(p3TileToAdd);
    } else if (canvasWidth > 0 && canvasHeight > 0) { 
        console.warn("p_ground platform not found. Cannot accurately place p3 for drifting.");
    }

    return {
      playerStart: { xPx: playerStartX, yPx: playerStartY },
      tiles: processedTiles,
    };
  } catch (error) {
    console.error("Error in processRawLevelData:", error);
    return null;
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
  // Exclude p_ground and p3 (the drifting platform) and very thin tiles when determining highest platform for coin spawn
  const gamePlatforms = processedLevel.tiles.filter(tile => tile.id !== 'p_ground' && tile.id !== 'p3' && tile.type === 1 && tile.height > 1); 

  if (gamePlatforms.length > 0) {
    const actualHighestPlatformTopY = Math.min(...gamePlatforms.map(tile => tile.y));
    ySpawnZoneTopCoinTopEdge = actualHighestPlatformTopY - MAX_JUMP_HEIGHT - COIN_SPAWN_TOP_MARGIN - COIN_SIZE;
  } else {
    // If no other platforms, coins are reachable from p_ground
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

  const leftHalfWidth = midPoint - horizontalSpawnMargin - COIN_SIZE;
  if (leftHalfWidth > 0) {
    const coin1X = Math.max(0, Math.random() * leftHalfWidth);
    const coin1Y = Math.random() * (ySpawnZoneBottomCoinTopEdge - ySpawnZoneTopCoinTopEdge) + ySpawnZoneTopCoinTopEdge;
    newPair.push({
      id: `coin-${currentTime}-1`, x: coin1X, y: coin1Y, width: COIN_SIZE, height: COIN_SIZE,
      isCollected: false, targetSpawnTime: currentTime, currentOpacity: 0, particles: [], isVisuallyPresent: true,
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
    });
  }
  return newPair;
};

const spawnSingleEnemy = (
  processedLevel: ProcessedLevelData | null,
  canvasWidth: number,
  canvasHeight: number
): EnemyState | null => {
  if (!processedLevel || !processedLevel.tiles || canvasWidth <= 0 || canvasHeight <= 0 || processedLevel.tiles.length === 0) return null;

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
    pImg.src = `https://placehold.co/${PLAYER_WIDTH}x${PLAYER_HEIGHT}/FFA500/FFFFFF.png?text=H`;
    pImg.setAttribute('data-ai-hint', 'character orange blue');
    pImg.onload = () => setAssets(prev => ({ ...prev, playerImage: pImg, playerImageLoaded: true }));
    pImg.onerror = () => { console.error("Failed to load player image."); setAssets(prev => ({ ...prev, playerImageLoaded: true })); };

    const tImg = new Image();
    tImg.src = `https://placehold.co/1x1/008000/FFFFFF.png?text=P`;
    tImg.setAttribute('data-ai-hint', 'platform grass dirt');
    tImg.onload = () => setAssets(prev => ({...prev, tileImage: tImg, tileImageLoaded: true}));
    tImg.onerror = () => {
        console.error("Failed to load tile image.");
        setAssets(prev => ({...prev, tileImageLoaded: true}));
    };

    const cImg = new Image();
    cImg.src = `/assets/images/thankscoin.png`;
    cImg.setAttribute('data-ai-hint', 'collectible coin');
    cImg.onload = () => setAssets(prev => ({ ...prev, coinImage: cImg, coinImageLoaded: true }));
    cImg.onerror = () => { console.error("Failed to load coin image."); setAssets(prev => ({ ...prev, coinImageLoaded: true })); };
  }, []);

  useEffect(() => {
    if (!isClient) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateSize = () => {
      const container = canvas.parentElement;
      let newWidth = 800; 
      let newHeight = 600;
      if (container) {
        if (container.clientWidth > 0) newWidth = container.clientWidth;
        if (container.clientHeight > 0) newHeight = container.clientHeight;
      }
      
      setCanvasSize(currentSize => {
        if (canvas.width !== newWidth) canvas.width = newWidth;
        if (canvas.height !== newHeight) canvas.height = newHeight;
        
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
          return { width: newWidth, height: newHeight };
        }
        return currentSize; 
      });
    };

    updateSize(); 
    let resizeObserver: ResizeObserver | null = null;
    if (canvas.parentElement && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateSize);
      resizeObserver.observe(canvas.parentElement);
    } else {
      window.addEventListener('resize', updateSize);
    }
    return () => {
      if (resizeObserver && canvas.parentElement) resizeObserver.unobserve(canvas.parentElement);
      else window.removeEventListener('resize', updateSize);
    };
  }, [isClient]);
  
  useEffect(() => {
    if (!isClient || !levelPath) {
      if (!isLoading) setIsLoading(true);
      return;
    }
    setRawLevelData(null);
    setProcessedLevel(null);
    if (!isLoading) setIsLoading(true);

    loadLevel(levelPath)
      .then(data => {
        if (data) {
          setRawLevelData(data);
        } else {
          toast({ title: "Error", description: `Failed to load level: ${levelPath}`, variant: "destructive" });
          setRawLevelData(null); 
        }
      })
      .catch(error => {
        console.error("Error in loadLevel promise chain:", error);
        toast({ title: "Error", description: "An unexpected error occurred loading level data.", variant: "destructive" });
        setRawLevelData(null);
      });
  }, [levelPath, isClient, toast, setIsLoading, setRawLevelData, setProcessedLevel, isLoading]);


  useEffect(() => {
    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !assets.playerImageLoaded || !assets.tileImageLoaded || !assets.coinImageLoaded) {
      if (!isLoading) setIsLoading(true);
      return;
    }
    
    setActiveCoins([]); 
    setActiveEnemies([]);
    
    const newProcessedLevel = processRawLevelData(
        rawLevelData, 
        canvasSize.width, 
        canvasSize.height,
        p3BasePosition,
        p3InterestPoints,
        p3CurrentTargetIndex,
        p3MovementState
    );
    
    if (newProcessedLevel) {
      setProcessedLevel(newProcessedLevel); 
      const newPlayer: PlayerState = {
        x: newProcessedLevel.playerStart.xPx, y: newProcessedLevel.playerStart.yPx,
        width: PLAYER_WIDTH, height: PLAYER_HEIGHT, vx: 0, vy: 0, isOnGround: false,
        isMovingLeft: false, isMovingRight: false, color: PLAYER_COLOR, image: assets.playerImage,
      };
      playerInstanceRef.current = newPlayer;
      if (parentPlayerRef) parentPlayerRef.current = newPlayer;

    } else {
      toast({ title: "Processing Error", description: "Failed to process level data.", variant: "destructive" });
      setProcessedLevel(null);
      if (!isLoading) setIsLoading(true);
    }
  }, [
    isClient, rawLevelData, canvasSize, assets.playerImageLoaded, assets.tileImageLoaded, assets.coinImageLoaded, 
    parentPlayerRef, toast, setIsLoading, setProcessedLevel, setActiveCoins, setActiveEnemies,
    p3BasePosition, p3InterestPoints, p3CurrentTargetIndex, p3MovementState, isLoading
  ]);

  useEffect(() => {
    if (!isClient || !isLoading || !processedLevel || canvasSize.width === 0 || canvasSize.height === 0) {
      return;
    }

    let coinsSpawnedOrAttempted = activeCoins.length > 0;
    if (!coinsSpawnedOrAttempted && processedLevel.tiles.length > 0) {
      const newCoins = spawnNewCoinPair(processedLevel, canvasSize.width, canvasSize.height);
      if (newCoins.length > 0) setActiveCoins(newCoins);
      coinsSpawnedOrAttempted = true; 
    }

    let enemiesSpawnedOrAttempted = activeEnemies.length > 0;
    if (levelPath !== '/levels/level2.json') { // Do not spawn enemies on level 2 for now
      if (!enemiesSpawnedOrAttempted && processedLevel.tiles.length > 0) {
        const newEnemy = spawnSingleEnemy(processedLevel, canvasSize.width, canvasSize.height);
        if (newEnemy) setActiveEnemies([newEnemy]);
        enemiesSpawnedOrAttempted = true;
      }
    } else {
      enemiesSpawnedOrAttempted = true; // For level 2, consider enemies "handled" (i.e., not spawning)
    }
    
    if (processedLevel.tiles.length === 0 || (coinsSpawnedOrAttempted && enemiesSpawnedOrAttempted)) {
      setIsLoading(false);
    }
  }, [
    isClient, processedLevel, canvasSize, isLoading, levelPath, 
    activeCoins.length, activeEnemies.length, 
    setActiveCoins, setActiveEnemies, setIsLoading
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
        const currentTime = Date.now();
        if (!p3MovementState.current || currentTime >= p3MovementState.current.startTime + P3_MOVEMENT_DURATION) {
          let nextTargetIndex = Math.floor(Math.random() * p3InterestPoints.current.length);
          if (p3InterestPoints.current.length > 1 && nextTargetIndex === p3CurrentTargetIndex.current) {
            nextTargetIndex = (nextTargetIndex + 1) % p3InterestPoints.current.length;
          }
          p3CurrentTargetIndex.current = nextTargetIndex;
          const targetOffset = p3InterestPoints.current[nextTargetIndex];
          const targetX = p3BasePosition.current.x + targetOffset.xOffset;
          const targetY = p3BasePosition.current.y + targetOffset.yOffset;
          p3MovementState.current = { startTime: currentTime, startX: p3Tile.x, startY: p3Tile.y, targetX, targetY };
        }

        const { startTime, startX, startY, targetX, targetY } = p3MovementState.current;
        const elapsedTime = currentTime - startTime;
        const t = Math.min(1, elapsedTime / P3_MOVEMENT_DURATION);
        
        const eased_t = -(Math.cos(Math.PI * t) - 1) / 2;

        const oldP3X = p3Tile.x;
        const oldP3Y = p3Tile.y;
        
        p3Tile.x = startX + (targetX - startX) * eased_t;
        p3Tile.y = startY + (targetY - startY) * eased_t;

        p3_delta_x = p3Tile.x - oldP3X;
        p3_delta_y = p3Tile.y - oldP3Y;
      }


      if (executeAction) {
        switch (executeAction) {
          case 'moveLeft': player.isMovingLeft = true; break;
          case 'moveRight': player.isMovingRight = true; break;
          case 'stopMoveLeft': player.isMovingLeft = false; break;
          case 'stopMoveRight': player.isMovingRight = false; break;
          case 'jump': if (player.isOnGround) { player.vy = JUMP_STRENGTH; player.isOnGround = false; } break;
        }
        resetExecuteAction();
      }
      if (player.isMovingLeft) player.vx = -PLAYER_SPEED; else if (player.isMovingRight) player.vx = PLAYER_SPEED; else player.vx = 0;

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
      if (groundPlatform && player.y + player.height > groundPlatform.y && player.vy >=0 && player.y < groundPlatform.y + groundPlatform.height) { 
          if (player.y + player.height > groundPlatform.y) { // Ensure player is not pushed through if somehow already below
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
        if (newCoin.particles.length > 0) {
          newCoin.particles = newCoin.particles.map(p => ({
            ...p,
            x: p.x + p.vx * deltaTimeFactor, 
            y: p.y + p.vy * deltaTimeFactor, 
            vy: p.vy + (GRAVITY * COIN_PARTICLE_GRAVITY_FACTOR * deltaTimeFactor), 
            life: p.life - deltaTime, 
            opacity: Math.max(0, (p.life - deltaTime) / COIN_PARTICLE_LIFESPAN),
          })).filter(p => p.life > 0);
          if (newCoin.particles.length === 0 && newCoin.isCollected) { // Check after filtering
            newCoin.isVisuallyPresent = false; 
          }
        } else if (newCoin.isCollected && newCoin.isVisuallyPresent && newCoin.currentOpacity === 0 && newCoin.particles.length === 0) {
            newCoin.isVisuallyPresent = false; // Ensures visuallyPresent is false if collected and faded out without particles
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
      const player = playerInstanceRef.current; if (!player) return;
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

