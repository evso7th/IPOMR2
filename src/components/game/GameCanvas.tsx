
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
  onPlayerAction: (action: GameAction) => void;
  playerRef: React.MutableRefObject<PlayerState | null>;
  executeAction: GameAction | null;
  resetExecuteAction: () => void;
}


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
     if (value.startsWith('calc(') && value.endsWith(')')) {
      const expression = value.substring(5, value.length - 1);
      const parts = expression.split(/(\s*[+-]\s*)/).map(part => part.trim());
      if (parts.length === 3) {
        const val1 = parseDimension(parts[0], totalSize);
        const operator = parts[1];
        const val2 = parseDimension(parts[2], totalSize);
        if (operator === '-') return val1 - val2;
        if (operator === '+') return val1 + val2;
      }
    }
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
}

function processRawLevelData(
  rawData: RawLevelData,
  canvasWidth: number,
  canvasHeight: number,
  p3BasePosRef: React.MutableRefObject<{ x: number; y: number } | null>,
  p3InterestPointsRef: React.MutableRefObject<Array<{ xOffset: number; yOffset: number }>>,
  p3CurrentTargetIndexRef: React.MutableRefObject<number>,
  p3MovementStateRef: React.MutableRefObject<{startTime: number, startX: number, startY: number, targetX: number, targetY: number} | null>,
  currentLevelPath: string
): { processedLevel: ProcessedLevelData | null; player: PlayerState | null } {
  if (!rawData || canvasWidth <= 0 || canvasHeight <= 0) {
    console.warn('[GameCanvas processRawLevelData] Invalid rawData or canvas dimensions. Canvas W:', canvasWidth, 'H:', canvasHeight);
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
        layer: rawTile.layer,
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
    }

    if (currentLevelPath === '/levels/level2.json') {
        const p_ground_tile_level2 = processedTiles.find(tile => tile.id === 'p_ground');
        if (p_ground_tile_level2 && canvasWidth > 0 && canvasHeight > 0) {
            const p_ground_top_y = p_ground_tile_level2.y;
            const p3_size_w_local = P3_SIZE_W;
            const p3_size_h_local = P3_SIZE_H;

            p3BasePosRef.current = {
                x: (canvasWidth / 2) - (p3_size_w_local / 2),
                y: p_ground_top_y - 300
            };

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
                  width: p3_size_w_local,
                  height: p3_size_h_local,
                  type: 1,
                  color: 'hsl(var(--secondary))',
                  vx: 0,
                  direction: 0,
                  layer: 'background',
                };
                processedTiles.push(p3TileToAdd);
            }
        }
    }


    const newPlayer: PlayerState = {
        x: playerStartX, y: playerStartY,
        width: PLAYER_WIDTH, height: PLAYER_HEIGHT, vx: 0, vy: 0, isOnGround: false,
        isMovingLeft: false, isMovingRight: false, color: PLAYER_COLOR, facingDirection: 'right', image: null, activePlatformId: null,
    };

    return {
      processedLevel: {
        playerStart: { xPx: playerStartX, yPx: playerStartY },
        tiles: processedTiles,
      },
      player: newPlayer,
    };
  } catch (error) {
    console.error("[GameCanvas processRawLevelData] Error processing level data:", error);
    return { processedLevel: null, player: null };
  }
}

const spawnNewCoinPair = (
  processedLevel: ProcessedLevelData | null,
  canvasWidth: number,
  canvasHeight: number
): CoinState[] => {

  const newCoins: CoinState[] = [];
  const currentTime = Date.now();
  const randomRotationSpeed = () => COIN_ROTATION_SPEED_MIN + Math.random() * (COIN_ROTATION_SPEED_MAX - COIN_ROTATION_SPEED_MIN);

  // For debugging, create one coin at a fixed position
  if (canvasWidth > 0 && canvasHeight > 0) {
    newCoins.push({
        id: `debug-coin-${currentTime}`,
        x: canvasWidth / 2 - COIN_SIZE / 2, // Centered horizontally
        y: canvasHeight / 2 - COIN_SIZE / 2, // Centered vertically
        width: COIN_SIZE,
        height: COIN_SIZE,
        isCollected: false,
        targetSpawnTime: currentTime,
        currentOpacity: 0,
        particles: [],
        isVisuallyPresent: true,
        rotationAngle: Math.random() * Math.PI * 2,
        rotationSpeed: randomRotationSpeed(),
    });
  }
  return newCoins;
};

const spawnSingleEnemy = (
  processedLevel: ProcessedLevelData | null,
  canvasWidth: number,
): EnemyState | null => {
  if (!processedLevel || !processedLevel.tiles || canvasWidth <= 0 || processedLevel.tiles.length === 0) return null;

  const p1 = processedLevel.tiles.find(tile => tile.id === 'p1' || tile.id === 'floating_platform_left' || tile.id === 'floating_platform_1');
  const p2 = processedLevel.tiles.find(tile => tile.id === 'p2' || tile.id === 'floating_platform_right' || tile.id === 'floating_platform_2');

  if (!p1 || !p2) {
     if (canvasWidth > 0 ) {
       // console.warn("[GameCanvas spawnSingleEnemy] P1/floating_platform_left or P2/floating_platform_right not found for enemy positioning.");
     }
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
  const processedLevelRef = useRef<ProcessedLevelData | null>(null);


  const [activeCoins, setActiveCoins] = useState<CoinState[]>([]);
  const [activeEnemies, setActiveEnemies] = useState<EnemyState[]>([]);

  const playerInstanceRef = useRef<PlayerState | null>(null);
  const lastFrameTime = useRef<number>(Date.now());

  const [isLoading, setIsLoading] = useState(true);
  // const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const p3BasePosition = useRef<{ x: number; y: number } | null>(null);
  const p3InterestPoints = useRef<Array<{ xOffset: number; yOffset: number }>>([]);
  const p3CurrentTargetIndex = useRef<number>(-1);
  const p3MovementStateRef = useRef<{startTime: number, startX: number, startY: number, targetX: number, targetY: number} | null>(null);

  const executeActionRef = useRef<GameAction | null>(null);


  // Effect 1: Set isClient and load assets
  useEffect(() => {
    // console.log("[GameCanvas Effect 1] Running: Set isClient, Load Assets");
    setIsClient(true);
    const pImg = new Image();
    pImg.src = `/assets/images/hero_jeans3.png`;
    pImg.setAttribute('data-ai-hint', 'character orange blue');
    pImg.onload = () => setAssets(prev => ({ ...prev, playerImage: pImg, playerImageLoaded: true }));
    pImg.onerror = () => {
        // console.error("Failed to load player image.");
        setAssets(prev => ({ ...prev, playerImageLoaded: true }));
    };

    const tImg = new Image();
    tImg.src = `/assets/images/platform_grass.png`;
    tImg.setAttribute('data-ai-hint', 'platform grass dirt');
    tImg.onload = () => setAssets(prev => ({...prev, tileImage: tImg, tileImageLoaded: true}));
    tImg.onerror = () => {
        // console.error("Failed to load tile image.");
        setAssets(prev => ({...prev, tileImageLoaded: true}));
    };

    const cImg = new Image();
    cImg.src = `/assets/images/thankscoin.png`;
    cImg.setAttribute('data-ai-hint', 'collectible coin gold');
    cImg.onload = () => setAssets(prev => ({ ...prev, coinImage: cImg, coinImageLoaded: true }));
    cImg.onerror = () => {
        // console.error("Failed to load coin image.");
        setAssets(prev => ({ ...prev, coinImageLoaded: true }));
    };

    const sImg = new Image();
    sImg.src = `/assets/images/stone1.jpg`;
    sImg.setAttribute('data-ai-hint', 'stone rock');
    sImg.onload = () => setAssets(prev => ({ ...prev, stoneImage: sImg, stoneImageLoaded: true }));
    sImg.onerror = () => {
        // console.error("Failed to load stone image.");
        setAssets(prev => ({ ...prev, stoneImageLoaded: true }));
    };

    const flowerImg = new Image();
    flowerImg.src = '/assets/images/flowers.png';
    flowerImg.setAttribute('data-ai-hint', 'flowers small');
    flowerImg.onload = () => setAssets(prev => ({ ...prev, flowerImage: flowerImg, flowerImageLoaded: true }));
    flowerImg.onerror = () => {
        // console.error("Failed to load flower image.");
        setAssets(prev => ({ ...prev, flowerImageLoaded: true}));
    };

    const tree1Img = new Image();
    tree1Img.src = '/assets/images/tree1.png';
    tree1Img.setAttribute('data-ai-hint', 'tree green');
    tree1Img.onload = () => setAssets(prev => ({ ...prev, treeImage: tree1Img, treeImageLoaded: true }));
    tree1Img.onerror = () => {
        // console.error("Failed to load tree1 image.");
        setAssets(prev => ({ ...prev, treeImageLoaded: true}));
    };

    const tree2Img = new Image();
    tree2Img.src = '/assets/images/tree2.png';
    tree2Img.setAttribute('data-ai-hint', 'tree nature');
    tree2Img.onload = () => setAssets(prev => ({ ...prev, tree2Image: tree2Img, tree2ImageLoaded: true }));
    tree2Img.onerror = () => {
        // console.error("Failed to load tree2 image.");
        setAssets(prev => ({ ...prev, tree2ImageLoaded: true}));
    };

    const smallBushImg = new Image();
    smallBushImg.src = '/assets/images/flowers.png';
    smallBushImg.setAttribute('data-ai-hint', 'bush small flowers');
    smallBushImg.onload = () => setAssets(prev => ({ ...prev, smallBushImage: smallBushImg, smallBushImageLoaded: true }));
    smallBushImg.onerror = () => {
        // console.error("Failed to load small bush image.");
        setAssets(prev => ({ ...prev, smallBushImageLoaded: true}));
    };

    const largeBushImg = new Image();
    largeBushImg.src = '/assets/images/bush1.png';
    largeBushImg.setAttribute('data-ai-hint', 'bush large');
    largeBushImg.onload = () => setAssets(prev => ({ ...prev, largeBushImage: largeBushImg, largeBushImageLoaded: true }));
    largeBushImg.onerror = () => {
        // console.error("Failed to load large bush image.");
        setAssets(prev => ({ ...prev, largeBushImageLoaded: true}));
    };

    const houseImg = new Image();
    houseImg.src = '/assets/images/house1.png';
    houseImg.setAttribute('data-ai-hint', 'house building');
    houseImg.onload = () => setAssets(prev => ({ ...prev, houseImage: houseImg, houseImageLoaded: true }));
    houseImg.onerror = () => {
        // console.error("Failed to load house image.");
        setAssets(prev => ({ ...prev, houseImageLoaded: true}));
    };

  }, []);

  const [assets, setAssets] = useState<{
    playerImage: HTMLImageElement | null;
    tileImage: HTMLImageElement | null;
    coinImage: HTMLImageElement | null;
    stoneImage: HTMLImageElement | null;
    flowerImage: HTMLImageElement | null;
    treeImage: HTMLImageElement | null;
    tree2Image: HTMLImageElement | null;
    smallBushImage: HTMLImageElement | null;
    largeBushImage: HTMLImageElement | null;
    houseImage: HTMLImageElement | null;
    playerImageLoaded: boolean;
    tileImageLoaded: boolean;
    coinImageLoaded: boolean;
    stoneImageLoaded: boolean;
    flowerImageLoaded: boolean;
    treeImageLoaded: boolean;
    tree2ImageLoaded: boolean;
    smallBushImageLoaded: boolean;
    largeBushImageLoaded: boolean;
    houseImageLoaded: boolean;
  }>({
    playerImage: null, tileImage: null, coinImage: null, stoneImage: null, flowerImage: null, treeImage: null,
    tree2Image: null, smallBushImage: null, largeBushImage: null, houseImage: null,
    playerImageLoaded: false, tileImageLoaded: false, coinImageLoaded: false, stoneImageLoaded: false, flowerImageLoaded: false, treeImageLoaded: false,
    tree2ImageLoaded: false, smallBushImageLoaded: false, largeBushImageLoaded: false, houseImageLoaded: false
  });

  // Effect 2: Apply canvasSize to canvas element attributes
  useEffect(() => {
    // console.log("[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize:", canvasSize);
    if (!isClient || !canvasRef.current) return;
    const canvas = canvasRef.current;
    if (canvasSize.width > 0 && canvas.width !== canvasSize.width) {
      // console.log(`[GameCanvas Effect 2] Setting canvas.width: ${canvasSize.width}`);
      canvas.width = canvasSize.width;
    }
    if (canvasSize.height > 0 && canvas.height !== canvasSize.height) {
      // console.log(`[GameCanvas Effect 2] Setting canvas.height: ${canvasSize.height}`);
      canvas.height = canvasSize.height;
    }
  }, [isClient, canvasSize]);

  // Effect 3: Observe parent size and update canvasSize state
  useEffect(() => {
    // console.log("[GameCanvas Effect 3] Running: Observe parent size");
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
            // console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Updating canvasSize from W:${currentSize.width} H:${currentSize.height} to W:${newWidth} H:${newHeight}`);
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
        // console.log("[GameCanvas Effect 3] ResizeObserver not supported, falling back to window resize listener.");
        window.addEventListener('resize', updateCanvasSizeState);
        usingWindowListener = true;
    }

    return () => {
      // console.log("[GameCanvas Effect 3] Cleanup: Unobserve parent size");
      observer.unobserve(observedElement);
      if (usingWindowListener) {
        window.removeEventListener('resize', updateCanvasSizeState);
      }
    };
  }, [isClient]);


  // Effect 4: Load raw level data
  useEffect(() => {
    // console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}`);
    if (!isClient || !levelPath) {
      if (levelPath) {
        // console.warn(`[GameCanvas Effect 4] Skipped: isClient is ${isClient}`);
      } else {
        // console.warn(`[GameCanvas Effect 4] Skipped: levelPath is ${levelPath}`);
      }
      return;
    }
    setRawLevelData(null);
    setIsLoading(true); // Always set isLoading to true when starting to load a new level

    loadLevel(levelPath)
      .then(data => {
        if (data) {
          // console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}:`, data);
          setRawLevelData(data);
        } else {
          // console.error(`[GameCanvas Effect 4] Failed to load rawLevelData for ${levelPath}, data is null.`);
          setRawLevelData(null);
        }
      })
      .catch(error => {
        // console.error(`[GameCanvas Effect 4] Error loading rawLevelData for ${levelPath}:`, error);
        setRawLevelData(null);
      });
  }, [levelPath, isClient]);


  // Effect 5: Process raw level data and initialize player
  useEffect(() => {
    const allAssetsLoaded = assets.playerImageLoaded && assets.tileImageLoaded && assets.coinImageLoaded && assets.stoneImageLoaded &&
                            assets.flowerImageLoaded && assets.treeImageLoaded && assets.tree2ImageLoaded &&
                            assets.smallBushImageLoaded && assets.largeBushImageLoaded && assets.houseImageLoaded;

    // console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, allAssetsLoaded: ${allAssetsLoaded}`);

    if (
      !isClient || !rawLevelData ||
      canvasSize.width === 0 || canvasSize.height === 0 ||
      !allAssetsLoaded
    ) {
      if (processedLevelRef.current !== null) {
        // console.log("[GameCanvas Effect 5] Conditions not met, clearing processedLevel.");
        setProcessedLevel(null);
      } else {
        // console.log("[GameCanvas Effect 5] Conditions not met, processedLevel already null or initial state.");
      }
      return;
    }

    // console.log("[GameCanvas Effect 5] Conditions met, processing rawLevelData...");
    setActiveCoins([]);
    setActiveEnemies([]);

    const { processedLevel: newProcessedLevel, player: newPlayer } = processRawLevelData(
        rawData,
        canvasSize.width,
        canvasSize.height,
        p3BasePosition,
        p3InterestPoints,
        p3CurrentTargetIndex,
        p3MovementStateRef,
        levelPath
    );

    if (newProcessedLevel && newPlayer) {
      newPlayer.image = assets.playerImage;
      // console.log("[GameCanvas Effect 5] Successfully processed level. New processedLevel:", newProcessedLevel, "New player:", newPlayer);
      setProcessedLevel(newProcessedLevel);
      playerInstanceRef.current = newPlayer;
      if (parentPlayerRef) parentPlayerRef.current = newPlayer;
    } else {
      // console.warn("[GameCanvas Effect 5] Failed to process level data or create player. Clearing processedLevel.");
      setProcessedLevel(null);
      playerInstanceRef.current = null;
      if (parentPlayerRef) parentPlayerRef.current = null;
    }
  }, [
    isClient, rawLevelData, canvasSize, assets, levelPath, parentPlayerRef,
    p3BasePosition, p3InterestPoints, p3CurrentTargetIndex, p3MovementStateRef,
    // Removed setIsLoading, setProcessedLevel from dependencies as they are setters.
  ]);


  // Effect 7: Spawn entities and finish loading
 useEffect(() => {
    // console.log(`[GameCanvas Effect 7] Running: Spawn entities. isClient: ${isClient}, isLoading: ${isLoading}, processedLevel: ${!!processedLevel}, canvasSize W:${canvasSize.width}H:${canvasSize.height}`);
    if (!isClient || !processedLevel || canvasSize.width === 0 || canvasSize.height === 0) {
      // console.log("[GameCanvas Effect 7] Pre-conditions not met, returning.");
      return;
    }
    // This effect should only run if we are currently in a loading state.
    // If isLoading is already false, it means entities were (or should have been) spawned.
    if (!isLoading) {
        // console.log("[GameCanvas Effect 7] isLoading is false, skipping spawn logic.");
        return;
    }

    let coinsAttemptedThisRun = activeCoins.length > 0;
    if (!coinsAttemptedThisRun && processedLevel.tiles.length > 0) {
      // console.log("[GameCanvas Effect 7] Spawning new coin pair.");
      const newCoins = spawnNewCoinPair(processedLevel, canvasSize.width, canvasSize.height);
      setActiveCoins(newCoins);
      coinsAttemptedThisRun = true;
    } else if (processedLevel.tiles.length === 0) {
       // console.log("[GameCanvas Effect 7] No tiles, no coins needed.");
       coinsAttemptedThisRun = true; // No tiles, no coins needed, consider attempt "done"
    }

    let enemiesAttemptedThisRun = activeEnemies.length > 0;
    if (levelPath !== '/levels/level2.json' && levelPath !== '/levels/level1.json') {
      if (!enemiesAttemptedThisRun && processedLevel.tiles.length > 0) {
        const p1 = processedLevel.tiles.find(t => t.id === 'p1' || t.id === 'floating_platform_left' || t.id === 'floating_platform_1');
        const p2 = processedLevel.tiles.find(t => t.id === 'p2' || t.id === 'floating_platform_right' || t.id === 'floating_platform_2');
        if (p1 && p2) {
          // console.log("[GameCanvas Effect 7] Spawning single enemy.");
          const newEnemy = spawnSingleEnemy(processedLevel, canvasSize.width);
          if (newEnemy) {
            setActiveEnemies([newEnemy]);
          }
        }
        enemiesAttemptedThisRun = true;
      } else if (processedLevel.tiles.length === 0) {
         // console.log("[GameCanvas Effect 7] No tiles, no enemies needed.");
         enemiesAttemptedThisRun = true; // No tiles, no enemies needed
      }
    } else {
      // console.log(`[GameCanvas Effect 7] Enemies not spawned for level: ${levelPath}`);
      enemiesAttemptedThisRun = true; // Enemies not needed for level 1 or 2
    }

    if (coinsAttemptedThisRun && enemiesAttemptedThisRun) {
      // console.log("[GameCanvas Effect 7] All entities attempted, setting isLoading to false.");
      setIsLoading(false);
    } else {
      // console.log(`[GameCanvas Effect 7] Did not set isLoading to false. coinsAttempted: ${coinsAttemptedThisRun}, enemiesAttempted: ${enemiesAttemptedThisRun}`);
    }

  }, [
    isClient, isLoading, processedLevel, canvasSize, levelPath,
    setActiveCoins, setActiveEnemies, setIsLoading
    // Removed activeCoins.length and activeEnemies.length to prevent re-triggering after initial load
  ]);


  // Effect 8: Respawn coins when all collected and particles are gone
  useEffect(() => {
    // console.log(`[GameCanvas Effect 8] Running: Check coin respawn. isLoading: ${isLoading}, processedLevel: ${!!processedLevel}`);
    if (!isClient || isLoading || !processedLevel || !processedLevel.tiles || canvasSize.width === 0 || canvasSize.height === 0) return;

    const allCollectedAndParticlesGone = activeCoins.length > 0 && activeCoins.every(c => c.isCollected && c.particles.length === 0 && !c.isVisuallyPresent);
    if (allCollectedAndParticlesGone) {
       // console.log("[GameCanvas Effect 8] All coins collected and particles gone, respawning new coin pair.");
       const newCoins = spawnNewCoinPair(processedLevel, canvasSize.width, canvasSize.height);
       setActiveCoins(newCoins);
    }
  }, [activeCoins, isClient, isLoading, processedLevel, canvasSize, setActiveCoins]);

  // Effect to keep executeActionRef.current updated with the executeAction prop
  useEffect(() => {
    executeActionRef.current = executeAction;
  }, [executeAction]);


  const gameLoop = useCallback(() => {
    processedLevelRef.current = processedLevel;

    const loopStartTime = Date.now();
    const deltaTime = (loopStartTime - lastFrameTime.current);
    const deltaTimeFactor = Math.max(0.1, Math.min(2, deltaTime / (1000 / 60)));

    const player = playerInstanceRef.current;
    const currentLevel = processedLevelRef.current;
    const currentCanvas = canvasRef.current;

    if (!player || !currentLevel || !currentLevel.tiles || !currentCanvas) {
      lastFrameTime.current = loopStartTime;
      if (isClient && !isLoading) requestAnimationFrame(gameLoop);
      return;
    }
    const ctx = currentCanvas.getContext('2d');
    if (!ctx) {
      lastFrameTime.current = loopStartTime;
      if (isClient && !isLoading) requestAnimationFrame(gameLoop);
      return;
    }

    if (levelPath === '/levels/level2.json') {
        const p3Tile = currentLevel.tiles.find(tile => tile.id === 'p3');
        if (p3Tile && p3BasePosition.current && p3InterestPoints.current.length > 0) {
          const currentTimeForP3 = Date.now();
          if (!p3MovementStateRef.current || currentTimeForP3 >= p3MovementStateRef.current.startTime + P3_MOVEMENT_DURATION) {
            let nextTargetIndex = p3CurrentTargetIndex.current;
            if (p3InterestPoints.current.length > 1) {
              do {
                nextTargetIndex = Math.floor(Math.random() * p3InterestPoints.current.length);
              } while (nextTargetIndex === p3CurrentTargetIndex.current);
            } else {
              nextTargetIndex = 0;
            }
            p3CurrentTargetIndex.current = nextTargetIndex;

            const targetOffset = p3InterestPoints.current[nextTargetIndex];
            const targetX = p3BasePosition.current.x + targetOffset.xOffset;
            const targetY = p3BasePosition.current.y + targetOffset.yOffset;
            p3MovementStateRef.current = { startTime: currentTimeForP3, startX: p3Tile.x, startY: p3Tile.y, targetX, targetY };
          }

          const { startTime, startX, startY, targetX, targetY } = p3MovementStateRef.current;
          const elapsedTime = currentTimeForP3 - startTime;
          const t = Math.min(1, elapsedTime / P3_MOVEMENT_DURATION);
          const eased_t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

          const oldP3X = p3Tile.x;
          const oldP3Y = p3Tile.y;

          p3Tile.x = startX + (targetX - startX) * eased_t;
          p3Tile.y = startY + (targetY - startY) * eased_t;

          const p3_delta_x = p3Tile.x - oldP3X;
          const p3_delta_y = p3Tile.y - oldP3Y;

           if (player.isOnGround && player.activePlatformId === 'p3') {
             player.x += p3_delta_x;
             player.y += p3_delta_y;
           }
        }
    }

    const currentExecuteAction = executeActionRef.current;
    if (currentExecuteAction) {
      switch (currentExecuteAction) {
        case 'moveLeft': player.isMovingLeft = true; player.facingDirection = 'left'; break;
        case 'moveRight': player.isMovingRight = true; player.facingDirection = 'right'; break;
        case 'stopMoveLeft': player.isMovingLeft = false; break;
        case 'stopMoveRight': player.isMovingRight = false; break;
        case 'jump':
          if (player.isOnGround) {
            player.vy = JUMP_STRENGTH;
            player.isOnGround = false;
          }
          break;
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
      if (tile.id !== 'p3' && tile.vx !== undefined && tile.direction !== undefined && currentCanvas.width > 0) {
        let newTileX = tile.x + (tile.vx * tile.direction * deltaTimeFactor);
        let changeDirection = false;

        if (tile.id === 'boat1') {
          const waterPit = currentLevel.tiles.find(t => t.id === 'water_pit');
          if (waterPit) {
            const waterPitXStart = waterPit.x;
            const waterPitXEnd = waterPit.x + waterPit.width;
            if (newTileX <= waterPitXStart && tile.direction === -1) {
              newTileX = waterPitXStart;
              changeDirection = true;
            } else if (newTileX + tile.width >= waterPitXEnd && tile.direction === 1) {
              newTileX = waterPitXEnd - tile.width;
              changeDirection = true;
            }
          } else {
            if (newTileX <= 0 && tile.direction === -1) { newTileX = 0; changeDirection = true; }
            else if (newTileX + tile.width >= currentCanvas.width && tile.direction === 1) { newTileX = currentCanvas.width - tile.width; changeDirection = true;}
          }
        } else {
          if (newTileX <= 0 && tile.direction === -1) { newTileX = 0; changeDirection = true; }
          else if (newTileX + tile.width >= currentCanvas.width && tile.direction === 1) { newTileX = currentCanvas.width - tile.width; changeDirection = true; }
        }

        const platformDeltaX = newTileX - tile.x;
        tile.x = newTileX;

        if (player.isOnGround && player.activePlatformId === tile.id) {
          player.x += platformDeltaX;
        }

        if (changeDirection) {
          tile.direction *= -1;
        }
      }
    });


    player.vy += GRAVITY * deltaTimeFactor;
    let tentativePlayerY = player.y + (player.vy * deltaTimeFactor);
    let newPlayerY = tentativePlayerY;
    player.isOnGround = false;
    player.activePlatformId = null;


    currentLevel.tiles.filter(tile => tile.type === 1).forEach(tile => {
      const tempPlayerStateForVerticalCheck = { ...player, y: newPlayerY, x: player.x };
      if (checkCollision(tempPlayerStateForVerticalCheck, tile)) {
        if (player.vy >= 0) {
          newPlayerY = tile.y - player.height;
          player.vy = 0;
          player.isOnGround = true;
          player.activePlatformId = tile.id;
        } else {
          newPlayerY = tile.y + tile.height;
          player.vy = 0;
        }
      }
    });
    player.y = newPlayerY;

    const tentativePlayerX = player.x + (player.vx * deltaTimeFactor);
    let newPlayerX = tentativePlayerX;
    currentLevel.tiles.filter(tile => tile.type === 1).forEach(tile => {
      const tempPlayerStateForHorizontalCheck = { ...player, x: newPlayerX, y: player.y };
      if (checkCollision(tempPlayerStateForHorizontalCheck, tile)) {
        const totalIntentVx = (player.vx * deltaTimeFactor);
        if (totalIntentVx > 0) newPlayerX = tile.x - player.width;
        else if (totalIntentVx < 0) newPlayerX = tile.x + tile.width;
      }
    });
    player.x = newPlayerX;


    if (player.x < 0) player.x = 0;
    if (currentCanvas.width > 0 && player.x + player.width > currentCanvas.width) player.x = currentCanvas.width - player.width;

    const groundPlatform = currentLevel.tiles.find(t => t.id === 'p_ground');
    if (groundPlatform && player.y + player.height > groundPlatform.y && player.vy >=0 ) {
        player.y = groundPlatform.y - player.height;
        player.vy = 0;
        player.isOnGround = true;
        player.activePlatformId = groundPlatform.id;
    } else if (!groundPlatform && player.y + player.height > currentCanvas.height && player.vy >=0 && currentCanvas.height > 0) {
        player.y = currentCanvas.height - player.height;
        player.vy = 0;
        player.isOnGround = true;
        player.activePlatformId = null;
    }


    setActiveCoins(prevCoins => prevCoins.map(coin => {
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
    }));

    setActiveEnemies(prevEnemies => prevEnemies.map(enemy => {
      let newEnemy = { ...enemy };
      let enemyDeltaX = (enemy.vx * enemy.direction * deltaTimeFactor);
      newEnemy.x += enemyDeltaX;

      if (currentCanvas.width > 0) {
          if (newEnemy.x <= 0 && newEnemy.direction === -1) { newEnemy.x = 0; newEnemy.direction *= -1; }
          else if (newEnemy.x + newEnemy.width >= currentCanvas.width && newEnemy.direction === 1) { newEnemy.x = currentCanvas.width - newEnemy.width; newEnemy.direction *= -1; }
      }

      const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };
      const enemyRect = { x: newEnemy.x, y: newEnemy.y, width: newEnemy.width, height: newEnemy.height };
      if (playerInstanceRef.current && checkCollision(playerRect, enemyRect)) {
        const p_ground_collision = currentLevel.tiles.find(tile => tile.id === 'p_ground');
        if (p_ground_collision && currentCanvas.width > 0 && playerInstanceRef.current) {
          playerInstanceRef.current.x = (currentCanvas.width / 2) - (playerInstanceRef.current.width / 2);
          playerInstanceRef.current.y = p_ground_collision.y - playerInstanceRef.current.height;
          playerInstanceRef.current.vx = 0; playerInstanceRef.current.vy = 0; playerInstanceRef.current.isOnGround = true;
          playerInstanceRef.current.activePlatformId = p_ground_collision.id;
        } else if (currentCanvas.width > 0 && playerInstanceRef.current) {
          playerInstanceRef.current.x = (currentCanvas.width / 2) - (playerInstanceRef.current.width / 2);
          playerInstanceRef.current.y = currentCanvas.height - playerInstanceRef.current.height;
          playerInstanceRef.current.vx = 0; playerInstanceRef.current.vy = 0; playerInstanceRef.current.isOnGround = true;
          playerInstanceRef.current.activePlatformId = null;
        }
      }
      return newEnemy;
    }));


    if (parentPlayerRef) parentPlayerRef.current = { ...player };

    ctx.clearRect(0, 0, currentCanvas.width, currentCanvas.height);

    currentLevel.tiles.forEach(tile => {
      if (tile.layer !== 'foreground') {
        let drawnWithImage = false;
        if (tile.type === 1) {
          if (tile.id.startsWith("stone_") && assets.stoneImage?.complete && assets.stoneImage.src) {
            ctx.drawImage(assets.stoneImage, tile.x, tile.y, tile.width, tile.height);
            drawnWithImage = true;
          } else if (assets.tileImage?.complete && assets.tileImage.src) {
            ctx.drawImage(assets.tileImage, tile.x, tile.y, tile.width, tile.height);
            drawnWithImage = true;
          }
        } else {
          if ((tile.id === "tree1" || tile.id === "tree_on_left_stone") && assets.treeImage?.complete && assets.treeImage.src) {
            ctx.drawImage(assets.treeImage, tile.x, tile.y, tile.width, tile.height);
            drawnWithImage = true;
          } else if (tile.id === "tree2" && assets.tree2Image?.complete && assets.tree2Image.src) {
            ctx.drawImage(assets.tree2Image, tile.x, tile.y, tile.width, tile.height);
            drawnWithImage = true;
          } else if (tile.id === "house1" && assets.houseImage?.complete && assets.houseImage.src) {
            ctx.drawImage(assets.houseImage, tile.x, tile.y, tile.width, tile.height);
            drawnWithImage = true;
          }
        }
        if (!drawnWithImage) {
           ctx.fillStyle = tile.color;
           ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
        }
      }
    });

    renderCoins(ctx, activeCoins, assets.coinImage);
    renderEnemies(ctx, activeEnemies);
    renderPlayer(ctx, player, assets.playerImage);

    currentLevel.tiles.forEach(tile => {
      if (tile.layer === 'foreground') {
        let drawnWithImage = false;
         if ((tile.id === "bush_left_1" || tile.id === "bush_right_1" || tile.id === "bush_on_right_stone") && assets.smallBushImage?.complete && assets.smallBushImage.src) {
          ctx.drawImage(assets.smallBushImage, tile.x, tile.y, tile.width, tile.height);
          drawnWithImage = true;
        } else if ((tile.id === "bush_left_2" || tile.id === "bush_right_2") && assets.largeBushImage?.complete && assets.largeBushImage.src) {
          ctx.drawImage(assets.largeBushImage, tile.x, tile.y, tile.width, tile.height);
          drawnWithImage = true;
        }

        if (!drawnWithImage) {
          ctx.fillStyle = tile.color;
          ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
        }
      }
    });
    lastFrameTime.current = loopStartTime;
    if (isClient && !isLoading) requestAnimationFrame(gameLoop);
  }, [
    isClient,
    isLoading, // Added isLoading here
    assets,
    resetExecuteAction,
    levelPath,
    parentPlayerRef,
    p3BasePosition,
    p3InterestPoints,
    p3CurrentTargetIndex,
    p3MovementStateRef,
    setActiveCoins,
    setActiveEnemies,
    processedLevel,
    canvasSize,
    // Removed activeCoins and activeEnemies from dependencies of gameLoop,
    // as setActiveCoins/Enemies use functional updates.
  ]);

  // Effect 9: Game Loop Setup (requestAnimationFrame)
  useEffect(() => {
    // console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize: W${canvasSize.width}H${canvasSize.height}, processedLevel: ${!!processedLevel}`);
    if (!isClient || isLoading || !canvasRef.current || canvasSize.width === 0 || canvasSize.height === 0 || !processedLevel) {
      // console.log("[GameCanvas Effect 9] Conditions not met for starting game loop.");
      return;
    }

    lastFrameTime.current = Date.now();
    // console.log("[GameCanvas Effect 9] Starting game loop.");
    const animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
      // console.log("[GameCanvas Effect 9] Cleanup: Cancelling animation frame.");
      cancelAnimationFrame(animationFrameId);
    };
  }, [isClient, isLoading, canvasSize, gameLoop, processedLevel]); // gameLoop is now a dependency


  // Effect 10: Keyboard input
  useEffect(() => {
    if (!isClient) return;
    const handleKeyDown = (e: KeyboardEvent) => {
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
    return <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground rounded-md">Loading Game Client...</div>;
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
