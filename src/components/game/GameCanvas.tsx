
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
  const [isLoading, setIsLoading] = useState(true); // Will be set to false by a later effect

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
  // const [activeCoins, setActiveCoins] = useState<CoinState[]>([]);
  // const [activeEnemies, setActiveEnemies] = useState<EnemyState[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  
  const lastFrameTime = useRef<number>(Date.now());
  const executeActionRef = useRef<GameAction | null>(null);

  const p3BasePositionRef = useRef<{ x: number; y: number } | null>(null);
  const p3InterestPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const p3CurrentTargetIndexRef = useRef<number>(0);
  const p3MovementStateRef = useRef<{startTime: number; startX: number; startY: number; targetX: number; targetY: number} | null>(null);
  const processedLevelRef = useRef<ProcessedLevelData | null>(null);

  // const { toast } = useToast();

  // --- Restored Helper Function ---
  const processRawLevelData = useCallback(
    (
      currentRawLevelData: RawLevelData,
      currentCanvasWidth: number,
      currentCanvasHeight: number
    ): { newProcessedLevel: ProcessedLevelData; newPlayer: PlayerState } | null => {
      console.log(`[GameCanvas processRawLevelData] Called with canvasSize W: ${currentCanvasWidth} H: ${currentCanvasHeight} for level: ${levelPath}`);
      if (!currentRawLevelData || currentCanvasWidth === 0 || currentCanvasHeight === 0) {
        console.warn("[GameCanvas processRawLevelData] Missing rawLevelData or canvas dimensions. Aborting.");
        return null;
      }

      const processedTiles: ProcessedTile[] = currentRawLevelData.tiles.map(rawTile => {
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
        const p3_size_w = P3_SIZE_W;
        const p3_size_h = P3_SIZE_H;
        
        const p3_center_x = currentCanvasWidth / 2;
        
        let p3_center_y = p_ground_top_y - 300 + (p3_size_h / 2);

        const p1_tile = processedTiles.find(t => t.id === 'p1');
        const p2_tile = processedTiles.find(t => t.id === 'p2');

        if (p1_tile && p2_tile) {
             const p1_center_y = p1_tile.y + p1_tile.height / 2;
             const p2_center_y = p2_tile.y + p2_tile.height / 2;
             p3_center_y = (p1_center_y + p2_center_y) / 2;
        }


        p3BasePositionRef.current = { x: p3_center_x - p3_size_w / 2, y: p3_center_y - p3_size_h / 2 };
         console.log(`[processRawLevelData] Level 2: p_ground_top_y: ${p_ground_top_y} p3BasePosRef.current:`, p3BasePositionRef.current);


        p3InterestPointsRef.current = [
          { x: 0, y: 0 }, // Center
          { x: -P3_DRIFT_RANGE, y: -P3_DRIFT_RANGE }, // Top-Left
          { x: P3_DRIFT_RANGE, y: P3_DRIFT_RANGE },   // Bottom-Right
          { x: -P3_DRIFT_RANGE, y: P3_DRIFT_RANGE },  // Bottom-Left
          { x: P3_DRIFT_RANGE, y: -P3_DRIFT_RANGE },  // Top-Right
        ];
        p3CurrentTargetIndexRef.current = 0; 
        p3MovementStateRef.current = null;

        const p3Tile: ProcessedTile = {
          id: 'p3',
          x: p3BasePositionRef.current.x + p3InterestPointsRef.current[0].x,
          y: p3BasePositionRef.current.y + p3InterestPointsRef.current[0].y,
          width: p3_size_w,
          height: p3_size_h,
          type: 1,
          color: 'purple', 
          vx: 0, // Static for now, movement handled separately
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
      } else { // left
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
        isOnGround: true,
        isMovingLeft: false,
        isMovingRight: false,
        color: PLAYER_COLOR,
        facingDirection: 'right',
        activePlatformId: null,
      };

      const newProcessedLevelData: ProcessedLevelData = {
        playerStart: { xPx: playerInitialX, yPx: playerInitialY },
        tiles: processedTiles,
      };
      console.log(`[processRawLevelData] Successfully processed. Player:`, newPlayer, "Number of tiles:", processedTiles.length);
      return { newProcessedLevel: newProcessedLevelData, newPlayer };
    },
    [
      assets, // for allAssetsLoaded check
      PLAYER_HEIGHT,
      PLAYER_WIDTH,
      PLAYER_COLOR,
      levelPath, // for level-specific logic
      P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, // For P3 logic
      // Refs are stable, no need to list them if they aren't re-created by this component
    ]
  );

  // --- Restored useEffect Hooks (Partially) ---

  // Effect 1: Set isClient and Load Assets
  useEffect(() => {
    console.log(`[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state: ${isClient}`);
    setIsClient(true);
    const assetPromises = [];
    // Player Image
    const pImg = new Image();
    pImg.src = '/assets/images/hero_jeans3.png';
    pImg.setAttribute('data-ai-hint', 'player character jeans');
    assetPromises.push(new Promise<void>((resolve) => {
        pImg.onload = () => { console.log("[GameCanvas Effect 1] Player image loaded."); setAssets(prev => ({ ...prev, playerImage: pImg, playerImageLoaded: true })); resolve(); };
        pImg.onerror = () => { console.error("Failed to load player image."); setAssets(prev => ({ ...prev, playerImageLoaded: true })); resolve(); };
    }));
    // Tile Image
    const tImg = new Image();
    tImg.src = '/assets/images/platform_grass.png';
    tImg.setAttribute('data-ai-hint', 'platform grass tile');
    assetPromises.push(new Promise<void>((resolve) => {
        tImg.onload = () => { console.log("[GameCanvas Effect 1] Tile image loaded."); setAssets(prev => ({ ...prev, tileImage: tImg, tileImageLoaded: true })); resolve(); };
        tImg.onerror = () => { console.error("Failed to load tile image."); setAssets(prev => ({ ...prev, tileImageLoaded: true })); resolve(); };
    }));
    // Coin Image
    const cImg = new Image();
    cImg.src = '/assets/images/thankscoin.png';
    cImg.setAttribute('data-ai-hint', 'collectible coin gold');
    assetPromises.push(new Promise<void>((resolve) => {
        cImg.onload = () => { console.log("[GameCanvas Effect 1] Coin image loaded."); setAssets(prev => ({ ...prev, coinImage: cImg, coinImageLoaded: true })); resolve(); };
        cImg.onerror = () => { console.error("Failed to load coin image."); setAssets(prev => ({ ...prev, coinImageLoaded: true })); resolve(); };
    }));
    // Stone Image
    const stoneImg = new Image();
    stoneImg.src = '/assets/images/stone1.jpg';
    stoneImg.setAttribute('data-ai-hint', 'stone rock texture');
    assetPromises.push(new Promise<void>((resolve) => {
        stoneImg.onload = () => { console.log("[GameCanvas Effect 1] Stone image loaded."); setAssets(prev => ({ ...prev, stoneImage: stoneImg, stoneImageLoaded: true })); resolve(); };
        stoneImg.onerror = () => { console.error("Failed to load stone image."); setAssets(prev => ({ ...prev, stoneImageLoaded: true })); resolve(); };
    }));
    // Tree1 Image
    const tree1Img = new Image();
    tree1Img.src = '/assets/images/tree1.png';
    tree1Img.setAttribute('data-ai-hint', 'tree nature design');
    assetPromises.push(new Promise<void>((resolve) => {
        tree1Img.onload = () => { console.log("[GameCanvas Effect 1] Tree1 image loaded."); setAssets(prev => ({ ...prev, tree1Image: tree1Img, tree1ImageLoaded: true })); resolve(); };
        tree1Img.onerror = () => { console.error("Failed to load tree1 image."); setAssets(prev => ({ ...prev, tree1ImageLoaded: true })); resolve(); };
    }));
    // Tree2 Image
    const tree2Img = new Image();
    tree2Img.src = '/assets/images/tree2.png';
    tree2Img.setAttribute('data-ai-hint', 'tree nature outline');
    assetPromises.push(new Promise<void>((resolve) => {
        tree2Img.onload = () => { console.log("[GameCanvas Effect 1] Tree2 image loaded."); setAssets(prev => ({ ...prev, tree2Image: tree2Img, tree2ImageLoaded: true })); resolve(); };
        tree2Img.onerror = () => { console.error("Failed to load tree2 image."); setAssets(prev => ({ ...prev, tree2ImageLoaded: true })); resolve(); };
    }));
    // SmallBush (flowers.png) Image
    const flowersImg = new Image();
    flowersImg.src = '/assets/images/flowers.png';
    flowersImg.setAttribute('data-ai-hint', 'flowers small bush');
    assetPromises.push(new Promise<void>((resolve) => {
        flowersImg.onload = () => { console.log("[GameCanvas Effect 1] SmallBush (flowers) image loaded."); setAssets(prev => ({ ...prev, smallBushImage: flowersImg, smallBushImageLoaded: true })); resolve(); };
        flowersImg.onerror = () => { console.error("Failed to load flowers image."); setAssets(prev => ({ ...prev, smallBushImageLoaded: true })); resolve(); };
    }));
    // LargeBush (bush1.png) Image
    const bush1Img = new Image();
    bush1Img.src = '/assets/images/bush1.png';
    bush1Img.setAttribute('data-ai-hint', 'bush large green');
    assetPromises.push(new Promise<void>((resolve) => {
        bush1Img.onload = () => { console.log("[GameCanvas Effect 1] LargeBush (bush1) image loaded."); setAssets(prev => ({ ...prev, largeBushImage: bush1Img, largeBushImageLoaded: true })); resolve(); };
        bush1Img.onerror = () => { console.error("Failed to load bush1 image."); setAssets(prev => ({ ...prev, largeBushImageLoaded: true })); resolve(); };
    }));
    // House Image
    const house1Img = new Image();
    house1Img.src = '/assets/images/house1.png';
    house1Img.setAttribute('data-ai-hint', 'house building facade');
    assetPromises.push(new Promise<void>((resolve) => {
        house1Img.onload = () => { console.log("[GameCanvas Effect 1] House image loaded."); setAssets(prev => ({ ...prev, houseImage: house1Img, houseImageLoaded: true })); resolve(); };
        house1Img.onerror = () => { console.error("Failed to load house1 image."); setAssets(prev => ({ ...prev, houseImageLoaded: true })); resolve(); };
    }));
    
    Promise.all(assetPromises).then(() => {
        console.log("[GameCanvas Effect 1] All asset loading attempts completed.");
    });
  }, []);

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
        // console.log(`[GameCanvas Effect 3 updateCanvasSizeState] newWidth: ${newWidth}, newHeight: ${newHeight}`);
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
    console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
      console.log("[GameCanvas Effect 4] Not client or no levelPath, returning.");
      return;
    }
    setRawLevelData(null); 
    // setIsLoading(true); //isLoading is true by default, managed by other effects now

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

  // Effect 5: Process raw level data (Restored)
  useEffect(() => {
    const allAssetsLoaded =
        assets.playerImageLoaded &&
        assets.tileImageLoaded &&
        assets.coinImageLoaded &&
        assets.stoneImageLoaded &&
        assets.tree1ImageLoaded &&
        assets.tree2ImageLoaded &&
        assets.smallBushImageLoaded &&
        assets.largeBushImageLoaded &&
        assets.houseImageLoaded;

    console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, allAssetsLoaded: ${allAssetsLoaded}`);

    if (isClient && rawLevelData && canvasSize.width > 0 && canvasSize.height > 0 && allAssetsLoaded) {
      console.log("[GameCanvas Effect 5] Conditions met, processing rawLevelData...");
      const result = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);
      if (result) {
        const { newProcessedLevel, newPlayer } = result;
        console.log("[GameCanvas Effect 5] Successfully processed level. Setting newProcessedLevel and newPlayer.");
        setProcessedLevel(newProcessedLevel);
        playerInstanceRef.current = newPlayer;
        if (parentPlayerRef) parentPlayerRef.current = newPlayer;
        processedLevelRef.current = newProcessedLevel; 
      } else {
        console.warn("[GameCanvas Effect 5] processRawLevelData returned null. Setting processedLevel to null.");
        setProcessedLevel(null);
        processedLevelRef.current = null;
      }
    } else {
        if (processedLevel !== null) { // Only set to null if it's not already null
             console.log("[GameCanvas Effect 5] Conditions not met or critical data missing. Setting processedLevel to null.");
             setProcessedLevel(null);
             processedLevelRef.current = null;
        }
    }
  }, [
    isClient,
    rawLevelData,
    canvasSize,
    assets, // This object reference changes when any asset loads
    processRawLevelData,
    setProcessedLevel,
    parentPlayerRef,
  ]);
  
  // Simplified Diagnostic Rendering (until gameLoop is restored)
  useEffect(() => {
    if (isClient && canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'red';
        ctx.fillRect(10, 10, 100, 50); // Draw a visible red rectangle
        console.log("[GameCanvas Diagnostic Draw] Red rectangle drawn.");
      }
    } else {
      console.log("[GameCanvas Diagnostic Draw] Conditions not met for drawing red rectangle.");
    }
  }, [isClient, canvasSize]); // Redraw if these change

  console.log(`[GameCanvas] Rendering. isClient: ${isClient}, isLoading: ${isLoading}, canvasSize: W${canvasSize.width}xH${canvasSize.height}`);
  
  if (!isClient) { // Initial placeholder before client-side logic runs
    return <div className="w-full h-full flex items-center justify-center bg-muted/20"><p>GameCanvas waiting for client...</p></div>;
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block outline-none"
    >
      Your browser does not support the HTML5 canvas tag.
    </canvas>
  );
}

