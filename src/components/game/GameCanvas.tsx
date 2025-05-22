
"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState } from '@/types/game';
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
  playerRef?: React.MutableRefObject<PlayerState | null>;
  executeAction: GameAction | null;
  resetExecuteAction: () => void;
  onGameStatsUpdate?: (stats: { uncollectedInPair: number; currentPairNum: number; totalPairsNum: number }) => void;
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
    return parseFloat(value); // Treat as px if no unit
  }
  return 0;
};


export default function GameCanvas({
  levelPath,
  playerRef: parentPlayerRef,
  executeAction,
  resetExecuteAction,
  onGameStatsUpdate,
}: GameCanvasProps) {
  console.log(`[GameCanvas] Component body. levelPath: ${levelPath}`);
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
    if (!isClient) {
      setIsClient(true);
      console.log("[GameCanvas Effect 1] Client mode activated.");
    }

    const loadImage = (src: string, hint: string, onLoaded: (img: HTMLImageElement) => void, onLoadedFlag: (flag: boolean) => void) => {
      const img = new Image();
      img.src = src;
      img.setAttribute('data-ai-hint', hint);
      img.onload = () => { 
        console.log(`[GameCanvas Effect 1] ${hint} image loaded from ${src}.`);
        onLoaded(img);
        onLoadedFlag(true);
      };
      img.onerror = () => { 
        console.error(`[GameCanvas Effect 1] Failed to load ${hint} image from ${src}.`);
        onLoadedFlag(true); // Mark as "attempted" to not block loading
      };
    };

    if (!assets.playerImageLoaded && !assets.playerImage) loadImage('/assets/images/hero_jeans3.png', 'player character', (img) => setAssets(prev => ({ ...prev, playerImage: img })), (flag) => setAssets(prev => ({ ...prev, playerImageLoaded: flag })));
    if (!assets.tileImageLoaded && !assets.tileImage) loadImage('/assets/images/platform_grass.png', 'platform tile', (img) => setAssets(prev => ({ ...prev, tileImage: img })), (flag) => setAssets(prev => ({ ...prev, tileImageLoaded: flag })));
    if (!assets.coinImageLoaded && !assets.coinImage) loadImage('/assets/images/thankscoin.png', 'collectible coin gold', (img) => setAssets(prev => ({ ...prev, coinImage: img })), (flag) => setAssets(prev => ({ ...prev, coinImageLoaded: flag })));
    if (!assets.stoneImageLoaded && !assets.stoneImage) loadImage('/assets/images/stone1.jpg', 'stone rock', (img) => setAssets(prev => ({ ...prev, stoneImage: img })), (flag) => setAssets(prev => ({ ...prev, stoneImageLoaded: flag })));
    if (!assets.tree1ImageLoaded && !assets.tree1Image) loadImage('/assets/images/tree1.png', 'tree nature', (img) => setAssets(prev => ({ ...prev, tree1Image: img })), (flag) => setAssets(prev => ({ ...prev, tree1ImageLoaded: flag })));
    if (!assets.tree2ImageLoaded && !assets.tree2Image) loadImage('/assets/images/tree2.png', 'tree nature', (img) => setAssets(prev => ({ ...prev, tree2Image: img })), (flag) => setAssets(prev => ({ ...prev, tree2ImageLoaded: flag })));
    if (!assets.flowersImageLoaded && !assets.flowersImage) loadImage('/assets/images/flowers.png', 'flowers small', (img) => setAssets(prev => ({ ...prev, flowersImage: img })), (flag) => setAssets(prev => ({ ...prev, flowersImageLoaded: flag })));
    if (!assets.smallBushImageLoaded && !assets.smallBushImage) loadImage('/assets/images/flowers.png', 'bush small decorative', (img) => setAssets(prev => ({ ...prev, smallBushImage: img })), (flag) => setAssets(prev => ({ ...prev, smallBushImageLoaded: flag })));
    if (!assets.largeBushImageLoaded && !assets.largeBushImage) loadImage('/assets/images/bush1.png', 'bush large decorative', (img) => setAssets(prev => ({ ...prev, largeBushImage: img })), (flag) => setAssets(prev => ({ ...prev, largeBushImageLoaded: flag })));
    if (!assets.houseImageLoaded && !assets.houseImage) loadImage('/assets/images/house1.png', 'house building', (img) => setAssets(prev => ({ ...prev, houseImage: img })), (flag) => setAssets(prev => ({ ...prev, houseImageLoaded: flag })));
    
  }, [isClient, assets]);

  // Effect 2: Apply canvasSize to canvas attributes
  useEffect(() => {
    // console.log(`[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize: {width: ${canvasSize.width}, height: ${canvasSize.height}}`);
    if (canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
      if (!ctxRef.current) {
        ctxRef.current = canvasRef.current.getContext('2d');
        // console.log("[GameCanvas Effect 2] Canvas context obtained/confirmed.");
      }
    //   console.log(`[GameCanvas Effect 2] Canvas attributes set to W:${canvasSize.width}, H:${canvasSize.height}`);
    }
  }, [canvasSize]);

  // Effect 3: Observe parent element size and update canvasSize state
  useEffect(() => {
    // console.log(`[GameCanvas Effect 3] Running: Observe parent size. isClient: ${isClient}`);
    if (!isClient || !canvasRef.current?.parentElement) {
    //   console.log(`[GameCanvas Effect 3] Not client or no parent element yet.`);
      return;
    }
    const parentElement = canvasRef.current.parentElement;
    // console.log(`[GameCanvas Effect 3] Parent element found:`, parentElement);

    const updateCanvasSizeState = () => {
      const newWidth = parentElement.clientWidth;
      const newHeight = parentElement.clientHeight;
      // console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Parent dims: W:${newWidth}, H:${newHeight}`);
      
      setCanvasSize(currentSize => {
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
          if ((newWidth > 0 && newHeight > 0) || (newWidth === 0 && newHeight === 0 && (currentSize.width !== 0 || currentSize.height !== 0))) {
            // console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Updating canvasSize from W:${currentSize.width} H:${currentSize.height} to W:${newWidth} H:${newHeight}`);
             return { width: newWidth, height: newHeight };
          }
        }
        return currentSize;
      });
    };
    
    updateCanvasSizeState(); 
    const resizeObserver = new ResizeObserver(updateCanvasSizeState);
    resizeObserver.observe(parentElement);
    // console.log("[GameCanvas Effect 3] ResizeObserver observing parent.");
    
    window.addEventListener('resize', updateCanvasSizeState);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateCanvasSizeState);
      // console.log("[GameCanvas Effect 3] Cleanup: ResizeObserver disconnected, resize listener removed.");
    };
  }, [isClient]);

  // Effect 4: Load raw level data
  useEffect(() => {
    console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
      console.log(`[GameCanvas Effect 4] Not client or no levelPath, returning.`);
      return;
    }
    
    console.log("[GameCanvas Effect 4] Setting isLoading to true, resetting states.");
    setIsLoading(true); 
    setRawLevelData(null);
    setProcessedLevel(null); 
    processedLevelRef.current = null;
    playerInstanceRef.current = null;
    if (parentPlayerRef) parentPlayerRef.current = null;
    setActiveCoins([]); 
    activeCoinsRef.current = [];
    setCurrentPairIndex(0);
    currentPairIndexRef.current = 0;
    setActiveEnemies([]);
    activeEnemiesRef.current = [];

    loadLevel(levelPath)
      .then(data => {
        if (data) {
          console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}`);
          setRawLevelData(data);
        } else {
          console.error(`[GameCanvas Effect 4] Failed to load rawLevelData for ${levelPath}, or data was null.`);
          setRawLevelData(null); 
        }
      })
      .catch(error => {
        console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null);
      });
  }, [levelPath, isClient, parentPlayerRef]); // setIsLoading is not needed as a dep here

  const processRawLevelData = useCallback((
    currentRawLevelData: RawLevelData | null,
    currentCanvasWidth: number,
    currentCanvasHeight: number
  ): ProcessedLevelData | null => {
    console.log(`[GameCanvas processRawLevelData] Called with canvasSize W: ${currentCanvasWidth} H: ${currentCanvasHeight} for level: ${levelPath}`);
    if (!currentRawLevelData || !currentRawLevelData.tiles || currentCanvasWidth === 0 || currentCanvasHeight === 0) {
      console.warn("[processRawLevelData] Raw data is null, or tiles missing, or canvas dimensions are zero. Cannot process.");
      return null;
    }

    const processedTiles: ProcessedTile[] = currentRawLevelData.tiles.map((rawTile: RawTileData) => {
      const tileWidth = parseDimension(rawTile.width, currentCanvasWidth);
      const tileHeight = parseDimension(rawTile.height, currentCanvasHeight);
      let tileX = 0;
      let tileY = 0;

      const xOffset = rawTile.positioning.xOffsetPx || 0;
      const yOffset = rawTile.positioning.yOffsetPx || 0;

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
      return {
        ...rawTile, x: tileX, y: tileY, width: tileWidth, height: tileHeight,
        vx: rawTile.vx || 0, direction: rawTile.direction || 0,
      };
    });
    
    let playerStartX = 50;
    let playerStartY = currentCanvasHeight - (PLAYER_HEIGHT + 50); 

    const startPlatformId = currentRawLevelData.playerStart?.platformId;
    if (startPlatformId) {
      const startPlatform = processedTiles.find(tile => tile.id === startPlatformId);
      if (startPlatform) {
        const align = currentRawLevelData.playerStart.horizontalAlign || 'center';
        const xOffsetPlayer = currentRawLevelData.playerStart.xOffsetPx || 0;
        const yOffsetPlayer = currentRawLevelData.playerStart.yOffsetPx || 0;

        if (align === 'left') playerStartX = startPlatform.x + xOffsetPlayer;
        else if (align === 'right') playerStartX = startPlatform.x + startPlatform.width - PLAYER_WIDTH - xOffsetPlayer;
        else playerStartX = startPlatform.x + (startPlatform.width / 2) - (PLAYER_WIDTH / 2) + xOffsetPlayer;
        
        playerStartY = startPlatform.y - PLAYER_HEIGHT - yOffsetPlayer;
      } else {
        console.warn(`[processRawLevelData] Start platform with ID "${startPlatformId}" not found. Using default start position.`);
      }
    } else {
      console.warn(`[processRawLevelData] playerStart.platformId not defined in level data. Using default start position.`);
    }
     
    const newPlayer: PlayerState = {
      x: playerStartX, y: playerStartY,
      width: PLAYER_WIDTH, height: PLAYER_HEIGHT,
      vx: 0, vy: 0,
      isOnGround: false, isMovingLeft: false, isMovingRight: false,
      color: PLAYER_COLOR,
      image: assets.playerImage || undefined,
      facingDirection: 'right',
      activePlatformId: null,
    };
    playerInstanceRef.current = newPlayer;
    if (parentPlayerRef) parentPlayerRef.current = newPlayer;
    
    // Add P3 programmatically for level2
    if (levelPath === '/levels/level2.json') {
      const p_ground_tile = processedTiles.find(t => t.id === 'p_ground');
      if (p_ground_tile) {
        const p_ground_top_y = p_ground_tile.y;
        const p3_size_w = P3_SIZE_W;
        const p3_size_h = P3_SIZE_H;
        
        const p3_x_base = (currentCanvasWidth / 2) - (p3_size_w / 2);
        const p3_y_base = p_ground_top_y - 300; // Upper surface of P3 is 300px above p_ground
        
        p3BasePositionRef.current = { x: p3_x_base, y: p3_y_base };

        // Define interest points relative to base - adjust so actual range is +/- P3_DRIFT_RANGE from center
        p3InterestPointsRef.current = [
            { x: -P3_DRIFT_RANGE, y: -P3_DRIFT_RANGE }, // Top-Left drift
            { x: P3_DRIFT_RANGE,  y: -P3_DRIFT_RANGE }, // Top-Right drift
            { x: P3_DRIFT_RANGE,  y: P3_DRIFT_RANGE },  // Bottom-Right drift
            { x: -P3_DRIFT_RANGE, y: P3_DRIFT_RANGE },  // Bottom-Left drift
        ];
        p3CurrentTargetIndexRef.current = 0; // Start with the first interest point
        p3MovementStateRef.current = null; // Reset movement state

        const initialTargetOffset = p3InterestPointsRef.current[p3CurrentTargetIndexRef.current];
        const initial_p3_x = p3_x_base + initialTargetOffset.x;
        const initial_p3_y = p3_y_base + initialTargetOffset.y;

        const p3Tile: ProcessedTile = {
            id: 'p3',
            x: initial_p3_x,
            y: initial_p3_y,
            width: p3_size_w,
            height: p3_size_h,
            type: 1,
            color: 'hsl(270, 70%, 60%)', // Purple
            vx: 0, // P3 movement is handled specially
            direction: 0,
            layer: 'background',
            'data-ai-hint': 'drifting platform'
        };
        processedTiles.push(p3Tile);
        console.log(`[processRawLevelData] Level 2: p_ground_top_y: ${p_ground_top_y} p3BasePosRef.current:`, p3BasePositionRef.current);
        console.log(`[processRawLevelData] Level 2: Added p3Tile:`, JSON.parse(JSON.stringify(p3Tile)));
      } else {
        console.warn("[processRawLevelData] Could not find p_ground for level 2 to position P3.");
      }
    }

    console.log(`[processRawLevelData] Successfully processed. Player:`, JSON.parse(JSON.stringify(newPlayer)), `Number of tiles: ${processedTiles.length}`);
    return {
      playerStart: { xPx: playerStartX, yPx: playerStartY },
      tiles: processedTiles,
    };
  }, [assets.playerImage, levelPath, parentPlayerRef]); // Dependencies for useCallback

  // Effect 5: Process raw level data when available and canvas is sized
  useEffect(() => {
    console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, tileImageLoaded: ${assets.tileImageLoaded}`);
    
    const allCriticalAssetsLoaded = assets.tileImageLoaded && assets.playerImageLoaded; // For this simplified version, only tile and player

    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allCriticalAssetsLoaded) {
      if (!allCriticalAssetsLoaded && rawLevelData && canvasSize.width > 0) {
         console.log("[GameCanvas Effect 5] Waiting for critical assets to load...", {tile: assets.tileImageLoaded, player: assets.playerImageLoaded});
      }
      if (processedLevelRef.current !== null) {
        console.log("[GameCanvas Effect 5] Conditions not met. Resetting processedLevel.");
        setProcessedLevel(null); // Ensure processedLevel is reset if conditions are no longer met
        processedLevelRef.current = null;
      }
      return;
    }
    
    console.log("[GameCanvas Effect 5] Conditions met, processing rawLevelData...");
    const newProcessedLevel = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);

    if (newProcessedLevel) {
      console.log("[GameCanvas Effect 5] Successfully processed level. Setting newProcessedLevel.");
      setProcessedLevel(newProcessedLevel);
    } else {
      console.error("[GameCanvas Effect 5] Processing rawLevelData failed. Setting processedLevel to null.");
      setProcessedLevel(null);
    }
  }, [isClient, rawLevelData, canvasSize, assets, processRawLevelData, setProcessedLevel]); // assets as a whole

  useEffect(() => {
    processedLevelRef.current = processedLevel;
    console.log("[GameCanvas Effect for processedLevelRef] processedLevelRef.current updated:", processedLevelRef.current ? `Tiles: ${processedLevelRef.current.tiles.length}` : "null");
  }, [processedLevel]);

  // Effect 7: Spawn entities and finalize loading
  useEffect(() => {
    console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevelRef.current}, canvasSize W:${canvasSize.width}H${canvasSize.height}, levelPath: ${levelPath}, activeCoins.length: ${activeCoins.length}`);

    if (!isLoading) {
        console.log("[GameCanvas Effect 7] isLoading is false, skipping all logic.");
        return;
    }

    if (!isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) {
      console.log("[GameCanvas Effect 7] Pre-conditions (isClient, processedLevelRef.current, canvasSize) not met for entity spawn/loading completion, returning.");
      return;
    }

    // All assets check (must match critical assets in Effect 5 + coin/enemy if they are to be spawned)
    const allAssetsRequiredForSpawn = assets.tileImageLoaded && assets.playerImageLoaded && assets.coinImageLoaded; // Add others if enemies are spawned

    if (!allAssetsRequiredForSpawn) {
        console.log("[GameCanvas Effect 7] Waiting for all required assets for spawn to load...", {tile:assets.tileImageLoaded, player:assets.playerImageLoaded, coin:assets.coinImageLoaded});
        return;
    }
    
    console.log("[GameCanvas Effect 7] All conditions met. Attempting to spawn entities and set isLoading=false.");
    
    // Simplified for this step: No coin/enemy spawning yet. We just want to get the game loop running.
    // We'll add coin spawning in the next step.
    
    console.log("[GameCanvas Effect 7] Setting isLoading to false. Game should start.");
    setIsLoading(false);

  }, [isClient, isLoading, processedLevel, canvasSize, assets, levelPath, setActiveCoins, setActiveEnemies, setIsLoading]);


  // Effect 8: Check and respawn coin pair if all collected
  useEffect(() => {
    // console.log(`[GameCanvas Effect 8] Running: Check coin respawn. isLoading: ${isLoading}, processedLevel: ${!!processedLevelRef.current}`);
    if (isLoading || !isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) return;

    const allCollectedAndParticlesGone = activeCoinsRef.current.length > 0 && activeCoinsRef.current.every(
      c => c.isCollected && c.particles.length === 0 && !c.isVisuallyPresent
    );

    if (allCollectedAndParticlesGone) {
      const nextPairIdx = currentPairIndexRef.current + 1;
      if (nextPairIdx < NUMBER_OF_COIN_PAIRS) {
        setCurrentPairIndex(nextPairIdx);
      } else {
         // All pairs collected for this "round"
         setActiveCoins([]); // Clear coins
      }
    }
  }, [activeCoins, isClient, isLoading, canvasSize, processedLevel, setActiveCoins, setCurrentPairIndex]); // Depends on activeCoins state

  // Effect 8.5: Spawn new coin pair when currentPairIndex changes
  useEffect(() => {
    if (isLoading || !isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) return;
    if (currentPairIndexRef.current < NUMBER_OF_COIN_PAIRS && activeCoinsRef.current.length === 0) {
      const newPair = spawnNewCoinPair(processedLevelRef.current, canvasSize.width, canvasSize.height);
      if (newPair.length > 0) {
          setActiveCoins(newPair);
      }
    }
  }, [currentPairIndex, isLoading, isClient, processedLevel, canvasSize, setActiveCoins]); // Depends on currentPairIndex state

  useEffect(() => {
    executeActionRef.current = executeAction;
  }, [executeAction]);

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const currentLevel = processedLevelRef.current; // Use the ref for latest data

    if (!ctx || !canvas) {
      console.warn("[gameLoop] No context or canvas, skipping frame.");
      requestAnimationFrame(gameLoop); // Keep trying
      return;
    }
    
    if (!currentLevel) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(128, 0, 128, 0.7)"; // Purple background for error
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "white";
      ctx.font = "16px Arial";
      ctx.textAlign = "center";
      ctx.fillText("Failed to load level data. Please check server and file path.", canvas.width / 2, canvas.height / 2);
      requestAnimationFrame(gameLoop);
      return;
    }
    
    console.log("[gameLoop] CALLED - Simplified, drawing static tiles ONLY");

    const loopStartTime = Date.now();
    let deltaTime = loopStartTime - lastFrameTime.current;
    const MAX_DELTA_TIME_MS = 100;
    if (deltaTime > MAX_DELTA_TIME_MS) {
      deltaTime = MAX_DELTA_TIME_MS;
    }
    const deltaTimeFactor = Math.max(0.1, Math.min(2, deltaTime / (1000 / 60)));
    lastFrameTime.current = loopStartTime;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Render Tiles (Platforms, Decorative)
    currentLevel.tiles.forEach(tile => {
      // For this step, only render type 1 tiles using tileImage or fallback color
      if (tile.type === 1) {
        if (assets.tileImage && assets.tileImage.complete) {
          ctx.drawImage(assets.tileImage, tile.x, tile.y, tile.width, tile.height);
        } else {
          ctx.fillStyle = tile.color || 'grey'; // Fallback color
          ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
        }
      }
    });

    // Player logic and rendering will be restored in the next step
    // Coin logic and rendering will be restored later
    // Enemy logic and rendering will be restored later

    requestAnimationFrame(gameLoop);
  }, [assets.tileImage]); // Simplified dependencies for this step

  // Effect 9: Start/Stop Game Loop
  useEffect(() => {
    console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize: W${canvasSize.width}H${canvasSize.height}, processedLevel: ${!!processedLevelRef.current}`);
    
    const conditionsMet = isClient && !isLoading && canvasRef.current && ctxRef.current && canvasSize.width > 0 && canvasSize.height > 0 && processedLevelRef.current && processedLevelRef.current.tiles.length > 0;
    
    if (conditionsMet) {
      console.log("[GameCanvas Effect 9] Conditions MET. Starting game loop.");
      lastFrameTime.current = Date.now();
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    } else {
      console.log(`[GameCanvas Effect 9] Conditions NOT MET. Game loop will not start. isClient: ${isClient}, isLoading: ${isLoading}, canvas: ${!!canvasRef.current}, ctx: ${!!ctxRef.current}, canvasW: ${canvasSize.width}, canvasH: ${canvasSize.height}, procLevelExists: ${!!processedLevelRef.current}, tilesLength: ${processedLevelRef.current?.tiles?.length || 0}`);
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    }
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
        console.log("[GameCanvas Effect 9] Cleanup: Game loop cancelled.");
      }
    };
  }, [isClient, isLoading, canvasSize, processedLevel, gameLoop]); // processedLevel (state) is a key trigger

  if (!isClient) {
    // console.log("[GameCanvas] Rendering null because not client-side yet (isClient is false).");
    return null; 
  }
  
  if (isLoading) {
      // console.log(`[GameCanvas] Rendering 'Internal Loading...' because isLoading is true.`);
      return (
        <div className="relative w-full h-full">
           <canvas
              ref={canvasRef}
              className="block w-full h-full border-2 border-pink-500 bg-pink-500/10"
              aria-label="Game Canvas Loading"
              tabIndex={0}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50 text-muted-foreground">
              <p>[GameCanvas] Internal Loading...</p>
            </div>
        </div>
      );
  }

  // console.log(`[GameCanvas] Rendering canvas element because isClient is true and isLoading is false. Canvas Size: W${canvasSize.width}xH${canvasSize.height}`);
  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full border-2 border-lime-500" // For debug
      aria-label="Game Canvas"
      tabIndex={0} 
    />
  );
}

