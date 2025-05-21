
"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState } from '@/types/game';
import {
  GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
  COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT,
  COIN_FADE_IN_DURATION, COIN_SPAWN_STAGGER_DELAY,
  COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR, COIN_PARTICLE_SIZE,
  ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR, PLATFORM_SPEED,
  COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX,
  COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SHADOW_BLUR, COIN_SHADOW_COLOR,
  P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, P3_MOVEMENT_DURATION,
} from '@/config/gameConfig';
// import { useToast } from "@/hooks/use-toast";
import { checkCollision } from '@/game/utils/collision';
import { renderPlayer } from '@/game/entities/playerRenderer';
// import { renderLevel } from '@/game/entities/levelRenderer'; // Will be re-integrated into gameLoop
import { renderCoins } from '@/game/entities/coinRenderer';
import { renderEnemies } from '@/game/entities/enemyRenderer';
import { loadLevel } from '@/lib/levelLoader';

interface GameCanvasProps {
  levelPath: string;
  playerRef?: React.MutableRefObject<PlayerState | null>;
  executeAction?: GameAction | null;
  resetExecuteAction?: () => void;
}

// Helper function to parse dimension strings (like "100%" or "50px")
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
  }
  console.warn(`[parseDimension] Invalid dimension value: ${value}, returning 0.`);
  return 0; // Default or error case
};


export default function GameCanvas({
  levelPath,
  playerRef: parentPlayerRef,
  executeAction,
  resetExecuteAction,
}: GameCanvasProps) {
  console.log("[GameCanvas] Component body. levelPath:", levelPath);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [assets, setAssets] = useState({
    playerImage: null as HTMLImageElement | null,
    tileImage: null as HTMLImageElement | null,
    coinImage: null as HTMLImageElement | null,
    stoneImage: null as HTMLImageElement | null,
    tree1Image: null as HTMLImageElement | null,
    tree2Image: null as HTMLImageElement | null,
    smallBushImage: null as HTMLImageElement | null, // for flowers.png
    largeBushImage: null as HTMLImageElement | null, // for bush1.png
    houseImage: null as HTMLImageElement | null,
    boatImage: null as HTMLImageElement | null, // Added for boat
    playerImageLoaded: false,
    tileImageLoaded: false,
    coinImageLoaded: false,
    stoneImageLoaded: false,
    tree1ImageLoaded: false,
    tree2ImageLoaded: false,
    smallBushImageLoaded: false,
    largeBushImageLoaded: false,
    houseImageLoaded: false,
    boatImageLoaded: false,
  });
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [rawLevelData, setRawLevelData] = useState<RawLevelData | null>(null);
  const [processedLevel, setProcessedLevel] = useState<ProcessedLevelData | null>(null);
  const playerInstanceRef = useRef<PlayerState | null>(null);
  const [activeCoins, setActiveCoins] = useState<CoinState[]>([]);
  const [activeEnemies, setActiveEnemies] = useState<EnemyState[]>([]);

  const p3BasePositionRef = useRef<{ x: number; y: number } | null>(null);
  const p3InterestPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const p3CurrentTargetIndexRef = useRef<number>(0);
  const p3MovementStateRef = useRef<{
    startTime: number;
    startX: number;
    startY: number;
    targetX: number;
    targetY: number;
  } | null>(null);
  
  const lastFrameTime = useRef<number>(Date.now());
  const executeActionRef = useRef<GameAction | null>(executeAction || null);
  const processedLevelRef = useRef<ProcessedLevelData | null>(null);


  const processRawLevelData = useCallback((
    rawData: RawLevelData | null, 
    currentCanvasWidth: number, 
    currentCanvasHeight: number
  ): ProcessedLevelData | null => {
    console.log(`[GameCanvas processRawLevelData] Called with canvasSize W: ${currentCanvasWidth} H: ${currentCanvasHeight} for level: ${levelPath}`);
    if (!rawData || currentCanvasWidth <= 0 || currentCanvasHeight <= 0) {
      console.warn("[GameCanvas processRawLevelData] No raw data or invalid canvas size, returning null.");
      return null;
    }

    const processedTiles: ProcessedTile[] = rawData.tiles.map(rawTile => {
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
          console.warn(`[processRawLevelData] Unknown anchor: ${rawTile.positioning.anchor} for tile ${rawTile.id}. Defaulting to top-left with offset.`);
          tileX = xOffset;
          tileY = yOffset;
      }
      return {
        ...rawTile,
        x: tileX,
        y: tileY,
        width: tileWidth,
        height: tileHeight,
        vx: rawTile.vx !== undefined ? rawTile.vx * PLATFORM_SPEED : 0,
        direction: rawTile.direction !== undefined ? rawTile.direction : 1,
        layer: rawTile.layer || 'background',
      };
    });
    
    const p_ground_tile = processedTiles.find(tile => tile.id === 'p_ground');
    if (!p_ground_tile) {
      console.error("[processRawLevelData] CRITICAL: p_ground tile not found. Level setup might be incorrect.");
    }
    const p_ground_top_y = p_ground_tile ? p_ground_tile.y : currentCanvasHeight -1; // Fallback if p_ground not found

    if (levelPath === '/levels/level2.json') {
        p3BasePositionRef.current = {
            x: (currentCanvasWidth / 2) - (P3_SIZE_W / 2),
            y: p_ground_top_y - 300, // Top of P3 is 300px above p_ground
        };
        console.log("[processRawLevelData] Level 2: p_ground_top_y:", p_ground_top_y, "p3BasePosRef.current:", p3BasePositionRef.current);

        p3InterestPointsRef.current = [
            { x: 0, y: 0 }, // Base position (no drift initially)
            { x: P3_DRIFT_RANGE, y: P3_DRIFT_RANGE },
            { x: -P3_DRIFT_RANGE, y: 0 },
            { x: 0, y: -P3_DRIFT_RANGE },
        ];
        p3CurrentTargetIndexRef.current = 0;
        p3MovementStateRef.current = null;

        const p3Tile: ProcessedTile = {
            id: 'p3',
            x: p3BasePositionRef.current.x,
            y: p3BasePositionRef.current.y,
            width: P3_SIZE_W,
            height: P3_SIZE_H,
            type: 1,
            color: 'hsl(var(--muted))',
            vx: 0, // Will be controlled by p3 logic
            direction: 0,
            layer: 'background',
            positioning: { anchor: 'top-left' } // Placeholder, as x/y are absolute
        };
        processedTiles.push(p3Tile);
        console.log("[processRawLevelData] Level 2: Added p3Tile:", p3Tile);
    }


    const playerStartPlatform = processedTiles.find(tile => tile.id === rawData.playerStart.platformId);
    let playerX = 0;
    let playerY = 0;

    if (playerStartPlatform) {
      playerY = playerStartPlatform.y - PLAYER_HEIGHT - (rawData.playerStart.yOffsetPx || 0);
      switch (rawData.playerStart.horizontalAlign) {
        case 'left':
          playerX = playerStartPlatform.x + (rawData.playerStart.xOffsetPx || 0);
          break;
        case 'center':
          playerX = playerStartPlatform.x + (playerStartPlatform.width / 2) - (PLAYER_WIDTH / 2) + (rawData.playerStart.xOffsetPx || 0);
          break;
        case 'right':
          playerX = playerStartPlatform.x + playerStartPlatform.width - PLAYER_WIDTH - (rawData.playerStart.xOffsetPx || 0);
          break;
      }
    } else {
      console.warn(`[processRawLevelData] Player start platform with id "${rawData.playerStart.platformId}" not found! Defaulting player to 0,0.`);
      playerX = 0;
      playerY = 0;
    }
    
    const newPlayer: PlayerState = {
      x: playerX,
      y: playerY,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      vx: 0,
      vy: 0,
      isOnGround: false,
      isMovingLeft: false,
      isMovingRight: false,
      color: PLAYER_COLOR,
      image: assets.playerImage || undefined,
      facingDirection: 'right',
      activePlatformId: null,
    };

    playerInstanceRef.current = newPlayer;
    if (parentPlayerRef) {
      parentPlayerRef.current = newPlayer;
    }
    console.log(`[processRawLevelData] Successfully processed. Player:`, newPlayer, "Number of tiles:", processedTiles.length);
    return { playerStart: { xPx: playerX, yPx: playerY }, tiles: processedTiles };
  }, [assets.playerImage, parentPlayerRef, levelPath]); // Added levelPath


  // Effect 1: Set isClient and load assets (Client-side only)
  useEffect(() => {
    console.log("[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state:", isClient);
    if (!isClient) {
      setIsClient(true);
    }

    const pImg = new Image();
    pImg.src = '/assets/images/hero_jeans3.png';
    pImg.setAttribute('data-ai-hint', 'character orange blue');
    pImg.onload = () => setAssets(prev => ({ ...prev, playerImage: pImg, playerImageLoaded: true }));
    pImg.onerror = () => { console.error("Failed to load player image."); setAssets(prev => ({ ...prev, playerImageLoaded: true })); };

    const tImg = new Image();
    tImg.src = '/assets/images/platform_grass.png';
    tImg.setAttribute('data-ai-hint', 'platform grass dirt');
    tImg.onload = () => setAssets(prev => ({ ...prev, tileImage: tImg, tileImageLoaded: true }));
    tImg.onerror = () => { console.error("Failed to load platform_grass image."); setAssets(prev => ({ ...prev, tileImageLoaded: true })); };
    
    const cImg = new Image();
    cImg.src = '/assets/images/thankscoin.png';
    cImg.setAttribute('data-ai-hint', 'collectible coin gold');
    cImg.onload = () => setAssets(prev => ({ ...prev, coinImage: cImg, coinImageLoaded: true }));
    cImg.onerror = () => { console.error("Failed to load coin image."); setAssets(prev => ({ ...prev, coinImageLoaded: true })); };

    const stoneImg = new Image();
    stoneImg.src = '/assets/images/stone1.jpg';
    stoneImg.setAttribute('data-ai-hint', 'stone rock');
    stoneImg.onload = () => setAssets(prev => ({ ...prev, stoneImage: stoneImg, stoneImageLoaded: true }));
    stoneImg.onerror = () => { console.error("Failed to load stone image."); setAssets(prev => ({ ...prev, stoneImageLoaded: true })); };
    
    const tree1Img = new Image();
    tree1Img.src = '/assets/images/tree1.png';
    tree1Img.setAttribute('data-ai-hint', 'tree nature large');
    tree1Img.onload = () => setAssets(prev => ({ ...prev, tree1Image: tree1Img, tree1ImageLoaded: true }));
    tree1Img.onerror = () => { console.error("Failed to load tree1 image."); setAssets(prev => ({ ...prev, tree1ImageLoaded: true })); };

    const tree2Img = new Image();
    tree2Img.src = '/assets/images/tree2.png'; 
    tree2Img.setAttribute('data-ai-hint', 'tree nature');
    tree2Img.onload = () => setAssets(prev => ({ ...prev, tree2Image: tree2Img, tree2ImageLoaded: true }));
    tree2Img.onerror = () => { console.error("Failed to load tree2 image."); setAssets(prev => ({ ...prev, tree2ImageLoaded: true })); };

    const sbImg = new Image();
    sbImg.src = '/assets/images/flowers.png';
    sbImg.setAttribute('data-ai-hint', 'flowers small');
    sbImg.onload = () => setAssets(prev => ({ ...prev, smallBushImage: sbImg, smallBushImageLoaded: true }));
    sbImg.onerror = () => { console.error("Failed to load small bush (flowers) image."); setAssets(prev => ({ ...prev, smallBushImageLoaded: true })); };

    const lbImg = new Image();
    lbImg.src = '/assets/images/bush1.png';
    lbImg.setAttribute('data-ai-hint', 'bush large');
    lbImg.onload = () => setAssets(prev => ({ ...prev, largeBushImage: lbImg, largeBushImageLoaded: true }));
    lbImg.onerror = () => { console.error("Failed to load large bush (bush1) image."); setAssets(prev => ({ ...prev, largeBushImageLoaded: true })); };
    
    const hImg = new Image();
    hImg.src = '/assets/images/house1.png';
    hImg.setAttribute('data-ai-hint', 'house building');
    hImg.onload = () => setAssets(prev => ({ ...prev, houseImage: hImg, houseImageLoaded: true }));
    hImg.onerror = () => { console.error("Failed to load house image."); setAssets(prev => ({ ...prev, houseImageLoaded: true })); };

    const boatImg = new Image(); // Added for boat
    boatImg.src = '/assets/images/boat.png'; // Assuming boat.png exists
    boatImg.setAttribute('data-ai-hint', 'boat water');
    boatImg.onload = () => setAssets(prev => ({ ...prev, boatImage: boatImg, boatImageLoaded: true }));
    boatImg.onerror = () => { console.error("Failed to load boat image."); setAssets(prev => ({ ...prev, boatImageLoaded: true })); };

  }, [isClient]);


  // Effect 2: Apply canvasSize to canvas attributes (Client-side only)
  useEffect(() => {
    console.log("[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize:", canvasSize);
    if (isClient && canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
      console.log(`[GameCanvas Effect 2] Canvas attributes set to W:${canvasSize.width} H:${canvasSize.height}`);
    }
  }, [isClient, canvasSize]);

  // Effect 3: Observe parent size (Client-side only)
  useEffect(() => {
    console.log("[GameCanvas Effect 3] Running: Observe parent size");
    if (!isClient || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const parentElement = canvas.parentElement;

    if (!parentElement) {
        console.warn("[GameCanvas Effect 3] No parent element found for canvas.");
        return;
    }

    const updateCanvasSizeState = (newWidth: number, newHeight: number) => {
      setCanvasSize(currentSize => {
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
          console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Updating canvasSize from W:${currentSize.width} H:${currentSize.height} to W:${newWidth} H:${newHeight}`);
          return { width: newWidth, height: newHeight };
        }
        return currentSize;
      });
    };
    
    const initialWidth = Math.max(0, parentElement.clientWidth);
    const initialHeight = Math.max(0, parentElement.clientHeight);
    console.log(`[GameCanvas Effect 3] Initial parent dimensions: W:${initialWidth} H:${initialHeight}`);
    if (initialWidth > 0 && initialHeight > 0) {
        updateCanvasSizeState(initialWidth, initialHeight);
    }

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(entries => {
        if (!entries || entries.length === 0) return;
        const entry = entries[0];
        const newWidth = Math.max(0, entry.contentRect.width);
        const newHeight = Math.max(0, entry.contentRect.height);
        updateCanvasSizeState(newWidth, newHeight);
      });
      resizeObserver.observe(parentElement);
    } else {
      const handleResize = () => {
        const newWidth = Math.max(0, parentElement.clientWidth);
        const newHeight = Math.max(0, parentElement.clientHeight);
        updateCanvasSizeState(newWidth, newHeight);
      };
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [isClient]);


  // Effect 4: Load raw level data (Client-side only)
  useEffect(() => {
    console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
      console.log("[GameCanvas Effect 4] Not client or no levelPath, returning.");
      return;
    }
    setRawLevelData(null); 
    // setIsLoading(true); // This will be handled by Effect 5 or 7

    loadLevel(levelPath)
      .then(data => {
        if (data) {
          console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}`);
          setRawLevelData(data);
        } else {
          console.error(`[GameCanvas Effect 4] Failed to load rawLevelData for ${levelPath}, data is null.`);
          setRawLevelData(null); 
        }
      })
      .catch(error => {
        console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null);
      });
  }, [isClient, levelPath]);


  // Effect 5: Process raw level data (when rawLevelData or canvasSize or assets change)
  useEffect(() => {
    console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, allAssetsLoaded: ${Object.values(assets).every(v => typeof v === 'boolean' ? v : !!v)}`);
    
    const allAssetsLoaded = assets.playerImageLoaded && assets.tileImageLoaded && assets.coinImageLoaded &&
                            assets.stoneImageLoaded && assets.tree1ImageLoaded && assets.tree2ImageLoaded &&
                            assets.smallBushImageLoaded && assets.largeBushImageLoaded && assets.houseImageLoaded && assets.boatImageLoaded;

    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsLoaded) {
      if (processedLevel !== null) {
        console.log("[GameCanvas Effect 5] Conditions not met for processing, or rawLevelData/canvasSize changed, clearing processedLevel.");
        setProcessedLevel(null); // Clear old processed level if inputs change or are invalid
      }
      if (!allAssetsLoaded) {
        console.log("[GameCanvas Effect 5] Waiting for all assets to load...");
      }
      return;
    }
    
    console.log("[GameCanvas Effect 5] Conditions met, processing rawLevelData...");
    const newProcessedLevel = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);

    if (newProcessedLevel) {
      console.log("[GameCanvas Effect 5] Successfully processed level. Setting newProcessedLevel and newPlayer.");
      setProcessedLevel(newProcessedLevel);
      // Player instance is now set within processRawLevelData and assigned to playerInstanceRef.current
      // Also assigned to parentPlayerRef if provided.
    } else {
      console.warn("[GameCanvas Effect 5] processRawLevelData returned null. Clearing processedLevel.");
      setProcessedLevel(null);
    }
  }, [isClient, rawLevelData, canvasSize, assets, processRawLevelData, parentPlayerRef, setProcessedLevel, playerInstanceRef]);
  

  // Effect 10 (Diagnostic Draw): Draw red square if not loading and canvas is ready
   useEffect(() => {
    // This is purely for diagnostics during step-by-step restoration
    if (isClient && canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0 && isLoading) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            console.log("[GameCanvas Diagnostic Draw] Drawing red rectangle (isLoading is true, but canvas ready).");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'red';
            ctx.fillRect(20, 20, 100, 50); 
            ctx.font = "12px Arial";
            ctx.fillStyle = "black";
            ctx.fillText("Simplified Canvas OK", 25, 45);
        } else {
            console.error("[GameCanvas Diagnostic Draw] Failed to get 2D context.");
        }
    } else {
         console.log("[GameCanvas Diagnostic Draw] Conditions not met for drawing red rectangle (isClient:", isClient, "canvasRef:", !!canvasRef.current, "canvasSize:", canvasSize, "isLoading:", isLoading,")");
    }
  }, [isClient, canvasSize, isLoading]);


  console.log(`[GameCanvas] Rendering. isClient: ${isClient}, isLoading: ${isLoading}, canvasSize: W${canvasSize.width}xH${canvasSize.height}`);
  
  return (
    <canvas
      ref={canvasRef}
      width={canvasSize.width || 300} 
      height={canvasSize.height || 150}
      className="w-full h-full block" // Ensure it takes up space
      tabIndex={0} 
    />
  );
}
