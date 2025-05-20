
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
// import { renderLevel } from '@/game/entities/levelRenderer'; // Not used due to direct rendering in gameLoop
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
  // console.warn(`[parseDimension] Could not parse dimension value: ${value}, defaulting to 0`);
  return 0;
}

function processRawLevelData(
  rawLevelDataInput: RawLevelData,
  canvasWidth: number,
  canvasHeight: number,
  p3BasePosRef: React.MutableRefObject<{ x: number; y: number } | null>,
  p3InterestPointsRef: React.MutableRefObject<Array<{ xOffset: number; yOffset: number }>>,
  p3CurrentTargetIndexRef: React.MutableRefObject<number>,
  p3MovementStateRef: React.MutableRefObject<{startTime: number, startX: number, startY: number, targetX: number, targetY: number} | null>,
  currentLevelPath: string
): { processedLevel: ProcessedLevelData | null; player: PlayerState | null } {
  // console.log('[GameCanvas processRawLevelData] Called with canvasSize W:', canvasWidth, 'H:', canvasHeight, 'for level:', currentLevelPath);
  if (!rawLevelDataInput || canvasWidth <= 0 || canvasHeight <= 0) {
    // console.warn('[GameCanvas processRawLevelData] Invalid rawLevelDataInput or canvas dimensions. Canvas W:', canvasWidth, 'H:', canvasHeight);
    return { processedLevel: null, player: null };
  }
  try {
    const processedTiles: ProcessedTile[] = rawLevelDataInput.tiles.map((rawTile: RawTileData) => {
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
    let playerStartY = canvasHeight - PLAYER_HEIGHT - 50; // Default start
    const startPlatform = processedTiles.find(tile => tile.id === rawLevelDataInput.playerStart.platformId);

    if (startPlatform) {
      const playerXOffset = rawLevelDataInput.playerStart.xOffsetPx || 0;
      const playerYOffset = rawLevelDataInput.playerStart.yOffsetPx || 0;
      switch (rawLevelDataInput.playerStart.horizontalAlign) {
        case 'left': playerStartX = startPlatform.x + playerXOffset; break;
        case 'center': playerStartX = startPlatform.x + (startPlatform.width / 2) - (PLAYER_WIDTH / 2) + playerXOffset; break;
        case 'right': playerStartX = startPlatform.x + startPlatform.width - PLAYER_WIDTH - playerXOffset; break;
      }
      playerStartY = startPlatform.y - PLAYER_HEIGHT - playerYOffset;
    } else {
      // console.warn(`[GameCanvas processRawLevelData] Player start platform with ID '${rawLevelDataInput.playerStart.platformId}' not found. Using default start position.`);
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
            // console.log("[processRawLevelData] Level 2: p_ground_top_y:", p_ground_top_y, "p3BasePosRef.current:", p3BasePosRef.current);

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
                  type: 1, // Collidable platform
                  color: 'hsl(var(--secondary))', // Example color
                  vx: 0, // Static for now, but can be made to drift
                  direction: 0,
                  layer: 'background', // Or 'foreground' if needed
                };
                processedTiles.push(p3TileToAdd);
                // console.log("[processRawLevelData] Level 2: Added p3Tile:", p3TileToAdd);
            }
        } else {
            // console.warn("[processRawLevelData] Level 2: p_ground tile not found or invalid canvas dimensions for p3 setup.");
        }
    }


    const newPlayer: PlayerState = {
        x: playerStartX, y: playerStartY,
        width: PLAYER_WIDTH, height: PLAYER_HEIGHT, vx: 0, vy: 0, isOnGround: false,
        isMovingLeft: false, isMovingRight: false, color: PLAYER_COLOR, facingDirection: 'right', image: null, activePlatformId: null,
    };
    // console.log("[processRawLevelData] Successfully processed. Player:", newPlayer, "Number of tiles:", processedTiles.length);

    return {
      processedLevel: {
        playerStart: { xPx: playerStartX, yPx: playerStartY }, // Use absolute pixel values
        tiles: processedTiles,
      },
      player: newPlayer,
    };
  } catch (error) {
    // console.error("[GameCanvas processRawLevelData] Error processing level data:", error);
    return { processedLevel: null, player: null };
  }
}

const spawnNewCoinPair = (
  processedLevel: ProcessedLevelData | null, // Can be null if level not loaded
  canvasWidth: number,
  canvasHeight: number
): CoinState[] => {
  const newCoins: CoinState[] = [];
  const currentTime = Date.now();

  if (canvasWidth <= 0 || canvasHeight <= 0) {
    // console.warn("[spawnNewCoinPair] Invalid canvas dimensions. Cannot spawn coins.");
    return newCoins;
  }

  // Debug: Always spawn one coin in the middle
  newCoins.push({
      id: `debug-coin-${currentTime}`,
      x: canvasWidth / 2 - COIN_SIZE / 2, 
      y: canvasHeight / 2 - COIN_SIZE / 2, 
      width: COIN_SIZE,
      height: COIN_SIZE,
      isCollected: false,
      targetSpawnTime: currentTime,
      currentOpacity: 1, // Start fully opaque for debugging
      particles: [],
      isVisuallyPresent: true,
      rotationAngle: Math.random() * Math.PI * 2,
      rotationSpeed: 0, // No rotation for this test
  });
  // console.log(`[spawnNewCoinPair DEBUG] Created 1 coin:`, newCoins);
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

  const enemyX = ENEMY_RADIUS + 10; // Start near left edge
  const enemyY = enemyCenterY - ENEMY_RADIUS; // Center vertically

  return {
    id: `enemy-${Date.now()}`, x: enemyX, y: enemyY, radius: ENEMY_RADIUS,
    width: ENEMY_RADIUS * 2, height: ENEMY_RADIUS * 2, // for collision
    vx: PLATFORM_SPEED * ENEMY_SPEED_FACTOR, direction: 1, color: ENEMY_COLOR,
  };
};


export default function GameCanvas({ levelPath, onPlayerAction, playerRef: parentPlayerRef, executeAction, resetExecuteAction }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rawLevelData, setRawLevelData] = useState<RawLevelData | null>(null); // Loaded from JSON

  const [processedLevel, setProcessedLevel] = useState<ProcessedLevelData | null>(null); // Processed based on canvas size
  const processedLevelRef = useRef<ProcessedLevelData | null>(null); // Ref for gameLoop

  const [activeCoins, setActiveCoins] = useState<CoinState[]>([]);
  const [activeEnemies, setActiveEnemies] = useState<EnemyState[]>([]);

  const playerInstanceRef = useRef<PlayerState | null>(null); // Mutable player state for gameLoop
  const lastFrameTime = useRef<number>(Date.now()); // For deltaTime calculation

  const [isLoading, setIsLoading] = useState(true); // Master loading state
  // const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 }); // Managed by ResizeObserver

  const p3BasePosition = useRef<{ x: number; y: number } | null>(null);
  const p3InterestPoints = useRef<Array<{ xOffset: number; yOffset: number }>>([]);
  const p3CurrentTargetIndex = useRef<number>(-1); // Start at -1 to ensure first point is chosen
  const p3MovementStateRef = useRef<{startTime: number, startX: number, startY: number, targetX: number, targetY: number} | null>(null);

  const executeActionRef = useRef<GameAction | null>(null);


  // Effect 1: Set isClient and load assets
  useEffect(() => {
    // console.log("[GameCanvas Effect 1] Running: Set isClient, Load Assets");
    setIsClient(true); // Component has mounted on the client
    // Player Image
    const pImg = new Image();
    pImg.src = `/assets/images/hero_jeans3.png`;
    pImg.setAttribute('data-ai-hint', 'character orange blue');
    pImg.onload = () => setAssets(prev => ({ ...prev, playerImage: pImg, playerImageLoaded: true }));
    pImg.onerror = () => {
        // console.error("Failed to load player image.");
        setAssets(prev => ({ ...prev, playerImageLoaded: true })); // Still mark as "loaded" to not block game
    };

    // Tile Image (for platforms)
    const tImg = new Image();
    tImg.src = `/assets/images/platform_grass.png`;
    tImg.setAttribute('data-ai-hint', 'platform grass dirt');
    tImg.onload = () => setAssets(prev => ({...prev, tileImage: tImg, tileImageLoaded: true}));
    tImg.onerror = () => {
        // console.error("Failed to load tile image.");
        setAssets(prev => ({...prev, tileImageLoaded: true}));
    };

    // Coin Image
    const cImg = new Image();
    cImg.src = `/assets/images/thankscoin.png`;
    cImg.setAttribute('data-ai-hint', 'collectible coin gold');
    cImg.onload = () => setAssets(prev => ({ ...prev, coinImage: cImg, coinImageLoaded: true }));
    cImg.onerror = () => {
        // console.error("Failed to load coin image.");
        setAssets(prev => ({ ...prev, coinImageLoaded: true }));
    };
    
    // Stone Image
    const sImg = new Image();
    sImg.src = `/assets/images/stone1.jpg`;
    sImg.setAttribute('data-ai-hint', 'stone rock');
    sImg.onload = () => setAssets(prev => ({ ...prev, stoneImage: sImg, stoneImageLoaded: true }));
    sImg.onerror = () => {
        // console.error("Failed to load stone image.");
        setAssets(prev => ({ ...prev, stoneImageLoaded: true }));
    };

    // Flower Image (small bush)
    const flowerImg = new Image();
    flowerImg.src = '/assets/images/flowers.png';
    flowerImg.setAttribute('data-ai-hint', 'flowers small');
    flowerImg.onload = () => setAssets(prev => ({ ...prev, flowerImage: flowerImg, flowerImageLoaded: true }));
    flowerImg.onerror = () => {
        // console.error("Failed to load flower image.");
        setAssets(prev => ({ ...prev, flowerImageLoaded: true}));
    };

    // Tree1 Image
    const tree1Img = new Image();
    tree1Img.src = '/assets/images/tree1.png';
    tree1Img.setAttribute('data-ai-hint', 'tree green');
    tree1Img.onload = () => setAssets(prev => ({ ...prev, treeImage: tree1Img, treeImageLoaded: true }));
    tree1Img.onerror = () => {
        // console.error("Failed to load tree1 image.");
        setAssets(prev => ({ ...prev, treeImageLoaded: true}));
    };
    
    // Tree2 Image
    const tree2Img = new Image();
    tree2Img.src = '/assets/images/tree2.png';
    tree2Img.setAttribute('data-ai-hint', 'tree nature');
    tree2Img.onload = () => setAssets(prev => ({ ...prev, tree2Image: tree2Img, tree2ImageLoaded: true }));
    tree2Img.onerror = () => {
        // console.error("Failed to load tree2 image.");
        setAssets(prev => ({ ...prev, tree2ImageLoaded: true}));
    };

    // Small Bush Image (used for flowers.png alias)
    const smallBushImg = new Image();
    smallBushImg.src = '/assets/images/flowers.png'; // Assuming flowers.png is for small bushes
    smallBushImg.setAttribute('data-ai-hint', 'bush small flowers');
    smallBushImg.onload = () => setAssets(prev => ({ ...prev, smallBushImage: smallBushImg, smallBushImageLoaded: true }));
    smallBushImg.onerror = () => {
        // console.error("Failed to load small bush image.");
        setAssets(prev => ({ ...prev, smallBushImageLoaded: true}));
    };

    // Large Bush Image
    const largeBushImg = new Image();
    largeBushImg.src = '/assets/images/bush1.png';
    largeBushImg.setAttribute('data-ai-hint', 'bush large');
    largeBushImg.onload = () => setAssets(prev => ({ ...prev, largeBushImage: largeBushImg, largeBushImageLoaded: true }));
    largeBushImg.onerror = () => {
        // console.error("Failed to load large bush image.");
        setAssets(prev => ({ ...prev, largeBushImageLoaded: true}));
    };
    
    // House Image
    const houseImg = new Image();
    houseImg.src = '/assets/images/house1.png';
    houseImg.setAttribute('data-ai-hint', 'house building');
    houseImg.onload = () => setAssets(prev => ({ ...prev, houseImage: houseImg, houseImageLoaded: true }));
    houseImg.onerror = () => {
        // console.error("Failed to load house image.");
        setAssets(prev => ({ ...prev, houseImageLoaded: true}));
    };


  }, []); // Runs once on mount

  const [assets, setAssets] = useState<{
    playerImage: HTMLImageElement | null;
    tileImage: HTMLImageElement | null;
    coinImage: HTMLImageElement | null;
    stoneImage: HTMLImageElement | null;
    flowerImage: HTMLImageElement | null;
    treeImage: HTMLImageElement | null; // For tree1.png
    tree2Image: HTMLImageElement | null; // For tree2.png
    smallBushImage: HTMLImageElement | null; // For flowers.png (small bushes)
    largeBushImage: HTMLImageElement | null; // For bush1.png (large bushes)
    houseImage: HTMLImageElement | null; // For house1.png
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

        // Only update if parent dimensions are valid
        if (parentElement.clientWidth > 0 && parentElement.clientHeight > 0) {
          newWidth = parentElement.clientWidth;
          newHeight = parentElement.clientHeight;
        } else {
          // If parent is 0x0, keep current canvasSize or set to 0,0 to reflect reality
          // Forcing to 0,0 if parent is 0,0 might be safer to prevent processing with invalid dims
          newWidth = 0; // canvasSize.width; 
          newHeight = 0; // canvasSize.height;
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

    updateCanvasSizeState(); // Initial call

    const observer = new ResizeObserver(updateCanvasSizeState);
    observer.observe(observedElement);

    // Fallback for browsers that don't support ResizeObserver
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
  }, [isClient]); // Depends only on isClient to set up


  // Effect 4: Load raw level data
  useEffect(() => {
    // console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
      // console.log(`[GameCanvas Effect 4] Conditions not met (isClient: ${isClient}, levelPath: ${levelPath}), returning.`);
      return;
    }
    setRawLevelData(null); // Clear previous level data
    setIsLoading(true); // Set loading state before fetching

    loadLevel(levelPath)
      .then(data => {
        if (data) {
          // console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}:`, data);
          setRawLevelData(data);
        } else {
          // console.error(`[GameCanvas Effect 4] Failed to load rawLevelData for ${levelPath}, data is null.`);
          setRawLevelData(null); // Ensure it's null on failure
        }
      })
      .catch(error => {
        // console.error(`[GameCanvas Effect 4] Error loading rawLevelData for ${levelPath}:`, error);
        setRawLevelData(null); // Ensure it's null on error
      });
  }, [levelPath, isClient, setIsLoading, setRawLevelData]); // Dependencies: levelPath, isClient, and setters for safety


  // Effect 5: Process raw level data and initialize player
  useEffect(() => {
    const allAssetsLoaded = assets.playerImageLoaded && assets.tileImageLoaded && assets.coinImageLoaded && assets.stoneImageLoaded &&
                            assets.flowerImageLoaded && assets.treeImageLoaded && assets.tree2ImageLoaded &&
                            assets.smallBushImageLoaded && assets.largeBushImageLoaded && assets.houseImageLoaded;

    // console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, allAssetsLoaded: ${allAssetsLoaded}`);

    if (
      !isClient || !rawLevelData ||
      canvasSize.width === 0 || canvasSize.height === 0 || // Crucial: ensure canvas has dimensions
      !allAssetsLoaded
    ) {
      // If conditions aren't met, and we have a processed level, clear it.
      if (processedLevelRef.current !== null) {
        // console.log("[GameCanvas Effect 5] Conditions not met, clearing processedLevel and player instance.");
        setProcessedLevel(null); 
        playerInstanceRef.current = null;
        if (parentPlayerRef) parentPlayerRef.current = null;
        setActiveCoins([]); // Clear active coins if level is being re-processed or invalidated
        setActiveEnemies([]); // Clear active enemies
      } else {
        // console.log("[GameCanvas Effect 5] Conditions not met, processedLevel already null or initial state.");
      }
      // Ensure isLoading is true if we can't process, to prevent game loop from starting prematurely
      if (!isLoading && (!rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsLoaded)) {
         // console.log("[GameCanvas Effect 5] Conditions for processing not met, ensuring isLoading is true.");
         // setIsLoading(true); // This line might cause issues if it fights with Effect 7
      }
      return;
    }

    // console.log("[GameCanvas Effect 5] Conditions met, processing rawLevelData...");
    // Reset coins and enemies when level changes or canvas resizes significantly enough to reprocess
    setActiveCoins([]); 
    setActiveEnemies([]); 

    const { processedLevel: newProcessedLevel, player: newPlayer } = processRawLevelData(
        rawLevelData, 
        canvasSize.width,
        canvasSize.height,
        p3BasePosition,
        p3InterestPoints,
        p3CurrentTargetIndex,
        p3MovementStateRef,
        levelPath
    );

    if (newProcessedLevel && newPlayer) {
      newPlayer.image = assets.playerImage; // Assign loaded image to player
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
    p3BasePosition, p3InterestPoints, p3CurrentTargetIndex, p3MovementStateRef, // Refs for P3 logic
    setProcessedLevel, setActiveCoins, setActiveEnemies, setIsLoading // Include setIsLoading here if it needs to be managed by this effect
  ]);


  // Effect 7: Spawn entities and finish loading
 useEffect(() => {
    // console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevelRef.current}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, levelPath: ${levelPath}`);
    // console.log(`[GameCanvas Effect 7] current activeCoins.length: ${activeCoins.length}, activeEnemies.length: ${activeEnemies.length}`);

    if (!isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) {
      // console.log("[GameCanvas Effect 7] Pre-conditions (isClient, processedLevel, canvasSize) not met, returning.");
      return;
    }
    // This effect should only run if we are currently in a loading state
    if (!isLoading) {
      // console.log("[GameCanvas Effect 7] isLoading is false, skipping spawn logic.");
      return;
    }
    
    let localCoinsSpawnedOrAttempted = activeCoins.length > 0; // Check current state
    if (!localCoinsSpawnedOrAttempted && processedLevelRef.current.tiles.length > 0) {
      // console.log(`[GameCanvas Effect 7] Spawning new coin pair for level ${levelPath}`);
      const newCoins = spawnNewCoinPair(processedLevelRef.current, canvasSize.width, canvasSize.height);
      // console.log(`[GameCanvas Effect 7] spawnNewCoinPair returned ${newCoins.length} coins.`);
      setActiveCoins(newCoins); // Update state
      localCoinsSpawnedOrAttempted = true; // Mark as attempted, even if newCoins is empty
    } else if (processedLevelRef.current.tiles.length === 0) {
       // console.log("[GameCanvas Effect 7] No tiles, no coins needed.");
       localCoinsSpawnedOrAttempted = true; // No tiles, so coin spawning "attempt" is complete/not needed
    }
    
    let localEnemiesSpawnedOrAttempted = activeEnemies.length > 0; // Check current state
    if (levelPath !== '/levels/level2.json' && levelPath !== '/levels/level1.json') { // Enemies only on other levels
        if (!localEnemiesSpawnedOrAttempted && processedLevelRef.current.tiles.length > 0) {
            const p1 = processedLevelRef.current.tiles.find(t => t.id === 'p1' || t.id === 'floating_platform_left' || t.id === 'floating_platform_1');
            const p2 = processedLevelRef.current.tiles.find(t => t.id === 'p2' || t.id === 'floating_platform_right' || t.id === 'floating_platform_2');
            if (p1 && p2) {
                // console.log("[GameCanvas Effect 7] Spawning single enemy.");
                const newEnemy = spawnSingleEnemy(processedLevelRef.current, canvasSize.width);
                if (newEnemy) {
                    setActiveEnemies([newEnemy]); // Update state
                }
            }
            localEnemiesSpawnedOrAttempted = true; // Mark as attempted
        } else if (processedLevelRef.current.tiles.length === 0) {
            // console.log("[GameCanvas Effect 7] No tiles, no enemies needed.");
            localEnemiesSpawnedOrAttempted = true; // No tiles, so enemy spawning "attempt" is complete/not needed
        }
    } else {
        // console.log(`[GameCanvas Effect 7] Enemies not spawned for level: ${levelPath}`);
        localEnemiesSpawnedOrAttempted = true; // Enemies not needed for this level
    }

    // If all entities have been spawned (or attempted/not needed), set isLoading to false
    if (localCoinsSpawnedOrAttempted && localEnemiesSpawnedOrAttempted) {
        // console.log("[GameCanvas Effect 7] All entities attempted or not needed, setting isLoading to false.");
        setIsLoading(false);
    } else {
        // console.log(`[GameCanvas Effect 7] Did not set isLoading to false. coinsAttempted: ${localCoinsSpawnedOrAttempted}, enemiesAttempted: ${localEnemiesSpawnedOrAttempted}`);
    }

  }, [
    isClient, isLoading, canvasSize, levelPath, // Key dependencies that trigger re-evaluation
    // activeCoins.length, activeEnemies.length, // Re-added: if coins/enemies are collected/removed, and isLoading is true, this might need to re-evaluate.
                                              // However, this was a source of issues. Let's test without them first, relying on `isLoading` and initial state.
    setActiveCoins, setActiveEnemies, setIsLoading // stable setters
    // processedLevelRef.current is a ref, not a state/prop, so changes to it won't trigger this effect.
    // This effect relies on `isLoading` to be true. `processedLevel` state is handled by Effect 5.
    // If we want this to react to `processedLevel` directly, `processedLevel` (state) should be a dependency.
    // For now, the chain is: Effect 5 sets `processedLevel` and `processedLevelRef`. 
    // This effect (7) runs if `isLoading` is true and other conditions are met.
  ]);


  // Effect 8: Respawn coins when all collected and particles are gone
  useEffect(() => {
    // console.log(`[GameCanvas Effect 8] Running: Check coin respawn. isLoading: ${isLoading}, processedLevel: ${!!processedLevelRef.current}`);
    if (!isClient || isLoading || !processedLevelRef.current || !processedLevelRef.current.tiles || canvasSize.width === 0 || canvasSize.height === 0) return;

    const allCollectedAndParticlesGone = activeCoins.length > 0 && activeCoins.every(c => c.isCollected && c.particles.length === 0 && !c.isVisuallyPresent);
    if (allCollectedAndParticlesGone) {
       // console.log("[GameCanvas Effect 8] All coins collected and particles gone, respawning new coin pair.");
       const newCoins = spawnNewCoinPair(processedLevelRef.current, canvasSize.width, canvasSize.height);
       setActiveCoins(newCoins);
    }
  }, [activeCoins, isClient, isLoading, canvasSize, setActiveCoins, processedLevelRef]); // Depends on activeCoins and isLoading to check respawn conditions

  // Effect to keep executeActionRef.current updated with the executeAction prop
  useEffect(() => {
    executeActionRef.current = executeAction;
  }, [executeAction]);


  const gameLoop = useCallback(() => {
    // console.log("[GameCanvas gameLoop] Frame started");
    // Ensure processedLevelRef.current is used as it's updated by another effect
    processedLevelRef.current = processedLevel; // Keep ref in sync with state for this frame

    const loopStartTime = Date.now();
    const deltaTime = (loopStartTime - lastFrameTime.current);
    const deltaTimeFactor = Math.max(0.1, Math.min(2, deltaTime / (1000 / 60))); // Clamp to prevent extreme jumps

    const player = playerInstanceRef.current;
    const currentLevel = processedLevelRef.current; // Use the ref for level data in game loop
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

    // P3 Platform Movement (Level 2 specific)
    if (levelPath === '/levels/level2.json') {
        const p3Tile = currentLevel.tiles.find(tile => tile.id === 'p3');
        if (p3Tile && p3BasePosition.current && p3InterestPoints.current.length > 0) {
          const currentTimeForP3 = Date.now();
          // Check if it's time to choose a new target
          if (!p3MovementStateRef.current || currentTimeForP3 >= p3MovementStateRef.current.startTime + P3_MOVEMENT_DURATION) {
            let nextTargetIndex = p3CurrentTargetIndex.current;
            if (p3InterestPoints.current.length > 1) { // Ensure there's more than one point to move to
              do {
                nextTargetIndex = Math.floor(Math.random() * p3InterestPoints.current.length);
              } while (nextTargetIndex === p3CurrentTargetIndex.current);
            } else {
              nextTargetIndex = 0; // Only one point, stay there or move to it
            }
            p3CurrentTargetIndex.current = nextTargetIndex;

            const targetOffset = p3InterestPoints.current[nextTargetIndex];
            const targetX = p3BasePosition.current.x + targetOffset.xOffset;
            const targetY = p3BasePosition.current.y + targetOffset.yOffset;
            // console.log(`[P3 Movement] New target: index ${nextTargetIndex}, offset {${targetOffset.xOffset}, ${targetOffset.yOffset}}, targetPos {${targetX}, ${targetY}}`);
            p3MovementStateRef.current = { startTime: currentTimeForP3, startX: p3Tile.x, startY: p3Tile.y, targetX, targetY };
          }

          // Interpolate P3's position
          const { startTime, startX, startY, targetX, targetY } = p3MovementStateRef.current;
          const elapsedTime = currentTimeForP3 - startTime;
          const t = Math.min(1, elapsedTime / P3_MOVEMENT_DURATION); // Normalized time (0 to 1)
          const eased_t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // Ease-in-out cubic

          const oldP3X = p3Tile.x;
          const oldP3Y = p3Tile.y;

          p3Tile.x = startX + (targetX - startX) * eased_t;
          p3Tile.y = startY + (targetY - startY) * eased_t;

          const p3_delta_x = p3Tile.x - oldP3X;
          const p3_delta_y = p3Tile.y - oldP3Y;

           // If player is on P3, move player with it
           if (player.isOnGround && player.activePlatformId === 'p3') {
             player.x += p3_delta_x;
             player.y += p3_delta_y;
           }
        }
    }


    // Player Actions
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
            // console.log("Player jumped");
          }
          break;
      }
      resetExecuteAction(); // Signal parent that action is processed
    }

    // Player horizontal movement
    if (player.isMovingLeft) {
      player.vx = -PLAYER_SPEED;
    } else if (player.isMovingRight) {
      player.vx = PLAYER_SPEED;
    } else {
      player.vx = 0;
    }

    // Platform horizontal movement
    currentLevel.tiles.forEach(tile => {
      if (tile.id !== 'p3' && tile.vx !== undefined && tile.direction !== undefined && currentCanvas.width > 0) { // p3 is handled separately
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
          } else { // Fallback if water_pit isn't defined for boat
            if (newTileX <= 0 && tile.direction === -1) { newTileX = 0; changeDirection = true; }
            else if (newTileX + tile.width >= currentCanvas.width && tile.direction === 1) { newTileX = currentCanvas.width - tile.width; changeDirection = true;}
          }
        } else { // For other moving platforms
          if (newTileX <= 0 && tile.direction === -1) { newTileX = 0; changeDirection = true; }
          else if (newTileX + tile.width >= currentCanvas.width && tile.direction === 1) { newTileX = currentCanvas.width - tile.width; changeDirection = true; }
        }


        const platformDeltaX = newTileX - tile.x;
        tile.x = newTileX;

        // If player is on this moving platform, move player with it
        if (player.isOnGround && player.activePlatformId === tile.id) {
          player.x += platformDeltaX;
        }

        if (changeDirection) {
          tile.direction *= -1;
        }
      }
    });


    // Player vertical movement (gravity)
    player.vy += GRAVITY * deltaTimeFactor;
    let tentativePlayerY = player.y + (player.vy * deltaTimeFactor);
    let newPlayerY = tentativePlayerY;
    player.isOnGround = false; // Assume not on ground until collision check
    let resolvedActivePlatformId: string | null = null;


    // Vertical collision with platforms
    currentLevel.tiles.filter(tile => tile.type === 1).forEach(tile => {
      const tempPlayerStateForVerticalCheck = { ...player, y: newPlayerY, x: player.x }; // Use newPlayerY for check
      if (checkCollision(tempPlayerStateForVerticalCheck, tile)) {
        if (player.vy >= 0) { // Moving downwards or landed
          newPlayerY = tile.y - player.height;
          player.vy = 0;
          player.isOnGround = true;
          resolvedActivePlatformId = tile.id;
        } else { // Moving upwards (hit head)
          newPlayerY = tile.y + tile.height;
          player.vy = 0; // Stop upward movement
        }
      }
    });
    player.y = newPlayerY;
    player.activePlatformId = resolvedActivePlatformId;


    // Horizontal collision with platforms
    const tentativePlayerX = player.x + (player.vx * deltaTimeFactor);
    let newPlayerX = tentativePlayerX;
    currentLevel.tiles.filter(tile => tile.type === 1).forEach(tile => {
      const tempPlayerStateForHorizontalCheck = { ...player, x: newPlayerX, y: player.y }; // Use newPlayerX
      if (checkCollision(tempPlayerStateForHorizontalCheck, tile)) {
        const totalIntentVx = (player.vx * deltaTimeFactor); // How much player intended to move
        if (totalIntentVx > 0) newPlayerX = tile.x - player.width; // Collided moving right
        else if (totalIntentVx < 0) newPlayerX = tile.x + tile.width; // Collided moving left
        // player.vx = 0; // Stop horizontal movement if needed, or just correct position
      }
    });
    player.x = newPlayerX;


    // Boundary checks for player
    if (player.x < 0) player.x = 0;
    if (currentCanvas.width > 0 && player.x + player.width > currentCanvas.width) player.x = currentCanvas.width - player.width;

    // Fall through bottom of canvas (or land on p_ground if it's the bottom-most collidable)
    // This specific check for p_ground might be redundant if p_ground is simply the lowest platform.
    const groundPlatform = currentLevel.tiles.find(t => t.id === 'p_ground');
    if (groundPlatform && player.y + player.height > groundPlatform.y && player.vy >=0 ) {
        // Allow slight overlap for very thin ground platforms to avoid "sinking in" visually
        if (player.y + player.height > groundPlatform.y + 1 ) { // +1 is a small tolerance
            player.y = groundPlatform.y - player.height;
            player.vy = 0;
            player.isOnGround = true;
            player.activePlatformId = groundPlatform.id;
        }
    } else if (!groundPlatform && player.y + player.height > currentCanvas.height && player.vy >=0 && currentCanvas.height > 0) {
        // Fallback if no p_ground, stop at canvas bottom
        player.y = currentCanvas.height - player.height;
        player.vy = 0;
        player.isOnGround = true;
        player.activePlatformId = null; // No specific platform ID if it's canvas bottom
    }


    // Update coins (fade-in, particles, collection)
    // console.log("[GameCanvas gameLoop] Before setActiveCoins, activeCoins:", activeCoins);
    setActiveCoins(prevCoins => {
      // If prevCoins is null or undefined, or not an array, return an empty array
      if (!Array.isArray(prevCoins)) return [];

      return prevCoins.map(coin => {
        let newCoin = { ...coin };

        // Rotation (even if speed is 0, angle is preserved)
        newCoin.rotationAngle += newCoin.rotationSpeed * deltaTimeFactor;
        if (newCoin.rotationAngle > Math.PI * 2) newCoin.rotationAngle -= Math.PI * 2;

        // Particle logic
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
            newCoin.isVisuallyPresent = false; // All particles gone
          }
        } else if (newCoin.isCollected && newCoin.isVisuallyPresent && newCoin.currentOpacity === 0 && newCoin.particles.length === 0) {
            // This case handles if particles were never generated but coin was collected and faded out
            newCoin.isVisuallyPresent = false;
        }

        // Fade-in logic
        if (!newCoin.isCollected && loopStartTime >= newCoin.targetSpawnTime && newCoin.currentOpacity < 1) {
          const opacityIncrease = deltaTime / COIN_FADE_IN_DURATION;
          newCoin.currentOpacity = Math.min(1, newCoin.currentOpacity + opacityIncrease);
        }

        // Collection logic
        const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };
        if (!newCoin.isCollected && newCoin.isVisuallyPresent && newCoin.currentOpacity > 0.5 && checkCollision(playerRect, newCoin as Rect)) {
          newCoin.isCollected = true;
          newCoin.currentOpacity = 0; // Make coin invisible immediately, particles will show
          newCoin.particles = []; // Clear any previous particles (though unlikely)
          for (let i = 0; i < COIN_PARTICLE_COUNT; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * COIN_PARTICLE_SPEED_MULTIPLIER + 0.5;
            newCoin.particles.push({
              x: newCoin.x + newCoin.width / 2, y: newCoin.y + newCoin.height / 2,
              vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
              size: COIN_PARTICLE_SIZE, opacity: 1, life: COIN_PARTICLE_LIFESPAN,
            });
          }
          // toast({ title: "Coin Collected!", description: `You collected coin ${newCoin.id}` });
        }
        return newCoin;
      });
    });
    // console.log("[GameCanvas gameLoop] After setActiveCoins, activeCoins (next render):", activeCoins);


    // Update enemies
    setActiveEnemies(prevEnemies => {
      if (!Array.isArray(prevEnemies)) return [];
      return prevEnemies.map(enemy => {
        let newEnemy = { ...enemy };
        let enemyDeltaX = (enemy.vx * enemy.direction * deltaTimeFactor);
        newEnemy.x += enemyDeltaX;

        // Enemy boundary checks
        if (currentCanvas.width > 0) {
            if (newEnemy.x <= 0 && newEnemy.direction === -1) { newEnemy.x = 0; newEnemy.direction *= -1; }
            else if (newEnemy.x + newEnemy.width >= currentCanvas.width && newEnemy.direction === 1) { newEnemy.x = currentCanvas.width - newEnemy.width; newEnemy.direction *= -1; }
        }

        // Enemy-player collision
        const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };
        const enemyRect = { x: newEnemy.x, y: newEnemy.y, width: newEnemy.width, height: newEnemy.height }; // Assuming enemy.width/height are set
        if (playerInstanceRef.current && checkCollision(playerRect, enemyRect)) {
          // console.log("Player collided with enemy!");
          // toast({ title: "Ouch!", description: "You hit an enemy!", variant: "destructive" });
          // Reset player to p_ground or canvas bottom
          const p_ground_collision = currentLevel.tiles.find(tile => tile.id === 'p_ground');
          if (p_ground_collision && currentCanvas.width > 0 && playerInstanceRef.current) {
            playerInstanceRef.current.x = (currentCanvas.width / 2) - (playerInstanceRef.current.width / 2);
            playerInstanceRef.current.y = p_ground_collision.y - playerInstanceRef.current.height;
            playerInstanceRef.current.vx = 0; playerInstanceRef.current.vy = 0; playerInstanceRef.current.isOnGround = true;
            playerInstanceRef.current.activePlatformId = p_ground_collision.id;
          } else if (currentCanvas.width > 0 && playerInstanceRef.current) { // Fallback if no p_ground
            playerInstanceRef.current.x = (currentCanvas.width / 2) - (playerInstanceRef.current.width / 2);
            playerInstanceRef.current.y = currentCanvas.height - playerInstanceRef.current.height;
            playerInstanceRef.current.vx = 0; playerInstanceRef.current.vy = 0; playerInstanceRef.current.isOnGround = true;
            playerInstanceRef.current.activePlatformId = null;
          }
        }
        return newEnemy;
      });
    });


    // Update parent player ref
    if (parentPlayerRef) parentPlayerRef.current = { ...player };

    // Rendering
    ctx.clearRect(0, 0, currentCanvas.width, currentCanvas.height);

    // Render Background Tiles & Platforms
    currentLevel.tiles.forEach(tile => {
      if (tile.layer !== 'foreground') { // Render background and main platforms
        let drawnWithImage = false;
        if (tile.type === 1) { // Collidable platforms
          if (tile.id.startsWith("stone_") && assets.stoneImage?.complete && assets.stoneImage.src) {
            ctx.drawImage(assets.stoneImage, tile.x, tile.y, tile.width, tile.height);
            drawnWithImage = true;
          } else if (assets.tileImage?.complete && assets.tileImage.src) { // Default platform image
            ctx.drawImage(assets.tileImage, tile.x, tile.y, tile.width, tile.height);
            drawnWithImage = true;
          }
        } else { // Decorative background elements (type !== 1)
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
        if (!drawnWithImage) { // Fallback to color
           ctx.fillStyle = tile.color;
           ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
        }
      }
    });

    // Render Coins
    // console.log("[GameCanvas gameLoop] Calling renderCoins with activeCoins:", activeCoins);
    renderCoins(ctx, activeCoins, assets.coinImage);

    // Render Enemies
    renderEnemies(ctx, activeEnemies);

    // Render Player
    renderPlayer(ctx, player, assets.playerImage);

    // Render Foreground Tiles
    currentLevel.tiles.forEach(tile => {
      if (tile.layer === 'foreground') {
        let drawnWithImage = false;
         // Example: if (tile.id === "bush_foreground" && assets.bushForegroundImage?.complete) ...
         if ((tile.id === "bush_left_1" || tile.id === "bush_right_1" || tile.id === "bush_on_right_stone") && assets.smallBushImage?.complete && assets.smallBushImage.src) {
          ctx.drawImage(assets.smallBushImage, tile.x, tile.y, tile.width, tile.height);
          drawnWithImage = true;
        } else if ((tile.id === "bush_left_2" || tile.id === "bush_right_2") && assets.largeBushImage?.complete && assets.largeBushImage.src) {
          ctx.drawImage(assets.largeBushImage, tile.x, tile.y, tile.width, tile.height);
          drawnWithImage = true;
        }

        if (!drawnWithImage) { // Fallback to color
          ctx.fillStyle = tile.color;
          ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
        }
      }
    });
    lastFrameTime.current = loopStartTime;
    if (isClient && !isLoading) requestAnimationFrame(gameLoop);
    // console.log("[GameCanvas gameLoop] Frame ended");
  }, [
    isClient,
    isLoading, 
    assets, // For images
    resetExecuteAction,
    levelPath, // For P3 logic
    parentPlayerRef, // For updating parent
    // activeCoins, activeEnemies, // These are states updated within the loop, using functional updates for them
    // canvasSize, processedLevel, // These are now accessed via refs inside the loop (currentCanvas, currentLevel)
    // Make sure refs used inside (p3BasePosition etc.) are stable or this callback won't update if they change
    // However, these refs are typically set once per level load.
    p3BasePosition, p3InterestPoints, p3CurrentTargetIndex, p3MovementStateRef, // P3 specific refs
    setActiveCoins, setActiveEnemies, // Stable state setters
    // Player related states (not directly used in gameLoop, but playerInstanceRef is derived)
    // Removed processedLevel and canvasSize from here as they are accessed via refs now
  ]);

  // Effect 9: Game Loop Setup (requestAnimationFrame)
  useEffect(() => {
    // console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize: W${canvasSize.width}H${canvasSize.height}, processedLevel: ${!!processedLevelRef.current}`);
    if (!isClient || isLoading || !canvasRef.current || canvasSize.width === 0 || canvasSize.height === 0 || !processedLevelRef.current) {
      // console.log("[GameCanvas Effect 9] Conditions not met for starting game loop.");
      return;
    }

    // console.log("[GameCanvas Effect 9] Starting game loop.");
    lastFrameTime.current = Date.now(); // Reset lastFrameTime before starting loop
    const animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
      // console.log("[GameCanvas Effect 9] Cleanup: Cancelling animation frame.");
      cancelAnimationFrame(animationFrameId);
    };
  }, [isClient, isLoading, canvasSize, gameLoop, processedLevel]); // gameLoop is now a dependency, also processedLevel to restart if level data changes


  // Effect 10: Keyboard input
  useEffect(() => {
    if (!isClient) return; // Only run on client
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
  }, [onPlayerAction, isClient]); // Depends on onPlayerAction and isClient

  if (!isClient) {
    // console.log("[GameCanvas] Not client, rendering loading fallback.");
    return <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground rounded-md">Loading Game Client...</div>;
  }

  // console.log(`[GameCanvas Render] isLoading: ${isLoading}, canvasSize: W${canvasSize.width}xH${canvasSize.height}`);
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

